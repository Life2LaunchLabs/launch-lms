"""OAuth 2.1 authorization server for connected apps (Claude connector)."""

import base64
import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from src.core.events.database import get_db_session
from src.db.oauth import OAuthAuthorizationCode, OAuthClient, OAuthGrant
from src.routers import oauth as oauth_router
from src.security.auth import get_current_user
from src.services.oauth import server
from src.services.oauth.config import mcp_resource
from src.tests.test_badge_marketplace import _create_tables, _setup

REDIRECT = "https://claude.ai/api/mcp/auth_callback"


@pytest.fixture
def world(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    _create_tables(engine)
    for model in (OAuthClient, OAuthAuthorizationCode, OAuthGrant):
        model.__table__.create(engine)
    session = Session(engine)
    _, _, alice, bob, carol, _ = _setup(session)
    app = FastAPI()
    app.include_router(oauth_router.router, prefix="/api/v1/oauth")
    app.include_router(oauth_router.well_known_router)
    state = {"user": alice}
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: state["user"]
    monkeypatch.setattr(oauth_router, "check_rate_limit", lambda *args, **kwargs: (True, 1, 60))
    return TestClient(app), session, state, {"alice": alice, "bob": bob, "carol": carol}


def _pkce():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def _register(client, **extra):
    response = client.post("/api/v1/oauth/register", json={"client_name": "Claude", "redirect_uris": [REDIRECT], **extra})
    assert response.status_code == 201, response.text
    return response.json()


def _authorize(client, client_id, challenge, org_id=1, approve=True, **extra):
    body = {"client_id": client_id, "redirect_uri": REDIRECT, "code_challenge": challenge, "state": "xyz", "approve": approve, "org_id": org_id, **extra}
    return client.post("/api/v1/oauth/authorize/decision", json=body)


def _code(response):
    query = parse_qs(urlparse(response.json()["redirect_to"]).query)
    assert query["state"] == ["xyz"] and "iss" in query
    return query["code"][0]


def _token(client, **form):
    return client.post("/api/v1/oauth/token", data=form)


def test_metadata_documents_point_at_each_other(world):
    client, *_ = world
    authorization = client.get("/.well-known/oauth-authorization-server").json()
    resource = client.get("/.well-known/oauth-protected-resource/api/v1/mcp").json()
    assert resource["authorization_servers"] == [authorization["issuer"]]
    assert resource["resource"] == mcp_resource()
    assert authorization["code_challenge_methods_supported"] == ["S256"]
    assert authorization["authorization_endpoint"].endswith("/auth/oauth/authorize")


def test_full_authorization_code_flow_with_pkce_and_rotation(world):
    client, session, _, users = world
    registered = _register(client)
    assert "client_secret" not in registered
    verifier, challenge = _pkce()

    validation = client.post("/api/v1/oauth/authorize/validate", json={"client_id": registered["client_id"], "redirect_uri": REDIRECT, "code_challenge": challenge})
    assert validation.status_code == 200
    assert [org["id"] for org in validation.json()["orgs"]] == [1]

    code = _code(_authorize(client, registered["client_id"], challenge))
    issued = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=verifier, resource=mcp_resource())
    assert issued.status_code == 200, issued.text
    tokens = issued.json()
    assert issued.headers["cache-control"] == "no-store"
    assert tokens["scope"] == "activities:read activities:write templates:read templates:write"

    context = server.resolve_access_token(session, tokens["access_token"])
    assert context.user.id == users["alice"].id and context.org_id == 1

    replay = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=verifier)
    assert replay.json()["error"] == "invalid_grant"
    assert server.resolve_access_token(session, tokens["access_token"]) is None, "code replay revokes issued tokens"


def test_refresh_rotates_and_reuse_revokes_the_family(world):
    client, session, *_ = world
    registered = _register(client)
    verifier, challenge = _pkce()
    code = _code(_authorize(client, registered["client_id"], challenge))
    first = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=verifier).json()

    second = _token(client, grant_type="refresh_token", refresh_token=first["refresh_token"], client_id=registered["client_id"]).json()
    assert second["refresh_token"] != first["refresh_token"]
    assert server.resolve_access_token(session, second["access_token"]) is not None

    reused = _token(client, grant_type="refresh_token", refresh_token=first["refresh_token"], client_id=registered["client_id"])
    assert reused.json()["error"] == "invalid_grant"
    assert server.resolve_access_token(session, second["access_token"]) is None


def test_pkce_redirect_and_code_checks(world):
    client, *_ = world
    registered = _register(client)
    verifier, challenge = _pkce()
    code = _code(_authorize(client, registered["client_id"], challenge))
    wrong = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=_pkce()[0])
    assert wrong.json() == {"error": "invalid_grant", "error_description": "PKCE verification failed"}

    missing_pkce = client.post("/api/v1/oauth/authorize/validate", json={"client_id": registered["client_id"], "redirect_uri": REDIRECT, "code_challenge": "short"})
    assert missing_pkce.json()["error"] == "invalid_request"
    bad_redirect = client.post("/api/v1/oauth/authorize/validate", json={"client_id": registered["client_id"], "redirect_uri": "https://evil.example/cb", "code_challenge": challenge})
    assert bad_redirect.json()["error"] == "invalid_request"
    wrong_resource = client.post("/api/v1/oauth/authorize/validate", json={"client_id": registered["client_id"], "redirect_uri": REDIRECT, "code_challenge": challenge, "resource": "https://other.example/mcp"})
    assert wrong_resource.json()["error"] == "invalid_target"


def test_expired_codes_and_tokens_are_rejected(world):
    client, session, *_ = world
    registered = _register(client)
    verifier, challenge = _pkce()
    code = _code(_authorize(client, registered["client_id"], challenge))
    record = session.exec(select(OAuthAuthorizationCode)).one()
    record.expires_at = datetime.utcnow() - timedelta(seconds=1)
    session.add(record)
    session.commit()
    expired = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=verifier)
    assert expired.json()["error"] == "invalid_grant"


def test_consent_requires_org_admin_and_denial_redirects(world):
    client, _, state, users = world
    registered = _register(client)
    _, challenge = _pkce()
    assert _authorize(client, registered["client_id"], challenge, org_id=2).status_code == 403
    denied = _authorize(client, registered["client_id"], challenge, approve=False)
    assert parse_qs(urlparse(denied.json()["redirect_to"]).query)["error"] == ["access_denied"]
    state["user"] = users["carol"]
    assert client.post("/api/v1/oauth/authorize/validate", json={"client_id": registered["client_id"], "redirect_uri": REDIRECT, "code_challenge": challenge}).json()["orgs"] == []


def test_registration_rejects_unsafe_redirects_and_confidential_clients_authenticate(world):
    client, *_ = world
    bad = client.post("/api/v1/oauth/register", json={"redirect_uris": ["http://evil.example/cb"]})
    assert bad.status_code == 400 and bad.json()["error"] == "invalid_redirect_uri"
    assert _register(client, redirect_uris=["http://localhost:6274/callback"])["client_id"]

    confidential = _register(client, token_endpoint_auth_method="client_secret_basic")
    verifier, challenge = _pkce()
    code = _code(_authorize(client, confidential["client_id"], challenge))
    unauthenticated = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=confidential["client_id"], code_verifier=verifier)
    assert unauthenticated.status_code == 401
    basic = base64.b64encode(f"{confidential['client_id']}:{confidential['client_secret']}".encode()).decode()
    code = _code(_authorize(client, confidential["client_id"], challenge))
    authenticated = client.post(
        "/api/v1/oauth/token",
        data={"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT, "code_verifier": verifier},
        headers={"Authorization": f"Basic {basic}"},
    )
    assert authenticated.status_code == 200


def test_users_can_list_and_disconnect_connections(world):
    client, session, *_ = world
    registered = _register(client)
    verifier, challenge = _pkce()
    code = _code(_authorize(client, registered["client_id"], challenge))
    tokens = _token(client, grant_type="authorization_code", code=code, redirect_uri=REDIRECT, client_id=registered["client_id"], code_verifier=verifier).json()
    connections = client.get("/api/v1/oauth/connections").json()
    assert [item["client_name"] for item in connections] == ["Claude"]
    assert client.delete(f"/api/v1/oauth/connections/{connections[0]['connection_id']}").status_code == 200
    assert server.resolve_access_token(session, tokens["access_token"]) is None
    assert client.get("/api/v1/oauth/connections").json() == []


def test_connector_can_be_disabled(world, monkeypatch):
    client, *_ = world
    monkeypatch.setenv("LAUNCHLMS_MCP_ENABLED", "false")
    assert client.get("/.well-known/oauth-authorization-server").status_code == 404
    assert client.post("/api/v1/oauth/register", json={}).status_code == 404


def test_cookieless_connector_endpoints_are_csrf_exempt():
    from unittest.mock import MagicMock

    from starlette.requests import Request

    from src.security.csrf import CSRFProtectionMiddleware

    middleware = CSRFProtectionMiddleware(MagicMock())

    def request(path):
        return Request({"type": "http", "method": "POST", "path": path, "headers": [], "query_string": b""})

    assert middleware._is_csrf_exempt(request("/api/v1/oauth/token"))
    assert middleware._is_csrf_exempt(request("/api/v1/mcp"))
    assert not middleware._is_csrf_exempt(request("/api/v1/oauth/authorize/decision"))
