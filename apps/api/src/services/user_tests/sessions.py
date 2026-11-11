"""Test persona sessions: who may open them, and the checks every request repeats.

A persona session is a normal login cookie with two extra claims: ``test_operator`` (the
platform admin who opened it) and ``test_cohort``. Any token for a test address without
them is refused, so a persona can never hold an ordinary login.
"""

import re
from contextvars import ContextVar
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select
from src.db.user_tests import TestCohort, TestPersona
from src.db.users import User
from src.services.user_tests.settings import enabled, is_test_address

SESSION_LENGTH = timedelta(hours=4)

# The persona acting in this request, if any. Mail capture reads it.
current_test_persona: ContextVar[int | None] = ContextVar("current_test_persona", default=None)
# The platform admin who opened it, so a persona's banner can switch to another persona of the run.
current_test_operator: ContextVar[int | None] = ContextVar("current_test_operator", default=None)


def is_platform_admin(user_id: int | None, db: Session) -> bool:
    from src.security.superadmin import is_user_owner_org_admin, is_user_superadmin

    if not user_id:
        return False
    return is_user_superadmin(user_id, db) or is_user_owner_org_admin(user_id, db)


def is_test_session(payload: dict | None) -> bool:
    payload = payload or {}
    if payload.get("demo_session"):
        # A demo visitor exploring a published run's persona acts in a private visitor copy,
        # not on the live site, so the visitor's demo session rules apply instead.
        return False
    return bool(payload.get("test_operator")) or is_test_address(payload.get("sub"))


def refresh_test_persona(refresh_token: str | None) -> str | None:
    """A verified test persona refresh token's subject, so it gets its own refresh limit; else None (the per-IP one)."""
    from src.security.auth import decode_refresh_token

    payload = decode_refresh_token(refresh_token) if refresh_token else None
    return str(payload["sub"]) if payload and payload.get("sub") and payload.get("test_operator") and is_test_session(payload) else None


def open_cohort(db: Session, cohort_id: int) -> TestCohort:
    cohort = db.get(TestCohort, cohort_id)
    if not cohort or cohort.status != "open" or cohort.expires_at <= datetime.utcnow():
        raise HTTPException(401, "This test cohort is closed, so its personas are signed out.")
    return cohort


def persona_for(db: Session, user: User | None) -> TestPersona | None:
    if not user or not user.id:
        return None
    return db.get(TestPersona, user.id)


def validate(db: Session, payload: dict) -> tuple[User, TestPersona, TestCohort]:
    """Check a persona session's claims against the live state. Raises 401/403."""
    if not enabled():
        raise HTTPException(401, "User tests are turned off, so test personas are signed out.")
    operator_id = payload.get("test_operator")
    if not operator_id:
        raise HTTPException(401, "Test personas can only be opened from Platform › User tests.")
    if not is_platform_admin(int(operator_id), db):
        raise HTTPException(403, "Platform admin access is required to act as a test persona.")
    user = db.exec(select(User).where(User.email == payload.get("sub"))).first()
    persona = persona_for(db, user)
    if not user or not persona:
        raise HTTPException(403, "This account is not a test persona.")
    cohort = open_cohort(db, persona.cohort_id)
    if payload.get("test_cohort") != cohort.cohort_uuid:
        raise HTTPException(401, "This test session belongs to another cohort.")
    return user, persona, cohort


# What a persona session never does, whatever a page offers: these reach past the cohort, bill, or
# hand out a way in. The cohort seal also refuses changes to a persona's address and password.
WRITES = frozenset({"POST", "PUT", "PATCH", "DELETE"})
BLOCKED = (
    (WRITES, re.compile(r"/api/v1/users/change_password/")),
    (frozenset({"DELETE"}), re.compile(r"/api/v1/users/user_id/")),
    (WRITES | {"GET"}, re.compile(r"/api/v1/orgs/[^/]+/api-tokens")),
    (WRITES, re.compile(r"/api/v1/payments/")),
    (WRITES, re.compile(r"/api/v1/auth/(google|sso)/")),
    # Personas may connect an app (the consent screen) and disconnect it; the seal keeps the grant
    # inside the cohort and the connection ends with the run (connector_persona).
    (WRITES, re.compile(r"/api/v1/oauth/(?!authorize/(validate|decision)$|connections/[^/]+$)")),
)


def connector_persona(db: Session, user: User | None) -> int | None:
    """For a connected app's token: the persona's user id when ``user`` is a test persona, None for a real account.

    Raises 401 once the persona's run has closed or expired, or user tests are off, so its tokens die with the run.
    """
    if not user or not user.id or not is_test_address(user.email):
        return None
    if not enabled():
        raise HTTPException(401, "User tests are turned off, so test personas are signed out.")
    persona = persona_for(db, user)
    if not persona:
        raise HTTPException(403, "This account is not a test persona.")
    open_cohort(db, persona.cohort_id)
    return int(user.id)


def refuse_blocked(method: str, path: str) -> None:
    for methods, pattern in BLOCKED:
        if method.upper() in methods and pattern.match(path):
            from src.services.user_tests.stories import record_blocked

            record_blocked("Test personas can't do this.", {"request": f"{method.upper()} {path}"})
            raise HTTPException(403, {"code": "test_persona_blocked", "message": "Test personas can't do this."})


def check(db: Session, payload: dict) -> tuple[int, int]:
    """The database half of entering a test session: (persona user id, operator id).

    Authentication runs this on a worker thread (it waits on the database), then sets the context
    variables itself: a value set on a worker thread does not reach the request.
    """
    user, persona, _ = validate(db, payload)
    now = datetime.utcnow()
    if not persona.last_active_at or now - persona.last_active_at > timedelta(minutes=1):
        persona.last_active_at = now
        db.add(persona)
    ids = int(user.id), int(payload["test_operator"])  # type: ignore[arg-type]
    db.commit()  # ends the transaction, so the connection goes back to the pool before the route runs
    return ids


def mark(persona_id: int, operator_id: int, request=None) -> None:
    current_test_persona.set(persona_id)
    current_test_operator.set(operator_id)
    if request is not None:
        refuse_blocked(request.method, request.url.path)


def enter(db: Session, payload: dict, request=None) -> int:
    """Enter a test session on the calling thread; returns the persona's user id."""
    persona_id, operator_id = check(db, payload)
    mark(persona_id, operator_id, request)
    return persona_id


def claims(user: User, operator_id: int, cohort: TestCohort) -> dict:
    return {"sub": user.email, "test_operator": int(operator_id), "test_cohort": cohort.cohort_uuid}


def tokens(user: User, operator_id: int, cohort: TestCohort) -> dict:
    from src.security.auth import create_access_token, create_refresh_token

    data = claims(user, operator_id, cohort)
    return {
        "access_token": create_access_token(data, SESSION_LENGTH),
        "refresh_token": create_refresh_token(data, SESSION_LENGTH),
    }


def handoff_tokens(db: Session, payload: dict) -> dict:
    """A persona session for another host, ending when the one it came from ends."""
    from src.security.auth import create_access_token, create_refresh_token

    user, _, cohort = validate(db, payload)
    remaining = datetime.fromtimestamp(int(payload["exp"])) - datetime.now()
    if remaining.total_seconds() <= 0:
        raise HTTPException(401, "This test session has ended. Open the persona again from User tests.")
    length = min(SESSION_LENGTH, remaining)
    data = claims(user, int(payload["test_operator"]), cohort)
    return {
        "access_token": create_access_token(data, length),
        "refresh_token": create_refresh_token(data, length),
        "test_persona": {"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip(), "cohort": cohort.name,
                         "seconds": int(length.total_seconds())},
    }


def refresh(db: Session, payload: dict) -> str:
    """A new access token that keeps the test claims; it never outlives the refresh token."""
    from src.security.auth import create_access_token

    user, _, cohort = validate(db, payload)
    remaining = datetime.fromtimestamp(int(payload["exp"])) - datetime.now()
    length = max(timedelta(seconds=1), min(SESSION_LENGTH, remaining))
    return create_access_token(claims(user, int(payload["test_operator"]), cohort), length)
