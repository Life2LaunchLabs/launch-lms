"""The LTI 1.3 launch: Canvas's login step, then its signed launch message.

1. Login (`/lti/login`): Canvas names the school's issuer and client id. We keep a one-use state and nonce
   in Redis for a few minutes, set a short partitioned state cookie, and send the browser to Canvas to sign.
   When Canvas offers LTI platform storage we also keep the state there, for browsers that drop the cookie.
2. Launch (`/lti/launch`): Canvas posts a signed id token. We check it against Canvas's published keys
   (issuer, client id, deployment id, expiry) and use the nonce once.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from dataclasses import dataclass, field
from functools import lru_cache

import jwt
import redis
from config.config import get_launchlms_config
from fastapi import HTTPException
from sqlmodel import Session

from src.db.canvas import CanvasConnection
from src.services.canvas import connections

logger = logging.getLogger(__name__)

STATE_TTL_SECONDS = 600
STATE_COOKIE = "launchlms_lti_state"
LTI = "https://purl.imsglobal.org/spec/lti/claim/"
RESOURCE_LINK_REQUEST = "LtiResourceLinkRequest"


class LaunchError(HTTPException):
    """A launch we refuse, with a plain sentence for the page Canvas shows."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(status_code=status_code, detail=message)
        self.message = message


def _redis() -> redis.Redis:
    url = get_launchlms_config().redis_config.redis_connection_string
    if not url:
        raise LaunchError("Opening Life2Launch from Canvas isn't available right now.", 503)
    return redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)


@dataclass
class LoginRedirect:
    authorize_url: str
    params: dict
    state: str
    storage_target: str | None
    platform_origin: str


def start_login(db: Session, issuer: str, client_id: str | None, login_hint: str, target_link_uri: str,
                lti_message_hint: str | None, deployment_id: str | None, storage_target: str | None,
                redirect_uri: str) -> LoginRedirect:
    if not issuer or not login_hint:
        raise LaunchError("Canvas didn't send what Life2Launch needs to open. Ask your school's Canvas admin to check the setup.")
    connection = connections.find_for_login(db, issuer, client_id)
    if not connection or not connection.enabled:
        raise LaunchError("Your school hasn't connected Canvas to Life2Launch, or the connection is switched off. Ask your school's Life2Launch admin.", 404)
    if deployment_id and connection.deployment_ids and deployment_id not in connection.deployment_ids:
        raise LaunchError("This Canvas deployment isn't connected to Life2Launch. Ask your school's Life2Launch admin to add its deployment id.", 403)
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    try:
        _redis().set(f"lti:state:{state}", json.dumps({"connection_id": connection.id, "nonce": nonce}),
                     ex=STATE_TTL_SECONDS, nx=True)
    except redis.RedisError as error:
        raise LaunchError("Opening Life2Launch from Canvas isn't available right now. Try again in a minute.", 503) from error
    params = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": connection.client_id,
        "redirect_uri": redirect_uri,
        "login_hint": login_hint,
        "state": state,
        "nonce": nonce,
    }
    if lti_message_hint:
        params["lti_message_hint"] = lti_message_hint
    return LoginRedirect(connections.authorize_url(connection), params, state,
                         storage_target if storage_target and len(storage_target) <= 64 else None,
                         connections.platform_origin(connection))


@lru_cache(maxsize=64)
def _jwk_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=5)


def _signing_key(connection: CanvasConnection, token: str):
    try:
        return _jwk_client(connections.platform_jwks_url(connection)).get_signing_key_from_jwt(token).key
    except jwt.PyJWKClientError as error:
        logger.warning("Canvas keys for connection %s unavailable: %s", connection.id, error)
        raise LaunchError("Life2Launch couldn't check Canvas's signature. Try again in a minute.", 502) from error


@dataclass
class Launch:
    connection: CanvasConnection
    canvas_user_id: str
    email: str
    given_name: str
    family_name: str
    name: str
    roles: list[str] = field(default_factory=list)
    course_id: str | None = None
    course_title: str | None = None
    claims: dict = field(default_factory=dict)


def consume_state(state: str) -> dict:
    if not state or len(state) > 128:
        raise LaunchError("This Canvas launch has expired. Open Life2Launch from Canvas again.")
    try:
        raw = _redis().getdel(f"lti:state:{state}")
    except redis.RedisError as error:
        raise LaunchError("Opening Life2Launch from Canvas isn't available right now. Try again in a minute.", 503) from error
    if not raw:
        raise LaunchError("This Canvas launch has expired or was already used. Open Life2Launch from Canvas again.")
    return json.loads(raw)


def verify_launch(db: Session, id_token: str, stored: dict) -> Launch:
    connection = db.get(CanvasConnection, stored.get("connection_id"))
    if not connection or not connection.enabled:
        raise LaunchError("Your school's Canvas connection is switched off. Ask your school's Life2Launch admin.", 403)
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.PyJWTError as error:
        raise LaunchError("Canvas sent a launch Life2Launch couldn't read.") from error
    if header.get("alg") != "RS256":
        raise LaunchError("Canvas sent a launch Life2Launch couldn't read.")
    try:
        claims = jwt.decode(
            id_token,
            _signing_key(connection, id_token),
            algorithms=["RS256"],
            audience=connection.client_id,
            issuer=connection.issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]},
            leeway=60,
        )
    except jwt.ExpiredSignatureError as error:
        raise LaunchError("This Canvas launch has expired. Open Life2Launch from Canvas again.") from error
    except jwt.PyJWTError as error:
        logger.info("Rejected Canvas launch for connection %s: %s", connection.id, error)
        raise LaunchError("Life2Launch couldn't confirm this launch came from your school's Canvas.", 401) from error
    audience = claims.get("aud")
    if isinstance(audience, list) and len(audience) > 1 and claims.get("azp") != connection.client_id:
        raise LaunchError("Life2Launch couldn't confirm this launch came from your school's Canvas.", 401)
    if not secrets.compare_digest(str(claims.get("nonce", "")), str(stored.get("nonce", ""))):
        raise LaunchError("This Canvas launch was already used. Open Life2Launch from Canvas again.", 401)
    if claims["iat"] > time.time() + 60:
        raise LaunchError("Life2Launch couldn't confirm this launch came from your school's Canvas.", 401)
    deployment = claims.get(f"{LTI}deployment_id")
    if not deployment or deployment not in (connection.deployment_ids or []):
        raise LaunchError("This Canvas deployment isn't connected to Life2Launch. Ask your school's Life2Launch admin to add its deployment id.", 403)
    if claims.get(f"{LTI}message_type") != RESOURCE_LINK_REQUEST or claims.get(f"{LTI}version") != "1.3.0":
        raise LaunchError("Life2Launch opens from a course link in Canvas. Ask your teacher where to find it.")
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise LaunchError("Canvas didn't share your email with Life2Launch. Ask your school's Canvas admin to set the tool's privacy level to public.")
    context = claims.get(f"{LTI}context") or {}
    return Launch(
        connection=connection,
        canvas_user_id=str(claims["sub"]),
        email=email,
        given_name=(claims.get("given_name") or "").strip(),
        family_name=(claims.get("family_name") or "").strip(),
        name=(claims.get("name") or "").strip(),
        roles=[str(role) for role in claims.get(f"{LTI}roles") or []],
        course_id=str(context["id"]) if context.get("id") else None,
        course_title=(context.get("title") or context.get("label") or "").strip() or None,
        claims=claims,
    )
