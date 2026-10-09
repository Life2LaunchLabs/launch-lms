"""OAuth 2.1 authorization server: registration, consent, tokens, revocation.

Public clients must use PKCE (S256). Codes are single-use and short-lived.
Refresh tokens rotate; presenting an already-rotated refresh token revokes the
whole grant family (RFC 9700 reuse detection). Access tokens are bound to the
user, the organization chosen at consent, the granted scopes and the MCP
resource.
"""

from __future__ import annotations

import base64
import hmac
from hashlib import sha256
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

from sqlmodel import Session, select

from src.db.oauth import OAuthAuthorizationCode, OAuthClient, OAuthGrant
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.services.oauth.config import (
    ACCESS_PREFIX,
    ACCESS_TTL_SECONDS,
    CLIENT_PREFIX,
    CODE_PREFIX,
    CODE_TTL_SECONDS,
    REFRESH_PREFIX,
    REFRESH_TTL_SECONDS,
    SCOPES,
    OAuthError,
    check_resource,
    hash_secret,
    issuer,
    new_secret,
    normalize_scope,
)

LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}


def _now() -> datetime:
    return datetime.utcnow()


def _valid_redirect_uri(uri: str) -> bool:
    parsed = urlparse(uri)
    if parsed.fragment or not parsed.netloc:
        return False
    if parsed.scheme == "https":
        return True
    return parsed.scheme == "http" and (parsed.hostname or "") in LOOPBACK_HOSTS


def register_client(db_session: Session, metadata: dict) -> dict:
    redirect_uris = metadata.get("redirect_uris")
    if not isinstance(redirect_uris, list) or not redirect_uris or len(redirect_uris) > 10:
        raise OAuthError("invalid_redirect_uri", "redirect_uris must list 1 to 10 URIs")
    if not all(isinstance(uri, str) and len(uri) <= 500 and _valid_redirect_uri(uri) for uri in redirect_uris):
        raise OAuthError("invalid_redirect_uri", "Redirect URIs must use https (or http on a loopback host) and have no fragment")
    method = metadata.get("token_endpoint_auth_method") or "none"
    if method not in {"none", "client_secret_post", "client_secret_basic"}:
        raise OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method")
    grant_types = metadata.get("grant_types") or ["authorization_code", "refresh_token"]
    if not set(grant_types) <= {"authorization_code", "refresh_token"}:
        raise OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported")
    if set(metadata.get("response_types") or ["code"]) != {"code"}:
        raise OAuthError("invalid_client_metadata", "Only the code response type is supported")
    scope = normalize_scope(metadata.get("scope"))
    name = str(metadata.get("client_name") or "Connected app").strip()[:200] or "Connected app"
    client_id = new_secret(CLIENT_PREFIX)[:48]
    secret = new_secret("lmcs_") if method != "none" else None
    issued_at = int(_now().timestamp())
    client = OAuthClient(
        client_id=client_id,
        client_secret_hash=hash_secret(secret) if secret else None,
        client_name=name,
        client_uri=_optional_url(metadata.get("client_uri")),
        logo_uri=_optional_url(metadata.get("logo_uri")),
        redirect_uris=list(redirect_uris),
        token_endpoint_auth_method=method,
        scope=scope,
        creation_date=str(_now()),
    )
    db_session.add(client)
    db_session.commit()
    response = {
        "client_id": client_id,
        "client_id_issued_at": issued_at,
        "client_name": name,
        "redirect_uris": list(redirect_uris),
        "token_endpoint_auth_method": method,
        "grant_types": list(grant_types),
        "response_types": ["code"],
        "scope": scope,
    }
    if secret:
        response.update({"client_secret": secret, "client_secret_expires_at": 0})
    return response


def _optional_url(value) -> str | None:
    if not isinstance(value, str) or not value.startswith("https://") or len(value) > 500:
        return None
    return value


def _client(db_session: Session, client_id: str | None) -> OAuthClient:
    client = db_session.exec(select(OAuthClient).where(OAuthClient.client_id == (client_id or ""))).first()
    if not client:
        raise OAuthError("invalid_client", "Unknown client", 401)
    return client


@dataclass
class AuthorizationRequest:
    client_id: str
    redirect_uri: str
    code_challenge: str
    code_challenge_method: str = "S256"
    response_type: str = "code"
    scope: str | None = None
    state: str | None = None
    resource: str | None = None


def admin_orgs(db_session: Session, user: PublicUser) -> list[Organization]:
    memberships = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user.id,
            UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS),  # type: ignore[attr-defined]
        )
    ).all()
    org_ids = sorted({membership.org_id for membership in memberships})
    if not org_ids:
        return []
    return list(db_session.exec(select(Organization).where(Organization.id.in_(org_ids))).all())  # type: ignore[union-attr]


def validate_authorization(db_session: Session, request: AuthorizationRequest, user: PublicUser) -> dict:
    """Check an authorization request before showing consent.

    Problems with the client or redirect URI are never redirected (the error
    is shown to the user); everything else is reported to the client.
    """
    client = _client(db_session, request.client_id)
    if request.redirect_uri not in client.redirect_uris:
        raise OAuthError("invalid_request", "redirect_uri is not registered for this client")
    if request.response_type != "code":
        raise OAuthError("unsupported_response_type", "Only response_type=code is supported")
    if request.code_challenge_method != "S256" or not (43 <= len(request.code_challenge or "") <= 128):
        raise OAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required")
    scope = normalize_scope(request.scope)
    check_resource(request.resource)
    orgs = admin_orgs(db_session, user)
    return {
        "client": {"name": client.client_name, "client_uri": client.client_uri, "logo_uri": client.logo_uri, "redirect_host": urlparse(request.redirect_uri).netloc},
        "scopes": [{"name": name, "description": SCOPES[name]} for name in scope.split()],
        "orgs": [{"id": org.id, "slug": org.slug, "name": org.name} for org in orgs],
        "user": {"username": user.username, "email": user.email},
    }


def _redirect(redirect_uri: str, params: dict) -> str:
    separator = "&" if urlparse(redirect_uri).query else "?"
    clean = {key: value for key, value in params.items() if value is not None}
    return f"{redirect_uri}{separator}{urlencode(clean)}"


def decide_authorization(
    db_session: Session, request: AuthorizationRequest, user: PublicUser, *, approve: bool, org_id: int | None
) -> str:
    """Record the user's decision and return the URL to send the browser to."""
    validate_authorization(db_session, request, user)
    if not approve:
        return _redirect(request.redirect_uri, {"error": "access_denied", "state": request.state, "iss": issuer()})
    if org_id not in {org.id for org in admin_orgs(db_session, user)}:
        raise OAuthError("access_denied", "You must be an admin of the organization you connect", 403)
    code = new_secret(CODE_PREFIX)
    db_session.add(
        OAuthAuthorizationCode(
            code_hash=hash_secret(code),
            client_id=request.client_id,
            user_id=user.id,
            org_id=org_id,
            redirect_uri=request.redirect_uri,
            code_challenge=request.code_challenge,
            scope=normalize_scope(request.scope),
            resource=check_resource(request.resource),
            expires_at=_now() + timedelta(seconds=CODE_TTL_SECONDS),
        )
    )
    db_session.commit()
    return _redirect(request.redirect_uri, {"code": code, "state": request.state, "iss": issuer()})


def authenticate_client(db_session: Session, form: dict, authorization: str | None) -> OAuthClient:
    client_id, secret = form.get("client_id"), form.get("client_secret")
    if authorization and authorization.lower().startswith("basic "):
        try:
            decoded = base64.b64decode(authorization[6:]).decode("utf-8")
            client_id, secret = decoded.split(":", 1)
        except (ValueError, UnicodeDecodeError) as exc:
            raise OAuthError("invalid_client", "Malformed client credentials", 401) from exc
    client = _client(db_session, client_id)
    if client.token_endpoint_auth_method != "none":
        if not secret or not client.client_secret_hash or not hmac.compare_digest(hash_secret(secret), client.client_secret_hash):
            raise OAuthError("invalid_client", "Client authentication failed", 401)
    return client


def _pkce_matches(verifier: str, challenge: str) -> bool:
    digest = base64.urlsafe_b64encode(sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(digest, challenge)


def _issue(db_session: Session, *, family_id: str, client_id: str, user_id: int, org_id: int, scope: str, resource: str) -> dict:
    access, refresh = new_secret(ACCESS_PREFIX), new_secret(REFRESH_PREFIX)
    now = _now()
    db_session.add(
        OAuthGrant(
            family_id=family_id,
            access_token_hash=hash_secret(access),
            refresh_token_hash=hash_secret(refresh),
            client_id=client_id,
            user_id=user_id,
            org_id=org_id,
            scope=scope,
            resource=resource,
            access_expires_at=now + timedelta(seconds=ACCESS_TTL_SECONDS),
            refresh_expires_at=now + timedelta(seconds=REFRESH_TTL_SECONDS),
            creation_date=str(now),
        )
    )
    db_session.commit()
    return {"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_TTL_SECONDS, "refresh_token": refresh, "scope": scope}


def exchange_token(db_session: Session, form: dict, authorization: str | None) -> dict:
    client = authenticate_client(db_session, form, authorization)
    grant_type = form.get("grant_type")
    if grant_type == "authorization_code":
        return _exchange_code(db_session, client, form)
    if grant_type == "refresh_token":
        return _refresh(db_session, client, form)
    raise OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token")


def _exchange_code(db_session: Session, client: OAuthClient, form: dict) -> dict:
    record = db_session.exec(
        select(OAuthAuthorizationCode).where(OAuthAuthorizationCode.code_hash == hash_secret(form.get("code") or ""))
    ).first()
    if not record or record.client_id != client.client_id:
        raise OAuthError("invalid_grant", "Unknown authorization code")
    if record.used_at is not None:
        # A replayed code means it leaked: revoke everything it produced.
        _revoke_family(db_session, f"code:{record.id}")
        raise OAuthError("invalid_grant", "Authorization code was already used")
    record.used_at = _now()
    db_session.add(record)
    db_session.commit()
    if record.expires_at < _now():
        raise OAuthError("invalid_grant", "Authorization code expired")
    if form.get("redirect_uri") != record.redirect_uri:
        raise OAuthError("invalid_grant", "redirect_uri does not match the authorization request")
    verifier = form.get("code_verifier") or ""
    if not (43 <= len(verifier) <= 128) or not _pkce_matches(verifier, record.code_challenge):
        raise OAuthError("invalid_grant", "PKCE verification failed")
    if form.get("resource") and check_resource(form.get("resource")) != record.resource:
        raise OAuthError("invalid_target", "resource does not match the authorization request")
    return _issue(
        db_session,
        family_id=f"code:{record.id}",
        client_id=client.client_id,
        user_id=record.user_id,
        org_id=record.org_id,
        scope=record.scope,
        resource=record.resource,
    )


def _revoke_family(db_session: Session, family_id: str) -> None:
    now = _now()
    for grant in db_session.exec(select(OAuthGrant).where(OAuthGrant.family_id == family_id)).all():
        if grant.revoked_at is None:
            grant.revoked_at = now
            db_session.add(grant)
    db_session.commit()


def _refresh(db_session: Session, client: OAuthClient, form: dict) -> dict:
    grant = db_session.exec(
        select(OAuthGrant).where(OAuthGrant.refresh_token_hash == hash_secret(form.get("refresh_token") or ""))
    ).first()
    if not grant or grant.client_id != client.client_id:
        raise OAuthError("invalid_grant", "Unknown refresh token")
    if grant.rotated_at is not None:
        _revoke_family(db_session, grant.family_id)
        raise OAuthError("invalid_grant", "Refresh token was already used; the connection was revoked")
    if grant.revoked_at is not None or grant.refresh_expires_at < _now():
        raise OAuthError("invalid_grant", "Refresh token expired or revoked")
    scope = grant.scope
    if form.get("scope"):
        requested = normalize_scope(form.get("scope"))
        if not set(requested.split()) <= set(grant.scope.split()):
            raise OAuthError("invalid_scope", "Cannot widen scope on refresh")
        scope = requested
    grant.rotated_at = _now()
    db_session.add(grant)
    return _issue(
        db_session,
        family_id=grant.family_id,
        client_id=client.client_id,
        user_id=grant.user_id,
        org_id=grant.org_id,
        scope=scope,
        resource=grant.resource,
    )


def revoke_token(db_session: Session, form: dict, authorization: str | None) -> None:
    client = authenticate_client(db_session, form, authorization)
    token_hash = hash_secret(form.get("token") or "")
    grant = db_session.exec(
        select(OAuthGrant).where((OAuthGrant.access_token_hash == token_hash) | (OAuthGrant.refresh_token_hash == token_hash))
    ).first()
    if grant and grant.client_id == client.client_id:
        _revoke_family(db_session, grant.family_id)


@dataclass
class AccessContext:
    user: PublicUser
    org_id: int
    scopes: set[str]
    client_id: str
    client_name: str


def resolve_access_token(db_session: Session, token: str) -> AccessContext | None:
    if not token.startswith(ACCESS_PREFIX):
        return None
    grant = db_session.exec(select(OAuthGrant).where(OAuthGrant.access_token_hash == hash_secret(token))).first()
    now = _now()
    if not grant or grant.revoked_at is not None or grant.access_expires_at < now:
        return None
    user = db_session.get(User, grant.user_id)
    if not user:
        return None
    public_user = PublicUser(**user.model_dump())
    grant.last_used_at = now
    db_session.add(grant)
    db_session.commit()
    client = db_session.exec(select(OAuthClient).where(OAuthClient.client_id == grant.client_id)).first()
    return AccessContext(
        user=public_user,
        org_id=grant.org_id,
        scopes=set(grant.scope.split()),
        client_id=grant.client_id,
        client_name=client.client_name if client else "Connected app",
    )


def list_grants(db_session: Session, user: PublicUser) -> list[dict]:
    grants = db_session.exec(
        select(OAuthGrant).where(OAuthGrant.user_id == user.id, OAuthGrant.revoked_at.is_(None))  # type: ignore[union-attr]
    ).all()
    active: dict[str, OAuthGrant] = {}
    for grant in grants:
        if grant.rotated_at is None and grant.refresh_expires_at > _now():
            active[grant.family_id] = grant
    clients = {
        client.client_id: client
        for client in db_session.exec(select(OAuthClient).where(OAuthClient.client_id.in_([g.client_id for g in active.values()]))).all()  # type: ignore[attr-defined]
    }
    return [
        {
            "connection_id": family_id,
            "client_name": clients.get(grant.client_id).client_name if clients.get(grant.client_id) else "Connected app",
            "org_id": grant.org_id,
            "scope": grant.scope,
            "last_used_at": grant.last_used_at.isoformat() if grant.last_used_at else None,
            "refreshed_at": grant.creation_date,
        }
        for family_id, grant in active.items()
    ]


def disconnect(db_session: Session, user: PublicUser, connection_id: str) -> None:
    owned = db_session.exec(
        select(OAuthGrant).where(OAuthGrant.family_id == connection_id, OAuthGrant.user_id == user.id)
    ).first()
    if not owned:
        raise OAuthError("invalid_request", "Connection not found", 404)
    _revoke_family(db_session, connection_id)
