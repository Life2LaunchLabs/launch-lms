"""The assignments screens: the list, one assignment's steps, its people and its messages (services/goals/assignment_views.py, assignment_messages.py)."""

from typing import Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.routers.goal_admin import _require_assignment_plan
from src.security.auth import get_current_user
from src.services.goals import assignment_invites, assignment_messages, assignment_views

router = APIRouter()


@router.get("")
def api_assignments(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return assignment_views.list_assignments(db, user, org_id)


@router.get("/{assignment_uuid}")
def api_assignment(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db, read=True)
    return assignment_views.assignment_detail(db, user, org_id, assignment_uuid)


@router.get("/{assignment_uuid}/people")
def api_assignment_people(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db, read=True)
    return assignment_views.assignment_people(db, user, org_id, assignment_uuid)


@router.get("/{assignment_uuid}/messages")
def api_assignment_messages(assignment_uuid: str, org_id: int, step: str | None = None, audience: Literal["all", "learner", "staff"] | None = None,
                            before: str | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A group assignment's thread with the whole group; filtered to a step it also lists learners' questions about it."""
    _require_assignment_plan(org_id, assignment_uuid, db, read=True)
    return assignment_messages.assignment_thread(db, user, org_id, assignment_uuid, step, audience, before)


@router.get("/{assignment_uuid}/learners/{user_uuid}/messages")
def api_assignment_learner_messages(assignment_uuid: str, user_uuid: str, org_id: int, step: str | None = None,
                                    audience: Literal["all", "learner", "staff"] | None = None, before: str | None = None,
                                    db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """One learner's messages about their plan from the assignment, with a line for each step past due."""
    _require_assignment_plan(org_id, assignment_uuid, db, read=True)
    return assignment_messages.learner_thread(db, user, org_id, assignment_uuid, user_uuid, step, audience, before)


@router.post("/{assignment_uuid}/resend")
def api_assignment_resend(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Send the assignment's waiting email invitations again."""
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignment_invites.resend(db, user, org_id, assignment_uuid)
