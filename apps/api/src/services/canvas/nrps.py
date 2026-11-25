"""LTI Names and Role Provisioning Services: asking a school's Canvas for a course's class list (DEV-193).

A short token from a client credentials grant signed with Life2Launch's LTI key, then the membership pages.
Only the school's own Canvas host is ever sent the token. services/canvas/roster.py applies what comes back.
"""

from __future__ import annotations

import logging
import secrets
import time
from urllib.parse import urlsplit

import httpx
import jwt
from sqlmodel import Session

from src.db.canvas import CanvasConnection
from src.services.canvas import connections, keys

logger = logging.getLogger(__name__)

NRPS_SCOPE = "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly"
MEMBERSHIP_MEDIA_TYPE = "application/vnd.ims.lti-nrps.v2.membershipcontainer+json"
MAX_MEMBERS = 2000
MAX_PAGES = 40
TIMEOUT = httpx.Timeout(10.0, connect=5.0)

NO_SCOPE = ("Canvas hasn't given Life2Launch the class list yet. Ask your school's Canvas admin to open the "
            "Life2Launch developer key, save it again so it picks up the class list permission, and turn it on.")
NOT_OFFERED = ("Canvas hasn't shared this course's class list yet. Open Life2Launch from the course in Canvas as its "
               "teacher once, then try again.")
UNREACHABLE = "Life2Launch couldn't reach your school's Canvas. Try again in a few minutes."


class RosterError(Exception):
    """A pull that couldn't finish, with a plain sentence for staff."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message



def _same_host(url: str, connection: CanvasConnection) -> bool:
    """Only the school's own Canvas gets a class list token from us."""
    parts = urlsplit(url)
    host = (parts.netloc or "").lower()
    allowed = {connection.canvas_host.lower(), connections.platform_host(connection).lower()} - {""}
    return parts.scheme == connections._scheme(host) and host in allowed


def token_url(connection: CanvasConnection) -> str:
    host = connections.platform_host(connection)
    return f"{connections._scheme(host)}://{host}/login/oauth2/token"


def _client_assertion(db: Session, connection: CanvasConnection, audience: str) -> str:
    now = int(time.time())
    claims = {"iss": connection.client_id, "sub": connection.client_id, "aud": audience,
              "iat": now, "exp": now + 300, "jti": secrets.token_urlsafe(24)}
    return jwt.encode(claims, keys.private_key_pem(db), algorithm="RS256", headers={"kid": keys.public_jwk(db)["kid"]})


def access_token(db: Session, connection: CanvasConnection, client: httpx.Client, scope: str = NRPS_SCOPE) -> str:
    url = token_url(connection)
    try:
        response = client.post(url, data={
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": _client_assertion(db, connection, url),
            "scope": scope,
        }, headers={"Accept": "application/json"})
    except httpx.HTTPError as error:
        logger.warning("Canvas token request for connection %s failed: %s", connection.id, error)
        raise RosterError(UNREACHABLE) from error
    body = _json(response)
    if response.status_code >= 400 or not body.get("access_token"):
        logger.info("Canvas refused a class list token for connection %s: %s %s", connection.id, response.status_code, body.get("error"))
        # Canvas answers invalid_scope (or a 400/401 naming the scope) when the key lacks the permission.
        raise RosterError(NO_SCOPE if response.status_code in (400, 401, 403) else UNREACHABLE)
    return str(body["access_token"])


def _json(response: httpx.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _next_link(response: httpx.Response) -> str | None:
    link = response.links.get("next") if response.headers.get("link") else None
    return link.get("url") if link else None


def fetch_members(connection: CanvasConnection, url: str, token: str, client: httpx.Client) -> list[dict]:
    members: list[dict] = []
    for _ in range(MAX_PAGES):
        if not _same_host(url, connection):
            raise RosterError(NOT_OFFERED)
        try:
            response = client.get(url, headers={"Authorization": f"Bearer {token}", "Accept": MEMBERSHIP_MEDIA_TYPE})
        except httpx.HTTPError as error:
            logger.warning("Canvas class list for connection %s failed: %s", connection.id, error)
            raise RosterError(UNREACHABLE) from error
        if response.status_code in (401, 403):
            raise RosterError(NO_SCOPE)
        if response.status_code == 404:
            raise RosterError(NOT_OFFERED)
        if response.status_code >= 400:
            raise RosterError(UNREACHABLE)
        page = _json(response).get("members") or []
        members.extend(member for member in page if isinstance(member, dict))
        if len(members) > MAX_MEMBERS:
            raise RosterError(f"This course has more than {MAX_MEMBERS} people, more than Life2Launch reads from one class list.")
        url = _next_link(response) or ""
        if not url:
            return members
    raise RosterError(UNREACHABLE)
