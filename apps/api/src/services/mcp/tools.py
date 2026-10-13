"""Tool catalog for the Launch LMS MCP server."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from typing import Awaitable, Callable

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from sqlmodel import Session

from src.services.mcp import handlers
from src.services.mcp.app_shell import PREVIEW_APP_URI
from src.services.oauth.server import AccessContext, admin_orgs

logger = logging.getLogger(__name__)

Handler = Callable[[Request, Session, AccessContext, dict], Awaitable[dict]]

_DOCUMENT = {"type": "object", "description": "An Activity Document (format 'launch-lms.activity', format_version 1). See get_activity_schema."}
_TEMPLATE_DOCUMENT = {"type": "object", "description": "A Plan Template Document (format 'launch-lms.plan-template', format_version 1). See get_plan_template_schema."}
_FRAMEWORK_DOCUMENT = {"type": "object", "description": "A Requirement Framework Document (format 'launch-lms.requirement-framework', format_version 1). See get_requirement_framework_schema."}
_BADGE_DOCUMENT = {"type": "object", "description": "A Badge Document (format 'launch-lms.badge', format_version 1). See get_badge_schema."}
_ORG = {
    "type": "string",
    "description": "Slug of the organization to act in (see list_organizations). Omit to use the organization chosen when connecting.",
}
_LIBRARY_KIND = {"type": "string", "enum": ["plan_template", "requirement_framework"]}
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
    org_scoped: bool = True

    def definition(self) -> dict:
        input_schema = {"type": "object", **self.input_schema}
        if self.org_scoped:
            input_schema["properties"] = {**input_schema.get("properties", {}), "org": _ORG}
        definition = {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": input_schema,
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
        "list_organizations",
        "List organizations",
        "List the organizations this admin can manage through the connector, and which one tools use by default. Pass another one's slug as `org` to any tool to act there.",
        {"properties": {}},
        handlers.list_organizations,
        org_scoped=False,
    ),
    Tool(
        "list_activities",
        "List activities",
        "List the interactive activities of a plan template: one per activity objective, edited in place.",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        handlers.list_activities,
    ),
    Tool(
        "get_activity",
        "Get an activity",
        "Read one activity as an Activity Document, plus its etag (needed to save) and the template it belongs to.",
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
        "Check an Activity Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass activity_uuid when editing an existing activity.",
        {"properties": {"document": _DOCUMENT, "activity_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_activity,
    ),
    Tool(
        "preview_activity",
        "Preview an activity",
        "Show the admin an interactive preview of an activity exactly as learners will experience it (same player, grading and branching). Pass `document` to preview unsaved edits; omit it to preview what is saved. Nothing is written to learner records.",
        {
            "properties": {
                "activity_uuid": {"type": "string"},
                "template_uuid": {"type": "string", "description": "Use with `document` when previewing an activity that is not saved yet."},
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
        "Save an Activity Document over a plan template's activity, in place; everyone playing it sees the change. Requires the etag from get_activity (or the last save). Fails with the current document if someone changed the activity since. Never deletes learner work: removing a page learners have answered is refused.",
        {"properties": {"activity_uuid": {"type": "string"}, "document": _DOCUMENT, "base_etag": {"type": "string"}}, "required": ["activity_uuid", "document", "base_etag"]},
        handlers.save_activity,
        scope="activities:write",
        read_only=False,
    ),
    Tool(
        "list_plan_templates",
        "List plan templates",
        "List the plan templates in the connected organization with their size and how often they have been assigned. Start here to find the template an admin is talking about.",
        {"properties": {"query": {"type": "string", "description": "Optional case-insensitive filter on name and description."}}},
        handlers.list_plan_templates,
        scope="plans:read",
    ),
    Tool(
        "get_plan_template",
        "Get a plan template",
        "Read one plan template as a Plan Template Document (details, roles, phases, objectives, steps and schedule), plus its etag (needed to save).",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        handlers.get_plan_template,
        scope="plans:read",
    ),
    Tool(
        "get_plan_template_schema",
        "Plan template format guide",
        "Get the authoring guide and JSON Schema for Plan Template Documents: phases, objectives, steps, schedules, badge objectives and roles. Read it before writing or editing a template.",
        {"properties": {}},
        handlers.get_plan_template_schema,
        scope="plans:read",
    ),
    Tool(
        "validate_plan_template",
        "Validate a plan template",
        "Check a Plan Template Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass template_uuid when editing an existing template; omit it for a new one.",
        {"properties": {"document": _TEMPLATE_DOCUMENT, "template_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_plan_template,
        scope="plans:read",
    ),
    Tool(
        "save_plan_template",
        "Save a plan template",
        "Save a Plan Template Document over an existing plan template. Requires the etag from get_plan_template (or the last save). Fails with the current document if someone changed the template since. Plans already assigned are not changed.",
        {"properties": {"template_uuid": {"type": "string"}, "document": _TEMPLATE_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["template_uuid", "document", "base_etag"]},
        handlers.save_plan_template,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "create_plan_template",
        "Create a plan template",
        "Create a new plan template from a Plan Template Document. Omit uuids for new phases and objectives; a document read with get_plan_template can be passed to copy that template.",
        {"properties": {"document": _TEMPLATE_DOCUMENT}, "required": ["document"]},
        handlers.create_plan_template,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "set_objective_requirements",
        "Link an objective to requirements",
        "Replace the requirement nodes one plan template objective counts toward. Link leaf requirements (see list_requirement_frameworks). Use it to say that objectives in different templates achieve the same thing.",
        {
            "properties": {
                "template_uuid": {"type": "string"},
                "objective_uuid": {"type": "string"},
                "node_uuids": {"type": "array", "items": {"type": "string"}, "description": "The full set; an empty list removes every link."},
            },
            "required": ["template_uuid", "objective_uuid", "node_uuids"],
        },
        handlers.set_objective_requirements,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "update_template_badge_versions",
        "Move badge objectives to the latest badge versions",
        "Point a template's badge objectives at each badge's newest published major version (get_plan_template lists outdated ones). Future assignments then require the new version.",
        {"properties": {"template_uuid": {"type": "string"}, "accept_previous_major_versions": {"type": "boolean", "description": "Still accept awards of the earlier version."}}, "required": ["template_uuid"]},
        handlers.update_template_badge_versions,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_requirement_frameworks",
        "List requirement frameworks",
        "List the organization's requirement frameworks with every requirement node (code, title, whether it is a leaf). Objectives link to leaf nodes.",
        {"properties": {}},
        handlers.list_requirement_frameworks,
        scope="plans:read",
    ),
    Tool(
        "get_requirement_framework",
        "Get a requirement framework",
        "Read a requirement framework's working version as a Requirement Framework Document, plus its etag (needed to save), version history, the template objectives linked to each node, and leaf requirements nothing links to yet.",
        {"properties": {"framework_uuid": {"type": "string"}}, "required": ["framework_uuid"]},
        handlers.get_requirement_framework,
        scope="plans:read",
    ),
    Tool(
        "get_requirement_framework_schema",
        "Requirement framework format guide",
        "Get the authoring guide and JSON Schema for Requirement Framework Documents: nodes, hierarchy levels, codes, versions and publishing.",
        {"properties": {}},
        handlers.get_requirement_framework_schema,
        scope="plans:read",
    ),
    Tool(
        "validate_requirement_framework",
        "Validate a requirement framework",
        "Check a Requirement Framework Document against every rule without saving, including which linked objectives an edit would affect. Pass framework_uuid when editing an existing framework.",
        {"properties": {"document": _FRAMEWORK_DOCUMENT, "framework_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_requirement_framework,
        scope="plans:read",
    ),
    Tool(
        "save_requirement_framework",
        "Save a requirement framework",
        "Save a Requirement Framework Document as the framework's working draft (a published version is never changed: saving over it starts a new draft). Requires the etag from get_requirement_framework. Does not publish.",
        {"properties": {"framework_uuid": {"type": "string"}, "document": _FRAMEWORK_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["framework_uuid", "document", "base_etag"]},
        handlers.save_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "create_requirement_framework",
        "Create a requirement framework",
        "Create a new requirement framework (as an unpublished draft) from a Requirement Framework Document.",
        {"properties": {"document": _FRAMEWORK_DOCUMENT}, "required": ["document"]},
        handlers.create_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "publish_requirement_framework",
        "Publish a requirement framework",
        "Publish the framework's current draft so new enrollments use it. Learners already enrolled stay on their version. Only call this when the admin asks to publish.",
        {"properties": {"framework_uuid": {"type": "string"}}, "required": ["framework_uuid"]},
        handlers.publish_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_badges",
        "List badges",
        "List the organization's badges with their status, live version, whether a draft is waiting, how many plan templates earn each, and their collection.",
        {"properties": {"query": {"type": "string", "description": "Optional case-insensitive filter on name and description."}}},
        handlers.list_badges,
        scope="plans:read",
    ),
    Tool(
        "get_badge",
        "Get a badge",
        "Read a badge's working version (its draft, else the live version) as a Badge Document: credential, Marketing and listing, plus its etag (needed to save), versions, and the plan templates that earn it.",
        {"properties": {"badge_uuid": {"type": "string"}}, "required": ["badge_uuid"]},
        handlers.get_badge,
        scope="plans:read",
    ),
    Tool(
        "get_badge_schema",
        "Badge format guide",
        "Get the authoring guide and JSON Schema for Badge Documents: credential fields, Marketing, listing, versions, publishing and ways to earn. Read it before creating or editing a badge.",
        {"properties": {}},
        handlers.get_badge_schema,
        scope="plans:read",
    ),
    Tool(
        "validate_badge",
        "Validate a badge",
        "Check a Badge Document against every rule without saving. Returns errors and warnings (including what is still missing to publish) with JSON paths.",
        {"properties": {"document": _BADGE_DOCUMENT}, "required": ["document"]},
        handlers.validate_badge,
        scope="plans:read",
    ),
    Tool(
        "create_badge",
        "Create a badge",
        "Create a new badge from a Badge Document. It starts as an unpublished draft; link the plan templates that earn it with set_badge_routes, then publish_badge when the admin asks.",
        {"properties": {"document": _BADGE_DOCUMENT}, "required": ["document"]},
        handlers.create_badge,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "save_badge",
        "Save a badge",
        "Save a Badge Document over a badge's working version. A published version is never changed: saving credential or Marketing edits over one starts a new draft. Listing changes apply at once. Requires the etag from get_badge. Does not publish.",
        {"properties": {"badge_uuid": {"type": "string"}, "document": _BADGE_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["badge_uuid", "document", "base_etag"]},
        handlers.save_badge,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "publish_badge",
        "Publish a badge",
        "Publish the badge's draft as a new semantic version and make it live. Omit semantic_version for the next minor (1.0.0 the first time). Only call this when the admin asks to publish.",
        {
            "properties": {
                "badge_uuid": {"type": "string"},
                "semantic_version": {"type": "string", "description": "major.minor.patch, greater than every published version. See get_badge context.next_semantic_versions."},
                "release_title": {"type": "string"},
                "release_notes": {"type": "string"},
            },
            "required": ["badge_uuid"],
        },
        handlers.publish_badge,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "set_badge_routes",
        "Set the ways to earn a badge",
        "Set the plan templates that earn a badge (its ways to earn) and which one is recommended. Learners who start the badge get their own plan from the recommended template. Pass the full list including the current routes: routes can be added but not removed here (remove them in the Launch LMS editor).",
        {
            "properties": {
                "badge_uuid": {"type": "string"},
                "routes": {
                    "type": "array",
                    "items": {"type": "object", "properties": {"template_uuid": {"type": "string"}, "recommended": {"type": "boolean"}}, "required": ["template_uuid"]},
                },
            },
            "required": ["badge_uuid", "routes"],
        },
        handlers.set_badge_routes,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_badge_collections",
        "List badge collections",
        "List the organization's badge collections with their credibility statement, endorsers and badges.",
        {"properties": {}},
        handlers.list_badge_collections,
        scope="plans:read",
    ),
    Tool(
        "save_badge_collection",
        "Create or edit a badge collection",
        "Create a badge collection (omit collection_uuid) or update one. Only the fields you pass change; endorsers replaces the whole list.",
        {
            "properties": {
                "collection_uuid": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "thumbnail_image": {"type": "string", "description": "https URL or /content/... path."},
                "credibility": {"type": "string", "description": "Why learners and employers should trust these badges."},
                "endorsers": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "url": {"type": "string"}, "logo_url": {"type": "string"}}, "required": ["name"]}},
                "public": {"type": "boolean"},
                "hidden": {"type": "boolean", "description": "Hidden collections are reachable by link only."},
            },
        },
        handlers.save_badge_collection,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "search_library",
        "Search the global library",
        "Search the plan templates or requirement frameworks published to the shared Launch LMS library.",
        {"properties": {"kind": _LIBRARY_KIND, "query": {"type": "string"}}, "required": ["kind"]},
        handlers.search_library,
        scope="plans:read",
    ),
    Tool(
        "copy_from_library",
        "Copy from the global library",
        "Copy a library plan template or requirement framework into the connected organization as an independent copy.",
        {"properties": {"kind": _LIBRARY_KIND, "uuid": {"type": "string", "description": "The library item's uuid from search_library."}}, "required": ["kind", "uuid"]},
        handlers.copy_from_library,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "publish_to_library",
        "Publish to the global library",
        "Publish (or refresh) a snapshot of one of this organization's plan templates or published requirement frameworks to the shared library. Only the platform's owner organization can do this. Only call it when the admin asks.",
        {"properties": {"kind": _LIBRARY_KIND, "uuid": {"type": "string"}}, "required": ["kind", "uuid"]},
        handlers.publish_to_library,
        scope="plans:write",
        read_only=False,
    ),
]
TOOLS_BY_NAME = {tool.name: tool for tool in TOOLS}


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
