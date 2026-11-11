"""The "Stop these emails" link at the foot of each notification: it switches that stream off without signing in.

The token names the person and the stream and carries an HMAC under a key derived from the app's
secret. It is deliberately not a JWT, so it can never pass as a sign-in token, and all it can do is
switch one stream off (or back on from the same page).
"""

from __future__ import annotations

import hashlib
import hmac

from sqlmodel import Session, select

from src.db.users import User
from src.security.security import SECRET_KEY
from src.services.notifications import preferences
from src.services.notifications.catalog import STREAMS
from src.services.oauth.config import frontend_url

_PURPOSE = b"launchlms-email-unsubscribe-v1"


def _signature(user_uuid: str, stream: str) -> str:
    key = hmac.new(str(SECRET_KEY).encode(), _PURPOSE, hashlib.sha256).digest()
    return hmac.new(key, f"{user_uuid}:{stream}".encode(), hashlib.sha256).hexdigest()[:32]


def token(user: User, stream: str) -> str:
    return f"{user.user_uuid}.{stream}.{_signature(user.user_uuid, stream)}"


def link(user: User, stream: str) -> str:
    return f"{frontend_url()}/api/v1/notifications/unsubscribe?token={token(user, stream)}"


def resolve(db: Session, value: str) -> tuple[User, str] | None:
    """The person and stream a token names, or None when it's not one of ours."""
    parts = (value or "").rsplit(".", 2)
    if len(parts) != 3:
        return None
    user_uuid, stream, signature = parts
    if stream not in STREAMS or not hmac.compare_digest(signature, _signature(user_uuid, stream)):
        return None
    user = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    return (user, stream) if user else None


def apply(db: Session, value: str, on: bool) -> str | None:
    """Switch the stream; returns its label, or None for a bad token."""
    found = resolve(db, value)
    if not found:
        return None
    user, stream = found
    preferences.save(db, int(user.id), {stream: on})  # type: ignore[arg-type]
    return STREAMS[stream].label
