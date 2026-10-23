"""Getting started (/start): plans to suggest for a role, and setting up the new space in one call."""

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.orgs import onboarding

router = APIRouter()


@router.get("/suggested")
def api_suggested(role: str, db: Session = Depends(get_db_session)):
    """Shared plans anyone may add, for this role. No sign-in needed: it's shown before the account step."""
    return onboarding.suggested(db, role)


@router.post("/set-up")
async def api_set_up(request: Request, payload: onboarding.SetUpRequest, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Make (or return) the person's space with the picks from /start."""
    return await onboarding.set_up(request, db, user, payload)
