"""Which email notifications a person gets: one switch per stream, kept in ``user.details``."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.notifications.catalog import STREAMS

DETAILS_KEY = "email_notifications"


def enabled(user: User | None, stream_key: str) -> bool:
    if not user or stream_key not in STREAMS:
        return False
    saved = ((user.details or {}).get(DETAILS_KEY) or {}).get(stream_key)
    return STREAMS[stream_key].default_on if saved is None else bool(saved)


def _is_staff_anywhere(db: Session, user_id: int) -> bool:
    return db.exec(select(UserOrganization.id).where(UserOrganization.user_id == user_id, UserOrganization.role_id.in_([1, 2]))).first() is not None  # type: ignore[union-attr]


def view(db: Session, user_id: int) -> dict:
    """The switches this person sees: staff streams only for people who are staff somewhere."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    staff = _is_staff_anywhere(db, user_id)
    return {"streams": [
        {"key": stream.key, "label": stream.label, "description": stream.description, "enabled": enabled(user, stream.key)}
        for stream in STREAMS.values() if stream.audience == "everyone" or staff
    ]}


def save(db: Session, user_id: int, changes: dict[str, bool]) -> dict:
    unknown = sorted(set(changes) - set(STREAMS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown email notification: {', '.join(unknown)}")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    details = dict(user.details or {})
    details[DETAILS_KEY] = {**(details.get(DETAILS_KEY) or {}), **{key: bool(value) for key, value in changes.items()}}
    user.details = details
    db.add(user)
    db.commit()
    return view(db, user_id)
