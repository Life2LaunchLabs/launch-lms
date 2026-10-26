import csv
import io
import re
from time import perf_counter
from collections.abc import Iterable
from datetime import datetime
from html import unescape
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from src.db.media import MediaAsset, MediaOwnerType, MediaType
from src.db.organizations import Organization
from src.db.resources import (
    ChannelAudience,
    CommentRule,
    CommentStatus,
    OrgSavedChannel,
    OrgSavedResource,
    ResourceCommentReport,
    Resource,
    ResourceChannel,
    ResourceChannelCreate,
    ResourceChannelRead,
    ResourceChannelResource,
    ResourceChannelUpdate,
    ResourceComment,
    ResourceCommentCreate,
    ResourceCommentReadWithAuthor,
    ResourceCommentUpdate,
    ResourceCreate,
    ResourceNoteBlock,
    ResourceNoteBlockCreate,
    ResourceNoteBlockRead,
    ResourceNoteBlockUpdate,
    ResourceRead,
    ResourceReviewCreate,
    ResourceTag,
    ResourceTagCreate,
    ResourceTagLink,
    ResourceTagRead,
    ResourceTagUpdate,
    ResourceTypeEnum,
    ResourceUpdate,
    UserResourceChannel,
    UserResourceChannelCreate,
    UserResourceChannelRead,
    UserSavedResource,
    UserSavedResourceChannel,
    UserSavedResourceRead,
    UserSavedResourceUpdate,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.security.access.access import ensure_feature, org_access
from src.security.org_auth import is_org_admin, is_org_member, require_org_admin, require_org_membership
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services.shared_content import owner_org_payload
from src.services.analytics.analytics import track
from src.services.analytics.events import RESOURCE_OPENED, RESOURCE_SAVED, RESOURCE_SEARCH_QUERY
from src.services.search.resource_lexical import (
    RESOURCE_SEARCH_VERSION,
    lexical_terms,
)
from src.services.search.resource_search import (
    query_fingerprint,
    rank_resources,
    refresh_resource_search_document,
    refresh_search_documents,
    refresh_search_documents_for_tag,
)
from src.services.utils.upload_content import upload_file


def _now() -> str:
    return str(datetime.now())


def _user_is_anonymous(current_user: PublicUser | AnonymousUser | APITokenUser) -> bool:
    return isinstance(current_user, AnonymousUser) or getattr(current_user, "id", 0) == 0


def _parse_og_tags(html: str) -> dict[str, str]:
    tags: dict[str, str] = {}
    for prop in ("title", "description", "image"):
        pattern = re.compile(
            rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']+)["\']',
            re.IGNORECASE,
        )
        match = pattern.search(html)
        if match:
            tags[prop] = unescape(match.group(1))
    title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_match and "title" not in tags:
        tags["title"] = unescape(title_match.group(1)).strip()
    return tags


def enrich_resource_metadata(url: str) -> dict[str, str | None]:
    parsed = urlparse(url)
    provider_name = parsed.netloc.replace("www.", "") if parsed.netloc else None
    provider_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else None
    data: dict[str, str | None] = {
        "provider_name": provider_name,
        "provider_url": provider_url,
        "title": None,
        "description": None,
        "cover_image_url": None,
    }

    if not url.startswith(("http://", "https://")):
        return data

    try:
        req = UrlRequest(url, headers={"User-Agent": "LaunchLMS Resource Import/1.0"})
        with urlopen(req, timeout=5) as response:
            content_type = response.headers.get("Content-Type", "")
            if "text/html" not in content_type:
                return data
            html = response.read(32768).decode("utf-8", errors="ignore")
    except (URLError, ValueError, TimeoutError):
        return data

    og = _parse_og_tags(html)
    data["title"] = og.get("title")
    data["description"] = og.get("description")
    data["cover_image_url"] = og.get("image")
    return data


def _get_org_or_404(org_id: int, db_session: Session) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_resource_or_404(resource_uuid: str, db_session: Session) -> Resource:
    resource = db_session.exec(select(Resource).where(Resource.resource_uuid == resource_uuid)).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


def _normalize_tag_name(name: str) -> str:
    return " ".join((name or "").strip().split())


def _get_channel_or_404(channel_uuid: str, db_session: Session) -> ResourceChannel:
    channel = db_session.exec(select(ResourceChannel).where(ResourceChannel.channel_uuid == channel_uuid)).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


def _get_user_channel_or_404(user_channel_uuid: str, db_session: Session) -> UserResourceChannel:
    channel = db_session.exec(
        select(UserResourceChannel).where(UserResourceChannel.user_channel_uuid == user_channel_uuid)
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Saved channel not found")
    return channel


def _serialize_channel(
    channel: ResourceChannel,
    db_session: Session,
    current_user,
    current_org_id: int | None = None,
) -> dict:
    resource_count = db_session.exec(
        select(func.count(ResourceChannelResource.id)).where(ResourceChannelResource.channel_id == channel.id)
    ).one()
    linked_usergroups = db_session.exec(
        select(UserGroupResource.usergroup_id).where(UserGroupResource.resource_uuid == channel.channel_uuid)
    ).all()
    owner_org = _get_org_or_404(channel.org_id, db_session)
    return {
        **ResourceChannelRead.model_validate(channel).model_dump(),
        **owner_org_payload(owner_org, current_org_id),
        "resource_count": int(resource_count or 0),
        "is_accessible": _channel_is_accessible(channel, db_session, current_user),
        "usergroup_ids": linked_usergroups,
    }


def _serialize_user_channel(channel: UserResourceChannel, db_session: Session, user_id: int) -> dict:
    resource_count = db_session.exec(
        select(func.count(UserSavedResourceChannel.id))
        .join(UserSavedResource, UserSavedResource.id == UserSavedResourceChannel.saved_resource_id)
        .where(
            UserSavedResource.user_id == user_id,
            UserSavedResourceChannel.user_channel_id == channel.id,
        )
    ).one()
    return {
        **UserResourceChannelRead.model_validate(channel).model_dump(),
        "resource_count": int(resource_count or 0),
    }


def _is_staff(current_user, org_id: int, db_session: Session) -> bool:
    """Staff (or admins) of the organization, and superadmins: they see and edit everything it owns."""
    return not _user_is_anonymous(current_user) and is_org_admin(current_user.id, org_id, db_session)


def _require_staff(current_user, org_id: int, db_session: Session) -> None:
    if _user_is_anonymous(current_user):
        raise HTTPException(status_code=401, detail="Sign in to change resources")
    require_org_admin(current_user.id, org_id, db_session)


def _channel_is_accessible(channel: ResourceChannel, db_session: Session, current_user) -> bool:
    """Who sees a channel: its org's staff, anyone signed in when it's in the Library, else its audience."""
    if _user_is_anonymous(current_user):
        return False
    if channel.listed or _is_staff(current_user, channel.org_id, db_session):
        return True
    if channel.audience == ChannelAudience.staff or not is_org_member(current_user.id, channel.org_id, db_session):
        return False
    if channel.audience == ChannelAudience.org:
        return True
    linked_usergroups = db_session.exec(
        select(UserGroupResource.usergroup_id).where(UserGroupResource.resource_uuid == channel.channel_uuid)
    ).all()
    if not linked_usergroups:
        return False
    return db_session.exec(
        select(UserGroupUser).where(
            UserGroupUser.user_id == current_user.id,
            UserGroupUser.usergroup_id.in_(linked_usergroups),
        )
    ).first() is not None


def _channels_of(resource_id: int, db_session: Session) -> list[ResourceChannel]:
    return list(db_session.exec(
        select(ResourceChannel)
        .join(ResourceChannelResource, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannelResource.resource_id == resource_id)
    ).all())


def _resource_in_accessible_channel(resource: Resource, db_session: Session, current_user) -> bool:
    if _is_staff(current_user, resource.org_id, db_session):
        return True
    return any(_channel_is_accessible(channel, db_session, current_user) for channel in _channels_of(resource.id, db_session))


def _in_library(resource: Resource, db_session: Session) -> bool:
    return any(channel.listed for channel in _channels_of(resource.id, db_session))


def _org_saved_channel_ids(org_id: int, db_session: Session) -> set[int]:
    """Library channels the organization saved and that are still listed."""
    return set(db_session.exec(
        select(OrgSavedChannel.channel_id)
        .join(ResourceChannel, ResourceChannel.id == OrgSavedChannel.channel_id)
        .where(OrgSavedChannel.org_id == org_id, ResourceChannel.listed == True)  # noqa: E712
    ).all())


def _org_saved_resource_ids(org_id: int, db_session: Session) -> set[int]:
    """Library resources the organization saved one by one and that are still in the Library."""
    rows = db_session.exec(
        select(OrgSavedResource.resource_id)
        .join(ResourceChannelResource, ResourceChannelResource.resource_id == OrgSavedResource.resource_id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(OrgSavedResource.org_id == org_id, ResourceChannel.listed == True)  # noqa: E712
    ).all()
    return set(rows)


def _org_channels(org_id: int, db_session: Session) -> list[ResourceChannel]:
    """The organization's own channels, then the Library channels it saved."""
    own = db_session.exec(
        select(ResourceChannel).where(ResourceChannel.org_id == org_id).order_by(ResourceChannel.creation_date.asc())
    ).all()
    saved_ids = _org_saved_channel_ids(org_id, db_session)
    saved = db_session.exec(select(ResourceChannel).where(ResourceChannel.id.in_(saved_ids)).order_by(ResourceChannel.name.asc())).all() if saved_ids else []
    return [*own, *[channel for channel in saved if channel.org_id != org_id]]


def _org_resource_ids(org_id: int, db_session: Session, current_user, include_private: bool = False) -> set[int]:
    """What the organization's people may open: resources in its channels and saved Library channels they see,
    plus Library resources it saved. ``include_private`` (staff) adds its own resources in no channel."""
    channels = [
        channel for channel in _org_channels(org_id, db_session)
        if (include_private and channel.org_id == org_id) or _channel_is_accessible(channel, db_session, current_user)
    ]
    ids: set[int] = set()
    if channels:
        ids |= set(db_session.exec(
            select(ResourceChannelResource.resource_id).where(ResourceChannelResource.channel_id.in_([c.id for c in channels]))
        ).all())
    if not _user_is_anonymous(current_user):
        ids |= _org_saved_resource_ids(org_id, db_session)
    if include_private:
        ids |= set(db_session.exec(select(Resource.id).where(Resource.org_id == org_id)).all())
    return ids


def _get_or_create_saved_resource(user_id: int, resource_id: int, db_session: Session) -> UserSavedResource:
    saved = db_session.exec(
        select(UserSavedResource).where(
            UserSavedResource.user_id == user_id,
            UserSavedResource.resource_id == resource_id,
        )
    ).first()
    if saved:
        return saved
    saved = UserSavedResource(
        user_id=user_id,
        resource_id=resource_id,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(saved)
    db_session.commit()
    db_session.refresh(saved)
    return saved


def _set_saved_resource_channels(saved_resource: UserSavedResource, user_channel_ids: Iterable[int], db_session: Session) -> None:
    existing = db_session.exec(
        select(UserSavedResourceChannel).where(UserSavedResourceChannel.saved_resource_id == saved_resource.id)
    ).all()
    existing_ids = {row.user_channel_id for row in existing}
    target_ids = set(user_channel_ids)
    for row in existing:
        if row.user_channel_id not in target_ids:
            db_session.delete(row)
    for channel_id in target_ids - existing_ids:
        db_session.add(
            UserSavedResourceChannel(
                saved_resource_id=saved_resource.id,
                user_channel_id=channel_id,
                creation_date=_now(),
            )
        )


def _resource_counts_map(
    resource_ids: list[int], db_session: Session
) -> tuple[dict[int, int], dict[int, int], dict[int, float], dict[int, int]]:
    if not resource_ids:
        return {}, {}, {}, {}
    save_counts_raw = db_session.exec(
        select(UserSavedResource.resource_id, func.count(UserSavedResource.id))
        .where(UserSavedResource.resource_id.in_(resource_ids))
        .group_by(UserSavedResource.resource_id)
    ).all()
    comment_counts_raw = db_session.exec(
        select(ResourceComment.resource_id, func.count(ResourceComment.id))
        .where(ResourceComment.resource_id.in_(resource_ids), ResourceComment.status == CommentStatus.live)
        .group_by(ResourceComment.resource_id)
    ).all()
    rating_summaries_raw = db_session.exec(
        select(
            ResourceComment.resource_id,
            func.avg(ResourceComment.rating),
            func.count(ResourceComment.rating),
        )
        .where(
            ResourceComment.resource_id.in_(resource_ids),
            ResourceComment.rating.is_not(None),
            ResourceComment.status == CommentStatus.live,
        )
        .group_by(ResourceComment.resource_id)
    ).all()
    return (
        {resource_id: count for resource_id, count in save_counts_raw},
        {resource_id: count for resource_id, count in comment_counts_raw},
        {resource_id: float(average) for resource_id, average, _count in rating_summaries_raw},
        {resource_id: count for resource_id, _average, count in rating_summaries_raw},
    )


def _resource_tags_map(resource_ids: list[int], db_session: Session) -> dict[int, list[dict]]:
    if not resource_ids:
        return {}
    rows = db_session.exec(
        select(ResourceTagLink, ResourceTag)
        .join(ResourceTag, ResourceTag.id == ResourceTagLink.tag_id)
        .where(ResourceTagLink.resource_id.in_(resource_ids))
        .order_by(ResourceTag.name.asc())
    ).all()
    tags_by_resource: dict[int, list[dict]] = {}
    for link, tag in rows:
        tags_by_resource.setdefault(link.resource_id, []).append(
            ResourceTagRead.model_validate(tag).model_dump()
        )
    return tags_by_resource


def _resource_user_state_map(resource_ids: list[int], current_user, db_session: Session) -> dict[int, UserSavedResource]:
    if _user_is_anonymous(current_user) or not resource_ids:
        return {}
    rows = db_session.exec(
        select(UserSavedResource).where(
            UserSavedResource.user_id == current_user.id,
            UserSavedResource.resource_id.in_(resource_ids),
        )
    ).all()
    return {row.resource_id: row for row in rows}


def _serialize_resource(
    resource: Resource,
    db_session: Session,
    current_user,
    current_org_id: int | None = None,
) -> dict:
    save_counts, comment_counts, average_ratings, rating_counts = _resource_counts_map([resource.id], db_session)
    tags_map = _resource_tags_map([resource.id], db_session)
    user_state_map = _resource_user_state_map([resource.id], current_user, db_session)
    user_state = user_state_map.get(resource.id)
    channel_rows = db_session.exec(
        select(ResourceChannel)
        .join(ResourceChannelResource, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannelResource.resource_id == resource.id)
    ).all()
    user_channel_uuids: list[str] = []
    if user_state:
        user_channel_uuids = list(db_session.exec(
            select(UserResourceChannel.user_channel_uuid)
            .join(UserSavedResourceChannel, UserResourceChannel.id == UserSavedResourceChannel.user_channel_id)
            .where(
                UserSavedResourceChannel.saved_resource_id == user_state.id,
                UserResourceChannel.is_default == False,
            )
        ).all())
    owner_org = _get_org_or_404(resource.org_id, db_session)
    return {
        **ResourceRead.model_validate(resource).model_dump(),
        **owner_org_payload(owner_org, current_org_id),
        "channels": [ResourceChannelRead.model_validate(channel).model_dump() for channel in channel_rows],
        "save_count": int(save_counts.get(resource.id, 0)),
        "comment_count": int(comment_counts.get(resource.id, 0)),
        "average_rating": average_ratings.get(resource.id),
        "rating_count": int(rating_counts.get(resource.id, 0)),
        "tags": tags_map.get(resource.id, []),
        "is_saved": user_state is not None,
        "has_outcome": bool(user_state and (user_state.outcome_text or user_state.outcome_link or user_state.outcome_file)),
        "user_state": UserSavedResourceRead.model_validate(user_state).model_dump() if user_state else None,
        "user_channel_uuids": user_channel_uuids,
    }


def _resolve_resource_tags(org_id: int, tag_uuids: list[str], db_session: Session) -> list[ResourceTag]:
    if not tag_uuids:
        return []
    normalized_uuids = list(dict.fromkeys([tag_uuid.strip() for tag_uuid in tag_uuids if tag_uuid.strip()]))
    if not normalized_uuids:
        return []
    tags = db_session.exec(
        select(ResourceTag).where(
            ResourceTag.org_id == org_id,
            ResourceTag.tag_uuid.in_(normalized_uuids),
        )
    ).all()
    tags_by_uuid = {tag.tag_uuid: tag for tag in tags}
    missing = [tag_uuid for tag_uuid in normalized_uuids if tag_uuid not in tags_by_uuid]
    if missing:
        raise HTTPException(status_code=400, detail="One or more tags are invalid for this organization")
    return [tags_by_uuid[tag_uuid] for tag_uuid in normalized_uuids]


def _set_resource_tags(resource_id: int, tag_ids: list[int], db_session: Session) -> None:
    existing_links = db_session.exec(
        select(ResourceTagLink).where(ResourceTagLink.resource_id == resource_id)
    ).all()
    existing_tag_ids = {link.tag_id for link in existing_links}
    target_tag_ids = set(tag_ids)
    for link in existing_links:
        if link.tag_id not in target_tag_ids:
            db_session.delete(link)
    for tag_id in target_tag_ids - existing_tag_ids:
        db_session.add(
            ResourceTagLink(
                resource_id=resource_id,
                tag_id=tag_id,
                creation_date=_now(),
            )
        )


async def list_channels(request: Request, org_id: int, current_user, db_session: Session, include_private: bool = False) -> dict:
    """The organization's channels and the Library channels it saved, as this person may see them.

    ``include_private`` (every channel, whatever its audience) only works for the org's staff.
    """
    _get_org_or_404(org_id, db_session)
    include_private = include_private and _is_staff(current_user, org_id, db_session)
    visible_channels = [
        _serialize_channel(channel, db_session, current_user, org_id)
        for channel in _org_channels(org_id, db_session)
        if include_private or _channel_is_accessible(channel, db_session, current_user)
    ]
    user_channels: list[dict] = []
    if not _user_is_anonymous(current_user):
        rows = db_session.exec(
            select(UserResourceChannel)
            .where(UserResourceChannel.user_id == current_user.id, UserResourceChannel.org_id == org_id)
            .order_by(UserResourceChannel.is_default.desc(), UserResourceChannel.name.asc())
        ).all()
        user_channels = [_serialize_user_channel(row, db_session, current_user.id) for row in rows]
    return {"channels": visible_channels, "user_channels": user_channels}


async def list_tags(request: Request, org_id: int, current_user, db_session: Session) -> list[dict]:
    _get_org_or_404(org_id, db_session)
    tags = db_session.exec(
        select(ResourceTag).where(ResourceTag.org_id == org_id).order_by(ResourceTag.name.asc())
    ).all()
    return [ResourceTagRead.model_validate(tag).model_dump() for tag in tags]


async def create_tag(request: Request, org_id: int, tag_data: ResourceTagCreate, current_user: PublicUser, db_session: Session) -> dict:
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    tag_name = _normalize_tag_name(tag_data.name)
    if not tag_name:
        raise HTTPException(status_code=400, detail="Tag name is required")
    existing = db_session.exec(
        select(ResourceTag).where(ResourceTag.org_id == org_id, func.lower(ResourceTag.name) == tag_name.lower())
    ).first()
    if existing:
        return ResourceTagRead.model_validate(existing).model_dump()
    tag = ResourceTag(
        org_id=org_id,
        tag_uuid=f"resourcetag_{uuid4()}",
        name=tag_name,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return ResourceTagRead.model_validate(tag).model_dump()


async def update_tag(
    request: Request,
    tag_uuid: str,
    tag_data: ResourceTagUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    tag = db_session.exec(select(ResourceTag).where(ResourceTag.tag_uuid == tag_uuid)).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    _require_staff(current_user, tag.org_id, db_session)
    updates = tag_data.model_dump(exclude_unset=True)
    if "name" in updates:
        tag_name = _normalize_tag_name(updates["name"] or "")
        if not tag_name:
            raise HTTPException(status_code=400, detail="Tag name is required")
        existing = db_session.exec(
            select(ResourceTag).where(
                ResourceTag.org_id == tag.org_id,
                func.lower(ResourceTag.name) == tag_name.lower(),
                ResourceTag.id != tag.id,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A tag with that name already exists")
        tag.name = tag_name
    tag.update_date = _now()
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    refresh_search_documents_for_tag(tag.id, db_session)
    return ResourceTagRead.model_validate(tag).model_dump()


async def delete_tag(request: Request, tag_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    tag = db_session.exec(select(ResourceTag).where(ResourceTag.tag_uuid == tag_uuid)).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    _require_staff(current_user, tag.org_id, db_session)
    resource_ids = list(db_session.exec(
        select(ResourceTagLink.resource_id).where(ResourceTagLink.tag_id == tag.id)
    ).all())
    db_session.delete(tag)
    db_session.commit()
    refresh_search_documents(resource_ids, db_session)
    return {"detail": "Tag deleted", "org_id": tag.org_id}


async def create_channel(request: Request, org_id: int, channel_data: ResourceChannelCreate, current_user: PublicUser, db_session: Session) -> dict:
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    channel = ResourceChannel(
        **channel_data.model_dump(),
        org_id=org_id,
        channel_uuid=f"channel_{uuid4()}",
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_channel(channel, db_session, current_user, org_id)


async def update_channel(request: Request, channel_uuid: str, channel_data: ResourceChannelUpdate, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    updates = channel_data.model_dump(exclude_unset=True)
    listed = updates.pop("listed", None)
    if listed is not None and listed != channel.listed:
        if listed and not is_user_superadmin(current_user.id, db_session):
            ensure_feature(channel.org_id, "resource_publishing", db_session)
        channel.listed = listed
        channel.listed_at = _now() if listed else None
    for key, value in updates.items():
        setattr(channel, key, value)
    channel.update_date = _now()
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_channel(channel, db_session, current_user, channel.org_id)


async def delete_channel(request: Request, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    db_session.delete(channel)
    db_session.commit()
    return {"detail": "Channel deleted"}


async def list_resources(
    request: Request,
    org_id: int,
    current_user,
    db_session: Session,
    channel_uuid: str | None = None,
    user_channel_uuid: str | None = None,
    resource_type: str | None = None,
    resource_types: str | None = None,
    tags: str | None = None,
    provider: str | None = None,
    query: str | None = None,
    access: str | None = None,
    saved_only: bool = False,
    completed_only: bool = False,
    include_private: bool = False,
    offset: int = 0,
    limit: int | None = None,
) -> list[dict]:
    search_started_at = perf_counter()
    _get_org_or_404(org_id, db_session)
    statement = select(Resource)
    requested_types = [
        item.strip().lower()
        for item in (resource_types or resource_type or "").split(",")
        if item.strip()
    ]
    valid_types = [item for item in requested_types if item in {enum_item.value for enum_item in ResourceTypeEnum}]
    if valid_types:
        statement = statement.where(Resource.resource_type.in_(valid_types))
    requested_tags = [_normalize_tag_name(item) for item in (tags or "").split(",") if _normalize_tag_name(item)]
    if requested_tags:
        normalized_requested_tags = list(dict.fromkeys(tag.lower() for tag in requested_tags))
        matching_resource_ids = select(ResourceTagLink.resource_id).join(
            ResourceTag, ResourceTag.id == ResourceTagLink.tag_id
        ).where(
            ResourceTag.org_id == org_id,
            func.lower(ResourceTag.name).in_(normalized_requested_tags),
        ).group_by(
            ResourceTagLink.resource_id
        ).having(
            func.count(func.distinct(ResourceTag.id)) == len(normalized_requested_tags)
        )
        statement = statement.where(Resource.id.in_(matching_resource_ids))
    if provider:
        statement = statement.where(Resource.provider_name == provider)
    if access in {"free", "paid", "restricted"}:
        statement = statement.where(Resource.access_mode == access)
    include_private = include_private and _is_staff(current_user, org_id, db_session)
    if channel_uuid:
        channel = _get_channel_or_404(channel_uuid, db_session)
        if not (include_private and channel.org_id == org_id) and not _channel_is_accessible(channel, db_session, current_user):
            raise HTTPException(status_code=403, detail="You do not have access to this channel")
        scope = set(db_session.exec(
            select(ResourceChannelResource.resource_id).where(ResourceChannelResource.channel_id == channel.id)
        ).all())
    else:
        scope = _org_resource_ids(org_id, db_session, current_user, include_private)
        if saved_only and not _user_is_anonymous(current_user):
            # A learner's own saves stay theirs while they can still open them, wherever they found them.
            saved_ids = set(db_session.exec(select(UserSavedResource.resource_id).where(UserSavedResource.user_id == current_user.id)).all()) - scope
            scope |= {
                resource.id for resource in db_session.exec(select(Resource).where(Resource.id.in_(saved_ids))).all()
                if _resource_in_accessible_channel(resource, db_session, current_user)
            } if saved_ids else set()
    resources = db_session.exec(
        statement.where(Resource.id.in_(scope)).order_by(Resource.creation_date.desc())
    ).all() if scope else []
    if user_channel_uuid:
        if _user_is_anonymous(current_user):
            return []
        user_channel = _get_user_channel_or_404(user_channel_uuid, db_session)
        if user_channel.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have access to this saved channel")
        resource_ids = db_session.exec(
            select(UserSavedResource.resource_id)
            .join(UserSavedResourceChannel, UserSavedResource.id == UserSavedResourceChannel.saved_resource_id)
            .where(
                UserSavedResource.user_id == current_user.id,
                UserSavedResourceChannel.user_channel_id == user_channel.id,
            )
        ).all()
        resources = [resource for resource in resources if resource.id in set(resource_ids)]
    if saved_only or completed_only:
        if _user_is_anonymous(current_user):
            return []
        saved_map = _resource_user_state_map([resource.id for resource in resources], current_user, db_session)
        filtered = []
        for resource in resources:
            state = saved_map.get(resource.id)
            if saved_only and not state:
                continue
            if completed_only and not (state and state.completed_at):
                continue
            filtered.append(resource)
        resources = filtered
    ranked_by_resource_id = {}
    search_version = RESOURCE_SEARCH_VERSION
    if query:
        tags_map = _resource_tags_map([resource.id for resource in resources], db_session)
        ranked, search_version = await rank_resources(
            resources,
            {resource_id: [tag["name"] for tag in resource_tags] for resource_id, resource_tags in tags_map.items()},
            query,
            db_session,
        )
        resources_by_id = {str(resource.id): resource for resource in resources}
        resources = [resources_by_id[result.document.key] for result in ranked]
        ranked_by_resource_id = {result.document.key: result for result in ranked}
    if offset:
        resources = resources[offset:]
    if limit is not None:
        resources = resources[:limit]
    serialized_resources = []
    search_query_id = None
    if query:
        from config.config import get_launchlms_config

        search_query_id = query_fingerprint(
            query,
            get_launchlms_config().security_config.auth_jwt_secret_key,
        )
    for resource in resources:
        serialized = _serialize_resource(resource, db_session, current_user, org_id)
        ranked_result = ranked_by_resource_id.get(str(resource.id))
        if ranked_result:
            serialized["search_version"] = search_version
            serialized["search_rank"] = offset + len(serialized_resources) + 1
            serialized["search_score"] = ranked_result.score
            serialized["search_match_quality"] = ranked_result.match_quality
            serialized["search_query_id"] = search_query_id
        serialized_resources.append(serialized)
    if query:
        await track(
            event_name=RESOURCE_SEARCH_QUERY,
            org_id=org_id,
            user_id=getattr(current_user, "id", 0),
            properties={
                "query_fingerprint": search_query_id,
                "query_terms": len(lexical_terms(query, remove_stop_words=True)),
                "results_count": len(serialized_resources),
                "zero_results": not serialized_resources,
                "latency_ms": round((perf_counter() - search_started_at) * 1_000, 2),
                "search_version": search_version,
            },
        )
    return serialized_resources


async def create_resource(
    request: Request,
    org_id: int,
    resource_data: ResourceCreate,
    current_user: PublicUser,
    db_session: Session,
    enrich_metadata: bool = True,
) -> dict:
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    payload = resource_data.model_dump()
    tag_uuids = payload.pop("tag_uuids", [])
    resolved_tags = _resolve_resource_tags(org_id, tag_uuids, db_session)
    if enrich_metadata:
        enrichment = enrich_resource_metadata(resource_data.external_url)
        payload["provider_name"] = payload.get("provider_name") or enrichment.get("provider_name")
        payload["provider_url"] = payload.get("provider_url") or enrichment.get("provider_url")
        payload["cover_image_url"] = payload.get("cover_image_url") or enrichment.get("cover_image_url")
    resource = Resource(
        **payload,
        org_id=org_id,
        created_by_user_id=current_user.id,
        resource_uuid=f"resource_{uuid4()}",
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(resource)
    db_session.commit()
    db_session.refresh(resource)
    _set_resource_tags(resource.id, [tag.id for tag in resolved_tags], db_session)
    db_session.commit()
    refresh_resource_search_document(resource, db_session)
    return _serialize_resource(resource, db_session, current_user, org_id)


async def update_resource(request: Request, resource_uuid: str, resource_data: ResourceUpdate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    _require_staff(current_user, resource.org_id, db_session)
    updates = resource_data.model_dump(exclude_unset=True)
    tag_uuids = updates.pop("tag_uuids", None)
    for key, value in updates.items():
        setattr(resource, key, value)
    resource.update_date = _now()
    db_session.add(resource)
    db_session.commit()
    if tag_uuids is not None:
        resolved_tags = _resolve_resource_tags(resource.org_id, tag_uuids, db_session)
        _set_resource_tags(resource.id, [tag.id for tag in resolved_tags], db_session)
        db_session.commit()
    db_session.refresh(resource)
    refresh_resource_search_document(resource, db_session)
    return _serialize_resource(resource, db_session, current_user, resource.org_id)


async def delete_resource(request: Request, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    _require_staff(current_user, resource.org_id, db_session)
    db_session.delete(resource)
    db_session.commit()
    return {"detail": "Resource deleted"}


async def get_resource(request: Request, resource_uuid: str, current_user, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    serialized = _serialize_resource(resource, db_session, current_user, resource.org_id)
    await track(
        event_name=RESOURCE_OPENED,
        org_id=resource.org_id,
        user_id=getattr(current_user, "id", 0),
        properties={"resource_uuid": resource.resource_uuid},
    )
    return serialized


async def list_channel_resources(request: Request, channel_uuid: str, current_user, db_session: Session) -> list[dict]:
    channel = _get_channel_or_404(channel_uuid, db_session)
    if not _channel_is_accessible(channel, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this channel")
    resource_ids = db_session.exec(
        select(ResourceChannelResource.resource_id)
        .where(ResourceChannelResource.channel_id == channel.id)
        .order_by(ResourceChannelResource.sort_order.asc(), ResourceChannelResource.id.asc())
    ).all()
    if not resource_ids:
        return []
    resources = db_session.exec(select(Resource).where(Resource.id.in_(resource_ids))).all()
    order = {resource_id: idx for idx, resource_id in enumerate(resource_ids)}
    resources.sort(key=lambda resource: order.get(resource.id, 999999))
    return [_serialize_resource(resource, db_session, current_user, channel.org_id) for resource in resources]


async def add_resource_to_channel(request: Request, channel_uuid: str, resource_uuid: str, current_user: PublicUser, db_session: Session, sort_order: int = 0) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    existing = db_session.exec(
        select(ResourceChannelResource).where(
            ResourceChannelResource.channel_id == channel.id,
            ResourceChannelResource.resource_id == resource.id,
        )
    ).first()
    if existing:
        existing.sort_order = sort_order
        existing.update_date = _now()
        db_session.add(existing)
    else:
        db_session.add(
            ResourceChannelResource(
                channel_id=channel.id,
                resource_id=resource.id,
                sort_order=sort_order,
                creation_date=_now(),
                update_date=_now(),
            )
        )
    db_session.commit()
    return {"detail": "Resource linked to channel"}


async def remove_resource_from_channel(request: Request, channel_uuid: str, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    link = db_session.exec(
        select(ResourceChannelResource).where(
            ResourceChannelResource.channel_id == channel.id,
            ResourceChannelResource.resource_id == resource.id,
        )
    ).first()
    if link:
        db_session.delete(link)
        db_session.commit()
    return {"detail": "Resource unlinked from channel"}


async def create_user_channel(request: Request, org_id: int, current_user: PublicUser, db_session: Session, user_channel_data: UserResourceChannelCreate) -> dict:
    require_org_membership(current_user.id, org_id, db_session)
    channel = UserResourceChannel(
        user_id=current_user.id,
        org_id=org_id,
        user_channel_uuid=f"userchannel_{uuid4()}",
        name=user_channel_data.name,
        description=user_channel_data.description,
        is_default=False,
        icon=user_channel_data.icon,
        color=user_channel_data.color,
        icon_color=user_channel_data.icon_color,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_user_channel(channel, db_session, current_user.id)


async def update_user_channel(request: Request, org_id: int, user_channel_uuid: str, current_user: PublicUser, db_session: Session, user_channel_data: UserResourceChannelCreate) -> dict:
    require_org_membership(current_user.id, org_id, db_session)
    channel = db_session.exec(
        select(UserResourceChannel).where(
            UserResourceChannel.user_channel_uuid == user_channel_uuid,
            UserResourceChannel.user_id == current_user.id,
            UserResourceChannel.org_id == org_id,
            UserResourceChannel.is_default == False,
        )
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    channel.name = user_channel_data.name
    channel.description = user_channel_data.description
    channel.icon = user_channel_data.icon
    channel.color = user_channel_data.color
    channel.icon_color = user_channel_data.icon_color
    channel.update_date = _now()
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_user_channel(channel, db_session, current_user.id)


async def delete_user_channel(
    request: Request,
    org_id: int,
    user_channel_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    require_org_membership(current_user.id, org_id, db_session)
    channel = db_session.exec(
        select(UserResourceChannel).where(
            UserResourceChannel.user_channel_uuid == user_channel_uuid,
            UserResourceChannel.user_id == current_user.id,
            UserResourceChannel.org_id == org_id,
            UserResourceChannel.is_default == False,
        )
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="List not found")
    db_session.delete(channel)
    db_session.commit()
    return {"detail": "List deleted; Library resources were kept"}


async def save_resource_for_user(request: Request, resource_uuid: str, save_data: UserSavedResourceUpdate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    saved_resource = _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    channel_ids: list[int] = []
    channel_update_requested = "user_channel_uuids" in save_data.model_fields_set
    if channel_update_requested and save_data.user_channel_uuids:
        rows = db_session.exec(
            select(UserResourceChannel).where(
                UserResourceChannel.user_channel_uuid.in_(save_data.user_channel_uuids),
                UserResourceChannel.user_id == current_user.id,
                UserResourceChannel.org_id == resource.org_id,
                UserResourceChannel.is_default == False,
            )
        ).all()
        channel_ids.extend(channel.id for channel in rows)
    if save_data.notes is not None:
        saved_resource.notes = save_data.notes
    if save_data.outcome_text is not None:
        saved_resource.outcome_text = save_data.outcome_text
    if save_data.outcome_link is not None:
        saved_resource.outcome_link = save_data.outcome_link
    if save_data.completed_at is not None:
        saved_resource.completed_at = save_data.completed_at
    if save_data.open_count_increment:
        saved_resource.open_count += save_data.open_count_increment
        saved_resource.last_opened_at = _now()
    saved_resource.update_date = _now()
    db_session.add(saved_resource)
    db_session.commit()
    db_session.refresh(saved_resource)
    if channel_update_requested:
        _set_saved_resource_channels(saved_resource, channel_ids, db_session)
        db_session.commit()
    serialized = _serialize_resource(resource, db_session, current_user, resource.org_id)
    await track(
        event_name=RESOURCE_SAVED,
        org_id=resource.org_id,
        user_id=current_user.id,
        properties={"resource_uuid": resource.resource_uuid},
    )
    return serialized


def _get_owned_note(note_uuid: str, current_user: PublicUser, db_session: Session) -> ResourceNoteBlock:
    note = db_session.exec(
        select(ResourceNoteBlock).where(
            ResourceNoteBlock.note_uuid == note_uuid,
            ResourceNoteBlock.user_id == current_user.id,
        )
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _validate_note_url(url: str | None) -> str:
    normalized = (url or "").strip()
    if not normalized.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Note links must use http or https")
    return normalized


def _next_note_sort_order(user_id: int, resource_id: int, db_session: Session) -> int:
    current = db_session.exec(
        select(func.max(ResourceNoteBlock.sort_order)).where(
            ResourceNoteBlock.user_id == user_id,
            ResourceNoteBlock.resource_id == resource_id,
        )
    ).one()
    return int(current if current is not None else -1) + 1


async def list_note_blocks(
    request: Request,
    resource_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[dict]:
    if _user_is_anonymous(current_user):
        raise HTTPException(status_code=401, detail="Sign in to view private Notes")
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    notes = db_session.exec(
        select(ResourceNoteBlock)
        .where(
            ResourceNoteBlock.resource_id == resource.id,
            ResourceNoteBlock.user_id == current_user.id,
        )
        .order_by(ResourceNoteBlock.sort_order.asc(), ResourceNoteBlock.id.asc())
    ).all()
    return [ResourceNoteBlockRead.model_validate(note).model_dump() for note in notes]


async def create_note_block(
    request: Request,
    resource_uuid: str,
    note_data: ResourceNoteBlockCreate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    if _user_is_anonymous(current_user):
        raise HTTPException(status_code=401, detail="Sign in to add private Notes")
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    if note_data.block_type not in {"text", "link", "image", "file"}:
        raise HTTPException(status_code=400, detail="Unsupported Note type")
    payload = note_data.model_dump(exclude={"sort_order"})
    if note_data.block_type == "text":
        payload["content"] = (note_data.content or "").strip()
        if not payload["content"]:
            raise HTTPException(status_code=400, detail="Note text is required")
    elif note_data.block_type == "link":
        payload["url"] = _validate_note_url(note_data.url)
        enrichment = enrich_resource_metadata(payload["url"])
        payload["title"] = note_data.title or enrichment.get("title") or enrichment.get("provider_name") or payload["url"]
        payload["description"] = note_data.description or enrichment.get("description")
        payload["preview_image_url"] = note_data.preview_image_url or enrichment.get("cover_image_url")
    else:
        asset = db_session.exec(
            select(MediaAsset).where(MediaAsset.asset_uuid == note_data.media_asset_uuid)
        ).first()
        if not asset:
            raise HTTPException(status_code=404, detail="Media asset not found")
        if asset.owner_type != MediaOwnerType.user or asset.owner_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only attach media from your own library")
        if asset.media_type not in {MediaType.image, MediaType.document}:
            raise HTTPException(status_code=400, detail="Notes support images and documents")
        payload.update({
            "block_type": "image" if asset.media_type == MediaType.image else "file",
            "media_asset_uuid": asset.asset_uuid,
            "url": asset.url,
            "title": note_data.title or asset.title or asset.filename,
            "preview_image_url": note_data.preview_image_url or asset.thumbnail_url,
            "filename": asset.filename,
            "original_filename": asset.title or asset.filename,
            "mime_type": asset.mime_type,
            "storage_directory": "media-library",
        })
    _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    note = ResourceNoteBlock(
        **payload,
        user_id=current_user.id,
        resource_id=resource.id,
        note_uuid=f"resourcenote_{uuid4()}",
        sort_order=(
            note_data.sort_order
            if note_data.sort_order is not None
            else _next_note_sort_order(current_user.id, resource.id, db_session)
        ),
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)
    return ResourceNoteBlockRead.model_validate(note).model_dump()


async def upload_note_file(
    request: Request,
    resource_uuid: str,
    file: UploadFile,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    if _user_is_anonymous(current_user):
        raise HTTPException(status_code=401, detail="Sign in to add private Notes")
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    original_filename = file.filename or "attachment"
    mime_type = file.content_type or "application/octet-stream"
    block_type = "image" if mime_type.startswith("image/") else "file"
    filename = await upload_file(
        file=file,
        directory=f"resources/{resource.resource_uuid}/notes",
        type_of_dir="users",
        uuid=str(current_user.user_uuid),
        allowed_types=["image", "document"],
        filename_prefix="note",
        max_size=15 * 1024 * 1024,
    )
    _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    note = ResourceNoteBlock(
        user_id=current_user.id,
        resource_id=resource.id,
        note_uuid=f"resourcenote_{uuid4()}",
        block_type=block_type,
        filename=filename,
        original_filename=original_filename,
        mime_type=mime_type,
        storage_directory="notes",
        sort_order=_next_note_sort_order(current_user.id, resource.id, db_session),
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)
    return ResourceNoteBlockRead.model_validate(note).model_dump()


async def update_note_block(
    request: Request,
    note_uuid: str,
    note_data: ResourceNoteBlockUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    note = _get_owned_note(note_uuid, current_user, db_session)
    updates = note_data.model_dump(exclude_unset=True)
    if note.block_type == "text" and "content" in updates:
        updates["content"] = (updates["content"] or "").strip()
        if not updates["content"]:
            raise HTTPException(status_code=400, detail="Note text is required")
    if "url" in updates:
        updates["url"] = _validate_note_url(updates["url"])
    _get_or_create_saved_resource(current_user.id, note.resource_id, db_session)
    for key, value in updates.items():
        setattr(note, key, value)
    note.update_date = _now()
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)
    return ResourceNoteBlockRead.model_validate(note).model_dump()


async def delete_note_block(
    request: Request,
    note_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    note = _get_owned_note(note_uuid, current_user, db_session)
    db_session.delete(note)
    db_session.commit()
    return {"detail": "Note deleted"}


async def upload_saved_resource_outcome_file(request: Request, resource_uuid: str, file: UploadFile, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    saved_resource = _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    filename = await upload_file(
        file=file,
        directory=f"resources/{resource.resource_uuid}/outcomes",
        type_of_dir="users",
        uuid=str(current_user.user_uuid),
        allowed_types=["image", "document"],
        filename_prefix="outcome",
        max_size=15 * 1024 * 1024,
    )
    saved_resource.outcome_file = filename
    saved_resource.update_date = _now()
    db_session.add(saved_resource)
    db_session.commit()
    return {"detail": "Outcome file uploaded", "filename": filename}


async def unsave_resource_for_user(request: Request, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    saved = db_session.exec(
        select(UserSavedResource).where(
            UserSavedResource.user_id == current_user.id,
            UserSavedResource.resource_id == resource.id,
        )
    ).first()
    if saved:
        db_session.delete(saved)
        db_session.commit()
    return {"detail": "Resource removed from saved resources"}


LINK_PATTERN = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|biz|info|co|app|ly)\b", re.IGNORECASE)
COMMENT_RULE_ORDER = {CommentRule.off: 0, CommentRule.staff: 1, CommentRule.all: 2}


def _author(user: User | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "user_uuid": user.user_uuid,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "avatar_image": user.avatar_image,
    }


def _comment_dict(comment: ResourceComment, author: User | None, report_count: int = 0, author_org: Organization | None = None, author_is_staff: bool = False) -> dict:
    return {
        **ResourceCommentReadWithAuthor(**comment.model_dump(), author=_author(author)).model_dump(),
        "report_count": report_count,
        "author_org": {"name": author_org.name, "slug": author_org.slug, "org_uuid": author_org.org_uuid} if author_org else None,
        "author_is_staff": author_is_staff,
    }


def _comment_rule(resource: Resource, db_session: Session) -> tuple[CommentRule, bool]:
    """The most open rule among the resource's channels, and whether any of them holds links.

    A resource in no channel only its org's staff see, so only they comment on it.
    """
    channels = _channels_of(resource.id, db_session)
    if not channels:
        return CommentRule.staff, False
    rule = max((CommentRule(channel.comment_rule) for channel in channels), key=COMMENT_RULE_ORDER.__getitem__)
    return rule, any(channel.hold_links for channel in channels)


def _is_staff_anywhere(user_id: int, db_session: Session) -> bool:
    return is_user_superadmin(user_id, db_session) or db_session.exec(
        select(UserOrganization.id).where(UserOrganization.user_id == user_id, UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS))
    ).first() is not None


def _report_counts(comment_ids: list[int], db_session: Session) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = db_session.exec(
        select(ResourceCommentReport.comment_id, func.count(ResourceCommentReport.id))
        .where(ResourceCommentReport.comment_id.in_(comment_ids))
        .group_by(ResourceCommentReport.comment_id)
    ).all()
    return dict(rows)


def _author_contexts(user_ids: set[int], owner_org_id: int, db_session: Session) -> tuple[dict[int, Organization], set[int]]:
    """Each author's org as other viewers read it (the owner org when they belong to it), and who is staff there."""
    if not user_ids:
        return {}, set()
    memberships = db_session.exec(select(UserOrganization).where(UserOrganization.user_id.in_(user_ids))).all()
    chosen: dict[int, UserOrganization] = {}
    for membership in memberships:
        current = chosen.get(membership.user_id)
        if current is None or (membership.org_id == owner_org_id and current.org_id != owner_org_id):
            chosen[membership.user_id] = membership
    orgs = {org.id: org for org in db_session.exec(select(Organization).where(Organization.id.in_({m.org_id for m in chosen.values()}))).all()}
    return (
        {user_id: orgs[m.org_id] for user_id, m in chosen.items() if m.org_id in orgs},
        {user_id for user_id, m in chosen.items() if m.role_id in ADMIN_OR_MAINTAINER_ROLE_IDS},
    )


def _comments_out(rows: list[tuple[ResourceComment, User]], owner_org_id: int, db_session: Session, with_reports: bool) -> list[dict]:
    reports = _report_counts([comment.id for comment, _ in rows], db_session) if with_reports else {}
    orgs, staff = _author_contexts({user.id for _, user in rows}, owner_org_id, db_session)
    return [_comment_dict(comment, user, reports.get(comment.id, 0), orgs.get(user.id), user.id in staff) for comment, user in rows]


async def list_comments(request: Request, resource_uuid: str, current_user, db_session: Session) -> list[dict]:
    """Live comments for everyone; the owning org's staff also get held and hidden ones and report counts."""
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    moderator = _is_staff(current_user, resource.org_id, db_session)
    statement = (
        select(ResourceComment, User)
        .join(User, User.id == ResourceComment.author_id)
        .where(ResourceComment.resource_id == resource.id)
        .order_by(ResourceComment.creation_date.asc())
    )
    if not moderator:
        statement = statement.where(or_(
            ResourceComment.status == CommentStatus.live,
            (ResourceComment.author_id == current_user.id) & (ResourceComment.status == CommentStatus.held),
        ))
    return _comments_out(list(db_session.exec(statement).all()), resource.org_id, db_session, moderator)


async def create_comment(request: Request, resource_uuid: str, comment_data: ResourceCommentCreate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    content = (comment_data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Write something before you post")
    moderator = _is_staff(current_user, resource.org_id, db_session)
    rule, hold_links = _comment_rule(resource, db_session)
    if not moderator:
        if rule == CommentRule.off:
            raise HTTPException(status_code=403, detail="Comments are turned off for this resource")
        if rule == CommentRule.staff and not _is_staff_anywhere(current_user.id, db_session):
            raise HTTPException(status_code=403, detail="Only staff can comment on this resource")
    held = not moderator and hold_links and bool(LINK_PATTERN.search(content))
    comment = ResourceComment(
        resource_id=resource.id,
        author_id=current_user.id,
        comment_uuid=f"resourcecomment_{uuid4()}",
        content=content,
        rating=comment_data.rating,
        status=CommentStatus.held if held else CommentStatus.live,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    author = db_session.get(User, current_user.id)
    return _comments_out([(comment, author)], resource.org_id, db_session, moderator)[0]


async def create_review(
    request: Request,
    resource_uuid: str,
    review_data: ResourceReviewCreate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    content = review_data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Review text is required")
    existing = db_session.exec(
        select(ResourceComment).where(
            ResourceComment.resource_id == resource.id,
            ResourceComment.author_id == current_user.id,
            ResourceComment.rating.is_not(None),
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already reviewed this resource")
    _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    try:
        return await create_comment(
            request,
            resource_uuid,
            ResourceCommentCreate(content=content, rating=review_data.rating),
            current_user,
            db_session,
        )
    except IntegrityError:
        db_session.rollback()
        raise HTTPException(status_code=409, detail="You have already reviewed this resource") from None


def _comment_and_resource(comment_uuid: str, db_session: Session) -> tuple[ResourceComment, Resource]:
    comment = db_session.exec(select(ResourceComment).where(ResourceComment.comment_uuid == comment_uuid)).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    resource = db_session.get(Resource, comment.resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return comment, resource


async def update_comment(request: Request, comment_uuid: str, comment_data: ResourceCommentUpdate, current_user: PublicUser, db_session: Session) -> dict:
    """Authors edit their own words. Staff change what others see through moderate_comment."""
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    if comment_data.content is not None:
        content = comment_data.content.strip()
        if not content:
            raise HTTPException(status_code=400, detail="Write something before you post")
        comment.content = content
        _, hold_links = _comment_rule(resource, db_session)
        if comment.status == CommentStatus.live and hold_links and LINK_PATTERN.search(content) and not _is_staff(current_user, resource.org_id, db_session):
            comment.status = CommentStatus.held
    if comment_data.rating is not None:
        comment.rating = comment_data.rating
    if comment.rating is not None:
        _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    comment.update_date = _now()
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    return _comments_out([(comment, db_session.get(User, comment.author_id))], resource.org_id, db_session, False)[0]


async def delete_comment(request: Request, comment_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.author_id != current_user.id and not _is_staff(current_user, resource.org_id, db_session):
        raise HTTPException(status_code=403, detail="You cannot delete this comment")
    db_session.delete(comment)
    db_session.commit()
    return {"detail": "Comment deleted"}


MODERATION_ACTIONS = {"approve": CommentStatus.live, "show": CommentStatus.live, "hide": CommentStatus.hidden, "keep": None}


async def moderate_comment(request: Request, comment_uuid: str, action: str, current_user: PublicUser, db_session: Session) -> dict:
    """The owning org's staff approve a held comment, hide or show one, or keep a reported one (clearing its reports)."""
    if action not in MODERATION_ACTIONS:
        raise HTTPException(status_code=422, detail="Unknown moderation action")
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    _require_staff(current_user, resource.org_id, db_session)
    status = MODERATION_ACTIONS[action]
    if status is not None:
        comment.status = status
        comment.update_date = _now()
        db_session.add(comment)
    if action in ("keep", "approve"):
        for report in db_session.exec(select(ResourceCommentReport).where(ResourceCommentReport.comment_id == comment.id)).all():
            db_session.delete(report)
    db_session.commit()
    db_session.refresh(comment)
    return _comments_out([(comment, db_session.get(User, comment.author_id))], resource.org_id, db_session, True)[0]


async def report_comment(request: Request, comment_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.status != CommentStatus.live or not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=404, detail="Comment not found")
    exists = db_session.exec(
        select(ResourceCommentReport).where(ResourceCommentReport.comment_id == comment.id, ResourceCommentReport.user_id == current_user.id)
    ).first()
    if not exists:
        db_session.add(ResourceCommentReport(comment_id=comment.id, user_id=current_user.id, creation_date=_now()))
        db_session.commit()
    return {"detail": "Reported"}


def _needs_look(comment: ResourceComment, report_count: int) -> bool:
    return comment.status == CommentStatus.held or (comment.status == CommentStatus.live and report_count > 0)


async def list_channel_comments(request: Request, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    """Every comment on a channel's resources for its org's staff: what needs a look first, then the newest."""
    channel = _get_channel_or_404(channel_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    rows = list(db_session.exec(
        select(ResourceComment, User, Resource)
        .join(User, User.id == ResourceComment.author_id)
        .join(Resource, Resource.id == ResourceComment.resource_id)
        .join(ResourceChannelResource, ResourceChannelResource.resource_id == Resource.id)
        .where(ResourceChannelResource.channel_id == channel.id)
        .order_by(ResourceComment.creation_date.desc())
    ).all())
    out = _comments_out([(comment, user) for comment, user, _ in rows], channel.org_id, db_session, True)
    for item, (_, _, resource) in zip(out, rows):
        item["resource"] = {"resource_uuid": resource.resource_uuid, "title": resource.title, "resource_type": resource.resource_type}
    needs = [item for item, (comment, _, _) in zip(out, rows) if _needs_look(comment, item["report_count"])]
    recent = [item for item, (comment, _, _) in zip(out, rows) if not _needs_look(comment, item["report_count"])]
    return {"needs_look": needs, "recent": recent[:50]}


async def import_resources_csv(
    request: Request,
    org_id: int,
    file: UploadFile,
    current_user: PublicUser,
    db_session: Session,
    channel_uuid: str | None = None,
) -> dict:
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    target_channel = _get_channel_or_404(channel_uuid, db_session) if channel_uuid else None
    if target_channel and target_channel.org_id != org_id:
        raise HTTPException(status_code=400, detail="Channel does not belong to this organization")
    raw = await file.read()
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")
    reader = csv.DictReader(io.StringIO(decoded))
    created = 0
    updated = 0
    errors: list[dict] = []
    resource_uuids: list[str] = []
    for idx, row in enumerate(reader, start=2):
        external_url = (row.get("external_url") or row.get("link") or row.get("url") or "").strip()
        if not external_url:
            errors.append({"row": idx, "error": "link is required"})
            continue
        enrichment = enrich_resource_metadata(external_url)
        resource_type_value = (row.get("resource_type") or "other").strip().lower()
        if resource_type_value not in {item.value for item in ResourceTypeEnum}:
            resource_type_value = "other"
        title = (row.get("title") or "").strip() or enrichment.get("title") or enrichment.get("provider_name") or external_url
        payload = ResourceCreate(
            title=title,
            description=(row.get("description") or "").strip() or enrichment.get("description") or None,
            resource_type=resource_type_value,
            provider_name=(row.get("provider_name") or "").strip() or enrichment.get("provider_name") or None,
            provider_url=(row.get("provider_url") or "").strip() or enrichment.get("provider_url") or None,
            external_url=external_url,
            cover_image_url=(row.get("cover_image_url") or "").strip() or enrichment.get("cover_image_url") or None,
            estimated_time=int(row.get("estimated_time")) if (row.get("estimated_time") or "").strip().isdigit() else None,
            is_featured=(row.get("is_featured") or "").strip().lower() in {"1", "true", "yes"},
            is_live=(row.get("is_live") or "").strip().lower() in {"1", "true", "yes"},
            access_mode=(row.get("access_mode") or "free").strip().lower(),
        )
        existing = db_session.exec(
            select(Resource).where(Resource.org_id == org_id, Resource.external_url == external_url)
        ).first()
        if existing:
            await update_resource(request, existing.resource_uuid, ResourceUpdate(**payload.model_dump()), current_user, db_session)
            resource = existing
            updated += 1
        else:
            created_row = await create_resource(request, org_id, payload, current_user, db_session, enrich_metadata=True)
            resource = _get_resource_or_404(created_row["resource_uuid"], db_session)
            created += 1
        resource_uuids.append(resource.resource_uuid)
        channels_to_link: list[ResourceChannel] = []
        if target_channel:
            channels_to_link.append(target_channel)
        channel_names = [item.strip() for item in (row.get("channels") or "").split("|") if item.strip()]
        for channel_name in channel_names:
            channel = db_session.exec(
                select(ResourceChannel).where(ResourceChannel.org_id == org_id, ResourceChannel.name == channel_name)
            ).first()
            if not channel:
                channel = ResourceChannel(
                    org_id=org_id,
                    channel_uuid=f"channel_{uuid4()}",
                    name=channel_name,
                    description=None,
                    color=None,
                    creation_date=_now(),
                    update_date=_now(),
                )
                db_session.add(channel)
                db_session.commit()
                db_session.refresh(channel)
            channels_to_link.append(channel)
        unique_channels = {channel.channel_uuid: channel for channel in channels_to_link}.values()
        for channel in unique_channels:
            await add_resource_to_channel(request, channel.channel_uuid, resource.resource_uuid, current_user, db_session)
    return {"created": created, "updated": updated, "errors": errors, "resource_uuids": resource_uuids}


async def upload_resource_thumbnail(request: Request, resource_uuid: str, thumbnail: UploadFile, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    org = _get_org_or_404(resource.org_id, db_session)
    _require_staff(current_user, resource.org_id, db_session)
    filename = await upload_file(
        file=thumbnail,
        directory=f"resources/{resource.resource_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
        max_size=10 * 1024 * 1024,
    )
    resource.thumbnail_image = filename
    resource.update_date = _now()
    db_session.add(resource)
    db_session.commit()
    db_session.refresh(resource)
    return _serialize_resource(resource, db_session, current_user, resource.org_id)


async def upload_channel_thumbnail(request: Request, channel_uuid: str, thumbnail: UploadFile, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    org = _get_org_or_404(channel.org_id, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    filename = await upload_file(
        file=thumbnail,
        directory=f"resource_channels/{channel.channel_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
        max_size=10 * 1024 * 1024,
    )
    channel.thumbnail_image = filename
    channel.update_date = _now()
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_channel(channel, db_session, current_user, channel.org_id)


# Your resources, the Library and org saves -----------------------------------------------------------------

def _orgs_by_id(org_ids: set[int], db_session: Session) -> dict[int, Organization]:
    if not org_ids:
        return {}
    return {org.id: org for org in db_session.exec(select(Organization).where(Organization.id.in_(org_ids))).all()}


def _channel_cards(channels: list[ResourceChannel], org_id: int, db_session: Session) -> list[dict]:
    """Channels as cards: counts, the resource types inside, who owns them, whether this org saved them,
    and (for its own) the comments waiting on staff."""
    if not channels:
        return []
    ids = [channel.id for channel in channels]
    links = db_session.exec(
        select(ResourceChannelResource.channel_id, Resource.resource_type)
        .join(Resource, Resource.id == ResourceChannelResource.resource_id)
        .where(ResourceChannelResource.channel_id.in_(ids))
        .order_by(ResourceChannelResource.sort_order.asc(), ResourceChannelResource.id.asc())
    ).all()
    counts: dict[int, int] = {}
    types: dict[int, list[str]] = {}
    for channel_id, resource_type in links:
        counts[channel_id] = counts.get(channel_id, 0) + 1
        value = getattr(resource_type, "value", resource_type)
        if value not in types.setdefault(channel_id, []):
            types[channel_id].append(value)
    saved = set(db_session.exec(select(OrgSavedChannel.channel_id).where(OrgSavedChannel.org_id == org_id, OrgSavedChannel.channel_id.in_(ids))).all())
    save_counts = dict(db_session.exec(
        select(OrgSavedChannel.channel_id, func.count(OrgSavedChannel.id)).where(OrgSavedChannel.channel_id.in_(ids)).group_by(OrgSavedChannel.channel_id)
    ).all())
    own_ids = [channel.id for channel in channels if channel.org_id == org_id]
    waiting: dict[int, int] = {}
    if own_ids:
        rows = db_session.exec(
            select(ResourceChannelResource.channel_id, ResourceComment.id, ResourceComment.status)
            .join(ResourceComment, ResourceComment.resource_id == ResourceChannelResource.resource_id)
            .where(ResourceChannelResource.channel_id.in_(own_ids), ResourceComment.status != CommentStatus.hidden)
        ).all()
        reports = _report_counts([comment_id for _, comment_id, _ in rows], db_session)
        for channel_id, comment_id, status in rows:
            if status == CommentStatus.held or reports.get(comment_id):
                waiting[channel_id] = waiting.get(channel_id, 0) + 1
    groups: dict[str, list[int]] = {}
    group_channels = [channel.channel_uuid for channel in channels if channel.audience == ChannelAudience.groups]
    if group_channels:
        for usergroup_id, resource_uuid in db_session.exec(
            select(UserGroupResource.usergroup_id, UserGroupResource.resource_uuid).where(UserGroupResource.resource_uuid.in_(group_channels))
        ).all():
            groups.setdefault(resource_uuid, []).append(usergroup_id)
    orgs = _orgs_by_id({channel.org_id for channel in channels}, db_session)
    return [
        {
            **ResourceChannelRead.model_validate(channel).model_dump(),
            **owner_org_payload(orgs[channel.org_id], org_id),
            "resource_count": counts.get(channel.id, 0),
            "resource_types": types.get(channel.id, [])[:4],
            "usergroup_ids": groups.get(channel.channel_uuid, []),
            "saved": channel.id in saved,
            "save_count": int(save_counts.get(channel.id, 0)),
            "needs_look": waiting.get(channel.id, 0),
        }
        for channel in channels
    ]


def _resource_rows(resources: list[Resource], org_id: int, db_session: Session) -> list[dict]:
    """Resources as list rows: what a row shows, its channels as this org sees them, and save/comment state."""
    if not resources:
        return []
    ids = [resource.id for resource in resources]
    _, comment_counts, average_ratings, rating_counts = _resource_counts_map(ids, db_session)
    visible_channel_ids = {channel.id for channel in _org_channels(org_id, db_session)}
    channel_rows = db_session.exec(
        select(ResourceChannelResource.resource_id, ResourceChannel)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannelResource.resource_id.in_(ids))
    ).all()
    channels: dict[int, list[dict]] = {}
    listed: set[int] = set()
    for resource_id, channel in channel_rows:
        if channel.listed:
            listed.add(resource_id)
        if channel.id in visible_channel_ids or channel.listed:
            channels.setdefault(resource_id, []).append({"channel_uuid": channel.channel_uuid, "name": channel.name, "color": channel.color, "org_id": channel.org_id})
    saved_direct = set(db_session.exec(select(OrgSavedResource.resource_id).where(OrgSavedResource.org_id == org_id, OrgSavedResource.resource_id.in_(ids))).all())
    saved_channels = _org_saved_channel_ids(org_id, db_session)
    saved_via_channel = {resource_id for resource_id, channel in channel_rows if channel.id in saved_channels}
    own_ids = [resource.id for resource in resources if resource.org_id == org_id]
    waiting: dict[int, int] = {}
    if own_ids:
        rows = db_session.exec(
            select(ResourceComment.resource_id, ResourceComment.id, ResourceComment.status)
            .where(ResourceComment.resource_id.in_(own_ids), ResourceComment.status != CommentStatus.hidden)
        ).all()
        reports = _report_counts([comment_id for _, comment_id, _ in rows], db_session)
        for resource_id, comment_id, status in rows:
            if status == CommentStatus.held or reports.get(comment_id):
                waiting[resource_id] = waiting.get(resource_id, 0) + 1
    tags = _resource_tags_map(ids, db_session)
    orgs = _orgs_by_id({resource.org_id for resource in resources}, db_session)
    return [
        {
            **ResourceRead.model_validate(resource).model_dump(exclude={"tags"}),
            **owner_org_payload(orgs[resource.org_id], org_id),
            "tags": tags.get(resource.id, []),
            "channels": channels.get(resource.id, []),
            "in_library": resource.id in listed,
            "saved": resource.id in saved_direct or resource.id in saved_via_channel,
            "saved_directly": resource.id in saved_direct,
            "comment_count": int(comment_counts.get(resource.id, 0)),
            "average_rating": average_ratings.get(resource.id),
            "rating_count": int(rating_counts.get(resource.id, 0)),
            "needs_look": waiting.get(resource.id, 0),
        }
        for resource in resources
    ]


async def org_workspace(request: Request, org_id: int, current_user: PublicUser, db_session: Session) -> dict:
    """Your resources: the org's channels and saved Library channels, then every resource it owns or saved."""
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    channels = _org_channels(org_id, db_session)
    resource_ids = _org_resource_ids(org_id, db_session, current_user, include_private=True)
    resources = db_session.exec(select(Resource).where(Resource.id.in_(resource_ids)).order_by(Resource.creation_date.desc())).all() if resource_ids else []
    return {
        "channels": _channel_cards(channels, org_id, db_session),
        "resources": _resource_rows(list(resources), org_id, db_session),
        "can_list": is_user_superadmin(current_user.id, db_session) or org_access(org_id, db_session).has("resource_publishing"),
    }


async def get_channel(request: Request, org_id: int, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    """One channel as the org's staff see it, with its resources in order."""
    channel = _get_channel_or_404(channel_uuid, db_session)
    if not _channel_is_accessible(channel, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this channel")
    resource_ids = db_session.exec(
        select(ResourceChannelResource.resource_id)
        .where(ResourceChannelResource.channel_id == channel.id)
        .order_by(ResourceChannelResource.sort_order.asc(), ResourceChannelResource.id.asc())
    ).all()
    by_id = {resource.id: resource for resource in db_session.exec(select(Resource).where(Resource.id.in_(resource_ids))).all()} if resource_ids else {}
    return {
        **_channel_cards([channel], org_id, db_session)[0],
        "can_edit": _is_staff(current_user, channel.org_id, db_session),
        "can_list": is_user_superadmin(current_user.id, db_session) or org_access(channel.org_id, db_session).has("resource_publishing"),
        "description": channel.description,
        "resources": _resource_rows([by_id[resource_id] for resource_id in resource_ids if resource_id in by_id], org_id, db_session),
    }


async def reorder_channel(request: Request, channel_uuid: str, resource_uuids: list[str], current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    _require_staff(current_user, channel.org_id, db_session)
    order = {resource_uuid: index for index, resource_uuid in enumerate(resource_uuids)}
    rows = db_session.exec(
        select(ResourceChannelResource, Resource.resource_uuid)
        .join(Resource, Resource.id == ResourceChannelResource.resource_id)
        .where(ResourceChannelResource.channel_id == channel.id)
    ).all()
    for link, resource_uuid in rows:
        if resource_uuid in order:
            link.sort_order = order[resource_uuid]
            db_session.add(link)
    db_session.commit()
    return {"detail": "Reordered"}


async def library(request: Request, org_id: int, current_user: PublicUser, db_session: Session, query: str | None = None, resource_type: str | None = None) -> dict:
    """The Library: every listed channel (most saved first) and its resources, searchable."""
    _get_org_or_404(org_id, db_session)
    _require_staff(current_user, org_id, db_session)
    channels = list(db_session.exec(select(ResourceChannel).where(ResourceChannel.listed == True)).all())  # noqa: E712
    cards = sorted(_channel_cards(channels, org_id, db_session), key=lambda card: (-card["save_count"], card["name"].lower()))
    statement = (
        select(Resource)
        .join(ResourceChannelResource, ResourceChannelResource.resource_id == Resource.id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannel.listed == True)  # noqa: E712
        .distinct()
    )
    if resource_type and resource_type in {item.value for item in ResourceTypeEnum}:
        statement = statement.where(Resource.resource_type == resource_type)
    resources = list(db_session.exec(statement).all())
    if query and query.strip():
        tags_map = _resource_tags_map([resource.id for resource in resources], db_session)
        ranked, _ = await rank_resources(resources, {rid: [tag["name"] for tag in tags] for rid, tags in tags_map.items()}, query, db_session)
        by_id = {str(resource.id): resource for resource in resources}
        resources = [by_id[result.document.key] for result in ranked]
        needle = query.strip().lower()
        cards = [card for card in cards if needle in card["name"].lower() or needle in (card.get("description") or "").lower()]
    else:
        save_counts = dict(db_session.exec(
            select(OrgSavedResource.resource_id, func.count(OrgSavedResource.id)).group_by(OrgSavedResource.resource_id)
        ).all())
        resources.sort(key=lambda resource: (-save_counts.get(resource.id, 0), resource.creation_date), reverse=False)
        resources = resources[:12]
    return {"channels": cards, "resources": _resource_rows(resources, org_id, db_session)}


async def save_channel_for_org(request: Request, org_id: int, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    _require_staff(current_user, org_id, db_session)
    channel = _get_channel_or_404(channel_uuid, db_session)
    if channel.org_id == org_id:
        raise HTTPException(status_code=409, detail="This channel is already yours")
    if not channel.listed:
        raise HTTPException(status_code=404, detail="Channel not found in the Library")
    if not db_session.exec(select(OrgSavedChannel).where(OrgSavedChannel.org_id == org_id, OrgSavedChannel.channel_id == channel.id)).first():
        db_session.add(OrgSavedChannel(org_id=org_id, channel_id=channel.id, saved_by_user_id=current_user.id, creation_date=_now()))
        db_session.commit()
    return _channel_cards([channel], org_id, db_session)[0]


async def unsave_channel_for_org(request: Request, org_id: int, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    _require_staff(current_user, org_id, db_session)
    channel = _get_channel_or_404(channel_uuid, db_session)
    for row in db_session.exec(select(OrgSavedChannel).where(OrgSavedChannel.org_id == org_id, OrgSavedChannel.channel_id == channel.id)).all():
        db_session.delete(row)
    db_session.commit()
    return {"detail": "Removed from your resources"}


async def save_resource_for_org(request: Request, org_id: int, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    _require_staff(current_user, org_id, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    if resource.org_id == org_id:
        raise HTTPException(status_code=409, detail="This resource is already yours")
    if not _in_library(resource, db_session):
        raise HTTPException(status_code=404, detail="Resource not found in the Library")
    if not db_session.exec(select(OrgSavedResource).where(OrgSavedResource.org_id == org_id, OrgSavedResource.resource_id == resource.id)).first():
        db_session.add(OrgSavedResource(org_id=org_id, resource_id=resource.id, saved_by_user_id=current_user.id, creation_date=_now()))
        db_session.commit()
    return _resource_rows([resource], org_id, db_session)[0]


async def unsave_resource_for_org(request: Request, org_id: int, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    _require_staff(current_user, org_id, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    for row in db_session.exec(select(OrgSavedResource).where(OrgSavedResource.org_id == org_id, OrgSavedResource.resource_id == resource.id)).all():
        db_session.delete(row)
    db_session.commit()
    return _resource_rows([resource], org_id, db_session)[0]


def resource_uuids_in(document) -> set[str]:
    """Every resource a plan document points at (Explore suggestions, materials, staff materials)."""
    found: set[str] = set()
    stack = [document]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            value = item.get("resource_uuid")
            if isinstance(value, str) and value:
                found.add(value)
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return found


def _step_titles_using(document, resource_uuid: str) -> list[str]:
    titles: list[str] = []
    for stage in (document or {}).get("stages") or []:
        for step in stage.get("steps") or []:
            if resource_uuid in resource_uuids_in(step):
                titles.append(step.get("title") or "Untitled step")
    return titles


async def resource_detail(request: Request, org_id: int, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    """A resource as staff see it: the row, its channels this org sees, and the org's plans that use it."""
    from src.db.goals import GoalTemplate, TemplateStatus

    _require_staff(current_user, org_id, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user) and resource.id not in _org_resource_ids(org_id, db_session, current_user, True):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    plans = []
    for template in db_session.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED)).all():
        steps = _step_titles_using(template.document, resource.resource_uuid)
        if steps:
            plans.append({"template_uuid": template.template_uuid, "title": template.title, "icon": template.icon, "color": template.color,
                          "thumbnail_image": template.thumbnail_image, "steps": steps})
    added_by = db_session.get(User, resource.created_by_user_id) if resource.created_by_user_id else None
    return {
        **_resource_rows([resource], org_id, db_session)[0],
        "description": resource.description,
        "can_edit": _is_staff(current_user, resource.org_id, db_session),
        "added_by": _author(added_by),
        "used_in": plans,
    }
