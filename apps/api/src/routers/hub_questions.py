from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_questions import QuestionAnswers, answer_questions

router = APIRouter()


@router.post("/messages/{message_uuid}/answers")
def answer_hub_questions(message_uuid: str, org_id: int, body: QuestionAnswers, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    """The learner's answers to the questions Coach asked in one reply; returns the message to send Coach."""
    return answer_questions(db_session, current_user, org_id, message_uuid, body)
