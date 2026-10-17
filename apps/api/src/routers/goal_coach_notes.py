"""Coach's notes on a goal: the goal owner's open notes, and acting on one."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.coach import first_look
from src.services.goals.coach_notes import NoteAction, _own_goal, act, goal_notes
from src.security.org_auth import require_org_membership

router = APIRouter()


@router.get("/{goal_uuid}/coach-notes")
def api_goal_coach_notes(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return goal_notes(db, user, goal_uuid)


@router.post("/{goal_uuid}/coach-notes/first-look")
async def api_goal_first_look(goal_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Coach's first look at a new goal, when it is due; returns the goal's notes either way."""
    require_org_membership(user.id, org_id, db)
    await first_look.take(db, org_id, _own_goal(db, user.id, goal_uuid), int(user.id))
    return goal_notes(db, user, goal_uuid)


@router.post("/{goal_uuid}/coach-notes/{note_uuid}/act")
def api_act_on_coach_note(goal_uuid: str, note_uuid: str, payload: NoteAction, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return act(db, user, goal_uuid, note_uuid, payload)
