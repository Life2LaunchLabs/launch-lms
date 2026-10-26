"""Insights tools on the MCP server, on the Riverside fixture: they see what the connected person sees in Insights."""

import asyncio

import pytest
from sqlmodel import Session

from src.db.insights import InsightCapture, InsightCaptureRule, InsightDashboard
from src.services.insights import mcp as insights_mcp
from src.services.insights import rules
from src.services.mcp.catalog import TOOLS_BY_NAME
from src.services.mcp.tools import call_tool
from src.services.oauth.server import AccessContext
from src.tests.test_insights import ADMIN, ANA, CL, REPORTS, _user
from src.tests.test_insights import db as riverside  # noqa: F401

SCOPES = {"insights:read", "insights:write"}


@pytest.fixture
def db(riverside: Session, monkeypatch) -> Session:  # noqa: F811
    for table in (InsightDashboard, InsightCapture, InsightCaptureRule):
        table.__table__.create(riverside.get_bind())
    monkeypatch.setattr(insights_mcp, "frontend_url", lambda: "https://lms.test")
    monkeypatch.setattr(rules, "send_email", lambda *args: None)
    return riverside


def _call(db, name, args, user_id=REPORTS, scopes=SCOPES):
    ctx = AccessContext(user=_user(user_id), org_id=1, scopes=set(scopes), client_id="lmc_test", client_name="Claude")
    return asyncio.run(call_tool(None, db, ctx, name, args))  # type: ignore[arg-type]


def _ok(out: dict) -> dict:
    assert not out.get("isError"), out["content"][0]["text"]
    return out["structuredContent"]


def test_every_insights_tool_is_listed_with_its_scope():
    names = {"get_dashboard_schema", "list_dashboards", "get_dashboard", "validate_dashboard", "preview_card", "list_captures",
             "create_dashboard", "save_dashboard", "capture_dashboard", "save_capture_rule"}
    assert {name: TOOLS_BY_NAME[name].scope.split(":")[0] for name in names} == dict.fromkeys(names, "insights")
    assert all(TOOLS_BY_NAME[name].read_only == (TOOLS_BY_NAME[name].scope == "insights:read") for name in names)


def test_a_model_reads_the_schema_writes_a_dashboard_and_saves_it_with_the_revision(db):
    schema = _ok(_call(db, "get_dashboard_schema", {"scope": "plan"}))
    assert "12-column grid" in schema["guide"] and schema["card_spec_schema"]["properties"]["measure"]
    assert "completion_rate" in {item["key"] for item in schema["measures"]} and schema["templates"]

    document = {"cards": [{"key": "done", "span": 3, "spec": {"measure": "completion_rate"}}, {"key": "by", "span": 12, "spec": {"measure": "completion_rate", "by": "plan"}}]}
    bad = _call(db, "validate_dashboard", {"scope": "plan", "document": document})
    assert not bad.get("isError") and not bad["structuredContent"]["valid"] and "by.by" in bad["content"][0]["text"]
    document["cards"][1]["spec"]["by"] = "version"
    assert _ok(_call(db, "validate_dashboard", {"scope": "plan", "document": document}))["valid"]

    preview = _ok(_call(db, "preview_card", {"scope": "plan", "key": CL, "spec": {"measure": "plan_starts"}, "range": "all"}))
    assert preview["result"]["value"]["v"] and preview["result"]["headline"]

    made = _call(db, "create_dashboard", {"scope": "plan", "title": "Plan check", "document": document})
    board = _ok(made)
    assert board["visibility"] == "me" and board["card_count"] == 2 and "Created dashboard \"Plan check\"" in made["content"][0]["text"]
    assert board["editor_url"].startswith("https://lms.test/orgs/riverside/admin/insights?d=dashboard_")

    run = _ok(_call(db, "get_dashboard", {"dashboard_uuid": board["dashboard_uuid"], "run": True, "key": CL}))
    assert set(run["results"]) == {"done", "by"} and run["editor_url"].startswith(f"https://lms.test/orgs/riverside/admin/insights/plan/{CL}?d=")
    assert _call(db, "get_dashboard", {"dashboard_uuid": board["dashboard_uuid"], "run": True})["isError"]

    saved = _ok(_call(db, "save_dashboard", {"dashboard_uuid": board["dashboard_uuid"], "revision": board["revision"], "title": "Plan check v2"}))
    assert saved["revision"] == board["revision"] + 1 and not saved["copied"]
    stale = _call(db, "save_dashboard", {"dashboard_uuid": board["dashboard_uuid"], "revision": board["revision"], "title": "Old"})
    assert stale["isError"] and '"status": 409' in stale["content"][0]["text"] and "current" in stale["content"][0]["text"]


def test_tools_see_what_the_person_sees(db):
    # Ana is staff without See reports: she can't share, and report-only cards warn they are locked to her.
    shared = _call(db, "create_dashboard", {"scope": "org", "visibility": "staff"}, user_id=ANA)
    assert shared["isError"] and "See reports" in shared["content"][0]["text"]
    others = {item["title"] for item in _ok(_call(db, "list_dashboards", {}, user_id=REPORTS))["dashboards"]}
    mine = _ok(_call(db, "create_dashboard", {"scope": "org", "title": "Ana's own"}, user_id=ANA))
    assert "Ana's own" not in {item["title"] for item in _ok(_call(db, "list_dashboards", {}, user_id=REPORTS))["dashboards"]}
    assert others and mine["visibility"] == "me"
    groups = _ok(_call(db, "list_dashboards", {"scope": "group"}, user_id=ADMIN))
    assert {item["key"] for item in groups["objects"]} >= {"grp_fall", "grp_evening"}


def test_a_connection_without_insights_scopes_is_told_to_reconnect(db):
    out = _call(db, "list_dashboards", {}, scopes={"plans:read"})
    assert out["isError"] and "insights:read" in out["content"][0]["text"]
    out = _call(db, "create_dashboard", {"scope": "org"}, scopes={"insights:read"})
    assert out["isError"] and "insights:write" in out["content"][0]["text"]


def test_a_model_captures_a_dashboard_and_schedules_more(db):
    board = next(item for item in _ok(_call(db, "list_dashboards", {"scope": "org"}))["dashboards"] if item["source_template"] == "starter:org.overview")
    taken = _call(db, "capture_dashboard", {"dashboard_uuid": board["dashboard_uuid"], "note": "Before the board meeting"})
    capture = _ok(taken)
    assert capture["note"] == "Before the board meeting" and capture["url"] == f"https://lms.test/orgs/riverside/admin/insights/captures/{capture['capture_uuid']}"
    assert [item["capture_uuid"] for item in _ok(_call(db, "list_captures", {"mine": True}))["captures"]] == [capture["capture_uuid"]]

    rule = _ok(_call(db, "save_capture_rule", {"dashboard_uuid": board["dashboard_uuid"], "cadence": "weekly", "day": 4, "emails": ["board@district.org"], "note": "Weekly"}))
    assert rule["summary"] == "Every Friday" and rule["emails"] == ["board@district.org"] and rule["enabled"]
    changed = _call(db, "save_capture_rule", {"rule_uuid": rule["rule_uuid"], "enabled": False})
    paused = _ok(changed)
    # Fields left out keep their value.
    assert not paused["enabled"] and paused["summary"] == "Every Friday" and paused["note"] == "Weekly" and paused["emails"] == ["board@district.org"]
    assert "turned off" in changed["content"][0]["text"]
    assert _call(db, "save_capture_rule", {"cadence": "weekly"})["isError"]
