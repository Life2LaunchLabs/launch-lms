"""User test tools on the MCP server: platform admins run a test cohort and test as its personas."""

from __future__ import annotations

from src.services.mcp.tool import Tool
from src.services.user_tests import mcp as tests_mcp

_COHORT = {"cohort_uuid": {"type": "string", "description": "From list_test_cohorts or create_test_cohort."}}
_PERSONA = {"user_id": {"type": "integer", "description": "The persona's user_id, from get_test_cohort."}}
_STAGE = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "maxLength": 120},
        "goal": {"type": "string", "maxLength": 2000, "description": "What the persona sets out to do, in their terms. Never name the screen or button to use."},
        "after": {"type": "object", "description": "Wait for another persona to finish one of its stages first.",
                  "properties": {"persona": {"type": "string", "description": "That persona's handle."}, "stage": {"type": "string", "description": "That stage's key: its title in lowercase with dashes."}},
                  "required": ["persona", "stage"]},
    },
    "required": ["title"],
}
_FINDING = {
    "kind": {"type": "string", "enum": ["bug", "confusion", "wish"], "description": "bug: something broke; confusion: the persona couldn't tell what to do; wish: something they wanted that isn't there."},
    "severity": {"type": "string", "enum": ["low", "medium", "high"], "description": "high: the persona couldn't go on."},
    "stage_key": {"type": "string"},
    "page": {"type": "string", "description": "The page's path, e.g. /orgs/acme/plans."},
    "what_happened": {"type": "string", "maxLength": 4000},
    "what_wanted": {"type": "string", "maxLength": 4000},
}


def _tool(name: str, title: str, description: str, properties: dict, required: list[str], handler, write: bool = False) -> Tool:
    return Tool(
        name, title, f"Platform admins only. {description}", {"properties": properties, "required": required} if required else {"properties": properties},
        handler, scope="user_tests:write" if write else "user_tests:read", read_only=not write, org_scoped=False, platform=True,
    )


USER_TEST_TOOLS = [
    _tool("list_test_cohorts", "List user test cohorts", "Test runs with their status and persona counts, and how a run works.", {}, [], tests_mcp.list_test_cohorts),
    _tool("get_test_cohort", "Read a test cohort", "A run's personas (user_id, handle, brief, email), its stages and the run board.", _COHORT, ["cohort_uuid"], tests_mcp.get_test_cohort),
    _tool("create_test_cohort", "Create a test cohort", "Start a test run. It closes on its own after `days`.", {
        "name": {"type": "string", "maxLength": 120}, "days": {"type": "integer", "minimum": 1, "maximum": 30}, "notes": {"type": "string", "maxLength": 2000},
    }, ["name"], tests_mcp.create_test_cohort, write=True),
    _tool("add_test_personas", "Add test personas", "Make fresh persona accounts in a run. Each joins the main organization; org_owner also makes an organization it owns.", {
        **_COHORT,
        "personas": {"type": "array", "minItems": 1, "maxItems": 50, "items": {"type": "object", "properties": {
            "first_name": {"type": "string", "maxLength": 60}, "last_name": {"type": "string", "maxLength": 60},
            "brief": {"type": "string", "maxLength": 4000, "description": "Who they are and how they use technology. Only the console and the tester see it."},
            "start_state": {"type": "string", "enum": ["has_account", "org_owner"]}, "org_name": {"type": "string", "maxLength": 100},
        }, "required": ["first_name"]}},
    }, ["cohort_uuid", "personas"], tests_mcp.add_test_personas, write=True),
    _tool("set_test_stages", "Set a test run's stages", "Replace the run's stages (at most 20). Every persona works through every stage.", {
        **_COHORT, "stages": {"type": "array", "maxItems": 20, "items": _STAGE},
    }, ["cohort_uuid", "stages"], tests_mcp.set_test_stages, write=True),
    _tool("get_test_board", "Read the run board", "Every persona against every stage: not started, waiting on someone, in progress, done or stuck. Stuck personas come first.", _COHORT, ["cohort_uuid"], tests_mcp.get_test_board),
    _tool("open_as_test_persona", "Open the site as a test persona", "A one-use link that signs a browser in as the persona and opens target_path. Use a fresh browser session for each persona.", {
        **_PERSONA, "target_path": {"type": "string", "maxLength": 1000, "description": "A path such as /start, or a link's full url from read_test_mail, which signs in on that link's own site."},
    }, ["user_id"], tests_mcp.open_as_test_persona, write=True),
    _tool("read_test_mail", "Read a test persona's email", "The persona's inbox (email the site sent it, held back from delivery), or one email as text with its links (pass mail_id).", {
        **_PERSONA, "mail_id": {"type": "integer"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100},
    }, ["user_id"], tests_mcp.read_test_mail),
    _tool("report_test_progress", "Report a persona's progress", "Mark where the persona is on a stage.", {
        **_PERSONA, "stage_key": {"type": "string"}, "status": {"type": "string", "enum": ["not_started", "in_progress", "done", "stuck"]}, "note": {"type": "string", "maxLength": 2000},
    }, ["user_id", "stage_key", "status"], tests_mcp.report_test_progress, write=True),
    _tool("log_test_finding", "Log a test finding", "Note a bug, a confusing moment or a wish, as the persona met it.", {**_PERSONA, **_FINDING}, ["user_id", "kind", "what_happened"], tests_mcp.log_test_finding, write=True),
    _tool("get_test_report", "Read a test run's report", "The run's findings and refused actions as Markdown, grouped by kind.", _COHORT, ["cohort_uuid"], tests_mcp.get_test_report),
    _tool("close_test_cohort", "Close a test cohort", "End a run now: its personas are signed out and can't sign in again.", _COHORT, ["cohort_uuid"], tests_mcp.close_test_cohort, write=True),
    _tool("purge_test_cohort", "Purge a closed test cohort", "Delete a closed run's personas and orgs, keeping its mail and report. A dry run (the default) only counts; pass dry_run false only when the admin asks.", {
        **_COHORT, "dry_run": {"type": "boolean"},
    }, ["cohort_uuid"], tests_mcp.purge_test_cohort, write=True),
]
