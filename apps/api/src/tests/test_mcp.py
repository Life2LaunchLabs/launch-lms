"""Launch LMS MCP server: auth discovery, org isolation, tools and the inline preview app."""

import json
from copy import deepcopy
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from src.core.events.database import get_db_session
from src.db.learning import LearningActivity, LearningPage
from src.db.learning_previews import LearningActivityPreview
from src.db.oauth import OAuthAuthorizationCode, OAuthClient, OAuthGrant
from src.db.programs import Objective, ObjectiveKind, Program, ProgramObjective
from src.routers import mcp as mcp_router
from src.services.mcp import app_shell
from src.services.mcp.app_shell import PREVIEW_APP_URI
from src.services.oauth import server
from src.services.oauth.config import ACCESS_PREFIX, frontend_url, hash_secret, mcp_resource
from src.tests import test_learning_documents as documents_world
from src.tests.test_learning_documents import _goal_template
from src.tests.test_badge_marketplace import _create_org


def _token(session: Session, user_id: int, org_id: int, scope: str = "activities:read activities:write") -> str:
    token = f"{ACCESS_PREFIX}test-{user_id}-{org_id}-{len(scope)}"
    if not session.exec(select(OAuthClient).where(OAuthClient.client_id == "lmc_test")).first():
        session.add(OAuthClient(client_id="lmc_test", client_name="Claude", redirect_uris=["https://claude.ai/cb"], scope=scope))
    session.add(
        OAuthGrant(
            family_id=f"family-{token}",
            access_token_hash=hash_secret(token),
            refresh_token_hash=hash_secret(token + "r"),
            client_id="lmc_test",
            user_id=user_id,
            org_id=org_id,
            scope=scope,
            resource=mcp_resource(),
            access_expires_at=datetime.utcnow() + timedelta(hours=1),
            refresh_expires_at=datetime.utcnow() + timedelta(days=1),
        )
    )
    session.commit()
    return token


@pytest.fixture
def mcp(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    monkeypatch.setattr(documents_world, "create_engine", lambda *args, **kwargs: engine)
    session, alice, carol = documents_world._world()
    for model in (OAuthClient, OAuthAuthorizationCode, OAuthGrant):
        model.__table__.create(engine)
    _goal_template(session, 50, "program_template", 1, "Career Ready", 50, "learning_activity_draft", "objective_activity")
    app = FastAPI()
    app.include_router(mcp_router.router, prefix="/api/v1/mcp")
    app.dependency_overrides[get_db_session] = lambda: session
    client = TestClient(app)
    token = _token(session, alice.id, 1)

    def rpc(method, params=None, auth=token, id_=1):
        body = {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}
        return client.post("/api/v1/mcp", json=body, headers={"Authorization": f"Bearer {auth}"} if auth else {})

    def call(name, arguments=None, auth=token):
        response = rpc("tools/call", {"name": name, "arguments": arguments or {}}, auth=auth)
        assert response.status_code == 200, response.text
        return response.json()["result"]

    return client, session, rpc, call, alice


def test_unauthenticated_requests_get_discovery_headers(mcp):
    client, _, rpc, *_ = mcp
    response = rpc("initialize", auth=None)
    assert response.status_code == 401
    assert 'resource_metadata="' in response.headers["www-authenticate"]
    assert "/.well-known/oauth-protected-resource/api/v1/mcp" in response.headers["www-authenticate"]
    assert rpc("ping", auth=f"{ACCESS_PREFIX}bogus").status_code == 401
    assert client.get("/api/v1/mcp").status_code == 405


def test_initialize_lists_tools_with_preview_app_metadata(mcp):
    client, _, rpc, _, alice = mcp
    initialized = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "claude"}}).json()["result"]
    assert initialized["protocolVersion"] == "2025-06-18"
    assert "Plan templates" in initialized["instructions"] and "list_activities" in initialized["instructions"]
    notification = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers={"Authorization": f"Bearer {ACCESS_PREFIX}test-{alice.id}-1-32"},
    )
    assert notification.status_code == 202
    tools = {tool["name"]: tool for tool in rpc("tools/list").json()["result"]["tools"]}
    assert {"list_activities", "get_activity", "validate_activity", "preview_activity", "save_activity"} <= set(tools)
    assert "create_activity" not in tools
    # Baseline: the connector never deletes or removes anything.
    assert not [name for name in tools if any(word in name for word in ("delete", "remove", "archive", "unpublish", "revoke"))]
    assert all(not tool["annotations"]["destructiveHint"] for tool in tools.values())
    assert tools["list_activities"]["inputSchema"]["required"] == ["template_uuid"]
    assert tools["preview_activity"]["_meta"]["ui"]["resourceUri"] == PREVIEW_APP_URI
    assert tools["save_activity"]["annotations"]["readOnlyHint"] is False
    assert rpc("nope").json()["error"]["code"] == -32601


def test_read_tools_walk_template_to_activity(mcp):
    _, _, _, call, _ = mcp
    editor_url = f"{frontend_url()}/orgs/creator/admin/plans/program_template/activity/draft"
    listed = call("list_activities", {"template_uuid": "program_template"})["structuredContent"]
    assert listed["template"] == {"template_uuid": "program_template", "title": "Career Ready"}
    assert listed["activities"] == [{
        "activity_uuid": "learning_activity_draft", "step_key": "objective_activity", "title": "Career interests",
        "page_count": 3, "branching": True, "editor_url": editor_url,
    }]
    assert call("list_activities")["isError"] is True
    activity = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    assert activity["etag"] and activity["editor_url"] == editor_url
    assert activity["context"]["template_name"] == "Career Ready"
    schema = call("get_activity_schema")["structuredContent"]
    assert "Branching flow" in schema["guide"] and "QuestionBlock" in schema["schema"]["$defs"]


def test_preview_and_save_round_trip_with_conflict_handling(mcp):
    _, session, _, call, _ = mcp
    current = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    edited = deepcopy(current["document"])
    edited["pages"][1]["title"] = "Makers"

    preview = call("preview_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "persona": {"user.first_name": "Sam"}})
    assert preview["structuredContent"]["unsaved"] is True
    embed = urlparse(preview["structuredContent"]["embed_url"])
    # Framed by Claude: the main frontend origin (the one the MCP App allows), no org subdomain.
    assert f"{embed.scheme}://{embed.netloc}" == app_shell.preview_origin()
    assert embed.path.startswith("/preview/activity/lpv_") and parse_qs(embed.query) == {"org": ["creator"], "embed": ["1"]}
    assert "Interactive preview" in preview["content"][0]["text"]
    assert session.exec(select(LearningActivityPreview)).one().source == "connector"

    saved = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "base_etag": current["etag"]})
    assert "isError" not in saved and 'in "Career Ready"' in saved["content"][0]["text"]
    assert session.exec(select(LearningPage).where(LearningPage.title == "Makers")).first() is not None

    stale = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "base_etag": current["etag"]})
    assert stale["isError"] is True
    detail = json.loads(stale["content"][0]["text"])
    assert detail["status"] == 409 and detail["current"]["etag"] == saved["structuredContent"]["etag"]

    invalid = deepcopy(saved["structuredContent"]["document"])
    invalid["activity"]["settings"]["flow"]["entry"] = "missing"
    report = call("validate_activity", {"activity_uuid": "learning_activity_draft", "document": invalid})["structuredContent"]
    assert report["valid"] is False and report["errors"][0]["path"] == "activity.settings.flow"


def test_unsaved_activities_validate_and_preview_against_a_template(mcp):
    _, session, _, call, _ = mcp
    document = {"activity": {"title": "Reflect"}, "pages": [{"page_uuid": "start", "title": "Start", "content": {"version": 2, "blocks": []}}]}
    assert call("validate_activity", {"document": document})["structuredContent"]["valid"] is True
    preview = call("preview_activity", {"template_uuid": "program_template", "document": document})
    assert preview["structuredContent"]["unsaved"] is True and "unsaved draft" in preview["content"][0]["text"]
    assert session.exec(select(LearningActivityPreview)).one().activity_id is None
    missing = call("preview_activity", {"template_uuid": "program_nope", "document": document})
    assert missing["isError"] is True and "connected organization" in missing["content"][0]["text"]


def test_tokens_are_confined_to_their_org_and_scopes(mcp):
    _, session, _, call, alice = mcp
    if not session.get(Program, 1):
        _create_org(session, org_id=3, slug="other")
    session.add(Program(id=60, program_uuid="program_other", slug="other-template", org_id=2, name="Other"))
    session.add(Objective(id=60, objective_uuid="objective_other", org_id=2, title="Other org", kind=ObjectiveKind.ACTIVITY))
    session.add(ProgramObjective(program_id=60, objective_id=60))
    session.add(LearningActivity(id=60, activity_uuid="learning_activity_other", objective_id=60, org_id=2, title="Other org", creation_date="", update_date=""))
    session.commit()
    _goal_template(session, 60, "program_other", 2, "Other", 60, "learning_activity_other", "objective_other")
    denied = call("get_activity", {"activity_uuid": "learning_activity_other"})
    assert denied["isError"] is True and "connected organization" in denied["content"][0]["text"]
    assert call("list_activities", {"template_uuid": "program_other"})["isError"] is True
    assert call("preview_activity", {"template_uuid": "program_other", "document": {}})["isError"] is True

    read_only = _token(session, alice.id, 1, scope="activities:read")
    blocked = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": {}, "base_etag": "x"}, auth=read_only)
    assert blocked["isError"] is True and "activities:write" in blocked["content"][0]["text"]


def test_revoked_tokens_stop_working(mcp):
    _, session, rpc, *_ = mcp
    grant = session.exec(select(OAuthGrant)).first()
    server._revoke_family(session, grant.family_id)
    assert rpc("ping").status_code == 401


def test_preview_app_resource_frames_the_preview_origin(mcp):
    _, _, rpc, *_ = mcp
    listed = {item["uri"]: item for item in rpc("resources/list").json()["result"]["resources"]}
    assert listed[PREVIEW_APP_URI]["mimeType"] == "text/html;profile=mcp-app"
    content = rpc("resources/read", {"uri": PREVIEW_APP_URI}).json()["result"]["contents"][0]
    origin = content["_meta"]["ui"]["csp"]["frameDomains"][0]
    assert origin.startswith("http")
    assert "ui/initialize" in content["text"] and json.dumps(origin) in content["text"]
    assert "ui/notifications/tool-result" in content["text"]
    assert rpc("resources/read", {"uri": "ui://nope"}).json()["error"]["code"] == -32002


def test_validate_activity_reports_every_flow_issue_with_placeholder_ids(mcp):
    *_, call, _ = mcp
    question = {"id": "q", "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "o1", "text": "a"}]},
                "scoring": {"mode": "off", "points": 0}, "completion": {"min_selections": 1, "max_selections": 1, "question_mode": "variable"}}
    document = {
        "activity": {"title": "Broken", "settings": {"flow": {"version": 1, "entry": "page:p1", "nodes": [
            {"id": "page:p1", "type": "page", "page_uuid": "p1"}, {"id": "page:p2", "type": "page", "page_uuid": "p2"}, {"id": "complete", "type": "complete"},
        ], "edges": [
            {"from": "page:p1", "to": "page:p2", "priority": 1, "condition": {"op": "eq", "left": {"source": "answer", "key": "p2.result.option_ids"}, "right": "o1"}},
            {"from": "page:p1", "to": "complete"},
            {"from": "page:p2", "to": "complete"},
        ]}}},
        "pages": [
            {"page_uuid": "p1", "title": "A", "content": {"version": 2, "blocks": []}},
            {"page_uuid": "p2", "title": "B", "content": {"version": 2, "blocks": [question]}},
            {"page_uuid": "p3", "title": "Orphan", "content": {"version": 2, "blocks": []}},
        ],
    }
    errors = call("validate_activity", {"document": document})["structuredContent"]["errors"]
    assert [item["message"] for item in errors] == [
        "Required pages missing from flow: p3",
        "Flow split page:p1 references a question answered after the split",
    ]
