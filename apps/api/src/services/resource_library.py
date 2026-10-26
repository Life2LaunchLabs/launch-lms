"""Your resources, the Library and org saves: what staff see of their org's channels and resources and the
Library, saving Library channels and resources for the org, and which plans use a resource."""

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.organizations import Organization
from src.db.resource_library import OrgSavedChannel, OrgSavedResource
from src.db.resources import (
    ChannelAudience,
    CommentStatus,
    Resource,
    ResourceChannel,
    ResourceChannelRead,
    ResourceChannelResource,
    ResourceComment,
    ResourceRead,
    ResourceTypeEnum,
)
from src.db.usergroup_resources import UserGroupResource
from src.db.users import PublicUser, User
from src.security.access.access import org_access
from src.security.superadmin import is_user_superadmin
from src.services.shared_content import owner_org_payload
from src.services.search.resource_search import rank_resources
from src.services import resources as base
from src.services.resource_comments import _author, _comment_rule, _report_counts


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
    _, comment_counts, average_ratings, rating_counts = base._resource_counts_map(ids, db_session)
    visible_channel_ids = {channel.id for channel in base._org_channels(org_id, db_session)}
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
    saved_channels = base._org_saved_channel_ids(org_id, db_session)
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
    tags = base._resource_tags_map(ids, db_session)
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
    base._get_org_or_404(org_id, db_session)
    base._require_staff(current_user, org_id, db_session)
    channels = base._org_channels(org_id, db_session)
    resource_ids = base._org_resource_ids(org_id, db_session, current_user, include_private=True)
    resources = db_session.exec(select(Resource).where(Resource.id.in_(resource_ids)).order_by(Resource.creation_date.desc())).all() if resource_ids else []
    return {
        "channels": _channel_cards(channels, org_id, db_session),
        "resources": _resource_rows(list(resources), org_id, db_session),
        "can_list": is_user_superadmin(current_user.id, db_session) or org_access(org_id, db_session).has("resource_publishing"),
    }


async def get_channel(request: Request, org_id: int, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    """One channel as the org's staff see it, with its resources in order."""
    channel = base._get_channel_or_404(channel_uuid, db_session)
    if not base._channel_is_accessible(channel, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this channel")
    resource_ids = db_session.exec(
        select(ResourceChannelResource.resource_id)
        .where(ResourceChannelResource.channel_id == channel.id)
        .order_by(ResourceChannelResource.sort_order.asc(), ResourceChannelResource.id.asc())
    ).all()
    by_id = {resource.id: resource for resource in db_session.exec(select(Resource).where(Resource.id.in_(resource_ids))).all()} if resource_ids else {}
    return {
        **_channel_cards([channel], org_id, db_session)[0],
        "can_edit": base._is_staff(current_user, channel.org_id, db_session),
        "can_list": is_user_superadmin(current_user.id, db_session) or org_access(channel.org_id, db_session).has("resource_publishing"),
        "description": channel.description,
        "resources": _resource_rows([by_id[resource_id] for resource_id in resource_ids if resource_id in by_id], org_id, db_session),
    }


async def reorder_channel(request: Request, channel_uuid: str, resource_uuids: list[str], current_user: PublicUser, db_session: Session) -> dict:
    channel = base._get_channel_or_404(channel_uuid, db_session)
    base._require_staff(current_user, channel.org_id, db_session)
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
    base._get_org_or_404(org_id, db_session)
    base._require_staff(current_user, org_id, db_session)
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
        tags_map = base._resource_tags_map([resource.id for resource in resources], db_session)
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
    base._require_staff(current_user, org_id, db_session)
    channel = base._get_channel_or_404(channel_uuid, db_session)
    if channel.org_id == org_id:
        raise HTTPException(status_code=409, detail="This channel is already yours")
    if not channel.listed:
        raise HTTPException(status_code=404, detail="Channel not found in the Library")
    if not db_session.exec(select(OrgSavedChannel).where(OrgSavedChannel.org_id == org_id, OrgSavedChannel.channel_id == channel.id)).first():
        db_session.add(OrgSavedChannel(org_id=org_id, channel_id=channel.id, saved_by_user_id=current_user.id, creation_date=base._now()))
        db_session.commit()
    return _channel_cards([channel], org_id, db_session)[0]


async def unsave_channel_for_org(request: Request, org_id: int, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    base._require_staff(current_user, org_id, db_session)
    channel = base._get_channel_or_404(channel_uuid, db_session)
    for row in db_session.exec(select(OrgSavedChannel).where(OrgSavedChannel.org_id == org_id, OrgSavedChannel.channel_id == channel.id)).all():
        db_session.delete(row)
    db_session.commit()
    return {"detail": "Removed from your resources"}


async def save_resource_for_org(request: Request, org_id: int, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    base._require_staff(current_user, org_id, db_session)
    resource = base._get_resource_or_404(resource_uuid, db_session)
    if resource.org_id == org_id:
        raise HTTPException(status_code=409, detail="This resource is already yours")
    if not base._in_library(resource, db_session):
        raise HTTPException(status_code=404, detail="Resource not found in the Library")
    if not db_session.exec(select(OrgSavedResource).where(OrgSavedResource.org_id == org_id, OrgSavedResource.resource_id == resource.id)).first():
        db_session.add(OrgSavedResource(org_id=org_id, resource_id=resource.id, saved_by_user_id=current_user.id, creation_date=base._now()))
        db_session.commit()
    return _resource_rows([resource], org_id, db_session)[0]


async def unsave_resource_for_org(request: Request, org_id: int, resource_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    base._require_staff(current_user, org_id, db_session)
    resource = base._get_resource_or_404(resource_uuid, db_session)
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

    base._require_staff(current_user, org_id, db_session)
    resource = base._get_resource_or_404(resource_uuid, db_session)
    if not base._resource_in_accessible_channel(resource, db_session, current_user) and resource.id not in base._org_resource_ids(org_id, db_session, current_user, True):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    plans = []
    for template in db_session.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED)).all():
        steps = _step_titles_using(template.document, resource.resource_uuid)
        if steps:
            plans.append({"template_uuid": template.template_uuid, "title": template.title, "icon": template.icon, "color": template.color,
                          "thumbnail_image": template.thumbnail_image, "steps": steps})
    added_by = db_session.get(User, resource.created_by_user_id) if resource.created_by_user_id else None
    comment_rule, hold_links = _comment_rule(resource, db_session)
    return {
        **_resource_rows([resource], org_id, db_session)[0],
        "description": resource.description,
        "can_edit": base._is_staff(current_user, resource.org_id, db_session),
        "added_by": _author(added_by),
        "used_in": plans,
        "comment_rule": comment_rule,
        "hold_links": hold_links,
    }
