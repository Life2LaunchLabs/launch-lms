"""Google sign-in's client ID and secret: saved in Platform › Settings, else the environment.

It's on when LAUNCHLMS_AUTH_OAUTH_ENABLED says so (with the keys in the environment, as before), or once a
superadmin saves both keys in Platform › Settings. Removing a saved key turns it back off.
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx
from config.config import get_launchlms_config
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.platform_secrets import PlatformSecret
from src.services import platform_secrets

CLIENT_ID = "google_client_id"
CLIENT_SECRET = "google_client_secret"


def _saved_in_platform() -> bool:
    from src.core.events.database import engine

    try:
        with Session(engine) as db:
            keys = set(db.exec(select(PlatformSecret.key).where(PlatformSecret.key.in_([CLIENT_ID, CLIENT_SECRET]))).all())  # type: ignore[attr-defined]
        return keys == {CLIENT_ID, CLIENT_SECRET}
    except Exception:
        return False


def enabled() -> bool:
    return bool(get_launchlms_config().general_config.auth_oauth_enabled) or _saved_in_platform()


def _keys() -> tuple[str, str]:
    if not enabled():
        raise HTTPException(status_code=404, detail="Google sign-in is turned off")
    client_id, secret = platform_secrets.get(CLIENT_ID), platform_secrets.get(CLIENT_SECRET)
    if not client_id or not secret:
        raise HTTPException(status_code=500, detail="Google sign-in isn't set up: add its client ID and secret in Platform › Settings")
    return client_id, secret


def authorize_url(redirect_uri: str, state: str, scope: str) -> str:
    client_id, _ = _keys()
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": scope or "openid email profile",
        "state": state, "access_type": "offline", "prompt": "consent",
    })


async def exchange_code(code: str, redirect_uri: str) -> dict:
    client_id, secret = _keys()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": client_id, "client_secret": secret, "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        })
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code if 400 <= response.status_code < 500 else 502,
                            detail=data.get("error_description") or "Token exchange failed")
    return {key: data.get(key) for key in ("access_token", "refresh_token", "expires_in", "token_type", "id_token")}
