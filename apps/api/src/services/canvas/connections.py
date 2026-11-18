"""Finding a school's Canvas connection and the Canvas addresses it signs with."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from config.config import get_launchlms_config
from sqlmodel import Session, select

from src.db.canvas import CANVAS_CLOUD_ISSUER, CanvasConnection

# Canvas Cloud signs from one shared site per environment, whatever the school's own address.
CLOUD_SSO_HOSTS = {
    "https://canvas.instructure.com": "sso.canvaslms.com",
    "https://canvas.beta.instructure.com": "sso.beta.canvaslms.com",
    "https://canvas.test.instructure.com": "sso.test.canvaslms.com",
}
HOST_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$")


def clean_host(value: str) -> str:
    """`https://School.instructure.com/courses/1` -> `school.instructure.com`; '' when it isn't a host."""
    value = (value or "").strip().lower()
    if not value:
        return ""
    if "//" not in value:
        value = f"//{value}"
    host = urlsplit(value).netloc.rstrip(".")
    return host if HOST_PATTERN.fullmatch(host) else ""


def platform_host(connection: CanvasConnection) -> str:
    """Where Canvas's sign-in redirect and keys live for this connection."""
    cloud = CLOUD_SSO_HOSTS.get(connection.issuer.rstrip("/"))
    if cloud and connection.canvas_host.endswith(".instructure.com"):
        return cloud
    return connection.canvas_host


def _scheme(host: str) -> str:
    # A self-hosted test Canvas on this machine may run without TLS in development.
    if get_launchlms_config().general_config.development_mode and host.split(":")[0] in {"localhost", "127.0.0.1"}:
        return "http"
    return "https"


def authorize_url(connection: CanvasConnection) -> str:
    host = platform_host(connection)
    return f"{_scheme(host)}://{host}/api/lti/authorize_redirect"


def platform_jwks_url(connection: CanvasConnection) -> str:
    host = platform_host(connection)
    return f"{_scheme(host)}://{host}/api/lti/security/jwks"


def platform_origin(connection: CanvasConnection) -> str:
    """The origin Canvas's message forwarding answers from (platform storage)."""
    host = platform_host(connection)
    return f"{_scheme(host)}://{host}"


def find_for_login(db: Session, issuer: str, client_id: str | None) -> CanvasConnection | None:
    query = select(CanvasConnection).where(CanvasConnection.issuer == issuer.rstrip("/"))
    if client_id:
        query = query.where(CanvasConnection.client_id == client_id)
    matches = db.exec(query).all()
    # Without a client id the issuer alone must name one school (Canvas Cloud always sends it).
    return matches[0] if len(matches) == 1 else None


def for_org(db: Session, org_id: int) -> CanvasConnection | None:
    return db.exec(select(CanvasConnection).where(CanvasConnection.org_id == org_id)).first()


def framing_hosts(db: Session, org_id: int) -> list[str]:
    """Canvas sites allowed to show this organization's pages in a frame: its switched-on connection only."""
    connection = for_org(db, org_id)
    if not connection or not connection.enabled or not connection.canvas_host:
        return []
    return [connection.canvas_host]


def default_issuer(canvas_host: str) -> str:
    if canvas_host.endswith(".instructure.com"):
        if ".beta." in canvas_host:
            return "https://canvas.beta.instructure.com"
        if ".test." in canvas_host:
            return "https://canvas.test.instructure.com"
        return CANVAS_CLOUD_ISSUER
    return CANVAS_CLOUD_ISSUER
