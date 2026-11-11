"""The connector's plan collection, listing and cover tools.

Collections group plans (and carry the categories /start and Discover rank by); the platform's own
collections can be starters. A listing says whether other organizations find a plan in Discover and how
they may use it; a cover is the plan's image or icon on a colour, the same in every version.
"""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.goal_templates import TemplateCover
from src.db.plan_collections import PlanCollectionCreate, PlanCollectionUpdate
from src.db.template_marketplace import TemplateLearnerAccessUpdate, TemplateListingUpdate
from src.services.goals import collections, template_learners, template_marketplace, templates
from src.services.oauth.server import AccessContext


async def list_collections(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return collections.list_collections(db_session, ctx.user, ctx.org_id)


async def save_collection(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    """Create a collection (no collection_uuid) or change one. ``template_uuids``, when given, is the whole plan list."""
    uuid = args.get("collection_uuid")
    fields = {key: args[key] for key in ("name", "description", "categories") if key in args}
    if uuid:
        result = collections.update_collection(db_session, ctx.user, ctx.org_id, uuid, PlanCollectionUpdate(**fields))
    else:
        if not fields.get("name"):
            raise HTTPException(status_code=422, detail="name is required for a new collection")
        result = collections.create_collection(db_session, ctx.user, ctx.org_id, PlanCollectionCreate(**fields))
        uuid = result["collection_uuid"]
    if "starter" in args:
        result = collections.update_collection(db_session, ctx.user, ctx.org_id, uuid, PlanCollectionUpdate(starter=bool(args["starter"])))
    if "template_uuids" in args:
        wanted = [str(item) for item in args["template_uuids"] or []]
        for gone in [item for item in result["template_uuids"] if item not in wanted]:
            result = collections.remove_plan(db_session, ctx.user, ctx.org_id, uuid, gone)
        if missing := [item for item in wanted if item not in result["template_uuids"]]:
            result = collections.add_plans(db_session, ctx.user, ctx.org_id, uuid, missing)
    return result


def _listing(args: dict, listed: bool = True) -> TemplateListingUpdate:
    return TemplateListingUpdate(listed=listed, mode=args.get("mode") or "locked", access=args.get("access") or "request")


async def set_plan_listing(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    listing = _listing(args, bool(args.get("listed", True)))
    return template_marketplace.set_listing(db_session, ctx.user, ctx.org_id, args["template_uuid"], listing)


def plan_share_url(db: Session, org_id: int, template_uuid: str) -> str:
    """The plan's Discover page on the organization's address: people who open it can start it there,
    joining the organization on the way."""
    from urllib.parse import quote

    from src.services.goals.mcp_templates import _org_slug
    from src.services.oauth.config import frontend_url

    return f"{frontend_url()}/orgs/{_org_slug(db, org_id)}/discover/plans/{quote(template_uuid)}"


async def set_plan_access(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    """Who can find and start the plan in this organization (the admin's "Who can find it"), and the link to share."""
    access = args.get("access")
    if access not in ("open", "request", "invite"):
        raise HTTPException(status_code=422, detail="access must be open, request or invite")
    result = template_learners.set_template_access(db_session, ctx.user, ctx.org_id, args["template_uuid"], TemplateLearnerAccessUpdate(access=access))
    result.pop("can_edit", None)
    result["share_url"] = plan_share_url(db_session, ctx.org_id, args["template_uuid"])
    result["note"] = ("Invite only: the plan isn't on Discover, and the link only shows what it asks. Only people your team assigns can start it."
                      if access == "invite" else
                      "Anyone with the link can start it here (or ask to, by request), joining your organization if they aren't in it yet. It needs a live version with steps.")
    return result


async def set_plan_cover(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    fields = {key: args[key] for key in ("thumbnail_image", "icon", "color") if key in args}
    if not fields:
        raise HTTPException(status_code=422, detail="Give thumbnail_image, icon or color")
    return {"template_uuid": args["template_uuid"], **templates.set_cover(db_session, ctx.user, ctx.org_id, args["template_uuid"], TemplateCover(**fields))}
