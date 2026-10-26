"""Asking to join an invite-only organization, and answering (see services/orgs/join_requests.py)."""

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.organization_join_requests import JoinRequestCreate
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_authenticated_user, get_current_user
from src.services.orgs import join_requests

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.post("/{org_id}/join-requests")
async def api_ask_to_join(request: Request, org_id: int, payload: JoinRequestCreate, db: Session = DB, current_user: PublicUser | AnonymousUser = Depends(get_current_user)):
    return await join_requests.ask(request, db, current_user, org_id, payload)


@router.get("/{org_id}/join-requests/mine")
def api_my_join_request(org_id: int, db: Session = DB, current_user: PublicUser = USER):
    return join_requests.mine(db, current_user, org_id)


@router.delete("/{org_id}/join-requests/mine")
def api_withdraw_join_request(org_id: int, db: Session = DB, current_user: PublicUser = USER):
    return join_requests.withdraw(db, current_user, org_id)


@router.get("/{org_id}/join-requests")
def api_join_requests(org_id: int, db: Session = DB, current_user: PublicUser = USER):
    return join_requests.list_requests(db, current_user, org_id)


@router.post("/join-requests/{request_uuid}/approve")
async def api_approve_join_request(request: Request, request_uuid: str, db: Session = DB, current_user: PublicUser = USER):
    return await join_requests.decide(request, db, current_user, request_uuid, True)


@router.post("/join-requests/{request_uuid}/decline")
async def api_decline_join_request(request: Request, request_uuid: str, db: Session = DB, current_user: PublicUser = USER):
    return await join_requests.decide(request, db, current_user, request_uuid, False)
