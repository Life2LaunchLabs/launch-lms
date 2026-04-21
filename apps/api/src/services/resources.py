import csv
import io
import re
from datetime import datetime
from html import unescape
from typing import Iterable, Optional
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest, urlopen
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import func, or_
from sqlmodel import Session, select

from src.db.organizations import Organization
from src.db.resources import (
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
    ResourceRead,
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
from src.security.org_auth import require_org_membership, require_org_role_permission
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
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


def enrich_resource_metadata(url: str) -> dict[str, Optional[str]]:
    parsed = urlparse(url)
    provider_name = parsed.netloc.replace("www.", "") if parsed.netloc else None
    provider_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else None
    data: dict[str, Optional[str]] = {
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


def _serialize_channel(channel: ResourceChannel, db_session: Session, current_user) -> dict:
    resource_count = db_session.exec(
        select(func.count(ResourceChannelResource.id)).where(ResourceChannelResource.channel_id == channel.id)
    ).one()
    linked_usergroups = db_session.exec(
        select(UserGroupResource.usergroup_id).where(UserGroupResource.resource_uuid == channel.channel_uuid)
    ).all()
    return {
        **ResourceChannelRead.model_validate(channel).model_dump(),
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


def _channel_is_accessible(channel: ResourceChannel, db_session: Session, current_user) -> bool:
    if channel.public:
        return True
    if _user_is_anonymous(current_user):
        return False
    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == current_user.id,
            UserOrganization.org_id == channel.org_id,
        )
    ).first()
    if membership and getattr(membership, "role_id", None) in ADMIN_OR_MAINTAINER_ROLE_IDS:
        return True
    linked_usergroups = db_session.exec(
        select(UserGroupResource.usergroup_id).where(UserGroupResource.resource_uuid == channel.channel_uuid)
    ).all()
    if not linked_usergroups:
        return membership is not None
    usergroup_membership = db_session.exec(
        select(UserGroupUser).where(
            UserGroupUser.user_id == current_user.id,
            UserGroupUser.usergroup_id.in_(linked_usergroups),
        )
    ).first()
    return usergroup_membership is not None


def _resource_in_accessible_channel(resource: Resource, db_session: Session, current_user) -> bool:
    channel_ids = db_session.exec(
        select(ResourceChannelResource.channel_id).where(ResourceChannelResource.resource_id == resource.id)
    ).all()
    if not channel_ids:
        return False
    channels = db_session.exec(select(ResourceChannel).where(ResourceChannel.id.in_(channel_ids))).all()
    return any(_channel_is_accessible(channel, db_session, current_user) for channel in channels)


def _get_or_create_default_user_channel(user_id: int, org_id: int, db_session: Session) -> UserResourceChannel:
    default_channel = db_session.exec(
        select(UserResourceChannel).where(
            UserResourceChannel.user_id == user_id,
            UserResourceChannel.org_id == org_id,
            UserResourceChannel.is_default == True,
        )
    ).first()
    if default_channel:
        return default_channel
    default_channel = UserResourceChannel(
        user_id=user_id,
        org_id=org_id,
        user_channel_uuid=f"userchannel_{uuid4()}",
        name="Saved",
        description="Your default saved resources",
        is_default=True,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(default_channel)
    db_session.commit()
    db_session.refresh(default_channel)
    return default_channel


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


def _resource_counts_map(resource_ids: list[int], db_session: Session) -> tuple[dict[int, int], dict[int, int]]:
    if not resource_ids:
        return {}, {}
    save_counts_raw = db_session.exec(
        select(UserSavedResource.resource_id, func.count(UserSavedResource.id))
        .where(UserSavedResource.resource_id.in_(resource_ids))
        .group_by(UserSavedResource.resource_id)
    ).all()
    comment_counts_raw = db_session.exec(
        select(ResourceComment.resource_id, func.count(ResourceComment.id))
        .where(ResourceComment.resource_id.in_(resource_ids))
        .group_by(ResourceComment.resource_id)
    ).all()
    return (
        {resource_id: count for resource_id, count in save_counts_raw},
        {resource_id: count for resource_id, count in comment_counts_raw},
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


def _serialize_resource(resource: Resource, db_session: Session, current_user) -> dict:
    save_counts, comment_counts = _resource_counts_map([resource.id], db_session)
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
            .where(UserSavedResourceChannel.saved_resource_id == user_state.id)
        ).all())
    return {
        **ResourceRead.model_validate(resource).model_dump(),
        "channels": [ResourceChannelRead.model_validate(channel).model_dump() for channel in channel_rows],
        "save_count": int(save_counts.get(resource.id, 0)),
        "comment_count": int(comment_counts.get(resource.id, 0)),
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
    _get_org_or_404(org_id, db_session)
    channels = db_session.exec(
        select(ResourceChannel).where(ResourceChannel.org_id == org_id).order_by(
            ResourceChannel.is_starred.desc(), ResourceChannel.name.asc()
        )
    ).all()
    visible_channels = [
        _serialize_channel(channel, db_session, current_user)
        for channel in channels
        if include_private or _channel_is_accessible(channel, db_session, current_user)
    ]
    user_channels: list[dict] = []
    if not _user_is_anonymous(current_user):
        _get_or_create_default_user_channel(current_user.id, org_id, db_session)
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
    require_org_role_permission(current_user.id, org_id, db_session, "resources", "action_create")
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
    require_org_role_permission(current_user.id, tag.org_id, db_session, "resources", "action_update")
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
    return ResourceTagRead.model_validate(tag).model_dump()


async def delete_tag(request: Request, tag_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    tag = db_session.exec(select(ResourceTag).where(ResourceTag.tag_uuid == tag_uuid)).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    require_org_role_permission(current_user.id, tag.org_id, db_session, "resources", "action_delete")
    db_session.delete(tag)
    db_session.commit()
    return {"detail": "Tag deleted"}


async def create_channel(request: Request, org_id: int, channel_data: ResourceChannelCreate, current_user: PublicUser, db_session: Session) -> dict:
    _get_org_or_404(org_id, db_session)
    require_org_role_permission(current_user.id, org_id, db_session, "resource_channels", "action_create")
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
    return _serialize_channel(channel, db_session, current_user)


async def update_channel(request: Request, channel_uuid: str, channel_data: ResourceChannelUpdate, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    require_org_role_permission(current_user.id, channel.org_id, db_session, "resource_channels", "action_update")
    updates = channel_data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(channel, key, value)
    channel.update_date = _now()
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_channel(channel, db_session, current_user)


async def delete_channel(request: Request, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    require_org_role_permission(current_user.id, channel.org_id, db_session, "resource_channels", "action_delete")
    db_session.delete(channel)
    db_session.commit()
    return {"detail": "Channel deleted"}


async def list_resources(
    request: Request,
    org_id: int,
    current_user,
    db_session: Session,
    channel_uuid: Optional[str] = None,
    user_channel_uuid: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_types: Optional[str] = None,
    tags: Optional[str] = None,
    provider: Optional[str] = None,
    query: Optional[str] = None,
    access: Optional[str] = None,
    saved_only: bool = False,
    completed_only: bool = False,
    include_private: bool = False,
) -> list[dict]:
    _get_org_or_404(org_id, db_session)
    statement = select(Resource).where(Resource.org_id == org_id)
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
    if query:
        q = f"%{query.lower()}%"
        statement = statement.where(
            or_(
                func.lower(Resource.title).like(q),
                func.lower(func.coalesce(Resource.description, "")).like(q),
                func.lower(func.coalesce(Resource.provider_name, "")).like(q),
            )
        )
    if access in {"free", "paid", "restricted"}:
        statement = statement.where(Resource.access_mode == access)
    resources = db_session.exec(statement.order_by(Resource.creation_date.desc())).all()
    if channel_uuid:
        channel = _get_channel_or_404(channel_uuid, db_session)
        if not include_private and not _channel_is_accessible(channel, db_session, current_user):
            raise HTTPException(status_code=403, detail="You do not have access to this channel")
        resource_ids = db_session.exec(
            select(ResourceChannelResource.resource_id).where(ResourceChannelResource.channel_id == channel.id)
        ).all()
        resources = [resource for resource in resources if resource.id in set(resource_ids)]
    elif user_channel_uuid:
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
    elif not include_private:
        resources = [resource for resource in resources if _resource_in_accessible_channel(resource, db_session, current_user)]
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
    return [_serialize_resource(resource, db_session, current_user) for resource in resources]


async def create_resource(
    request: Request,
    org_id: int,
    resource_data: ResourceCreate,
    current_user: PublicUser,
    db_session: Session,
    enrich_metadata: bool = True,
) -> dict:
    _get_org_or_404(org_id, db_session)
    require_org_role_permission(current_user.id, org_id, db_session, "resources", "action_create")
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
    return _serialize_resource(resource, db_session, current_user)


async def update_resource(request: Request, resource_uuid: str, resource_data: ResourceUpdate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    require_org_role_permission(current_user.id, resource.org_id, db_session, "resources", "action_update")
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
    return _serialize_resource(resource, db_session, current_user)


async def delete_resource(request: Request, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    require_org_role_permission(current_user.id, resource.org_id, db_session, "resources", "action_delete")
    db_session.delete(resource)
    db_session.commit()
    return {"detail": "Resource deleted"}


async def get_resource(request: Request, resource_uuid: str, current_user, db_session: Session, include_private: bool = False) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not include_private and not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    return _serialize_resource(resource, db_session, current_user)


async def list_channel_resources(request: Request, channel_uuid: str, current_user, db_session: Session, include_private: bool = False) -> list[dict]:
    channel = _get_channel_or_404(channel_uuid, db_session)
    if not include_private and not _channel_is_accessible(channel, db_session, current_user):
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
    return [_serialize_resource(resource, db_session, current_user) for resource in resources]


async def add_resource_to_channel(request: Request, channel_uuid: str, resource_uuid: str, current_user: PublicUser, db_session: Session, sort_order: int = 0) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    resource = _get_resource_or_404(resource_uuid, db_session)
    require_org_role_permission(current_user.id, channel.org_id, db_session, "resource_channels", "action_update")
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
    require_org_role_permission(current_user.id, channel.org_id, db_session, "resource_channels", "action_update")
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
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(channel)
    db_session.commit()
    db_session.refresh(channel)
    return _serialize_user_channel(channel, db_session, current_user.id)


async def save_resource_for_user(request: Request, resource_uuid: str, save_data: UserSavedResourceUpdate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    default_channel = _get_or_create_default_user_channel(current_user.id, resource.org_id, db_session)
    saved_resource = _get_or_create_saved_resource(current_user.id, resource.id, db_session)
    channel_ids: list[int] = [default_channel.id] if save_data.add_to_default_channel else []
    if save_data.user_channel_uuids:
        rows = db_session.exec(
            select(UserResourceChannel).where(
                UserResourceChannel.user_channel_uuid.in_(save_data.user_channel_uuids),
                UserResourceChannel.user_id == current_user.id,
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
    _set_saved_resource_channels(saved_resource, channel_ids, db_session)
    db_session.commit()
    return _serialize_resource(resource, db_session, current_user)


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


async def list_comments(request: Request, resource_uuid: str, current_user, db_session: Session) -> list[dict]:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    rows = db_session.exec(
        select(ResourceComment, User)
        .join(User, User.id == ResourceComment.author_id)
        .where(ResourceComment.resource_id == resource.id)
        .order_by(ResourceComment.creation_date.asc())
    ).all()
    return [
        ResourceCommentReadWithAuthor(
            **comment.model_dump(),
            author={
                "id": user.id,
                "user_uuid": user.user_uuid,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "avatar_image": user.avatar_image,
            },
        ).model_dump()
        for comment, user in rows
    ]


async def create_comment(request: Request, resource_uuid: str, comment_data: ResourceCommentCreate, current_user: PublicUser, db_session: Session) -> dict:
    resource = _get_resource_or_404(resource_uuid, db_session)
    if not _resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    comment = ResourceComment(
        resource_id=resource.id,
        author_id=current_user.id,
        comment_uuid=f"resourcecomment_{uuid4()}",
        content=comment_data.content,
        creation_date=_now(),
        update_date=_now(),
    )
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    return ResourceCommentReadWithAuthor(
        **comment.model_dump(),
        author={
            "id": current_user.id,
            "user_uuid": current_user.user_uuid,
            "username": current_user.username,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "avatar_image": current_user.avatar_image,
        },
    ).model_dump()


async def update_comment(request: Request, comment_uuid: str, comment_data: ResourceCommentUpdate, current_user: PublicUser, db_session: Session) -> dict:
    comment = db_session.exec(select(ResourceComment).where(ResourceComment.comment_uuid == comment_uuid)).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    resource = db_session.exec(select(Resource).where(Resource.id == comment.resource_id)).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    can_moderate = True
    try:
        require_org_role_permission(current_user.id, resource.org_id, db_session, "resources", "action_update")
    except HTTPException:
        can_moderate = False
    if comment.author_id != current_user.id and not can_moderate:
        raise HTTPException(status_code=403, detail="You cannot edit this comment")
    if comment_data.content is not None:
        comment.content = comment_data.content
    comment.update_date = _now()
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    user = db_session.exec(select(User).where(User.id == comment.author_id)).first()
    return ResourceCommentReadWithAuthor(
        **comment.model_dump(),
        author={
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_image": user.avatar_image,
        } if user else None,
    ).model_dump()


async def delete_comment(request: Request, comment_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    comment = db_session.exec(select(ResourceComment).where(ResourceComment.comment_uuid == comment_uuid)).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    resource = db_session.exec(select(Resource).where(Resource.id == comment.resource_id)).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    can_moderate = True
    try:
        require_org_role_permission(current_user.id, resource.org_id, db_session, "resources", "action_update")
    except HTTPException:
        can_moderate = False
    if comment.author_id != current_user.id and not can_moderate:
        raise HTTPException(status_code=403, detail="You cannot delete this comment")
    db_session.delete(comment)
    db_session.commit()
    return {"detail": "Comment deleted"}


async def import_resources_csv(
    request: Request,
    org_id: int,
    file: UploadFile,
    current_user: PublicUser,
    db_session: Session,
    channel_uuid: Optional[str] = None,
) -> dict:
    _get_org_or_404(org_id, db_session)
    require_org_role_permission(current_user.id, org_id, db_session, "resources", "action_create")
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
                    public=True,
                    is_starred=False,
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
    require_org_role_permission(current_user.id, resource.org_id, db_session, "resources", "action_update")
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
    return _serialize_resource(resource, db_session, current_user)


async def upload_channel_thumbnail(request: Request, channel_uuid: str, thumbnail: UploadFile, current_user: PublicUser, db_session: Session) -> dict:
    channel = _get_channel_or_404(channel_uuid, db_session)
    org = _get_org_or_404(channel.org_id, db_session)
    require_org_role_permission(current_user.id, channel.org_id, db_session, "resource_channels", "action_update")
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
    return _serialize_channel(channel, db_session, current_user)
