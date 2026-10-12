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
from src.services.plan_template_documents.models import authoring_guide as template_authoring_guide
from src.services.plan_template_documents.models import plan_template_json_schema
from src.services.requirement_documents.models import authoring_guide as requirement_authoring_guide
from src.services.requirement_documents.models import requirement_framework_json_schema
from src.services.oauth.server import AccessContext

SUPPORTED_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SERVER_INFO = {"name": "launch-lms", "title": "Launch LMS", "version": "1.0.0"}
INSTRUCTIONS = """Launch LMS holds plans. Plan templates are reusable plans: an ordered stack of phases and objectives that learners get as their own plan, from an organization or by starting a badge. An objective is either a standard step (fields, checkboxes, uploads, a badge to earn) or an interactive activity the learner plays in the app: phone-sized pages made of blocks and questions, optionally routed by a branching flow, edited as an Activity Document. A template's step_order and each objective's after_objective_uuids decide when learners can start steps.

Templates: find them with list_plan_templates, read one with get_plan_template and get_plan_template_schema before editing. Add an activity by giving a new objective type "activity" in the template document and saving; then edit its pages with the activity tools. Edit the whole document, run validate_plan_template until it is clean, and tell the admin what will change (validation warnings list removals). Template edits apply to future assignments; activity edits apply to everyone playing that activity.

Activities: find them with list_activities (template_uuid for a template's activities; badge_uuid for activities still on older badge learning paths), read one with get_activity, and read get_activity_schema before writing pages. Edit the whole Activity Document, run validate_activity until it is clean, then show the admin preview_activity with your edited document so they can click through it. Badge-path activities can only be saved in a draft badge version that the admin publishes in Launch LMS.

Save only when the admin asks, with the etag you read; on a stale-document error, merge your change into the returned current document and retry. Point the admin to the editor_url to review. Requirement frameworks (standards, competencies) sit beside templates: objectives link to leaf requirement nodes; find them with list_requirement_frameworks. Publishing a framework and publishing to the global library happen only when the admin asks."""

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
        "description": "How Launch LMS plan templates, phases, objectives and steps are written.",
        "mimeType": "text/markdown",
    },
    {
        "uri": "launch-lms://plan-template-document/schema",
        "name": "plan-template-document-schema",
        "title": "Plan Template Document JSON Schema",
        "description": "JSON Schema for Plan Template Document v1.",
        "mimeType": "application/schema+json",
    },
    {
        "uri": "launch-lms://requirement-framework-document/guide",
        "name": "requirement-framework-authoring-guide",
        "title": "Requirement framework authoring guide",
        "description": "How Launch LMS requirement frameworks, levels, codes and versions work.",
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
        return {"tools": [tool.definition() for tool in TOOLS]}
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
