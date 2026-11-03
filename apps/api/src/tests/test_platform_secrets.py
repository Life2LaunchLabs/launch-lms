"""Platform-wide API keys: saved encrypted in Platform › Settings, the environment variable as fallback."""

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.db.platform_secrets import PlatformSecret
from src.services import platform_secrets
from src.services.stock_media import pexels


@pytest.fixture
def db(monkeypatch):
    from src.core.events import database

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine, tables=[PlatformSecret.__table__])
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    with Session(engine) as session:
        yield session


def test_saved_key_overrides_the_environment_and_is_never_shown(db, monkeypatch):
    assert platform_secrets.describe(db)[0]["source"] == "none" and pexels.api_key() == ""
    monkeypatch.setenv("PEXELS_API_KEY", "env-key-123456")
    assert platform_secrets.describe(db)[0]["source"] == "environment" and pexels.api_key() == "env-key-123456"

    rows = platform_secrets.save(db, "pexels", "  saved-key-abcd1234 ", user_id=None)
    assert rows[0]["source"] == "platform" and rows[0]["last4"] == "1234"
    assert "saved-key" not in str(rows)
    assert "saved-key" not in db.get(PlatformSecret, 1).ciphertext
    assert pexels.api_key() == "saved-key-abcd1234"

    platform_secrets.save(db, "pexels", "", user_id=None)  # removing it falls back to the environment
    assert platform_secrets.describe(db)[0]["source"] == "environment" and pexels.api_key() == "env-key-123456"


def test_rejects_unknown_names_and_junk(db):
    with pytest.raises(HTTPException) as unknown:
        platform_secrets.save(db, "openai", "sk-whatever-123", user_id=None)
    assert unknown.value.status_code == 404
    with pytest.raises(HTTPException) as junk:
        platform_secrets.save(db, "pexels", "two words here", user_id=None)
    assert junk.value.status_code == 422


def test_routes_are_for_superadmins_only():
    from src.router import v1_router
    from src.security.superadmin import require_superadmin

    routes = [route for route in v1_router.routes if "/superadmin/settings/keys" in getattr(route, "path", "")]
    assert {route.path.split("/superadmin")[1] for route in routes} == {"/settings/keys", "/settings/keys/{name}"}
    for route in routes:
        assert require_superadmin in [dep.call for dep in route.dependant.dependencies]


def test_google_sign_in_turns_on_once_both_keys_are_saved(db, monkeypatch):
    import asyncio

    from src.routers import google_oauth as routes
    from src.services.auth import google_oauth

    for name in ("LAUNCHLMS_GOOGLE_CLIENT_ID", "LAUNCHLMS_GOOGLE_CLIENT_SECRET", "LAUNCHLMS_AUTH_OAUTH_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    assert google_oauth.enabled() is False and routes.google_status() == {"enabled": False}
    off = routes.google_authorize(routes.AuthorizeRequest(redirect_uri="https://app.example/auth/callback/google"))
    assert off.status_code == 404 and b"turned off" in off.body

    platform_secrets.save(db, "google_client_id", "1234-abc.apps.googleusercontent.com", user_id=None)
    assert google_oauth.enabled() is False  # both are needed
    platform_secrets.save(db, "google_client_secret", "GOCSPX-secret-value", user_id=None)
    assert routes.google_status() == {"enabled": True}
    url = routes.google_authorize(routes.AuthorizeRequest(redirect_uri="https://app.example/auth/callback/google", state="s1"))["url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?") and "client_id=1234-abc.apps.googleusercontent.com" in url and "state=s1" in url
    assert "GOCSPX" not in url

    class Reply:
        status_code = 200

        def json(self):
            return {"access_token": "ya29.token", "expires_in": 3599, "token_type": "Bearer", "scope": "email"}

    sent = {}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, url, data):
            sent.update(data, url=url)
            return Reply()

    monkeypatch.setattr(google_oauth.httpx, "AsyncClient", Client)
    token = asyncio.run(routes.google_token(routes.TokenRequest(code="code-1", redirect_uri="https://app.example/auth/callback/google")))
    assert token["access_token"] == "ya29.token" and "scope" not in token
    assert sent["client_secret"] == "GOCSPX-secret-value" and sent["code"] == "code-1"

    platform_secrets.save(db, "google_client_secret", "", user_id=None)  # removing one turns it off again
    assert google_oauth.enabled() is False
