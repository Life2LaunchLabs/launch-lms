"""Invitees: people a test run invites who have no account yet (DEV-103).

An invitee is a reserved address on the run's pattern (``<handle>.<cohort slug>@<test domain>``)
with no account. Mail sent to it is kept for the run like any persona's. The console opens a
signed-out browser for it (an entry link that leaves only a short ``test_invitee`` cookie). When
that browser signs up with the address, through an invitation or the front page, the new account
becomes a persona of the run in the same request, before it joins any org, so the cohort seal
holds from its first row, and the sign-up answers with a persona session.

No other sign-up may use a test address: an account on the test domain is always a persona.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.user_tests import TestCohort, TestInvitee, TestMail, TestPersona
from src.db.users import User
from src.services.user_tests import sessions
from src.services.user_tests.settings import email_domain, enabled, is_test_address

INVITEE_COOKIE = "launchlms_test_invitee"
TOKEN_TYPE = "test_invitee"
START_STATE = "invitee"

# Set by a sign-up request that carried a valid invitee cookie: (invitee id, operator id).
adopting_invitee: ContextVar[tuple[int, int] | None] = ContextVar("adopting_invitee", default=None)


def create(db: Session, cohort: TestCohort, handle: str, first_name: str, last_name: str = "", brief: str = "") -> TestInvitee:
    email = f"{handle}.{cohort.slug}@{email_domain()}"
    if db.exec(select(User.id).where(User.email == email)).first() or db.exec(select(TestInvitee.id).where(TestInvitee.email == email)).first():
        raise HTTPException(409, f"{email} is already taken.")
    invitee = TestInvitee(cohort_id=int(cohort.id), handle=handle, email=email, first_name=first_name, last_name=last_name, brief=brief)  # type: ignore[arg-type]
    db.add(invitee)
    db.commit()
    db.refresh(invitee)
    return invitee


def row(db: Session, invitee: TestInvitee) -> dict:
    from sqlalchemy import func

    unread = db.exec(select(func.count()).select_from(TestMail).where(TestMail.to_address == invitee.email, TestMail.opened_at.is_(None))).one()  # type: ignore[union-attr]
    return {
        "invitee_id": invitee.id,
        "user_id": invitee.user_id,  # set once they sign up; from then on they are a persona
        "first_name": invitee.first_name,
        "last_name": invitee.last_name,
        "email": invitee.email,
        "handle": invitee.handle,
        "brief": invitee.brief,
        "start_state": START_STATE,
        "signed_up": invitee.user_id is not None,
        "signed_up_at": invitee.signed_up_at.isoformat() + "Z" if invitee.signed_up_at else None,
        "unread_mail": unread,
    }


def for_cohort(db: Session, cohort_id: int, *, pending_only: bool = False) -> list[TestInvitee]:
    statement = select(TestInvitee).where(TestInvitee.cohort_id == cohort_id)
    if pending_only:
        statement = statement.where(TestInvitee.user_id.is_(None))  # type: ignore[union-attr]
    return list(db.exec(statement.order_by(TestInvitee.creation_date, TestInvitee.id)).all())  # type: ignore[arg-type]


def get(db: Session, invitee_id: int) -> TestInvitee:
    invitee = db.get(TestInvitee, int(invitee_id))
    if not invitee:
        raise HTTPException(404, "That invitee isn't in any run.")
    return invitee


def by_address(db: Session, address: str | None) -> TestInvitee | None:
    if not address or not is_test_address(address):
        return None
    return db.exec(select(TestInvitee).where(TestInvitee.email == str(address).strip().lower())).first()


def entry_token(invitee: TestInvitee, operator_id: int, cohort: TestCohort, length: timedelta = sessions.SESSION_LENGTH) -> str:
    """The signed cookie an invitee's browser carries until it signs up. It names no account, so it signs nobody in."""
    from src.security.auth import ALGORITHM, SECRET_KEY

    payload = {"type": TOKEN_TYPE, "invitee": int(invitee.id), "email": invitee.email, "test_operator": int(operator_id),  # type: ignore[arg-type]
               "test_cohort": cohort.cohort_uuid, "exp": datetime.now(timezone.utc) + length}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode(token: str | None) -> dict | None:
    from src.security.auth import ALGORITHM, SECRET_KEY

    if not token or len(token) > 2000:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == TOKEN_TYPE else None


def claim(db: Session, request: Request | None, email: str) -> tuple[TestInvitee, int, TestCohort] | None:
    """For a sign-up with ``email``: the invitee it adopts, or None for an ordinary address.

    Raises 403 for a test address without a valid invitee cookie for exactly that address, so no
    one can make an account on the test domain outside a run.
    """
    if not is_test_address(email):
        return None
    refused = HTTPException(403, {"code": "test_address_signup", "message": "Test addresses can only sign up from a browser opened for them in Platform › User tests."})
    if not enabled():
        raise refused
    payload = _decode(request.cookies.get(INVITEE_COOKIE) if request is not None else None)
    if not payload or str(payload.get("email", "")).lower() != str(email).strip().lower():
        raise refused
    invitee = db.get(TestInvitee, int(payload["invitee"]))
    if not invitee or invitee.user_id is not None or invitee.email != str(email).strip().lower():
        raise refused
    operator_id = int(payload["test_operator"])
    if not sessions.is_platform_admin(operator_id, db):
        raise refused
    cohort = sessions.open_cohort(db, invitee.cohort_id)
    if payload.get("test_cohort") != cohort.cohort_uuid:
        raise refused
    return invitee, operator_id, cohort


def guard(email: str | None) -> None:
    """Called before any account is created: a test address needs this request's invitee claim."""
    if not is_test_address(email):
        return
    claimed = adopting_invitee.get()
    if claimed is None:
        raise HTTPException(403, {"code": "test_address_signup", "message": "Test addresses can only sign up from a browser opened for them in Platform › User tests."})


def adopt(db: Session, user: User) -> TestPersona | None:
    """Called right after a new account's first commit, before it joins any org: make it the invitee's persona."""
    if not user or not user.id or not is_test_address(user.email):
        return None
    claimed = adopting_invitee.get()
    invitee = db.get(TestInvitee, claimed[0]) if claimed else None
    if not invitee or invitee.email != str(user.email).strip().lower() or invitee.user_id is not None:
        raise HTTPException(403, {"code": "test_address_signup", "message": "Test addresses can only sign up from a browser opened for them in Platform › User tests."})
    persona = TestPersona(user_id=int(user.id), cohort_id=invitee.cohort_id, handle=invitee.handle, brief=invitee.brief, start_state=START_STATE)
    invitee.user_id, invitee.signed_up_at = int(user.id), datetime.utcnow()
    user.email_verified = True  # the run reads its mail; there is no inbox to verify
    user.email_verified_at = datetime.now(timezone.utc).isoformat()
    db.add_all([persona, invitee, user])
    # The invitation and anything else sent before they signed up is now in the persona's inbox.
    for mail in db.exec(select(TestMail).where(TestMail.to_address == invitee.email, TestMail.to_user_id.is_(None))).all():  # type: ignore[union-attr]
        mail.to_user_id, mail.cohort_id = int(user.id), invitee.cohort_id
        db.add(mail)
    db.commit()
    return persona


@contextmanager
def signing_up(db: Session, request: Request | None, email: str):
    """Around a sign-up: a test address needs a valid invitee cookie for exactly that address, and adopts it."""
    found = claim(db, request, email)
    token = adopting_invitee.set((int(found[0].id), found[1]) if found else None)  # type: ignore[arg-type]
    try:
        yield
    finally:
        adopting_invitee.reset(token)


def session_for(db: Session, user, request: Request | None = None, response=None) -> dict | None:
    """The persona session a sign-up that adopted an invitee answers with, instead of an ordinary login.

    Also drops the invitee cookie from ``response``: the browser is the persona now.
    """
    claimed = adopting_invitee.get()
    persona = db.get(TestPersona, int(user.id)) if claimed and user and user.id else None  # type: ignore[arg-type]
    if not persona:
        return None
    account = db.get(User, int(user.id))
    cohort = sessions.open_cohort(db, persona.cohort_id)
    if response is not None:
        from src.security.cookies import get_cookie_domain_for_request

        response.delete_cookie(key=INVITEE_COOKIE, domain=get_cookie_domain_for_request(request) if request is not None else None)
        response.delete_cookie(key=INVITEE_COOKIE)
    user = account
    return {
        "tokens": sessions.tokens(user, claimed[1], cohort),  # type: ignore[index]
        "test_persona": {"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip(), "cohort": cohort.name,
                         "seconds": int(sessions.SESSION_LENGTH.total_seconds())},
    }
