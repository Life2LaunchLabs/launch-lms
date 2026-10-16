"""Coach's notes on a goal: the goal owner's open notes, and acting on one."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals.coach_notes import NoteAction, act, goal_notes

router = APIRouter()


@router.get("/{goal_uuid}/coach-notes")
def api_goal_coach_notes(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return goal_notes(db, user, goal_uuid)


@router.post("/{goal_uuid}/coach-notes/{note_uuid}/act")
def api_act_on_coach_note(goal_uuid: str, note_uuid: str, payload: NoteAction, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return act(db, user, goal_uuid, note_uuid, payload)
