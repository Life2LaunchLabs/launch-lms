"""Tool calls for the Launch LMS MCP server: organization resolution, scope checks and result summaries."""

from __future__ import annotations

import json
import logging
from dataclasses import replace

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from sqlmodel import Session

from src.services.mcp.catalog import TOOLS, TOOLS_BY_NAME, Tool  # noqa: F401  (re-exported)
from src.services.oauth.server import AccessContext, admin_orgs

logger = logging.getLogger(__name__)

def _summary(name: str, result: dict) -> str:
    if name == "preview_activity":
        state = "unsaved draft" if result.get("unsaved") else "saved version"
        return f"Interactive preview of the {state} is ready: {result['preview_url']} (link valid until {result['expires_at']})."
    if name == "save_activity":
        document = result["document"]
        return (
            f"Saved \"{document['activity']['title']}\" ({len(document['pages'])} pages) in \"{result['context'].get('template_name')}\". "
            f"New etag: {result['etag']}. Review in Launch LMS: {result['editor_url']}"
        )
    if name in {"save_plan_template", "create_plan_template"}:
        document = result["document"]
        objectives = sum(len(phase.get("objectives") or []) for phase in document["phases"])
        verb = "Saved" if result.get("changed") else "No changes to"
        warnings = "".join(f"\nWarning at {item['path']}: {item['message']}" for item in result.get("warnings") or [])
        return (
            f"{verb} plan template \"{document['template']['name']}\" ({len(document['phases'])} phases, {objectives} objectives). "
            f"New etag: {result['etag']}. Review in Launch LMS: {result['editor_url']}{warnings}"
        )
    if name in {"save_requirement_framework", "create_requirement_framework", "publish_requirement_framework"}:
        document, context = result["document"], result["context"]
        verb = {"publish_requirement_framework": "Published"}.get(name, "Saved" if result.get("changed") else "No changes to")
        warnings = "".join(f"\nWarning at {item['path']}: {item['message']}" for item in result.get("warnings") or [])
        return (
            f"{verb} requirement framework \"{document['framework']['name']}\" version {context['version']} ({context['status']}, {len(document['nodes'])} requirements). "
            f"New etag: {result['etag']}. Review in Launch LMS: {result['editor_url']}{warnings}"
        )
    if name in {"create_badge", "save_badge", "publish_badge", "set_badge_routes"}:
        document, context = result["document"], result["context"]
        working = context["working_version"]
        if name == "publish_badge":
            verb = f"Published version {result['published_semantic_version']} of"
        elif name == "set_badge_routes":
            verb = "Updated the ways to earn"
        elif name == "create_badge":
            verb = "Created"
        else:
            verb = ("Saved (started a new draft)" if result.get("started_draft") else "Saved") if result.get("changed") else "No changes to"
        live = context["live_version"]
        state = f"live version {live['semantic_version']}" if live else "not published yet"
        if context["has_unpublished_draft"]:
            state += ", unpublished draft waiting"
        routes = ", ".join(f"{route['name']}{' (recommended)' if route['recommended'] else ''}" for route in context["routes"]) or "none yet"
        warnings = "".join(f"\nWarning at {item['path']}: {item['message']}" for item in result.get("warnings") or [])
        return (
            f"{verb} badge \"{document['badge']['name']}\" ({state}; working version: {working['state']}). Ways to earn: {routes}. "
            f"New etag: {result['etag']}. Review in Launch LMS: {result['editor_url']}{warnings}"
        )
    return json.dumps(result, ensure_ascii=False, default=str)


def _error_text(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return json.dumps({"status": exc.status_code, **detail}, ensure_ascii=False, default=str)
    return json.dumps({"status": exc.status_code, "message": str(detail)}, ensure_ascii=False)


async def call_tool(request: Request, db_session: Session, ctx: AccessContext, name: str, args: dict) -> dict:
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        return {"content": [{"type": "text", "text": f"Unknown tool: {name}"}], "isError": True}
    if tool.scope not in ctx.scopes:
        return {"content": [{"type": "text", "text": f"This connection was not granted {tool.scope}. Reconnect Launch LMS to allow it."}], "isError": True}
    args = dict(args or {})
    org_ref = args.pop("org", None) if tool.org_scoped else None
    if org_ref:
        orgs = {org.slug: org for org in admin_orgs(db_session, ctx.user)}
        org = orgs.get(str(org_ref).strip())
        if org is None:
            available = ", ".join(sorted(orgs)) or "none"
            return {"content": [{"type": "text", "text": f"You are not an admin of an organization with slug {org_ref!r}. Organizations you can manage: {available}."}], "isError": True}
        ctx = replace(ctx, org_id=int(org.id))  # type: ignore[arg-type]
    logger.info("mcp tool call", extra={"tool": name, "user_id": ctx.user.id, "org_id": ctx.org_id, "client": ctx.client_id})
    try:
        result = await tool.handler(request, db_session, ctx, args)
    except HTTPException as exc:
        db_session.rollback()
        return {"content": [{"type": "text", "text": _error_text(exc)}], "isError": True}
    except (KeyError, TypeError, ValueError) as exc:
        db_session.rollback()
        return {"content": [{"type": "text", "text": f"Invalid arguments for {name}: {exc}"}], "isError": True}
    result = jsonable_encoder(result)  # dates and datetimes become ISO strings
    return {"content": [{"type": "text", "text": _summary(name, result)}], "structuredContent": result}
