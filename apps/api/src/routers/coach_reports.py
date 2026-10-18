"""Learners report a Coach reply that went wrong."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.coach import CoachReportCreate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.coach import reports

router = APIRouter()


@router.post("/messages/{message_uuid}/report", status_code=201)
def report_message(message_uuid: str, org_id: int, payload: CoachReportCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return reports.report(db_session, org_id, int(current_user.id), message_uuid, payload.reason, payload.note)
