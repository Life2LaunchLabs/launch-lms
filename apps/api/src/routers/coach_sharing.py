"""Learners share a Coach conversation with the coaching team, or stop sharing it."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.coach import CoachShareCreate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.coach import sharing

router = APIRouter()


@router.get("/conversations/{conversation_uuid}/share")
def get_conversation_share(conversation_uuid: str, org_id: int, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return sharing.status(db_session, org_id, int(current_user.id), conversation_uuid)


@router.post("/conversations/{conversation_uuid}/share")
def share_conversation(conversation_uuid: str, org_id: int, payload: CoachShareCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return sharing.share(db_session, org_id, int(current_user.id), conversation_uuid, payload.note)


@router.delete("/conversations/{conversation_uuid}/share")
def unshare_conversation(conversation_uuid: str, org_id: int, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return sharing.unshare(db_session, org_id, int(current_user.id), conversation_uuid)
