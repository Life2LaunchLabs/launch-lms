"""Accessibility settings: the learner's own, and a learner's for staff assisting them."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.users import accessibility

router = APIRouter()


@router.get("/users/me/accessibility", tags=["users"])
async def api_get_my_accessibility(db_session: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Your accessibility settings: read aloud, voice and speed, bigger text, less motion."""
    return accessibility.get_mine(db_session, current_user)


@router.put("/users/me/accessibility", tags=["users"])
async def api_save_my_accessibility(payload: accessibility.AccessibilitySettings, db_session: Session = Depends(get_db_session),
                                    current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    return accessibility.save_mine(db_session, current_user, payload)


@router.get("/orgs/{org_id}/users/{user_id}/accessibility", tags=["orgs"])
async def api_get_learner_accessibility(org_id: int, user_id: int, db_session: Session = Depends(get_db_session),
                                        current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """A learner's accessibility settings, for staff who can manage learners."""
    return accessibility.get_for_learner(db_session, current_user, org_id, user_id)


@router.put("/orgs/{org_id}/users/{user_id}/accessibility", tags=["orgs"])
async def api_save_learner_accessibility(org_id: int, user_id: int, payload: accessibility.AccessibilitySettings,
                                         db_session: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Set a learner's accessibility settings while assisting them; the learner sees who changed them."""
    return accessibility.save_for_learner(db_session, current_user, org_id, user_id, payload)
