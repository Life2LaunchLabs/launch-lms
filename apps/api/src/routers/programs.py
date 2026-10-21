from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.programs import ParticipantResponse
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import programs as service


router = APIRouter()


@router.get("/me/all")
def api_my_program_summaries(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.my_program_summaries(db_session, current_user)


@router.post("/invitations/me/viewed")
def api_mark_my_program_invitations_viewed(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.mark_my_program_invitations_viewed(db_session, current_user)


@router.post("/invitations/{participant_uuid}/respond")
def api_respond_to_invitation(
    participant_uuid: str,
    payload: ParticipantResponse,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.respond_to_invitation(db_session, current_user, org_id, participant_uuid, payload.accept)
