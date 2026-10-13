"""Plan sharing routes that sit beside the invitation and collaborator routes in planning.py."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import plan_sharing as service

router = APIRouter()


@router.delete("/plans/{identifier}/invitations/{invitation_uuid}")
def api_revoke_invitation(identifier: str, invitation_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.revoke_invitation(db, current_user, identifier, invitation_uuid)
