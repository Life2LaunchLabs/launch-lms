"""Getting started (/start): frameworks to track, plans to suggest for a role, and setting up the new space in one call."""

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.orgs import onboarding

router = APIRouter()


@router.get("/frameworks")
def api_frameworks(db: Session = Depends(get_db_session)):
    """Requirement frameworks in the library. No sign-in needed: it's shown before the account step."""
    return onboarding.frameworks(db)


@router.get("/suggested")
def api_suggested(role: str, framework: str | None = None, db: Session = Depends(get_db_session)):
    """Shared plans anyone may add, for this role, ranked by how much of ``framework`` they cover. No sign-in needed."""
    return onboarding.suggested(db, role, framework)


@router.post("/set-up")
async def api_set_up(request: Request, payload: onboarding.SetUpRequest, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Make (or return) the person's space with the picks from /start."""
    return await onboarding.set_up(request, db, user, payload)
