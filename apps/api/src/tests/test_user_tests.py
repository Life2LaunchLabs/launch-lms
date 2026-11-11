"""User tests: the switch only reaches test personas, and their mail is never delivered."""

import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.user_tests import TestCohort, TestCohortOrg, TestLoginTicket, TestMail, TestPersona
from src.db.users import User
from src.security.rbac.constants import ADMIN_ROLE_ID, USER_ROLE_ID
from src.services.user_tests import cohorts, mail, personas, sessions, tickets
from src.services.user_tests.settings import is_test_address


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("LAUNCHLMS_USER_TESTS_ENABLED", "true")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Organization.__table__,
            OrganizationConfig.__table__,
            UserOrganization.__table__,
            TestCohort.__table__,
            TestPersona.__table__,
            TestCohortOrg.__table__,
            TestMail.__table__,
            TestLoginTicket.__table__,
        ],
    )
    import src.core.events.database as database

    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda user_id: None, raising=False)
    with Session(engine) as session:
        session.add(Organization(id=1, name="Launch", slug="launch", email="team@example.com", org_uuid="org_main", creation_date="", update_date=""))
        session.add(_user(1, "admin@example.com"))
        session.add(_user(2, "real.learner@example.com"))
        session.add(UserOrganization(user_id=1, org_id=1, role_id=ADMIN_ROLE_ID, creation_date="", update_date=""))
        session.add(UserOrganization(user_id=2, org_id=1, role_id=USER_ROLE_ID, creation_date="", update_date=""))
        session.commit()
        # Each request has its own context; give each test a clean one too.
        token = sessions.current_test_persona.set(None)
        try:
            yield session
        finally:
            sessions.current_test_persona.reset(token)


def _user(user_id: int, email: str) -> User:
    return User(
        id=user_id, username=email.split("@")[0], first_name="Real", last_name="Person", email=email,
        user_uuid=f"user_{user_id}", creation_date="", update_date="",
    )


def _cohort(db: Session, name: str = "Riverside onboarding") -> dict:
    return cohorts.create_cohort(db, 1, cohorts.CreateCohort(name=name))


def _persona(db: Session, cohort_uuid: str, first_name: str = "Maya", **extra) -> dict:
    body = personas.CreatePersonas(personas=[personas.CreatePersona(first_name=first_name, **extra)])
    return asyncio.run(personas.create_personas(db, cohort_uuid, body))[0]


def _session_payload(db: Session, persona: dict) -> dict:
    link = tickets.mint(db, 1, persona["user_id"], "/plans")
    token = link["path"].split("t=", 1)[1]
    redeemed = tickets.redeem(db, token)
    from src.security.auth import decode_jwt

    return decode_jwt(redeemed["tokens"]["access_token"])


def test_personas_are_fresh_test_accounts_and_learners_in_the_main_org(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"], brief="Ninth grader, new to the app")
    assert is_test_address(maya["email"])
    assert maya["email"] == f"maya.{cohort['slug']}@test.life2launch.app"
    memberships = db.exec(select(UserOrganization).where(UserOrganization.user_id == maya["user_id"])).all()
    assert [(m.org_id, m.role_id) for m in memberships] == [(1, USER_ROLE_ID)]
    assert not sessions.is_platform_admin(maya["user_id"], db)
    assert db.get(User, maya["user_id"]).signup_method == "test_persona"


def test_org_owner_persona_gets_an_unlisted_test_org(db):
    cohort = _cohort(db)
    owner = _persona(db, cohort["cohort_uuid"], first_name="Ms Rivera", start_state="org_owner", org_name="Riverside High")
    link = db.exec(select(TestCohortOrg)).one()
    org = db.get(Organization, link.org_id)
    assert org.name == "Riverside High" and org.explore is False
    assert link.created_by_user_id == owner["user_id"]
    # An org a real user creates is left alone.
    assert personas.record_org(db, 2, 1, "real.learner@example.com") is False


def test_login_links_are_refused_for_real_accounts_and_non_admins(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as real:
        tickets.mint(db, 1, 2)
    assert real.value.status_code == 403
    with pytest.raises(HTTPException) as not_admin:
        tickets.mint(db, 2, maya["user_id"])
    assert not_admin.value.status_code == 403
    with pytest.raises(HTTPException) as persona_as_operator:
        tickets.mint(db, maya["user_id"], maya["user_id"])
    assert persona_as_operator.value.status_code == 403


@pytest.mark.parametrize("path", ["//evil.example", "https://evil.example/", "plans", "/\\evil"])
def test_login_links_only_land_on_this_site(db, path):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException):
        tickets.mint(db, 1, maya["user_id"], path)


def test_a_login_link_works_once_and_expires(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    token = tickets.mint(db, 1, maya["user_id"], "/plans")["path"].split("t=", 1)[1]
    assert db.exec(select(TestLoginTicket)).one().token_hash != token  # only a hash is stored
    first = tickets.redeem(db, token)
    assert first["target_path"] == "/plans"
    with pytest.raises(HTTPException):
        tickets.redeem(db, token)
    late = tickets.mint(db, 1, maya["user_id"])["path"].split("t=", 1)[1]
    for ticket in db.exec(select(TestLoginTicket).where(TestLoginTicket.used_at.is_(None))).all():
        ticket.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.add(ticket)
    db.commit()
    with pytest.raises(HTTPException):
        tickets.redeem(db, late)


def test_sessions_are_rechecked_and_end_when_the_cohort_closes(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    payload = _session_payload(db, maya)
    assert payload["test_operator"] == 1 and payload["test_cohort"] == cohort["cohort_uuid"]
    sessions.enter(db, payload)
    assert sessions.current_test_persona.get() == maya["user_id"]
    # A plain login for a test address is never accepted.
    with pytest.raises(HTTPException):
        sessions.validate(db, {"sub": maya["email"]})
    with pytest.raises(HTTPException):
        sessions.validate(db, {**payload, "test_cohort": "cohort_other"})
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as closed:
        sessions.validate(db, payload)
    assert closed.value.status_code == 401


def test_sessions_end_when_the_admin_loses_platform_access(db):
    cohort = _cohort(db)
    payload = _session_payload(db, _persona(db, cohort["cohort_uuid"]))
    membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == 1)).one()
    membership.role_id = USER_ROLE_ID
    db.add(membership)
    db.commit()
    with pytest.raises(HTTPException) as demoted:
        sessions.validate(db, payload)
    assert demoted.value.status_code == 403


def test_the_flag_turns_everything_off(db, monkeypatch):
    cohort = _cohort(db)
    payload = _session_payload(db, _persona(db, cohort["cohort_uuid"]))
    monkeypatch.setenv("LAUNCHLMS_USER_TESTS_ENABLED", "false")
    with pytest.raises(HTTPException):
        sessions.validate(db, payload)


def test_refresh_keeps_the_test_claims(db):
    cohort = _cohort(db)
    payload = _session_payload(db, _persona(db, cohort["cohort_uuid"]))
    from src.security.auth import decode_jwt

    renewed = decode_jwt(sessions.refresh(db, payload))
    assert renewed["test_operator"] == 1 and renewed["test_cohort"] == cohort["cohort_uuid"]
    assert renewed["exp"] <= payload["exp"] + 1


def _no_delivery(monkeypatch):
    from src.services.email import utils

    sent = []
    monkeypatch.setattr(utils, "_send_email_resend", lambda *args, **kwargs: sent.append(args) or {"id": "sent"})
    monkeypatch.setattr(utils, "_send_email_smtp", lambda *args, **kwargs: sent.append(args) or {"id": "sent"})
    return utils, sent


def test_mail_to_a_test_address_is_captured_and_never_delivered(db, monkeypatch):
    utils, sent = _no_delivery(monkeypatch)
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    body = '<p>Join us</p><a href="https://life2launch.app/orgs/launch/invite?code=abc&amp;x=1">Accept</a>'
    result = utils.send_email(maya["email"], "You're invited", body)
    assert result["captured"] and not result["delivered"] and sent == []
    stored = db.exec(select(TestMail)).one()
    assert stored.to_user_id == maya["user_id"] and stored.cohort_id is not None
    assert stored.links[0]["url"] == "https://life2launch.app/orgs/launch/invite?code=abc&x=1"
    # Unknown test addresses are still never delivered.
    assert utils.send_email("nobody.anywhere@test.life2launch.app", "Hi", "x")["captured"]
    assert sent == []


def test_mail_a_persona_sends_to_an_outside_address_is_captured(db, monkeypatch):
    utils, sent = _no_delivery(monkeypatch)
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    token = sessions.current_test_persona.set(maya["user_id"])
    try:
        result = utils.send_email("coworker@gmail.com", "Join me", "<p>hello</p>")
    finally:
        sessions.current_test_persona.reset(token)
    assert result["captured"] and sent == []
    assert db.exec(select(TestMail)).one().reason == "persona_sender"


def test_real_mail_is_still_delivered(db, monkeypatch):
    utils, sent = _no_delivery(monkeypatch)
    monkeypatch.setenv("LAUNCHLMS_EMAIL_PROVIDER", "smtp")
    utils.send_email("real.learner@example.com", "Hello", "<p>hi</p>")
    assert len(sent) == 1
    assert db.exec(select(TestMail)).all() == []


def test_mail_is_not_delivered_even_if_saving_it_fails(db, monkeypatch):
    utils, sent = _no_delivery(monkeypatch)
    monkeypatch.setattr(mail, "_store", lambda *args: (_ for _ in ()).throw(RuntimeError("db down")))
    assert utils.send_email("maya.x@test.life2launch.app", "Hi", "x")["captured"]
    assert sent == []


def test_cohort_limits(db):
    for index in range(cohorts.MAX_OPEN_COHORTS):
        _cohort(db, f"Run {index}")
    with pytest.raises(HTTPException):
        _cohort(db, "One too many")
    closed = cohorts.list_cohorts(db)[0]
    cohorts.close_cohort(db, closed["cohort_uuid"])
    with pytest.raises(HTTPException):
        _persona(db, closed["cohort_uuid"])


def _request(token: str):
    from starlette.requests import Request

    return Request({"type": "http", "method": "GET", "path": "/", "headers": [(b"authorization", f"Bearer {token}".encode())], "query_string": b""})


def test_authentication_refuses_a_plain_login_for_a_persona(db):
    from src.security.auth import create_access_token, get_current_user

    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as plain:
        asyncio.run(get_current_user(_request(create_access_token({"sub": maya["email"]})), db))
    assert plain.value.status_code == 401
    payload = _session_payload(db, maya)
    from src.services.user_tests.sessions import claims

    good = create_access_token(claims(db.get(User, maya["user_id"]), 1, db.get(TestCohort, 1)))
    assert payload["test_cohort"] == db.get(TestCohort, 1).cohort_uuid
    user = asyncio.run(get_current_user(_request(good), db))
    assert user.id == maya["user_id"]
    # Real users are unaffected.
    real = asyncio.run(get_current_user(_request(create_access_token({"sub": "real.learner@example.com"})), db))
    assert real.id == 2


def test_the_refresh_endpoint_keeps_persona_sessions_and_refuses_closed_ones(db):
    from starlette.requests import Request
    from starlette.responses import Response
    from src.security.auth import decode_jwt
    from src.services.demo.refresh import refresh_demo

    cohort = _cohort(db)
    payload = _session_payload(db, _persona(db, cohort["cohort_uuid"]))
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [(b"cookie", b"refresh_token_cookie=r")], "query_string": b""})
    stored = []
    result = refresh_demo(request, Response(), payload, lambda *args: stored.append(args), lambda: 0)
    assert decode_jwt(result["access_token"])["test_cohort"] == cohort["cohort_uuid"]
    assert stored and stored[0][2] == "r"
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException):
        refresh_demo(request, Response(), payload, lambda *args: None, lambda: 0)


def test_a_persona_moves_to_another_org_host_as_the_same_persona(db):
    """Host-only cookies: picking her own test org hands Dana's persona session to that host."""
    from types import SimpleNamespace
    from unittest.mock import patch

    from fastapi import Response
    from src.routers.auth_handoff import HandoffRequest, RedemptionRequest, issue_handoff, redeem_handoff
    from src.security.auth import JWT_REFRESH_COOKIE_NAME, decode_jwt
    from src.services.auth import handoff
    from src.tests.security.test_handoff import OneUseRedis

    cohort = _cohort(db)
    persona = _persona(db, cohort["cohort_uuid"], "Dana")
    link = tickets.mint(db, 1, persona["user_id"], "/")
    refresh = tickets.redeem(db, link["path"].split("t=", 1)[1])["tokens"]["refresh_token"]
    started = decode_jwt(refresh)
    config = SimpleNamespace(hosting_config=SimpleNamespace(frontend_domain="unstable.life2launch.app", cookie_config=SimpleNamespace(scope="host-only")))
    body = HandoffRequest(target_host="dana-s-test-org.unstable.life2launch.app", state="s" * 43, return_path="/admin")
    with patch.object(handoff, "_redis", return_value=OneUseRedis()), patch.object(handoff, "get_launchlms_config", return_value=config):
        issued = issue_handoff(SimpleNamespace(cookies={JWT_REFRESH_COOKIE_NAME: refresh}), body, Response(), db)
        redeemed = redeem_handoff(RedemptionRequest(**body.model_dump(), ticket=issued["ticket"]), Response(), db)
        moved = decode_jwt(redeemed["refresh_token"])
        assert (moved["test_operator"], moved["test_cohort"]) == (1, cohort["cohort_uuid"])
        assert moved["exp"] <= started["exp"] + 1  # never outlives the session it came from
        assert redeemed["test_persona"]["user_id"] == persona["user_id"] and redeemed["test_persona"]["cohort"] == "Riverside onboarding"

        # A closed cohort can't hand a session on.
        issued = issue_handoff(SimpleNamespace(cookies={JWT_REFRESH_COOKIE_NAME: refresh}), body, Response(), db)
        cohorts.close_cohort(db, cohort["cohort_uuid"])
        with pytest.raises(HTTPException) as closed:
            redeem_handoff(RedemptionRequest(**body.model_dump(), ticket=issued["ticket"]), Response(), db)
        assert closed.value.status_code == 401
        with pytest.raises(HTTPException):
            issue_handoff(SimpleNamespace(cookies={JWT_REFRESH_COOKIE_NAME: refresh}), body, Response(), db)


def test_only_a_verified_persona_refresh_token_gets_its_own_refresh_limit(db):
    from src.security.auth import create_refresh_token
    from src.services.user_tests.sessions import refresh_test_persona

    cohort = _cohort(db)
    persona = _persona(db, cohort["cohort_uuid"])
    link = tickets.mint(db, 1, persona["user_id"], "/")
    refresh = tickets.redeem(db, link["path"].split("t=", 1)[1])["tokens"]["refresh_token"]
    assert refresh_test_persona(refresh) == persona["email"]
    assert refresh_test_persona(create_refresh_token({"sub": "admin@example.com"})) is None
    assert refresh_test_persona("forged.token.value") is None
    assert refresh_test_persona(None) is None


def test_a_dropped_persona_can_tell_an_open_run_from_a_closed_one(db, monkeypatch):
    """No sign-in needed: a persona whose session dropped asks before being told the run ended (UT-3)."""
    from starlette.requests import Request
    from starlette.responses import Response
    from src.routers.user_tests import persona_run_state

    monkeypatch.setattr("src.routers.user_tests.check_rate_limit", lambda *args: (True, 0, 0))
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    assert persona_run_state(maya["user_id"], request, Response(), db) == {"open": True}
    assert persona_run_state(2, request, Response(), db) == {"open": False}  # a real account says nothing more
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    assert persona_run_state(maya["user_id"], request, Response(), db) == {"open": False}


def test_a_test_counts_as_active_only_while_an_open_runs_persona_is_busy(db):
    """Unstable's deploy waits while this is true, so a run isn't cut off by a redeploy."""
    cohort = _cohort(db)
    maya = _persona(db, cohort["cohort_uuid"])
    assert cohorts.tests_active(db)["active"] is False  # made, never used
    persona = db.get(TestPersona, maya["user_id"])
    persona.last_active_at = datetime.utcnow() - timedelta(minutes=5)
    db.add(persona)
    db.commit()
    assert cohorts.tests_active(db)["active"] is True
    persona.last_active_at = datetime.utcnow() - timedelta(minutes=cohorts.ACTIVE_MINUTES + 1)
    db.add(persona)
    db.commit()
    assert cohorts.tests_active(db)["active"] is False  # left open but idle
    persona.last_active_at = datetime.utcnow()
    db.add(persona)
    db.commit()
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    assert cohorts.tests_active(db)["active"] is False  # closed
