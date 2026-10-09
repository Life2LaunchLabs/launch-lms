"""Launch LMS MCP server: auth discovery, org isolation, tools and the inline preview app."""

import json
from copy import deepcopy
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from src.core.events.database import get_db_session
from src.db.learning import LearningActivity, LearningBadge, LearningBadgeVersion, LearningPage
from src.db.learning_previews import LearningActivityPreview
from src.db.oauth import OAuthAuthorizationCode, OAuthClient, OAuthGrant
from src.routers import mcp as mcp_router
from src.services.mcp.app_shell import PREVIEW_APP_URI
from src.services.oauth import server
from src.services.oauth.config import ACCESS_PREFIX, hash_secret, mcp_resource
from src.tests import test_learning_documents as documents_world
from src.tests.test_badge_marketplace import _create_badge


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
    assert "draft" in initialized["instructions"]
    notification = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers={"Authorization": f"Bearer {ACCESS_PREFIX}test-{alice.id}-1-32"},
    )
    assert notification.status_code == 202
    tools = {tool["name"]: tool for tool in rpc("tools/list").json()["result"]["tools"]}
    assert {"list_badges", "get_activity", "preview_activity", "save_activity", "create_activity"} <= set(tools)
    assert tools["preview_activity"]["_meta"]["ui"]["resourceUri"] == PREVIEW_APP_URI
    assert tools["save_activity"]["annotations"]["readOnlyHint"] is False
    assert rpc("nope").json()["error"]["code"] == -32601


def test_read_tools_walk_badge_to_activity(mcp):
    _, _, _, call, _ = mcp
    badges = call("list_badges")["structuredContent"]["badges"]
    assert badges[0]["badge_uuid"] == "badge_1" and badges[0]["draft_version"]["version_uuid"] == "badge_version_draft"
    activities = call("list_activities", {"badge_uuid": "badge_1"})["structuredContent"]
    assert activities["version"]["editable"] is True
    assert activities["activities"][0] == {
        "activity_uuid": "learning_activity_draft", "title": "Career interests", "description": "", "order": 1,
        "required": True, "page_count": 3, "branching": True,
    }
    activity = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    assert activity["etag"] and "/editor?version=badge_version_draft" in activity["editor_url"]
    schema = call("get_activity_schema")["structuredContent"]
    assert "Branching flow" in schema["guide"] and "QuestionBlock" in schema["schema"]["$defs"]


def test_preview_and_save_round_trip_with_conflict_handling(mcp):
    _, session, _, call, _ = mcp
    current = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    edited = deepcopy(current["document"])
    edited["pages"][1]["title"] = "Makers"

    preview = call("preview_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "persona": {"user.first_name": "Sam"}})
    assert preview["structuredContent"]["unsaved"] is True
    assert preview["structuredContent"]["embed_url"].endswith("?embed=1")
    assert "Interactive preview" in preview["content"][0]["text"]
    assert session.exec(select(LearningActivityPreview)).one().source == "connector"

    saved = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "base_etag": current["etag"]})
    assert "isError" not in saved
    assert session.exec(select(LearningPage).where(LearningPage.title == "Makers")).first() is not None

    stale = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": edited, "base_etag": current["etag"]})
    assert stale["isError"] is True
    detail = json.loads(stale["content"][0]["text"])
    assert detail["status"] == 409 and detail["current"]["etag"] == saved["structuredContent"]["etag"]

    invalid = deepcopy(saved["structuredContent"]["document"])
    invalid["activity"]["settings"]["flow"]["entry"] = "missing"
    report = call("validate_activity", {"activity_uuid": "learning_activity_draft", "document": invalid})["structuredContent"]
    assert report["valid"] is False and report["errors"][0]["path"] == "activity.settings.flow"


def test_create_activity_in_draft(mcp):
    _, session, _, call, _ = mcp
    created = call("create_activity", {"badge_uuid": "badge_1", "document": {"activity": {"title": "Reflect"}, "pages": [{"page_uuid": "start", "title": "Start", "content": {"version": 2, "blocks": []}}]}})
    assert "Saved \"Reflect\"" in created["content"][0]["text"]
    assert session.exec(select(LearningActivity).where(LearningActivity.title == "Reflect")).one().version_id == 50


def test_tokens_are_confined_to_their_org_and_scopes(mcp):
    _, session, _, call, alice = mcp
    other = _create_badge(session, badge_id=2, org_id=2)
    session.add(LearningActivity(id=60, activity_uuid="learning_activity_other", path_id=50, badge_id=other.id, version_id=other.active_version_id, org_id=2, title="Other org", creation_date="", update_date=""))
    session.commit()
    denied = call("get_activity", {"activity_uuid": "learning_activity_other"})
    assert denied["isError"] is True and "connected organization" in denied["content"][0]["text"]
    assert call("list_activities", {"badge_uuid": "badge_2"})["isError"] is True

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


def test_badge_versions_published_are_reported_read_only(mcp):
    _, session, _, call, _ = mcp
    version = session.get(LearningBadgeVersion, 50)
    version.state = "published"
    session.add(version)
    badge = session.get(LearningBadge, 1)
    session.add(badge)
    session.commit()
    current = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    assert current["context"]["editable"] is False
    locked = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": current["document"], "base_etag": current["etag"]})
    assert locked["isError"] is True and "read-only" in locked["content"][0]["text"]
