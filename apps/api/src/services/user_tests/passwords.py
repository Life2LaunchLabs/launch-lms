"""A persona's sign-in password, so a run can test "sign out and come back later" (DEV-126).

The console gives every persona a known password: derived from the server's signing secret and the
persona's account, so it is the same each time the console shows it and never stored in clear. Only
a platform admin sees it (the console and the connector). A persona that signed up from an
invitation can use the password it chose there instead.

Signing in with it on the ordinary Login form answers with a persona session, never an ordinary
login: the same claims a console link gives (the run's operator and cohort), so every request is
rechecked against the live run, the seal still holds, and the session ends when the run closes.
Personas still can't change their own password (the seal refuses it), and real accounts' sign-in and
password reset are unchanged.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from contextlib import contextmanager

from fastapi import HTTPException
from sqlmodel import Session
from src.db.user_tests import TestPersona
from src.db.users import User
from src.security.security import security_hash_password, security_verify_password
from src.services.user_tests import sessions
from src.services.user_tests.settings import enabled, is_test_address

# Set on a session while the console writes a persona's known password: the one change to a
# persona's password the seal lets through.
CONSOLE_PASSWORD_FLAG = "user_tests_console_password"


def known_password(user: User) -> str:
    """The console's password for this persona: stable, unguessable without the server secret."""
    from src.security.auth import SECRET_KEY

    digest = hmac.new(str(SECRET_KEY).encode(), f"test-persona-password:{user.user_uuid}".encode(), hashlib.sha256).digest()
    code = base64.b32encode(digest).decode().rstrip("=").lower()
    return f"test-{code[:5]}-{code[5:10]}-{code[10:15]}"


def initial_hash(user: User) -> str:
    """For a persona being created: its password hash is the known password's from the start."""
    return security_hash_password(known_password(user))


@contextmanager
def console_writes_password(db: Session):
    db.info[CONSOLE_PASSWORD_FLAG] = True
    try:
        yield
    finally:
        db.info.pop(CONSOLE_PASSWORD_FLAG, None)


def reveal(db: Session, operator_id: int, persona_user_id: int) -> dict:
    """The persona's address and known password, for a platform admin. Sets the password if the account
    doesn't have it yet (a persona made before DEV-126, or an invitee who chose its own)."""
    if not sessions.is_platform_admin(operator_id, db):
        raise HTTPException(403, "Platform admin access is required.")
    user = db.get(User, persona_user_id)
    persona = sessions.persona_for(db, user)
    if not user or not persona:
        raise HTTPException(403, "Passwords can only be shown for test personas.")
    sessions.open_cohort(db, persona.cohort_id)
    password = known_password(user)
    if not security_verify_password(password, user.password):
        with console_writes_password(db):
            user.password = security_hash_password(password)
            db.add(user)
            db.commit()
    return {"user_id": user.id, "email": user.email, "password": password}


def login_session(db: Session, user: User) -> dict | None:
    """For a sign-in whose password was right: the persona session it answers with, or None for a real account.

    Raises when the address is on the test domain but the account can't sign in as a persona now
    (user tests off, not a persona, its run closed, or the run's operator no longer a platform admin).
    """
    if not is_test_address(user.email):
        return None
    if not enabled():
        raise HTTPException(401, {"code": "test_persona_signed_out", "message": "User tests are turned off, so test personas are signed out."})
    persona = db.get(TestPersona, int(user.id)) if user.id else None  # type: ignore[arg-type]
    if not persona:
        raise HTTPException(403, {"code": "test_persona_signed_out", "message": "This account is not a test persona."})
    cohort = sessions.open_cohort(db, persona.cohort_id)
    operator_id = int(cohort.created_by)
    if not sessions.is_platform_admin(operator_id, db):
        raise HTTPException(403, {"code": "test_persona_signed_out", "message": "This run's operator can no longer run user tests, so its personas are signed out."})
    return {
        "tokens": sessions.tokens(user, operator_id, cohort),
        "test_persona": {"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip(), "cohort": cohort.name,
                         "seconds": int(sessions.SESSION_LENGTH.total_seconds())},
    }
