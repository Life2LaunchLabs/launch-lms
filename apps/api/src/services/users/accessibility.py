"""A learner's accessibility settings: how much the app reads aloud, how it sounds, and how it looks.

The speaker and mic buttons show for everyone; these settings only change how much the app does on its own.
They're saved on the account (``User.details["accessibility"]``) so they follow the learner to any device.
The learner owns them. Staff who can manage learners can set them for a learner they're assisting, and the
learner sees who changed them last.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_admin
from src.services.connect.people import learner_name
from src.services.portfolio_identity import shown_name

KEY = "accessibility"


class AccessibilitySettings(BaseModel):
    read_to_me: bool = False
    voice: str | None = Field(default=None, max_length=200)
    rate: float = Field(default=1.0, ge=0.5, le=2.0)
    highlight: bool = True
    bigger_text: bool = False
    less_motion: Literal["device", "on", "off"] = "device"


def _stored(user: User) -> dict:
    details = user.details if isinstance(user.details, dict) else {}
    saved = details.get(KEY)
    return saved if isinstance(saved, dict) else {}


def settings_dict(user: User) -> dict:
    saved = _stored(user)
    values = AccessibilitySettings().model_dump()
    for name in AccessibilitySettings.model_fields:
        if name not in saved:
            continue
        try:  # one bad value falls back to its default; the rest are kept
            values[name] = getattr(AccessibilitySettings(**{name: saved[name]}), name)
        except ValueError:
            pass
    return {**values, "set_by": saved.get("set_by") if isinstance(saved.get("set_by"), dict) else None}


def _save(db: Session, user: User, settings: AccessibilitySettings, set_by: dict | None) -> dict:
    details = dict(user.details) if isinstance(user.details, dict) else {}
    details[KEY] = {**settings.model_dump(), "set_by": set_by}
    user.details = details  # a new dict, so the JSON column sees the change
    user.update_date = datetime.now().isoformat()
    db.add(user)
    db.commit()
    db.refresh(user)
    return settings_dict(user)


def _user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_mine(db: Session, current_user: PublicUser) -> dict:
    return settings_dict(_user(db, current_user.id))


def save_mine(db: Session, current_user: PublicUser, settings: AccessibilitySettings) -> dict:
    return _save(db, _user(db, current_user.id), settings, None)


def _learner_in_org(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> User:
    require_org_admin(current_user.id, org_id, db, "manage_learners")
    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    return _user(db, user_id)


def get_for_learner(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    return settings_dict(_learner_in_org(db, current_user, org_id, user_id))


def save_for_learner(db: Session, current_user: PublicUser, org_id: int, user_id: int, settings: AccessibilitySettings) -> dict:
    """Staff assisting a learner set their settings for them; the learner sees who did it."""
    learner = _learner_in_org(db, current_user, org_id, user_id)
    if learner.id == current_user.id:
        return _save(db, learner, settings, None)
    helper = _user(db, current_user.id)
    name = learner_name(db, helper.id, org_id) or shown_name(helper)
    return _save(db, learner, settings, {"user_id": helper.id, "name": name, "at": datetime.now().isoformat()})
