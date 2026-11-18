"""Finding a school's Canvas connection and the Canvas addresses it signs with."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from config.config import get_launchlms_config
from sqlmodel import Session, select

from src.db.canvas import CANVAS_CLOUD_ISSUER, CanvasConnection
from src.services.oauth.config import frontend_url

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


def framing_origins(db: Session, org_slug: str | None) -> list[str]:
    """Canvas sites allowed to show these pages in a frame: the switched-on connection of the organization
    whose site it is. The main site (no slug, or the owner organization's) is where every school's learners
    land, so it allows every switched-on Canvas. Everything else may only be framed by ourselves."""
    from src.db.organizations import Organization
    from src.services.orgs.owner import owner_org

    query = select(CanvasConnection.canvas_host).where(CanvasConnection.enabled == True)  # noqa: E712
    owner = owner_org(db)
    if org_slug and (not owner or org_slug != owner.slug):
        org = db.exec(select(Organization).where(Organization.slug == org_slug)).first()
        if not org:
            return []
        query = query.where(CanvasConnection.org_id == org.id)
    hosts = sorted({host for host in db.exec(query).all() if host and HOST_PATTERN.fullmatch(host)})
    return [f"{_scheme(host)}://{host}" for host in hosts]


def default_issuer(canvas_host: str) -> str:
    if canvas_host.endswith(".instructure.com"):
        if ".beta." in canvas_host:
            return "https://canvas.beta.instructure.com"
        if ".test." in canvas_host:
            return "https://canvas.test.instructure.com"
        return CANVAS_CLOUD_ISSUER
    return CANVAS_CLOUD_ISSUER


def tool_urls() -> dict:
    """Life2Launch's own LTI addresses, which a school's Canvas admin enters for the developer key."""
    base = f"{frontend_url()}/api/v1/lti"
    return {
        "login": f"{base}/login",
        "launch": f"{base}/launch",
        "jwks": f"{base}/jwks",
        "config": f"{base}/canvas.json",
    }
