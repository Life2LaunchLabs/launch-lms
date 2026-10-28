"""The page an invitation email or a join link opens (see services/orgs/invite_landing.py)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.services.orgs import invite_landing

router = APIRouter()


@router.get("/{org_id}/invite-preview")
def api_invite_preview(org_id: int, invitation: str | None = None, invite_code: str | None = None, db: Session = Depends(get_db_session)):
    return invite_landing.preview(db, org_id, invitation, invite_code)
