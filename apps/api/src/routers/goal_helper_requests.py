"""Helpers waiting on an organization admin before joining a learner's plan (see services/goals/helper_requests.py)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.goals import helper_requests

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/helper-requests")
def api_helper_requests(org_id: int, current_user: PublicUser = USER, db: Session = DB):
    return helper_requests.list_requests(db, current_user, org_id)


@router.post("/helper-requests/{invitation_uuid}/approve")
def api_approve_helper(org_id: int, invitation_uuid: str, current_user: PublicUser = USER, db: Session = DB):
    return helper_requests.decide(db, current_user, org_id, invitation_uuid, approve=True)


@router.post("/helper-requests/{invitation_uuid}/decline")
def api_decline_helper(org_id: int, invitation_uuid: str, current_user: PublicUser = USER, db: Session = DB):
    return helper_requests.decide(db, current_user, org_id, invitation_uuid, approve=False)
