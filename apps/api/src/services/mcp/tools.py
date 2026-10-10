"""Tool catalog for the Launch LMS MCP server."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.services.mcp import handlers
from src.services.mcp.app_shell import PREVIEW_APP_URI
from src.services.oauth.server import AccessContext

logger = logging.getLogger(__name__)

Handler = Callable[[Request, Session, AccessContext, dict], Awaitable[dict]]

_DOCUMENT = {"type": "object", "description": "An Activity Document (format 'launch-lms.activity', format_version 1). See get_activity_schema."}
_TEMPLATE_DOCUMENT = {"type": "object", "description": "A Plan Template Document (format 'launch-lms.plan-template', format_version 1). See get_plan_template_schema."}
_PERSONA = {
    "type": "object",
    "description": "Optional learner variables to preview with, e.g. {\"user.first_name\": \"Sam\", \"user.details.variables.grade\": \"9\"}.",
    "additionalProperties": True,
}


@dataclass(frozen=True)
class Tool:
    name: str
    title: str
    description: str
    input_schema: dict
    handler: Handler
    scope: str = "activities:read"
    read_only: bool = True
    ui: bool = False

    def definition(self) -> dict:
        definition = {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": {"type": "object", **self.input_schema},
            "annotations": {
                "title": self.title,
                "readOnlyHint": self.read_only,
                "destructiveHint": False,
                "idempotentHint": self.read_only,
                "openWorldHint": False,
            },
        }
        if self.ui:
            definition["_meta"] = {"ui": {"resourceUri": PREVIEW_APP_URI}, "ui/resourceUri": PREVIEW_APP_URI}
        return definition


TOOLS = [
    Tool(
        "list_badges",
        "List badges",
        "List the badges in the connected organization with their draft and active versions. Start here to find the badge an admin is talking about.",
        {"properties": {"query": {"type": "string", "description": "Optional case-insensitive name filter."}}},
        handlers.list_badges,
    ),
    Tool(
        "list_activities",
        "List activities in a badge",
        "List the activities of a badge version (default: the newest draft, else the active published version).",
        {"properties": {"badge_uuid": {"type": "string"}, "version_uuid": {"type": "string"}}, "required": ["badge_uuid"]},
        handlers.list_activities,
    ),
    Tool(
        "get_activity",
        "Get an activity",
        "Read one activity as an Activity Document, plus its etag (needed to save) and whether its version is an editable draft.",
        {"properties": {"activity_uuid": {"type": "string"}}, "required": ["activity_uuid"]},
        handlers.get_activity,
    ),
    Tool(
        "get_activity_schema",
        "Activity format guide",
        "Get the authoring guide and JSON Schema for Activity Documents: blocks, questions, branching flow and variants. Read it before writing or editing pages.",
        {"properties": {}},
        handlers.get_activity_schema,
    ),
    Tool(
        "list_variables",
        "List learner variables",
        "List the learner variables this organization defines, usable in flow conditions, display bindings and preview personas.",
        {"properties": {}},
        handlers.list_variables,
    ),
    Tool(
        "validate_activity",
        "Validate an activity",
        "Check an Activity Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass activity_uuid when editing an existing activity, badge_uuid when drafting a new one.",
        {"properties": {"document": _DOCUMENT, "activity_uuid": {"type": "string"}, "badge_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_activity,
    ),
    Tool(
        "preview_activity",
        "Preview an activity",
        "Show the admin an interactive preview of an activity exactly as learners will experience it (same player, grading and branching). Pass `document` to preview unsaved edits; omit it to preview what is saved. Nothing is written to learner records.",
        {
            "properties": {
                "activity_uuid": {"type": "string"},
                "badge_uuid": {"type": "string", "description": "Use with `document` when previewing an activity that does not exist yet."},
                "document": _DOCUMENT,
                "persona": _PERSONA,
            },
        },
        handlers.preview_activity,
        ui=True,
    ),
    Tool(
        "save_activity",
        "Save an activity",
        "Save an Activity Document over an existing activity in a draft badge version. Requires the etag from get_activity (or the last save). Fails with the current document if someone changed the activity since. Publishing the draft stays with the admin in Launch LMS.",
        {"properties": {"activity_uuid": {"type": "string"}, "document": _DOCUMENT, "base_etag": {"type": "string"}}, "required": ["activity_uuid", "document", "base_etag"]},
        handlers.save_activity,
        scope="activities:write",
        read_only=False,
    ),
    Tool(
        "create_activity",
        "Create an activity",
        "Add a new activity to a badge's draft version from an Activity Document (defaults to the newest draft). New pages use short placeholder ids; a document read with get_activity can be passed to copy that activity.",
        {"properties": {"badge_uuid": {"type": "string"}, "version_uuid": {"type": "string"}, "document": _DOCUMENT}, "required": ["badge_uuid", "document"]},
        handlers.create_activity,
        scope="activities:write",
        read_only=False,
    ),
    Tool(
        "list_plan_templates",
        "List plan templates",
        "List the plan templates in the connected organization with their size and how often they have been assigned. Start here to find the template an admin is talking about.",
        {"properties": {"query": {"type": "string", "description": "Optional case-insensitive filter on name and description."}}},
        handlers.list_plan_templates,
        scope="templates:read",
    ),
    Tool(
        "get_plan_template",
        "Get a plan template",
        "Read one plan template as a Plan Template Document (details, roles, phases, objectives, steps and schedule), plus its etag (needed to save).",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        handlers.get_plan_template,
        scope="templates:read",
    ),
    Tool(
        "get_plan_template_schema",
        "Plan template format guide",
        "Get the authoring guide and JSON Schema for Plan Template Documents: phases, objectives, steps, schedules, badge objectives and roles. Read it before writing or editing a template.",
        {"properties": {}},
        handlers.get_plan_template_schema,
        scope="templates:read",
    ),
    Tool(
        "list_requirement_nodes",
        "List requirement nodes",
        "List the organization's requirement frameworks and their nodes, which objectives can count toward via requirement_node_uuids.",
        {"properties": {}},
        handlers.list_requirement_nodes,
        scope="templates:read",
    ),
    Tool(
        "validate_plan_template",
        "Validate a plan template",
        "Check a Plan Template Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass template_uuid when editing an existing template; omit it for a new one.",
        {"properties": {"document": _TEMPLATE_DOCUMENT, "template_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_plan_template,
        scope="templates:read",
    ),
    Tool(
        "save_plan_template",
        "Save a plan template",
        "Save a Plan Template Document over an existing plan template. Requires the etag from get_plan_template (or the last save). Fails with the current document if someone changed the template since. Plans already assigned are not changed.",
        {"properties": {"template_uuid": {"type": "string"}, "document": _TEMPLATE_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["template_uuid", "document", "base_etag"]},
        handlers.save_plan_template,
        scope="templates:write",
        read_only=False,
    ),
    Tool(
        "create_plan_template",
        "Create a plan template",
        "Create a new plan template from a Plan Template Document. Omit uuids for new phases and objectives; a document read with get_plan_template can be passed to copy that template.",
        {"properties": {"document": _TEMPLATE_DOCUMENT}, "required": ["document"]},
        handlers.create_plan_template,
        scope="templates:write",
        read_only=False,
    ),
]
TOOLS_BY_NAME = {tool.name: tool for tool in TOOLS}


def _summary(name: str, result: dict) -> str:
    if name == "preview_activity":
        state = "unsaved draft" if result.get("unsaved") else "saved version"
        return f"Interactive preview of the {state} is ready: {result['preview_url']} (link valid until {result['expires_at']})."
    if name in {"save_activity", "create_activity"}:
        document = result["document"]
        return (
            f"Saved \"{document['activity']['title']}\" ({len(document['pages'])} pages) to draft "
            f"\"{result['context'].get('version_title')}\". New etag: {result['etag']}. Review and publish in Launch LMS: {result['editor_url']}"
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
    logger.info("mcp tool call", extra={"tool": name, "user_id": ctx.user.id, "org_id": ctx.org_id, "client": ctx.client_id})
    try:
        result = await tool.handler(request, db_session, ctx, args or {})
    except HTTPException as exc:
        db_session.rollback()
        return {"content": [{"type": "text", "text": _error_text(exc)}], "isError": True}
    except (KeyError, TypeError, ValueError) as exc:
        db_session.rollback()
        return {"content": [{"type": "text", "text": f"Invalid arguments for {name}: {exc}"}], "isError": True}
    return {"content": [{"type": "text", "text": _summary(name, result)}], "structuredContent": result}
