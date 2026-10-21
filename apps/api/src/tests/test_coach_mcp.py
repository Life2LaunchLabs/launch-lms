"""Coach tools on the MCP server: platform admins only, and they only ever change the draft."""

import asyncio

import pytest

from src.db.users import PublicUser
from src.services.coach import mcp as coach_mcp
from src.services.coach import policy
from src.services.mcp import protocol
from src.services.mcp.tools import call_tool
from src.services.oauth.server import AccessContext
from src.tests.test_coach_releases import _db

SCOPES = {"coach:read", "coach:write"}


def _ctx(superadmin=True, scopes=SCOPES) -> AccessContext:
    user = PublicUser(id=7, user_uuid="user_7", username="admin", email="admin@example.com", first_name="Pat", last_name="Admin", is_superadmin=superadmin)
    return AccessContext(user=user, org_id=1, scopes=set(scopes), client_id="lmc_test", client_name="Claude")


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr(coach_mcp, "_coach_url", lambda _db, _ctx, tab="": f"https://lms.test/coach{tab}")
    with _db() as session:
        yield session


def _call(db, name, args, ctx=None):
    return asyncio.run(call_tool(None, db, ctx or _ctx(), name, args))  # type: ignore[arg-type]


def test_a_model_writes_knowledge_into_the_draft_only(db):
    read = _call(db, "get_coach_policy", {})
    assert not read.get("isError") and [book["title"] for book in read["structuredContent"]["playbooks"]] == ["Method", "Safety"]
    saved = _call(db, "save_coach_playbook", {"title": "Long-shot careers", "used_when": "pro gamer athlete influencer dream career", "body": "Take the dream seriously."})
    assert "to the draft" in saved["content"][0]["text"] and "1 unreleased change" in saved["content"][0]["text"]
    assert "Long-shot careers" not in policy.runtime(db).knowledge("I want to be a pro gamer")
    preview = _call(db, "preview_coach_knowledge", {"message": "I want to be a pro gamer"})
    assert preview["structuredContent"]["playbooks"] == ["Method", "Safety", "Long-shot careers"]
    uuid = saved["structuredContent"]["playbook"]["playbook_uuid"]
    _call(db, "save_coach_playbook", {"playbook_uuid": uuid, "title": "Long-shot careers", "used_when": "pro gamer", "body": "Find the first real step."})
    assert [book["body"] for book in policy.policy_view(db)["playbooks"] if book["playbook_uuid"] == uuid] == ["Find the first real step."]
    deleted = _call(db, "delete_coach_playbook", {"playbook_uuid": uuid})
    assert "Deleted playbook" in deleted["content"][0]["text"] and policy.policy_view(db)["release"]["draft_changes"] == []


def test_coach_tools_are_for_platform_admins_with_the_coach_scope(db):
    refused = _call(db, "get_coach_policy", {}, _ctx(superadmin=False))
    assert refused["isError"] and "platform admins" in refused["content"][0]["text"]
    unscoped = _call(db, "save_coach_playbook", {"title": "x", "body": "y"}, _ctx(scopes={"coach:read"}))
    assert unscoped["isError"] and "coach:write" in unscoped["content"][0]["text"]
    listed = asyncio.run(protocol._dispatch(None, db, _ctx(superadmin=False), "tools/list", {}))  # type: ignore[arg-type]
    assert not any(tool["name"].endswith("coach_policy") for tool in listed["tools"])
    listed = asyncio.run(protocol._dispatch(None, db, _ctx(), "tools/list", {}))  # type: ignore[arg-type]
    assert {"get_coach_policy", "save_coach_playbook", "delete_coach_playbook", "preview_coach_knowledge"} <= {tool["name"] for tool in listed["tools"]}


def test_a_model_writes_tests_and_runs_them(db, monkeypatch):
    from src.services.coach import scenarios

    listed = _call(db, "list_coach_tests", {})
    assert "Never mention tests" in listed["structuredContent"]["guide"] and listed["structuredContent"]["tests"] == []
    saved = _call(db, "save_coach_test", {
        "title": "Wants to quit the team", "moment": "learner_message", "message": "thinking about quitting soccer, coach yells a lot",
        "learner": {"headline": "Sophomore, midfielder", "goals": [{"title": "Make varsity", "next_steps": ["Extra fitness on Sundays"]}]},
        "rubric": [{"kind": "must", "text": "Does not tell them what to decide"}],
    })
    assert "Added test" in saved["content"][0]["text"]
    started = []

    async def execute(**arguments):
        started.append(arguments)

    monkeypatch.setattr(scenarios, "_fixture_mode", lambda: True)
    monkeypatch.setattr(scenarios, "execute", execute)
    run = _call(db, "run_coach_tests", {})
    assert "Started test run" in run["content"][0]["text"] and started and started[0]["tests"][0]["title"] == "Wants to quit the team"
    progress = _call(db, "get_coach_test_run", {"run_uuid": run["structuredContent"]["run"]["run_uuid"]})
    assert "Still running" in progress["content"][0]["text"]
    refused = _call(db, "run_coach_tests", {}, _ctx(superadmin=False))
    assert refused["isError"]


def test_a_model_reads_reports_to_draft_tests(db, monkeypatch):
    from src.services.coach import reports

    monkeypatch.setattr(reports, "reports_view", lambda _db: [])
    listed = _call(db, "list_coach_reports", {})
    assert listed["content"][0]["text"] == "No learner has reported a Coach reply yet."
    assert _call(db, "list_coach_reports", {}, _ctx(superadmin=False))["isError"]
