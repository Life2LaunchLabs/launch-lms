"""User test tools on the MCP server: a platform admin's connector runs a cohort and tests as its personas."""

import asyncio

from src.db.user_tests import TestMail, TestPersona
from src.db.users import PublicUser
from src.services.mcp import protocol
from src.services.mcp.tools import call_tool
from src.services.oauth.server import AccessContext
from src.services.user_tests import mcp as tests_mcp
from src.tests.test_user_tests_stories import db  # noqa: F401  (fixture)

SCOPES = {"user_tests:read", "user_tests:write"}


def _ctx(user_id=1, superadmin=True, scopes=SCOPES) -> AccessContext:
    user = PublicUser(id=user_id, user_uuid=f"user_{user_id}", username="admin", email="admin@example.com", first_name="Real", last_name="Admin", is_superadmin=superadmin)
    return AccessContext(user=user, org_id=1, scopes=set(scopes), client_id="lmc_test", client_name="Claude", default_org_id=1)


def _call(session, name, args, ctx=None):
    result = asyncio.run(call_tool(None, session, ctx or _ctx(), name, args))  # type: ignore[arg-type]
    return result


def test_a_connector_runs_a_cohort_end_to_end(db, monkeypatch):  # noqa: F811
    monkeypatch.setattr(tests_mcp, "frontend_url", lambda: "https://lms.test")
    made = _call(db, "create_test_cohort", {"name": "Riverside onboarding"})
    assert not made.get("isError"), made
    uuid = made["structuredContent"]["cohort_uuid"]
    assert made["structuredContent"]["console_url"] == f"https://lms.test/orgs/launch/admin/platform/user-tests/{uuid}"
    added = _call(db, "add_test_personas", {"cohort_uuid": uuid, "personas": [{"first_name": "Dana", "brief": "Counselor"}, {"first_name": "Maya"}]})
    dana, maya = added["structuredContent"]["personas"]
    staged = _call(db, "set_test_stages", {"cohort_uuid": uuid, "stages": [
        {"title": "Invite your students", "goal": "Invite Maya."},
        {"title": "Join your school", "after": {"persona": "dana", "stage": "invite-your-students"}},
    ]})
    assert [stage["key"] for stage in staged["structuredContent"]["stages"]] == ["invite-your-students", "join-your-school"]

    link = _call(db, "open_as_test_persona", {"user_id": maya["user_id"], "target_path": "/start"})
    assert link["structuredContent"]["url"].startswith("https://lms.test/auth/test-entry?t=")
    monkeypatch.setattr(tests_mcp.mail, "site_hosts", lambda: {"lms.test"})
    on_org = _call(db, "open_as_test_persona", {"user_id": maya["user_id"], "target_path": "http://riverside.lms.test/signup?invitation=abc"})["structuredContent"]
    assert on_org["url"].startswith("https://riverside.lms.test/auth/test-entry?t=")
    assert _call(db, "open_as_test_persona", {"user_id": maya["user_id"], "target_path": "https://evil.test/x"})["isError"]
    db.add(TestMail(cohort_id=db.get(TestPersona, maya["user_id"]).cohort_id, to_address=maya["email"], to_user_id=maya["user_id"], subject="You're invited",
                    html="<html><head><style>p{}</style></head><body><p>Join Riverside &amp; start.</p><a href='https://lms.test/join'>Join</a></body></html>",
                    reason="test_address", links=[{"url": "https://lms.test/join", "path": "/join"}]))
    db.commit()
    inbox = _call(db, "read_test_mail", {"user_id": maya["user_id"]})["structuredContent"]["mail"]
    assert [item["subject"] for item in inbox] == ["You're invited"]
    one = _call(db, "read_test_mail", {"user_id": maya["user_id"], "mail_id": inbox[0]["id"]})["structuredContent"]
    assert one["text"] == "Join Riverside & start.\nJoin" and one["opened_at"] and "html" not in one
    assert _call(db, "read_test_mail", {"user_id": dana["user_id"], "mail_id": inbox[0]["id"]})["isError"]

    _call(db, "report_test_progress", {"user_id": maya["user_id"], "stage_key": "join-your-school", "status": "stuck", "note": "No join button"})
    _call(db, "log_test_finding", {"user_id": maya["user_id"], "kind": "confusion", "stage_key": "join-your-school", "what_happened": "The invite opened a login page"})
    board = _call(db, "get_test_board", {"cohort_uuid": uuid})["structuredContent"]
    assert board["personas"][0]["user_id"] == maya["user_id"] and board["counts"]["stuck"] == 1
    report = _call(db, "get_test_report", {"cohort_uuid": uuid})["structuredContent"]["markdown"]
    assert "## Confusing parts (1)" in report and "The invite opened a login page" in report

    assert _call(db, "purge_test_cohort", {"cohort_uuid": uuid})["isError"]  # still open
    _call(db, "close_test_cohort", {"cohort_uuid": uuid})
    dry = _call(db, "purge_test_cohort", {"cohort_uuid": uuid})["structuredContent"]
    assert dry["dry_run"] and dry["counts"]["personas"] == 2


def test_user_test_tools_are_for_platform_admins_with_the_scope(db, monkeypatch):  # noqa: F811
    refused = _call(db, "list_test_cohorts", {}, _ctx(user_id=99, superadmin=False))
    assert refused["isError"] and "platform admins" in refused["content"][0]["text"]
    unscoped = _call(db, "create_test_cohort", {"name": "x"}, _ctx(scopes={"user_tests:read"}))
    assert unscoped["isError"] and "user_tests:write" in unscoped["content"][0]["text"]
    monkeypatch.delenv("LAUNCHLMS_USER_TESTS_ENABLED")
    assert _call(db, "list_test_cohorts", {})["isError"]
    listed = asyncio.run(protocol._dispatch(None, db, _ctx(superadmin=False), "tools/list", {}))  # type: ignore[arg-type]
    assert not any("test_cohort" in tool["name"] for tool in listed["tools"])
