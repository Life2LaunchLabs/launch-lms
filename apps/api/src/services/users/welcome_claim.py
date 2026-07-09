"""
Session claim for the guest-onboarding signup flow.

When email verification is required, `POST /auth/signup/welcome` withholds the
session and instead returns a one-time claim token. The signup tab polls the
claim endpoint with it; once the email is verified, the claim resolves and the
session is issued — so the user never re-enters credentials.

Tokens live in Redis with the same 1-hour TTL as verification links.
"""
import json
import secrets

from sqlmodel import Session, select

from src.db.users import User
from src.services.users.email_verification import (
    TOKEN_TTL_SECONDS,
    get_redis_connection,
)


def create_welcome_claim(user_uuid: str, redirect_url: str) -> str:
    """Store a one-time claim token in Redis and return it."""
    r = get_redis_connection()
    token = secrets.token_urlsafe(32)
    r.setex(
        f"welcome_claim:{token}",
        TOKEN_TTL_SECONDS,
        json.dumps({"user_uuid": user_uuid, "redirect_url": redirect_url}),
    )
    return token


def resolve_welcome_claim(
    db_session: Session, token: str
) -> tuple[str, User | None, str | None]:
    """
    Resolve a claim token.

    Returns (status, user, redirect_url) where status is:
        "invalid" — unknown or expired token (or user no longer exists)
        "pending" — email not verified yet, keep polling
        "ready"   — email verified; token is consumed and the session may be issued
    """
    r = get_redis_connection()
    redis_key = f"welcome_claim:{token}"
    raw = r.get(redis_key)

    if not raw:
        return "invalid", None, None

    claim = json.loads(raw)

    user = db_session.exec(
        select(User).where(User.user_uuid == claim["user_uuid"])
    ).first()

    if not user:
        r.delete(redis_key)
        return "invalid", None, None

    if not user.email_verified:
        return "pending", None, None

    r.delete(redis_key)
    return "ready", user, claim.get("redirect_url")
