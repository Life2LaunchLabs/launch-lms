"""Insights tools on the MCP server: read and write dashboards, try a card, capture and schedule captures."""

from __future__ import annotations

from src.services.insights import mcp as insights_mcp
from src.services.mcp.tool import Tool

_SCOPE = {"type": "string", "enum": ["org", "plan", "group", "learner"], "description": "What the dashboard is about: the whole organization, one plan, one group or one learner."}
_KEY = {"type": "string", "description": "The plan, group or learner a plan, group or learner dashboard is showing (list_dashboards with that scope lists them). Omit for org."}
_RANGE = {
    "description": "28d, 90d, 12m, all, or {start, end} as ISO dates. Omit for the dashboard's own range.",
    "oneOf": [{"type": "string", "enum": ["28d", "90d", "12m", "all"]}, {"type": "object", "properties": {"start": {"type": "string", "format": "date"}, "end": {"type": "string", "format": "date"}}, "required": ["start", "end"]}],
}
_DOCUMENT = {
    "type": "object",
    "description": "{cards: [{key, span, spec}], range}. The whole document; see get_dashboard_schema.",
    "properties": {"cards": {"type": "array", "items": {"type": "object"}}, "range": {}},
}
_VISIBILITY = {"type": "string", "enum": ["me", "staff", "admins"], "description": "Who can open it. Sharing needs the See reports permission; keep it me unless the admin asks."}

INSIGHTS_TOOLS = [
    Tool(
        "get_dashboard_schema",
        "Get the Insights dashboard schema",
        "How Insights dashboards and cards work, the card spec's JSON Schema, and for one scope: the measures and breakdowns a card can use, the charts each shape allows, and the templates and library questions to start from. Read it before writing or editing a dashboard.",
        {"properties": {"scope": _SCOPE}},
        insights_mcp.get_dashboard_schema,
        scope="insights:read",
    ),
    Tool(
        "list_dashboards",
        "List Insights dashboards",
        "The Insights dashboards shared with you or yours, with their scope, revision and editor_url. With scope plan or group, also the plans or groups you can open one on (their keys).",
        {"properties": {"scope": _SCOPE}},
        insights_mcp.list_dashboards,
        scope="insights:read",
    ),
    Tool(
        "get_dashboard",
        "Get an Insights dashboard",
        "A dashboard's document (its cards) and revision, the etag to save with. Pass run to get each card's numbers as you would see them; a plan, group or learner dashboard runs on the one named by key.",
        {"properties": {"dashboard_uuid": {"type": "string"}, "run": {"type": "boolean"}, "key": _KEY, "range": _RANGE}, "required": ["dashboard_uuid"]},
        insights_mcp.get_dashboard,
        scope="insights:read",
    ),
    Tool(
        "validate_dashboard",
        "Validate an Insights dashboard",
        "Check a dashboard document for a scope without saving: every card's spec, span and key. Returns the cleaned document, errors to fix, and warnings for cards locked to you.",
        {"properties": {"scope": _SCOPE, "document": _DOCUMENT}, "required": ["document"]},
        insights_mcp.validate_dashboard,
        scope="insights:read",
    ),
    Tool(
        "preview_card",
        "Preview an Insights card",
        "Run one card spec and return its result (headline, value, rows or series) as you would see it, without saving. Use it to check a card answers the question before adding it.",
        {"properties": {"scope": _SCOPE, "key": _KEY, "spec": {"type": "object", "description": "A card spec; see get_dashboard_schema."}, "range": _RANGE}, "required": ["spec"]},
        insights_mcp.preview_card,
        scope="insights:read",
    ),
    Tool(
        "list_captures",
        "List Insights captures",
        "Captures (dashboards frozen as they showed on a day, with a note) you can open, newest first. Filter by dashboard, scope and key, or to your own.",
        {"properties": {"dashboard_uuid": {"type": "string"}, "scope": _SCOPE, "key": _KEY, "mine": {"type": "boolean"}}},
        insights_mcp.list_captures,
        scope="insights:read",
    ),
    Tool(
        "create_dashboard",
        "Create an Insights dashboard",
        "Make a dashboard from a template (its key, from get_dashboard_schema) or from a document you wrote. It is private unless visibility says otherwise. Call it when the admin asks for a dashboard.",
        {
            "properties": {
                "scope": _SCOPE, "title": {"type": "string", "maxLength": 120}, "description": {"type": "string", "maxLength": 500},
                "visibility": _VISIBILITY, "template": {"type": "string"}, "document": _DOCUMENT,
            },
            "required": ["scope"],
        },
        insights_mcp.create_dashboard,
        scope="insights:write",
        read_only=False,
    ),
    Tool(
        "save_dashboard",
        "Save an Insights dashboard",
        "Save over a dashboard with the revision you read: the whole document, and optionally its title, description or visibility. A stale revision is refused with the current dashboard; merge into it and save again. If you can't edit it, you get your own copy with the change.",
        {
            "properties": {
                "dashboard_uuid": {"type": "string"}, "revision": {"type": "integer"}, "document": _DOCUMENT,
                "title": {"type": "string", "maxLength": 120}, "description": {"type": "string", "maxLength": 500}, "visibility": _VISIBILITY,
            },
            "required": ["dashboard_uuid", "revision"],
        },
        insights_mcp.save_dashboard,
        scope="insights:write",
        read_only=False,
    ),
    Tool(
        "capture_dashboard",
        "Capture an Insights dashboard",
        "Freeze a saved dashboard as it shows now, for you, with a note. Captures are kept; the admin can share a read-only link from the capture. Plan, group and learner dashboards capture the one named by key.",
        {"properties": {"dashboard_uuid": {"type": "string"}, "key": _KEY, "range": _RANGE, "note": {"type": "string", "maxLength": 2000}}, "required": ["dashboard_uuid"]},
        insights_mcp.capture_dashboard,
        scope="insights:write",
        read_only=False,
    ),
    Tool(
        "save_capture_rule",
        "Schedule Insights captures",
        "Capture a dashboard on a schedule and send it on. Pass dashboard_uuid for a new schedule, or rule_uuid to change one (fields left out stay as they are). Staff get a link to the capture in Insights and need See reports; email addresses get a read-only link where small groups are hidden. Only call it when the admin asks.",
        {
            "properties": {
                "dashboard_uuid": {"type": "string"}, "rule_uuid": {"type": "string"}, "key": _KEY,
                "cadence": {"type": "string", "enum": ["weekly", "monthly", "once"]},
                "day": {"type": "integer", "minimum": 0, "maximum": 28, "description": "Weekly: 0 is Monday to 6 Sunday. Monthly: day 1 to 28, or 0 for the last day."},
                "on_date": {"type": "string", "format": "date", "description": "For once: the day to capture."},
                "range": _RANGE, "note": {"type": "string", "maxLength": 2000},
                "staff": {"type": "array", "items": {"type": "string"}, "description": "user_uuids of staff to send it to."},
                "emails": {"type": "array", "items": {"type": "string", "format": "email"}},
                "link_days": {"type": "integer", "enum": [7, 30, 90], "description": "How long the emailed link works."},
                "enabled": {"type": "boolean"},
            },
        },
        insights_mcp.save_capture_rule,
        scope="insights:write",
        read_only=False,
    ),
]
