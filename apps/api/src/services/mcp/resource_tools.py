"""The connector's resource tools: the links, videos, tools and guides an organization offers in Discover, and the
channels it files them in. They act as the connected staff member, through the same service the admin pages use."""

from __future__ import annotations

from fastapi import HTTPException, Request
from pydantic import ValidationError
from sqlmodel import Session, select

from src.db.organizations import Organization
from src.db.resources import (
    Resource,
    ResourceChannel,
    ResourceChannelCreate,
    ResourceChannelResource,
    ResourceChannelUpdate,
    ResourceCreate,
    ResourceTagCreate,
    ResourceUpdate,
)
from src.services import resources as service
from src.services.mcp.tool import Tool
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext

_TYPES = ["video", "article", "guide", "tool", "assessment", "course", "school", "career", "other"]
_RESOURCE_FIELDS = ("title", "description", "resource_type", "external_url", "provider_name", "provider_url", "cover_image_url",
                    "estimated_time", "is_featured", "access_mode")
_CHANNEL_FIELDS = ("name", "description", "color", "audience", "comment_rule", "hold_links", "listed")


def _slug(db_session: Session, org_id: int) -> str:
    org = db_session.get(Organization, org_id)
    return org.slug if org else ""


def _urls(db_session: Session, org_id: int, resource_uuid: str) -> dict:
    base = f"{frontend_url()}/orgs/{_slug(db_session, org_id)}"
    return {"discover_url": f"{base}/discover?r={resource_uuid.removeprefix('resource_')}",
            "editor_url": f"{base}/admin/resources/item/{resource_uuid}"}


def _own_resource(db_session: Session, ctx: AccessContext, resource_uuid: str) -> Resource:
    resource = db_session.exec(select(Resource).where(Resource.resource_uuid == str(resource_uuid))).first()
    if resource is None or resource.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Resource not found in the connected organization")
    return resource


def _own_channel(db_session: Session, ctx: AccessContext, channel_uuid: str) -> ResourceChannel:
    channel = db_session.exec(select(ResourceChannel).where(ResourceChannel.channel_uuid == str(channel_uuid))).first()
    if channel is None or channel.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail=f"Channel {channel_uuid} not found in the connected organization")
    return channel


def _compact(db_session: Session, ctx: AccessContext, item: dict) -> dict:
    return {
        "resource_uuid": item["resource_uuid"], "title": item["title"], "resource_type": item["resource_type"],
        "external_url": item["external_url"], "provider_name": item.get("provider_name"), "estimated_time": item.get("estimated_time"),
        "is_featured": item.get("is_featured"), "access_mode": item.get("access_mode"),
        "tags": [tag["name"] for tag in item.get("tags") or []],
        "channels": [{"channel_uuid": channel["channel_uuid"], "name": channel["name"]} for channel in item.get("channels") or []],
        "own": item.get("org_id") == ctx.org_id, "save_count": item.get("save_count", 0),
        **_urls(db_session, ctx.org_id, item["resource_uuid"]),
    }


def _full(db_session: Session, ctx: AccessContext, item: dict) -> dict:
    keep = ("resource_uuid", "title", "description", "resource_type", "external_url", "provider_name", "provider_url", "cover_image_url",
            "thumbnail_image", "estimated_time", "is_featured", "access_mode", "save_count", "comment_count", "average_rating", "rating_count",
            "creation_date", "update_date")
    return {
        **{key: item.get(key) for key in keep},
        "tags": [tag["name"] for tag in item.get("tags") or []],
        "channels": [{"channel_uuid": channel["channel_uuid"], "name": channel["name"], "own": channel["org_id"] == ctx.org_id} for channel in item.get("channels") or []],
        "own": item.get("org_id") == ctx.org_id, "owner_org_name": item.get("owner_org_name"),
        **_urls(db_session, ctx.org_id, item["resource_uuid"]),
    }


def _channel(channel: dict, ctx: AccessContext) -> dict:
    keep = ("channel_uuid", "name", "description", "color", "audience", "comment_rule", "listed", "resource_count")
    return {**{key: channel.get(key) for key in keep}, "own": channel.get("org_id") == ctx.org_id,
            **({"from_org": channel.get("owner_org_name")} if channel.get("org_id") != ctx.org_id else {})}


async def list_resource_channels(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    listed = await service.list_channels(request, ctx.org_id, ctx.user, db_session, include_private=True)
    return {"channels": [_channel(channel, ctx) for channel in listed["channels"]]}


async def save_resource_channel(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    fields = {key: args[key] for key in _CHANNEL_FIELDS if key in args}
    try:
        if args.get("channel_uuid"):
            channel = _own_channel(db_session, ctx, args["channel_uuid"])
            saved = await service.update_channel(request, channel.channel_uuid, ResourceChannelUpdate(**fields), ctx.user, db_session)
        else:
            if not str(fields.get("name") or "").strip():
                raise HTTPException(status_code=422, detail="name is required for a new channel")
            listed = fields.pop("listed", None)
            saved = await service.create_channel(request, ctx.org_id, ResourceChannelCreate(**fields), ctx.user, db_session)
            if listed:
                saved = await service.update_channel(request, saved["channel_uuid"], ResourceChannelUpdate(listed=True), ctx.user, db_session)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False))
    return {**_channel(saved, ctx), "created": not args.get("channel_uuid")}


async def list_resources(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    limit = max(1, min(int(args.get("limit") or 50), 50))
    offset = max(0, int(args.get("offset") or 0))
    tags = args.get("tags")
    found = await service.list_resources(
        request, ctx.org_id, ctx.user, db_session,
        channel_uuid=args.get("channel_uuid") or None,
        resource_types=",".join(args["resource_types"]) if args.get("resource_types") else None,
        tags=",".join(tags) if isinstance(tags, list) else (tags or None),
        query=str(args.get("query") or "").strip() or None,
        include_private=True, offset=offset, limit=limit,
    )
    return {"resources": [_compact(db_session, ctx, item) for item in found], "offset": offset, "limit": limit, "more": len(found) == limit}


async def get_resource(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    resource = db_session.exec(select(Resource).where(Resource.resource_uuid == str(args["resource_uuid"]))).first()
    if resource is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    scope = service._org_resource_ids(ctx.org_id, db_session, ctx.user, include_private=True)
    if resource.id not in scope:
        raise HTTPException(status_code=404, detail="Resource not found in the connected organization")
    return _full(db_session, ctx, service._serialize_resource(resource, db_session, ctx.user, ctx.org_id))


async def _tag_uuids(request: Request, db_session: Session, ctx: AccessContext, names) -> list[str]:
    if not isinstance(names, list):
        raise HTTPException(status_code=422, detail="tags must be a list of names")
    uuids: list[str] = []
    for name in names:
        if str(name or "").strip():
            tag = await service.create_tag(request, ctx.org_id, ResourceTagCreate(name=str(name)), ctx.user, db_session)
            uuids.append(tag["tag_uuid"])
    return list(dict.fromkeys(uuids))


async def _set_channels(request: Request, db_session: Session, ctx: AccessContext, resource: Resource, channel_uuids) -> None:
    if not isinstance(channel_uuids, list):
        raise HTTPException(status_code=422, detail="channel_uuids must be a list")
    wanted = [_own_channel(db_session, ctx, uuid) for uuid in dict.fromkeys(str(uuid) for uuid in channel_uuids)]
    current = db_session.exec(
        select(ResourceChannel).join(ResourceChannelResource, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannelResource.resource_id == resource.id, ResourceChannel.org_id == ctx.org_id)
    ).all()
    wanted_ids = {channel.id for channel in wanted}
    for channel in current:
        if channel.id not in wanted_ids:
            await service.remove_resource_from_channel(request, channel.channel_uuid, resource.resource_uuid, ctx.user, db_session)
    current_ids = {channel.id for channel in current}
    for channel in wanted:
        if channel.id not in current_ids:
            count = len(db_session.exec(select(ResourceChannelResource.id).where(ResourceChannelResource.channel_id == channel.id)).all())
            await service.add_resource_to_channel(request, channel.channel_uuid, resource.resource_uuid, ctx.user, db_session, sort_order=count)


async def save_resource(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    fields = {key: args[key] for key in _RESOURCE_FIELDS if key in args}
    if fields.get("resource_type") is not None and fields["resource_type"] not in _TYPES:
        raise HTTPException(status_code=422, detail=f"resource_type must be one of {', '.join(_TYPES)}")
    if "tags" in args:
        fields["tag_uuids"] = await _tag_uuids(request, db_session, ctx, args["tags"])
    resource_uuid = args.get("resource_uuid")
    # Check every channel before writing anything, so a wrong uuid saves nothing.
    if "channel_uuids" in args:
        for uuid in args["channel_uuids"] if isinstance(args["channel_uuids"], list) else []:
            _own_channel(db_session, ctx, uuid)
    try:
        if resource_uuid:
            resource = _own_resource(db_session, ctx, resource_uuid)
            await service.update_resource(request, resource.resource_uuid, ResourceUpdate(**fields), ctx.user, db_session)
        else:
            if not str(fields.get("title") or "").strip() or not str(fields.get("external_url") or "").strip():
                raise HTTPException(status_code=422, detail="title and external_url are required for a new resource")
            created = await service.create_resource(request, ctx.org_id, ResourceCreate(**fields), ctx.user, db_session,
                                                    enrich_metadata=bool(args.get("fill_from_link", True)))
            resource = _own_resource(db_session, ctx, created["resource_uuid"])
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False))
    if "channel_uuids" in args:
        await _set_channels(request, db_session, ctx, resource, args["channel_uuids"])
    _refresh_embedding(resource.id)
    db_session.refresh(resource)
    saved = _full(db_session, ctx, service._serialize_resource(resource, db_session, ctx.user, ctx.org_id))
    warning = None if saved["channels"] else "In no channel yet: only staff can see it. Pass channel_uuids to put it in Discover."
    return {**saved, "created": not resource_uuid, **({"warning": warning} if warning else {})}


def _refresh_embedding(resource_id: int) -> None:
    """Semantic search re-embeds in the background, as the admin pages do; lexical search is already current."""
    import asyncio

    from src.services.search.resource_search import refresh_resource_search_embedding_task, vector_search_enabled

    if vector_search_enabled():
        asyncio.get_running_loop().create_task(refresh_resource_search_embedding_task(resource_id))


def _school_link(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    return url if url.startswith(("http://", "https://")) else f"https://{url.lstrip('/')}"


def _school_description(school: dict) -> str:
    """One plain paragraph of the school's College Scorecard facts, each one only when the Scorecard has it."""
    where = ", ".join(part for part in (school.get("city"), school.get("state")) if part)
    kind = f"{school['control']} school" if school.get("control") else "School"
    first = f"{kind} in {where}" if where else kind
    if school.get("degree"):
        first += f", awarding up to {school['degree'].lower()}" if school["degree"] != "Certificates" else ", awarding certificates"
    facts = []
    if school.get("students"):
        facts.append(f"{school['students']:,} students")
    if school.get("admission_rate") is not None:
        facts.append(f"{round(school['admission_rate'] * 100)}% of applicants admitted")
    if school.get("completion_rate") is not None:
        facts.append(f"{round(school['completion_rate'] * 100)}% finish")
    tuition = (school.get("tuition") or {}).get("in")
    if tuition:
        facts.append(f"in-state tuition about ${round(tuition):,} a year")
    if school.get("median_earnings"):
        facts.append(f"graduates earn about ${round(school['median_earnings']):,} a year ten years after starting")
    text = first + "."
    if facts:
        text += " " + "; ".join(facts) + "."
    source = school.get("source") or {}
    released = f", released {source['released']}" if source.get("released") else ""
    return text + f" Figures from the U.S. Department of Education's College Scorecard{released}."


async def add_school_resources(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    from src.db.life_plans import SchoolEntry
    from src.services.life_plans.public_data import get_school, live_schools

    channel = _own_channel(db_session, ctx, str(args.get("channel_uuid") or ""))
    state = str(args.get("state") or "OR").upper()
    stmt = live_schools().where(SchoolEntry.state == state)
    unitids = args.get("unitids")
    if unitids:
        if not isinstance(unitids, list):
            raise HTTPException(status_code=422, detail="unitids must be a list")
        stmt = stmt.where(SchoolEntry.unitid.in_([str(item) for item in unitids]))  # type: ignore[union-attr]
    entries = sorted(db_session.exec(stmt).all(), key=lambda entry: entry.name)
    own = db_session.exec(select(Resource).where(Resource.org_id == ctx.org_id, Resource.resource_type == "school")).all()
    by_link = {resource.external_url.rstrip("/").lower(): resource for resource in own}
    added, updated, skipped = [], [], []
    for entry in entries:
        school = get_school(db_session, entry.unitid)
        link = _school_link(entry.url)
        if not school or not link:
            skipped.append({"unitid": entry.unitid, "name": entry.name, "why": "no website in the College Scorecard"})
            continue
        fields = {"title": entry.name, "description": _school_description(school), "resource_type": "school", "external_url": link,
                  "provider_name": entry.name, "provider_url": link, "access_mode": "free",
                  "tag_uuids": await _tag_uuids(request, db_session, ctx, [tag for tag in (entry.control, entry.degree) if tag])}
        existing = by_link.get(link.rstrip("/").lower())
        if existing:
            await service.update_resource(request, existing.resource_uuid, ResourceUpdate(**fields), ctx.user, db_session)
            resource = existing
            updated.append(entry.name)
        else:
            created = await service.create_resource(request, ctx.org_id, ResourceCreate(**fields), ctx.user, db_session,
                                                    enrich_metadata=bool(args.get("fill_from_link", False)))
            resource = _own_resource(db_session, ctx, created["resource_uuid"])
            by_link[link.rstrip("/").lower()] = resource
            added.append(entry.name)
        in_channel = db_session.exec(select(ResourceChannelResource.id).where(
            ResourceChannelResource.channel_id == channel.id, ResourceChannelResource.resource_id == resource.id)).first()
        if not in_channel:
            count = len(db_session.exec(select(ResourceChannelResource.id).where(ResourceChannelResource.channel_id == channel.id)).all())
            await service.add_resource_to_channel(request, channel.channel_uuid, resource.resource_uuid, ctx.user, db_session, sort_order=count)
        _refresh_embedding(resource.id)
    note = None if entries else f"No reviewed College Scorecard schools for {state}: load and review them in Platform > Life plans data first."
    return {"channel": channel.name, "state": state, "added": added, "updated": updated, "skipped": skipped, **({"note": note} if note else {})}


# Everyday names for the RIASEC types and O*NET job zones, used as career tags (the same words the app shows).
_INTEREST_TAGS = {"R": "Building", "I": "Thinking", "A": "Creating", "S": "Helping", "E": "Leading", "C": "Organizing"}
_TRAINING_TAGS = {1: "Little or no prep", 2: "High school + training", 3: "Certificate or 2-year", 4: "4-year degree", 5: "Grad school"}


def _career_description(career: dict) -> str:
    source = career.get("source") or {}
    version = (source.get("title") or "O*NET").replace(" Database", "")
    return f"{career.get('description') or ''} Career facts from {version} by USDOL/ETA, used under CC BY 4.0.".strip()


async def add_career_resources(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    from src.db.life_plans import CareerEntry
    from src.services.life_plans.careers import code_of, onet_link
    from src.services.life_plans.public_data import get_career, live_careers, top_interests

    channel = _own_channel(db_session, ctx, str(args.get("channel_uuid") or ""))
    stmt = live_careers()
    codes = args.get("codes")
    if codes:
        if not isinstance(codes, list):
            raise HTTPException(status_code=422, detail="codes must be a list")
        stmt = stmt.where(CareerEntry.code.in_([str(item) for item in codes]))  # type: ignore[union-attr]
    zones = args.get("job_zones")
    if zones:
        if not isinstance(zones, list):
            raise HTTPException(status_code=422, detail="job_zones must be a list")
        stmt = stmt.where(CareerEntry.job_zone.in_([int(item) for item in zones]))  # type: ignore[union-attr]
    # Careers with no interest profile ("All Other" catch-alls) can't be matched or swiped, so they're left out.
    entries = sorted((entry for entry in db_session.exec(stmt).all() if len(entry.interests or {}) == 6), key=lambda entry: entry.title)
    limit = args.get("limit")
    if limit:
        entries = entries[: max(1, int(limit))]
    own = db_session.exec(select(Resource).where(Resource.org_id == ctx.org_id, Resource.resource_type == "career")).all()
    by_code = {code_of(resource): resource for resource in own if code_of(resource)}
    added, updated = [], []
    for entry in entries:
        career = get_career(db_session, entry.code)
        if not career:
            continue
        tags = [_INTEREST_TAGS[letter] for letter in top_interests(entry.interests)[:2]] + ([_TRAINING_TAGS[entry.job_zone]] if entry.job_zone in _TRAINING_TAGS else [])
        link = onet_link(entry.code)
        fields = {"title": entry.title, "description": _career_description(career), "resource_type": "career", "external_url": link,
                  "provider_name": "O*NET OnLine", "provider_url": "https://www.onetonline.org/", "access_mode": "free",
                  "tag_uuids": await _tag_uuids(request, db_session, ctx, tags)}
        existing = by_code.get(entry.code)
        if existing:
            await service.update_resource(request, existing.resource_uuid, ResourceUpdate(**fields), ctx.user, db_session)
            resource = existing
            updated.append(entry.title)
        else:
            created = await service.create_resource(request, ctx.org_id, ResourceCreate(**fields), ctx.user, db_session, enrich_metadata=False)
            resource = _own_resource(db_session, ctx, created["resource_uuid"])
            by_code[entry.code] = resource
            added.append(entry.title)
        in_channel = db_session.exec(select(ResourceChannelResource.id).where(
            ResourceChannelResource.channel_id == channel.id, ResourceChannelResource.resource_id == resource.id)).first()
        if not in_channel:
            count = len(db_session.exec(select(ResourceChannelResource.id).where(ResourceChannelResource.channel_id == channel.id)).all())
            await service.add_resource_to_channel(request, channel.channel_uuid, resource.resource_uuid, ctx.user, db_session, sort_order=count)
        _refresh_embedding(resource.id)
    note = None if entries else "No reviewed O*NET careers to add: load and review the O*NET database in Platform > Life plans data first."
    # Long lists are summed up, so the answer stays readable.
    show = lambda names: names if len(names) <= 40 else names[:40] + [f"and {len(names) - 40} more"]  # noqa: E731
    return {"channel": channel.name, "added": show(added), "updated": show(updated), "added_count": len(added), "updated_count": len(updated), **({"note": note} if note else {})}


_RESOURCE_TYPE = {"type": "string", "enum": _TYPES, "description": "What it is: sets its icon, color and card in Discover."}
_AUDIENCE = {"type": "string", "enum": ["org", "groups", "staff"], "description": "Who sees the channel: everyone in the organization (default), only groups given it on the admin page, or staff only."}

RESOURCE_TOOLS = [
    Tool(
        "list_resource_channels",
        "List resource channels",
        "List the organization's resource channels (its own, then Library channels it saved from other organizations) with who sees each and how many resources it holds. "
        "Discover shows resources by channel, and a resource only reaches learners through a channel they can see.",
        {"properties": {}},
        list_resource_channels,
        scope="resources:read",
    ),
    Tool(
        "list_resources",
        "List resources",
        "List the resources this organization offers (newest first, 50 a page), including its own resources in no channel yet. Filter by search words, channel, type or tags.",
        {"properties": {
            "query": {"type": "string", "description": "Search words, matched on title, description, provider and tags."},
            "channel_uuid": {"type": "string"},
            "resource_types": {"type": "array", "items": {"type": "string", "enum": _TYPES}},
            "tags": {"type": "array", "items": {"type": "string"}, "description": "Tag names; a resource must have all of them."},
            "offset": {"type": "integer"},
            "limit": {"type": "integer", "description": "Up to 50."},
        }},
        list_resources,
        scope="resources:read",
    ),
    Tool(
        "get_resource",
        "Get a resource",
        "Read one resource: every field, its tags and channels, how many learners saved it, its reviews' rating, and its Discover and editor links.",
        {"properties": {"resource_uuid": {"type": "string"}}, "required": ["resource_uuid"]},
        get_resource,
        scope="resources:read",
    ),
    Tool(
        "save_resource",
        "Save a resource",
        "Add a resource (omit resource_uuid; title and external_url are required) or change one of the organization's own. Only the fields given change. "
        "On a new resource the provider and cover image are filled from the link's preview unless given (fill_from_link false skips it). "
        "`tags` (names, made if new) and `channel_uuids` (this organization's channels) each replace the whole set when given. "
        "A resource in no channel is visible to staff only, so put new ones in a channel (list_resource_channels); to take one out of Discover, pass channel_uuids []. "
        "The connector never deletes: the admin deletes resources and channels in the app (editor_url).",
        {"properties": {
            "resource_uuid": {"type": "string", "description": "Omit to add a new resource."},
            "title": {"type": "string"},
            "external_url": {"type": "string", "description": "Where Open takes the learner."},
            "description": {"type": "string", "description": "One or two plain sentences on what it is and why it helps, written for a 15-year-old."},
            "resource_type": _RESOURCE_TYPE,
            "provider_name": {"type": "string", "description": "Who made it, e.g. Khan Academy."},
            "provider_url": {"type": "string"},
            "cover_image_url": {"type": "string", "description": "An image address, e.g. a url from upload_media or add_stock_media."},
            "estimated_time": {"type": "integer", "description": "Minutes it takes."},
            "is_featured": {"type": "boolean", "description": "Featured resources lead their channel in Discover."},
            "access_mode": {"type": "string", "enum": ["free", "paid", "restricted"], "description": "free (default), paid, or restricted (needs an account elsewhere)."},
            "tags": {"type": "array", "items": {"type": "string"}},
            "channel_uuids": {"type": "array", "items": {"type": "string"}},
            "fill_from_link": {"type": "boolean", "description": "New resources only. Default true."},
        }},
        save_resource,
        scope="resources:write",
        read_only=False,
    ),
    Tool(
        "save_resource_channel",
        "Save a resource channel",
        "Make a resource channel (omit channel_uuid; name is required) or change one of the organization's own. Only the fields given change. "
        "`listed` puts the channel in the shared Library for other organizations (needs the resource partner program); only set it when the admin asks.",
        {"properties": {
            "channel_uuid": {"type": "string", "description": "Omit to make a new channel."},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "color": {"type": "string", "description": "A hex color, e.g. #2563eb."},
            "audience": _AUDIENCE,
            "comment_rule": {"type": "string", "enum": ["all", "staff", "off"], "description": "Who may review its resources: everyone (default), staff only, or no one."},
            "hold_links": {"type": "boolean", "description": "Hold reviews with links until staff approve them. Default true."},
            "listed": {"type": "boolean"},
        }},
        save_resource_channel,
        scope="resources:write",
        read_only=False,
    ),
    Tool(
        "add_school_resources",
        "Add schools from the College Scorecard",
        "Make each reviewed College Scorecard school in a state (default OR) a `school` resource in the given channel: its website as the link, "
        "and a short description of its Scorecard facts (students, admission, completion, in-state tuition, earnings) with the source named. "
        "Run it again to refresh: schools already added (matched by website) are updated, never duplicated. Pass unitids to add only some.",
        {"properties": {
            "channel_uuid": {"type": "string", "description": "This organization's channel to file them in (make one with save_resource_channel)."},
            "state": {"type": "string", "description": "Two-letter state. Default OR."},
            "unitids": {"type": "array", "items": {"type": "string"}, "description": "Only these schools (federal school ids)."},
            "fill_from_link": {"type": "boolean", "description": "Fetch each new school's site preview for a cover image. Default false (slower)."},
        }, "required": ["channel_uuid"]},
        add_school_resources,
        scope="resources:write",
        read_only=False,
    ),
    Tool(
        "add_career_resources",
        "Add careers from O*NET",
        "Make each reviewed O*NET career that has an interest profile a `career` resource in the given channel: its O*NET OnLine page as the link, "
        "O*NET's description, and tags for its two strongest interest types (Building, Thinking, Creating, Helping, Leading, Organizing) and its usual training. "
        "In the app a career opens as a profile (pay in Oregon, training, how it fits the learner's interest quiz) and feeds Career swipe. "
        "Run it again to refresh: careers already added (matched by O*NET-SOC code) are updated, never duplicated. Pass codes or job_zones to add only some.",
        {"properties": {
            "channel_uuid": {"type": "string", "description": "This organization's channel to file them in (make one with save_resource_channel, e.g. \"Careers\")."},
            "codes": {"type": "array", "items": {"type": "string"}, "description": "Only these careers (O*NET-SOC codes like 29-2042.00)."},
            "job_zones": {"type": "array", "items": {"type": "integer"}, "description": "Only careers in these job zones (1 little preparation to 5 extensive)."},
            "limit": {"type": "integer", "description": "Add at most this many (alphabetical). Default all."},
        }, "required": ["channel_uuid"]},
        add_career_resources,
        scope="resources:write",
        read_only=False,
    ),
]
