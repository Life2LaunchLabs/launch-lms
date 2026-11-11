"""Suggestions: resources picked for where the person is, each with its reason, and what they do with them."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.org_auth import require_org_membership
from src.services.recommend import engine, lists

router = APIRouter()


def _signed_in(user) -> PublicUser:
    if not getattr(user, "id", None) or getattr(user, "user_uuid", "") == "user_anonymous":
        raise HTTPException(status_code=401, detail="Sign in to see suggestions.")
    return user


class SaveToPhase(BaseModel):
    org_id: int
    resource_uuid: str = Field(max_length=100)
    shelf: str = Field(default="", max_length=80)


class Events(BaseModel):
    org_id: int
    events: list[dict] = Field(default_factory=list, max_length=50)


@router.get("/phase/{phase_id}")
def api_phase(phase_id: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A phase's suggestions: the few to show on its page, the shelves behind See more, and its saved list."""
    user = _signed_in(user)
    require_org_membership(user.id, org_id, db)
    return engine.for_phase(db, user, org_id, phase_id)


@router.post("/phase/{phase_id}/save")
def api_save_to_phase(phase_id: str, body: SaveToPhase, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Save a resource to the phase's Library list (made the first time) and to the Library."""
    return lists.save_to_phase(db, _signed_in(user), body.org_id, phase_id, body.resource_uuid, body.shelf)


@router.delete("/phase/{phase_id}/save/{resource_uuid}")
def api_remove_from_phase(phase_id: str, resource_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Take a resource out of the phase's list; it stays in the Library."""
    return lists.remove_from_phase(db, _signed_in(user), org_id, phase_id, resource_uuid)


@router.post("/events")
def api_events(body: Events, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """What the person saw and did: shown, open, hide (left out of that context from then on) and unhide."""
    return lists.record(db, _signed_in(user), body.org_id, body.events)
