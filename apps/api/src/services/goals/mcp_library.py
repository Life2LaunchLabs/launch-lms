"""The connector's library tools: goal templates (``goals.library``) and requirement frameworks (``services/requirements``)."""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.services.goals import library, templates
from src.services.goals.mcp_templates import envelope
from src.services.oauth.server import AccessContext

_KINDS = {"plan_template", "requirement_framework"}


def _kind(args: dict) -> str:
    kind = str(args.get("kind") or "")
    if kind not in _KINDS:
        raise HTTPException(status_code=422, detail="kind must be plan_template or requirement_framework")
    return kind


async def search_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind, query = _kind(args), str(args.get("query") or "")
    if kind == "plan_template":
        return {"kind": kind, "items": [{**item, "uuid": item["template_uuid"]} for item in library.list_library(db_session, ctx.user, ctx.org_id, query)]}
    from src.services import requirements

    return {"kind": kind, "items": [{**item, "uuid": item["framework_uuid"]} for item in requirements.list_framework_library(db_session, ctx.user, ctx.org_id, query)]}


async def copy_from_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind = _kind(args)
    if kind == "plan_template":
        return {"kind": kind, **envelope(db_session, templates.template_or_404(db_session, ctx.org_id, library.copy_from_library(db_session, ctx.user, ctx.org_id, args["uuid"])["template_uuid"]))}
    from src.services import requirements
    from src.services.mcp.handlers import _with_framework_url
    from src.services.requirement_documents import store as requirement_store

    copied = requirements.copy_framework_from_library(db_session, ctx.user, ctx.org_id, args["uuid"])
    framework = requirement_store.get_framework_document(db_session, ctx.user, ctx.org_id, copied["framework_uuid"])
    return {"kind": kind, **_with_framework_url(db_session, ctx, framework)}


async def publish_to_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind = _kind(args)
    if kind == "plan_template":
        library.publish_to_library(db_session, ctx.user, ctx.org_id, args["uuid"])
    else:
        from src.services import requirements

        requirements.publish_framework_to_library(db_session, ctx.user, ctx.org_id, args["uuid"], bool(args.get("editable", True)))
    return {"kind": kind, "uuid": args["uuid"], "published_to_library": True}
