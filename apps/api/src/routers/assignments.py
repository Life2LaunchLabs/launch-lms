"""The assignments screens: the list, one assignment's steps, and its people (services/goals/assignment_views.py)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.routers.goal_admin import _require_assignment_plan
from src.security.auth import get_current_user
from src.services.goals import assignment_views

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
