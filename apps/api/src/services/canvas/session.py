"""Signing a Canvas launch in: partitioned cookies inside the Canvas page, one-use tickets to hand the session on.

Inside Canvas, browsers don't send our usual SameSite=Lax cookies, so a Canvas session's access, refresh and
marker cookies are SameSite=None; Secure; Partitioned: the browser keeps them for use inside that school's
Canvas only, apart from the person's normal Life2Launch sign-in in another tab. `launchlms_canvas` marks the
session, so every place that refreshes or clears the cookies keeps those attributes (web: services/auth/cookies.ts).

A launch never sets cookies directly on Canvas's post: it hands a one-use ticket to the organization's own
host (`/lti/session`), which sets the cookies there and checks they stuck. If they didn't (a browser that
blocks cookies in frames), the page offers Safari's storage access prompt and a button that opens
Life2Launch in a new tab, signed in, with normal first-party cookies. No token travels in a URL.
"""

from __future__ import annotations

import json
import re
import secrets
from datetime import timedelta

import redis
from config.config import get_launchlms_config
from fastapi import Request, Response
from sqlmodel import Session

from src.db.organizations import Organization
from src.security.auth import JWT_COOKIE_NAME, JWT_REFRESH_COOKIE_NAME
from src.security.cookies import CANVAS_MARKER_COOKIE, host_cookie_domain
from src.services.canvas.launch import LaunchError, _redis

SESSION_MARKER_COOKIE = "launchlms_has_session"
TICKET_PATTERN = re.compile(r"^[A-Za-z0-9_-]{40,64}$")
# Long enough for a student to read the "open in a new tab" page and tap; still one use only.
BRIDGE_TICKET_TTL_SECONDS = 300
# The in-app "open in a new tab" button asks for its ticket on the tap (design: 60 seconds).
TAB_TICKET_TTL_SECONDS = 60


def _scheme() -> str:
    return "https" if get_launchlms_config().hosting_config.ssl else "http"


def org_base_url(db: Session, org: Organization) -> str:
    """The organization's own site: the owner org on the bare domain, others on their subdomain."""
    from src.services.orgs.owner import require_owner_org

    domain = get_launchlms_config().hosting_config.frontend_domain.rstrip("/")
    owner = require_owner_org(db)
    if org.id == owner.id:
        return f"{_scheme()}://{domain}"
    return f"{_scheme()}://{org.slug}.{domain}"


def issue_ticket(payload: dict, ttl: int = BRIDGE_TICKET_TTL_SECONDS) -> str:
    """A one-use ticket: `{"kind": "launch", ...checked launch}` or `{"kind": "session", "email", "org_id", "return"}`."""
    ticket = secrets.token_urlsafe(32)
    value = json.dumps(payload)
    try:
        if not _redis().set(f"lti:ticket:{ticket}", value, ex=ttl, nx=True):
            raise LaunchError("Opening Life2Launch from Canvas isn't available right now. Try again in a minute.", 503)
    except redis.RedisError as error:
        raise LaunchError("Opening Life2Launch from Canvas isn't available right now. Try again in a minute.", 503) from error
    return ticket


def redeem_ticket(ticket: str) -> dict | None:
    if not isinstance(ticket, str) or not TICKET_PATTERN.fullmatch(ticket):
        return None
    try:
        raw = _redis().getdel(f"lti:ticket:{ticket}")
    except redis.RedisError:
        return None
    return json.loads(raw) if raw else None


def safe_return_path(path: str) -> str:
    if (not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or len(path) > 512
            or "\\" in path or any(ord(c) < 32 or ord(c) == 127 for c in path)):
        return "/"
    return path


def cookie_domain(request: Request) -> str | None:
    return host_cookie_domain(request)


def is_canvas_session(request: Request) -> bool:
    return request.cookies.get(CANVAS_MARKER_COOKIE) == "1"


def set_canvas_cookies(response: Response, request: Request, access_token: str, refresh_token: str) -> None:
    """Partitioned sign-in cookies for use inside Canvas. Always Secure: browsers refuse SameSite=None otherwise."""
    common = {"secure": True, "samesite": "none", "partitioned": True, "path": "/", "domain": cookie_domain(request)}
    response.set_cookie(JWT_COOKIE_NAME, access_token, httponly=True,
                        max_age=int(timedelta(hours=8).total_seconds()), **common)
    response.set_cookie(JWT_REFRESH_COOKIE_NAME, refresh_token, httponly=True,
                        max_age=int(timedelta(days=30).total_seconds()), **common)
    response.set_cookie(SESSION_MARKER_COOKIE, "1", httponly=False,
                        max_age=int(timedelta(days=30).total_seconds()), **common)
    response.set_cookie(CANVAS_MARKER_COOKIE, "1", httponly=False,
                        max_age=int(timedelta(days=30).total_seconds()), **common)


def clear_canvas_cookies(response: Response, request: Request) -> None:
    common = {"secure": True, "samesite": "none", "partitioned": True, "path": "/", "domain": cookie_domain(request)}
    for name in (JWT_COOKIE_NAME, JWT_REFRESH_COOKIE_NAME, SESSION_MARKER_COOKIE, CANVAS_MARKER_COOKIE):
        # Starlette's delete_cookie can't say Partitioned, and a partitioned cookie is only cleared by one that does.
        response.set_cookie(name, "", max_age=0, expires=0,
                            httponly=name in {JWT_COOKIE_NAME, JWT_REFRESH_COOKIE_NAME}, **common)


def set_state_cookie(response: Response, state: str) -> None:
    response.set_cookie("launchlms_lti_state", state, max_age=600, httponly=True, secure=True,
                        samesite="none", partitioned=True, path="/api/v1/lti/")


def clear_state_cookie(response: Response) -> None:
    response.set_cookie("launchlms_lti_state", "", max_age=0, expires=0, httponly=True, secure=True,
                        samesite="none", partitioned=True, path="/api/v1/lti/")
