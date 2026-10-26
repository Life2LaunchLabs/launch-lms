"""Stateless MCP (Streamable HTTP) JSON-RPC handling.

Each POST carries one JSON-RPC message (or a batch). Requests get a JSON
response; notifications and responses are acknowledged with 202 by the router.
No session state is kept between requests.
"""

from __future__ import annotations

import json

from fastapi import Request
from sqlmodel import Session

from src.services.learning_documents.models import activity_document_json_schema, authoring_guide
from src.services.mcp.app_shell import APP_MIME_TYPE, PREVIEW_APP_URI, preview_app_html, preview_app_meta
from src.services.mcp.tools import TOOLS, call_tool
from src.services.goals.document import json_schema as plan_template_json_schema
from src.services.goals.mcp_templates import authoring_guide as template_authoring_guide
from src.services.requirement_documents.models import authoring_guide as requirement_authoring_guide
from src.services.requirement_documents.models import requirement_framework_json_schema
from src.services.oauth.server import AccessContext

SUPPORTED_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SERVER_INFO = {"name": "launch-lms", "title": "Launch LMS", "version": "1.1.0"}
INSTRUCTIONS = """Launch LMS holds plans, the requirements they count toward, and the badges they earn. Everything belongs to an organization: tools act in the organization chosen when connecting; list_organizations shows every organization this admin manages, and any tool takes `org` (a slug) to act in another one. Say which organization you are working in when it is not the default.

Requirement frameworks (standards, competencies, state mandates) are hierarchies of requirement nodes. Turn a requirements write-up into one with get_requirement_framework_schema, validate_requirement_framework and create_requirement_framework (or edit an existing one from list_requirement_frameworks / get_requirement_framework). Frameworks are versioned: saves edit a draft; publish_requirement_framework only when the admin asks.

Plan templates are reusable goals: an ordered stack of stages of typed steps that learners get as their own goal, assigned by an organization or joined from Discover. A step is a task, upload, write-up, event, another plan's badge to earn, decision or an interactive activity the learner plays in the app. Steps link to leaf requirement nodes (requirement_node_uuids in the document, or set_objective_requirements with the step_key). Read get_plan_template_schema first; build the whole document, run validate_plan_template until it is clean, then create_plan_template or save_plan_template. Templates are versioned: create_plan_template and save_plan_template edit the draft, and publish_plan_template (only when the admin asks) makes it the version new assignments and learners joining get. Issued goals keep their version and their learners' answers; restore_plan_template_version rolls back by publishing an earlier version again.

Activities: add one by giving a new step type "activity" in a template document and saving; list_activities then shows its activity_uuid. Read get_activity_schema, write the whole Activity Document, validate_activity until clean, show preview_activity so the admin can click through, then save_activity. Activity edits change the template's draft and reach learners when the template is published.

Badges are an optional part of a plan: the template document's `badge` block (kind, skills, certificate style, optional name and image, extra Open Badges fields). Everything else about the badge comes from the plan (title, description, criteria, requirements, version), and finishing the plan earns it. It is drafted and published with the plan.

Typical flow: requirements write-up -> framework -> template whose steps link to it, with a `badge` block if finishing it should earn a badge -> publish_plan_template when the admin asks.

Insights dashboards show an organization's numbers as cards: the whole organization, one plan, one group or one learner. Read get_dashboard_schema for the scope first (the measures, breakdowns, templates and questions), write the whole document, validate_dashboard until clean, preview_card a card you are unsure of, then create_dashboard or save_dashboard with the revision you read. Tools see only what the admin sees in Insights. capture_dashboard freezes a dashboard with a note; save_capture_rule schedules captures and sends them to staff or by email, only when the admin asks.

Coach (platform admins only): get_coach_policy shows the coaching policy's draft. save_coach_playbook and delete_coach_playbook write knowledge into the draft; preview_coach_knowledge shows which playbooks a learner message would bring in. Nothing reaches learners until a person releases the draft on Platform › Coach › Releases, so never say a change is live. Tests: list_coach_tests explains how to write realistic scenarios; save_coach_test writes one; run_coach_tests grades the draft beside the live release and get_coach_test_run reads the result. A run makes real model calls, so run it when the admin asks.

Save only when the admin asks, with the etag you read; on a stale-document error, merge your change into the returned current document and retry. Tell the admin what will change (validation warnings list removals) and point them to the editor_url to review. Publishing to the global library happens only when the admin asks."""

RESOURCES = [
    {
        "uri": "launch-lms://activity-document/guide",
        "name": "activity-authoring-guide",
        "title": "Activity authoring guide",
        "description": "How Launch LMS activities, blocks, questions and branching flows are written.",
        "mimeType": "text/markdown",
    },
    {
        "uri": "launch-lms://activity-document/schema",
        "name": "activity-document-schema",
        "title": "Activity Document JSON Schema",
        "description": "JSON Schema for Activity Document v1.",
        "mimeType": "application/schema+json",
    },
    {
        "uri": "launch-lms://plan-template-document/guide",
        "name": "plan-template-authoring-guide",
        "title": "Plan template authoring guide",
        "description": "How Launch LMS plan templates (goal templates: stages of typed steps) are written.",
        "mimeType": "text/markdown",
    },
    {
        "uri": "launch-lms://plan-template-document/schema",
        "name": "plan-template-document-schema",
        "title": "Plan Template Document JSON Schema",
        "description": "JSON Schema for the Goal Template Document (launch-lms.goal-template v1).",
        "mimeType": "application/schema+json",
    },
    {
        "uri": "launch-lms://requirement-framework-document/guide",
        "name": "requirement-framework-authoring-guide",
        "title": "Requirement framework authoring guide",
        "description": "How Launch LMS requirement frameworks, categories, numbering, rules and versions work.",
        "mimeType": "text/markdown",
    },
    {
        "uri": "launch-lms://requirement-framework-document/schema",
        "name": "requirement-framework-document-schema",
        "title": "Requirement Framework Document JSON Schema",
        "description": "JSON Schema for Requirement Framework Document v1.",
        "mimeType": "application/schema+json",
    },
    {
        "uri": PREVIEW_APP_URI,
        "name": "activity-preview",
        "title": "Activity preview",
        "description": "Interactive preview of an activity, rendered by the Launch LMS learner player.",
        "mimeType": APP_MIME_TYPE,
    },
]


class RpcError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def _negotiate(requested: str | None) -> str:
    return requested if requested in SUPPORTED_VERSIONS else SUPPORTED_VERSIONS[0]


def _read_resource(uri: str) -> dict:
    if uri == "launch-lms://activity-document/guide":
        return {"uri": uri, "mimeType": "text/markdown", "text": authoring_guide()}
    if uri == "launch-lms://activity-document/schema":
        return {"uri": uri, "mimeType": "application/schema+json", "text": json.dumps(activity_document_json_schema())}
    if uri == "launch-lms://plan-template-document/guide":
        return {"uri": uri, "mimeType": "text/markdown", "text": template_authoring_guide()}
    if uri == "launch-lms://plan-template-document/schema":
        return {"uri": uri, "mimeType": "application/schema+json", "text": json.dumps(plan_template_json_schema())}
    if uri == "launch-lms://requirement-framework-document/guide":
        return {"uri": uri, "mimeType": "text/markdown", "text": requirement_authoring_guide()}
    if uri == "launch-lms://requirement-framework-document/schema":
        return {"uri": uri, "mimeType": "application/schema+json", "text": json.dumps(requirement_framework_json_schema())}
    if uri == PREVIEW_APP_URI:
        return {"uri": uri, "mimeType": APP_MIME_TYPE, "text": preview_app_html(), "_meta": preview_app_meta()}
    raise RpcError(-32002, f"Resource not found: {uri}")


async def _dispatch(request: Request, db_session: Session, ctx: AccessContext, method: str, params: dict) -> dict:
    if method == "initialize":
        return {
            "protocolVersion": _negotiate(params.get("protocolVersion")),
            "capabilities": {"tools": {"listChanged": False}, "resources": {"listChanged": False, "subscribe": False}},
            "serverInfo": SERVER_INFO,
            "instructions": INSTRUCTIONS,
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        platform_admin = bool(getattr(ctx.user, "is_superadmin", False))
        return {"tools": [tool.definition() for tool in TOOLS if platform_admin or not tool.platform]}
    if method == "tools/call":
        name = params.get("name")
        if not isinstance(name, str):
            raise RpcError(-32602, "tools/call needs a tool name")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            raise RpcError(-32602, "Tool arguments must be an object")
        return await call_tool(request, db_session, ctx, name, arguments)
    if method == "resources/list":
        listed = []
        for resource in RESOURCES:
            entry = dict(resource)
            if resource["uri"] == PREVIEW_APP_URI:
                entry["_meta"] = preview_app_meta()
            listed.append(entry)
        return {"resources": listed}
    if method == "resources/templates/list":
        return {"resourceTemplates": []}
    if method == "resources/read":
        return {"contents": [_read_resource(str(params.get("uri") or ""))]}
    if method == "prompts/list":
        return {"prompts": []}
    raise RpcError(-32601, f"Method not found: {method}")


async def handle_message(request: Request, db_session: Session, ctx: AccessContext, message) -> dict | None:
    """Handle one JSON-RPC message; returns the response, or None for notifications/responses."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}}
    if "method" not in message:
        return None  # A response to a server request; this server sends none.
    if "id" not in message:
        return None  # Notification (e.g. notifications/initialized).
    params = message.get("params") or {}
    try:
        if not isinstance(params, dict):
            raise RpcError(-32602, "params must be an object")
        result = await _dispatch(request, db_session, ctx, str(message["method"]), params)
    except RpcError as exc:
        return {"jsonrpc": "2.0", "id": message["id"], "error": {"code": exc.code, "message": exc.message}}
    return {"jsonrpc": "2.0", "id": message["id"], "result": result}
