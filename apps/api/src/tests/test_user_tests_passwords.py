"""DEV-126: a sealed persona signs out and back in with its email and password."""

import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response
from src.db.users import User
from src.security.auth import decode_jwt
from src.security.security import security_hash_password
from src.services.user_tests import cohorts, passwords, sessions
from src.services.user_tests.seal import CohortSealError
from src.tests import test_user_tests
from src.tests.test_user_tests import _cohort, _persona

db = test_user_tests.db  # the shared fixture


@pytest.fixture(autouse=True)
def no_rate_limit(monkeypatch):
    monkeypatch.setattr("src.routers.auth.check_login_rate_limit", lambda request: (True, 0))


def _login(db, email: str, password: str) -> dict:
    from src.routers.auth import login

    request = Request({"type": "http", "method": "POST", "path": "/api/v1/auth/login", "headers": [], "query_string": b"",
                       "client": ("10.0.0.1", 1), "server": ("localhost", 80), "scheme": "http"})
    return asyncio.run(login(request, Response(), username=email, password=password, db_session=db))


def test_the_console_password_signs_a_persona_back_in_as_the_same_sealed_persona(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    shown = passwords.reveal(db, 1, maya["user_id"])
    assert shown["email"] == maya["email"] and shown["password"].startswith("test-")
    # Stable: the console shows the same password each time.
    assert passwords.reveal(db, 1, maya["user_id"])["password"] == shown["password"]

    result = _login(db, shown["email"], shown["password"])
    claims = decode_jwt(result["tokens"]["access_token"])
    # A persona session, like a console link: the run's operator and cohort, rechecked every request.
    assert claims["test_operator"] == 1 and claims["test_cohort"] == cohort["cohort_uuid"]
    assert result["test_persona"]["user_id"] == maya["user_id"]
    user, persona, _ = sessions.validate(db, claims)
    assert user.id == maya["user_id"] and persona.cohort_id


def test_a_wrong_password_and_a_closed_run_stay_signed_out(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    shown = passwords.reveal(db, 1, maya["user_id"])
    with pytest.raises(HTTPException) as wrong:
        _login(db, shown["email"], "not-the-password")
    assert wrong.value.status_code == 401
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as closed:
        _login(db, shown["email"], shown["password"])
    assert closed.value.status_code == 401


def test_only_platform_admins_see_a_password_and_only_for_personas(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException):
        passwords.reveal(db, 2, maya["user_id"])  # a real learner
    with pytest.raises(HTTPException):
        passwords.reveal(db, 1, 2)  # a real account


def test_a_persona_made_before_dev126_gets_the_known_password_when_shown(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    with passwords.console_writes_password(db):
        account = db.get(User, maya["user_id"])
        account.password = security_hash_password("an old random password")
        db.add(account)
        db.commit()
    shown = passwords.reveal(db, 1, maya["user_id"])
    assert _login(db, shown["email"], shown["password"])["test_persona"]["user_id"] == maya["user_id"]


def test_a_persona_still_cannot_change_its_own_password(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    account = db.get(User, maya["user_id"])
    account.password = security_hash_password("my own choice")
    db.add(account)
    with pytest.raises(CohortSealError):
        db.commit()
    db.rollback()


def test_real_accounts_sign_in_as_before(db):
    account = db.get(User, 2)
    account.password = security_hash_password("a real password 123")
    db.add(account)
    db.commit()
    result = _login(db, "real.learner@example.com", "a real password 123")
    claims = decode_jwt(result["tokens"]["access_token"])
    assert "test_operator" not in claims and "test_persona" not in result
