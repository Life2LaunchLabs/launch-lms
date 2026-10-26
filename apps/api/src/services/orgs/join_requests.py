"""Asking to join an invite-only organization.

Anyone can ask, signed in or not (then with their address and name). Admins, and staff who manage
learners, answer on the organization's profile (Requests). Approving someone with an account makes
them a learner at once and takes a learner seat; approving an address with no account sends the
organization's invitation, which holds the seat until they sign up. Either way they hear by email,
and an account holder also finds the answer in their chat with the organization.
"""

from __future__ import annotations

import html
import logging
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import Session, col, func, select

from src.db.organization_invitations import InviteUsersRequest
from src.db.organization_join_requests import JoinRequestCreate, OrganizationJoinRequest
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.access.access import require_capacity
from src.services.connect import chats, people
from src.services.email.utils import send_email
from src.services.oauth.config import frontend_url
from src.services.school import chats as school_chats, plan_requests
from src.services.security.rate_limiting import check_rate_limit, get_client_ip

logger = logging.getLogger(__name__)
REQUESTED, APPROVED, DECLINED = "requested", "approved", "declined"
LEARNER_ROLE_ID = 4
# Asking without an account: at most this many asks per address and per connection an hour.
ASKS_PER_HOUR = 5


def _now() -> str:
    return datetime.now().isoformat()


def _org_or_404(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _signed_in(user: PublicUser | AnonymousUser | None) -> bool:
    return isinstance(user, PublicUser) and bool(getattr(user, "id", None))


def _member(db: Session, org_id: int, user_id: int | None) -> bool:
    return bool(user_id) and db.exec(select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first() is not None


def _pending(db: Session, org_id: int, email: str) -> OrganizationJoinRequest | None:
    return db.exec(select(OrganizationJoinRequest).where(OrganizationJoinRequest.org_id == org_id, OrganizationJoinRequest.email_normalized == email,
                                                         OrganizationJoinRequest.status == REQUESTED)).first()


def _dict(db: Session, row: OrganizationJoinRequest) -> dict:
    return {"request_uuid": row.request_uuid, "status": row.status, "email": row.email, "name": row.name, "message": row.message,
            "creation_date": row.creation_date, "person": people.person(db, row.user_id) if row.user_id else None}


async def ask(request: Request, db: Session, current_user: PublicUser | AnonymousUser, org_id: int, payload: JoinRequestCreate) -> dict:
    from src.services.orgs.orgs import get_org_join_mechanism

    org = _org_or_404(db, org_id)
    if await get_org_join_mechanism(request, org_id, current_user, db) != "inviteOnly":
        raise HTTPException(status_code=400, detail=f"Anyone can join {org.name}; sign up instead")
    user_id = int(current_user.id) if _signed_in(current_user) else None  # type: ignore[union-attr]
    if user_id:
        email = str(current_user.email)  # type: ignore[union-attr]
        name = " ".join(part for part in (current_user.first_name, current_user.last_name) if part) or current_user.username  # type: ignore[union-attr]
        if _member(db, org_id, user_id):
            raise HTTPException(status_code=409, detail=f"You're already in {org.name}")
    else:
        if not payload.email:
            raise HTTPException(status_code=400, detail="Your email address is needed to answer you")
        email, name = str(payload.email), payload.name.strip()
        for key in (f"join_request:{get_client_ip(request)}", f"join_request:{email.casefold()}"):
            if not check_rate_limit(key, ASKS_PER_HOUR, 3600)[0]:
                raise HTTPException(status_code=429, detail="Too many requests; try again later")
    normalized = email.strip().casefold()
    row = _pending(db, org_id, normalized)
    now = _now()
    if row is None:
        row = OrganizationJoinRequest(request_uuid=f"org_join_{uuid4()}", org_id=org_id, email=email.strip(), email_normalized=normalized, creation_date=now)
    row.user_id, row.name, row.message, row.update_date = user_id or row.user_id, name, payload.message.strip(), now
    db.add(row)
    db.commit()
    return {"status": REQUESTED, "request_uuid": row.request_uuid}


def mine(db: Session, current_user: PublicUser, org_id: int) -> dict:
    row = _pending(db, org_id, str(current_user.email).strip().casefold())
    return {"status": REQUESTED, "request_uuid": row.request_uuid} if row else {"status": "none"}


def withdraw(db: Session, current_user: PublicUser, org_id: int) -> dict:
    row = _pending(db, org_id, str(current_user.email).strip().casefold())
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    db.delete(row)
    db.commit()
    return {"status": "none"}


def _require_decider(db: Session, current_user: PublicUser, org_id: int) -> None:
    if not plan_requests.can_decide(db, int(current_user.id), org_id):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail="Only admins and staff who manage learners answer requests to join")


def waiting(db: Session, org_id: int) -> list[OrganizationJoinRequest]:
    return list(db.exec(select(OrganizationJoinRequest).where(OrganizationJoinRequest.org_id == org_id, OrganizationJoinRequest.status == REQUESTED)
                        .order_by(col(OrganizationJoinRequest.creation_date))).all())


def list_requests(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    _require_decider(db, current_user, org_id)
    return [_dict(db, row) for row in waiting(db, org_id)]


async def decide(request: Request, db: Session, current_user: PublicUser, request_uuid: str, approve: bool) -> dict:
    row = db.exec(select(OrganizationJoinRequest).where(OrganizationJoinRequest.request_uuid == request_uuid)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    _require_decider(db, current_user, row.org_id)
    if row.status != REQUESTED:
        raise HTTPException(status_code=409, detail="This request was already answered")
    org = _org_or_404(db, row.org_id)
    account = db.get(User, row.user_id) if row.user_id else db.exec(select(User).where(func.lower(User.email) == row.email_normalized)).first()
    invited = False
    if approve and account and not _member(db, org.id, account.id):  # type: ignore[arg-type]
        require_capacity("learners", int(org.id), db)  # type: ignore[arg-type]
        db.add(UserOrganization(user_id=int(account.id), org_id=int(org.id), role_id=LEARNER_ROLE_ID, creation_date=_now(), update_date=_now()))  # type: ignore[arg-type]
    elif approve and not account:
        # No account yet: the organization's invitation holds the seat and carries them through signup.
        from src.services.orgs.users import invite_batch_users

        result = await invite_batch_users(request, int(org.id), InviteUsersRequest(emails=[row.email], role_id=LEARNER_ROLE_ID), db, current_user)  # type: ignore[arg-type]
        outcome = (result.results[0] if result.results else None)
        if outcome is None or outcome.status not in ("invited", "already_invited"):
            raise HTTPException(status_code=409, detail=(outcome.detail if outcome and outcome.detail else "That invitation couldn't be sent"))
        invited = True
    row.status, row.decided_by_user_id, row.decided_at, row.update_date = (APPROVED if approve else DECLINED), current_user.id, datetime.utcnow(), _now()
    row.user_id = row.user_id or (account.id if account else None)
    db.add(row)
    if account:
        conversation = school_chats.school_chat(db, int(org.id), int(account.id))  # type: ignore[arg-type]
        chats.post(db, conversation, int(current_user.id), f"Welcome to {org.name}! I approved your request to join." if approve  # type: ignore[arg-type]
                   else f"I declined your request to join {org.name} for now. Reply here if you'd like to talk about it.")
    db.commit()
    if not invited:
        _email_answer(org, row, approve)
    return {**_dict(db, row), "invited": invited}


def _email_answer(org: Organization, row: OrganizationJoinRequest, approved: bool) -> None:
    name = html.escape(org.name)
    if approved:
        subject, line = f"You're in {org.name}", f"Your request to join <b>{name}</b> was approved."
        link = f'<p><a href="{frontend_url()}/orgs/{org.slug}">Go to {name}</a></p>'
    else:
        subject, line, link = f"Your request to join {org.name}", f"<b>{name}</b> couldn't add you right now.", ""
    try:
        send_email(to=row.email, subject=subject, body=f"<html><body><p>Hello {html.escape(row.name or row.email)}</p><p>{line}</p>{link}</body></html>")
    except Exception:
        logger.exception("Failed to email the answer to a request to join %s", org.id)
