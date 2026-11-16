"""User tests: someone a run invites who has no account yet (DEV-103).

The console reserves an address on the run's pattern, mail to it is kept for the run, and signing up
with it from the browser the console opened makes the new account a sealed persona of the run.
"""

import asyncio
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException, Response
from sqlmodel import select
from starlette.requests import Request
from src.db.organization_invitations import OrganizationInvitation
from src.db.user_organizations import UserOrganization
from src.db.user_tests import TestCohortOrg, TestInvitee, TestLoginTicket, TestMail, TestPersona
from src.db.users import User
from src.security.rbac.constants import USER_ROLE_ID
from src.services.user_tests import cleanup, cohorts, invitees, mail, personas, sessions, tickets
from src.tests.test_user_tests_stories import _run, db  # noqa: F401  (fixture)

PASSWORD = "Long-enough-password-1!"


def _request(cookies: dict | None = None) -> Request:
    header = "; ".join(f"{name}={value}" for name, value in (cookies or {}).items())
    scope = {"type": "http", "method": "POST", "path": "/api/v1/auth/signup/welcome", "headers": [(b"cookie", header.encode()), (b"host", b"localhost")],
             "query_string": b"", "client": ("127.0.0.1", 1), "server": ("localhost", 80), "scheme": "http"}
    return Request(scope)


def _add_invitee(db, cohort: dict, first_name: str = "Nia") -> dict:  # noqa: F811
    body = personas.CreatePersonas(personas=[personas.CreatePersona(first_name=first_name, brief="Ninth grader, no account yet", start_state="invitee")])
    return asyncio.run(personas.create_personas(db, cohort["cohort_uuid"], body))[0]


def _entry_cookie(db, invitee: dict, target: str = "/") -> dict:  # noqa: F811
    link = tickets.mint_invitee(db, 1, invitee["invitee_id"], target)
    redeemed = tickets.redeem(db, link["path"].split("t=", 1)[1])
    assert redeemed["tokens"] is None and redeemed["persona"] is None  # signed out: no account yet
    assert redeemed["target_path"] == target
    return {invitees.INVITEE_COOKIE: redeemed["invitee_token"]}


def _signup(db, email: str, cookies: dict | None = None, **extra):  # noqa: F811
    from src.routers.auth import WelcomeSignupRequest, complete_welcome_signup

    body = WelcomeSignupRequest(email=email, password=PASSWORD, first_name="Nia", last_name="Lopez", birth_date=date(2010, 3, 1), **extra)
    return asyncio.run(complete_welcome_signup(_request(cookies), Response(), body, db))


def test_an_invitee_is_a_reserved_address_with_no_account(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    nia = _add_invitee(db, cohort)
    assert nia["email"] == f"nia.{cohort['slug']}@test.life2launch.app" and nia["user_id"] is None and not nia["signed_up"]
    assert db.exec(select(User).where(User.email == nia["email"])).first() is None
    detail = cohorts.serialize(db, cohorts.get_cohort(db, cohort["cohort_uuid"]), detail=True)
    assert [row["invitee_id"] for row in detail["invitees"]] == [nia["invitee_id"]]
    assert _add_invitee(db, cohort)["handle"] == "nia-2"  # handles stay unique in the run


def test_mail_to_an_invitee_is_kept_for_its_run(db, monkeypatch):  # noqa: F811
    from src.services.email import utils

    sent = []
    monkeypatch.setattr(utils, "_send_email_resend", lambda *args, **kwargs: sent.append(args) or {"id": "sent"})
    cohort, dana, maya = _run(db)
    nia = _add_invitee(db, cohort)
    assert utils.send_email(nia["email"], "You're invited", '<a href="https://life2launch.app/orgs/x/invite?invitation=abc">Accept</a>')["captured"]
    assert sent == []
    stored = db.exec(select(TestMail)).one()
    assert stored.cohort_id == cohorts.get_cohort(db, cohort["cohort_uuid"]).id and stored.to_user_id is None
    listed = mail.list_mail(db, stored.cohort_id, to_address=nia["email"])
    assert [item["links"][0]["url"] for item in listed] == ["https://life2launch.app/orgs/x/invite?invitation=abc"]


def test_test_addresses_sign_up_only_from_the_invitees_browser(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    nia = _add_invitee(db, cohort)
    other = _add_invitee(db, cohort, "Omar")
    for email, cookies in ((nia["email"], None), ("probe.anything@test.life2launch.app", None), (nia["email"], _entry_cookie(db, other)),
                           (nia["email"], {invitees.INVITEE_COOKIE: "forged"})):
        with pytest.raises(HTTPException) as refused:
            _signup(db, email, cookies)
        assert refused.value.status_code == 403
    assert db.exec(select(User).where(User.email.like("%test.life2launch.app"), User.id.not_in([dana["user_id"], maya["user_id"]]))).all() == []


def test_an_invitee_signs_up_from_an_invitation_and_becomes_a_sealed_persona(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    nia = _add_invitee(db, cohort)
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    invitation = OrganizationInvitation(invitation_uuid="inv_nia", org_id=test_org, email=nia["email"], email_normalized=nia["email"], role_id=USER_ROLE_ID,
                                        created_by_user_id=dana["user_id"], status="pending", expires_at=datetime.utcnow() + timedelta(days=7))
    from src.db.roles import Role

    db.add_all([invitation, Role(id=USER_ROLE_ID, name="Learner", role_uuid="role_learner", rights={})])
    db.commit()
    db.add(TestMail(cohort_id=None, to_address=nia["email"], subject="You're invited", reason="test_address"))
    db.commit()

    result = _signup(db, nia["email"], _entry_cookie(db, nia, "/invite?invitation=inv_nia"), invitation_token="inv_nia", org_id=test_org)

    user = db.exec(select(User).where(User.email == nia["email"])).one()
    persona = db.get(TestPersona, user.id)
    assert persona and persona.cohort_id == cohorts.get_cohort(db, cohort["cohort_uuid"]).id and persona.start_state == "invitee"
    assert db.get(TestInvitee, nia["invitee_id"]).user_id == user.id
    # Joined the inviting org like a real invitee, and lands in its first phase.
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == user.id, UserOrganization.org_id == test_org)).one().role_id == USER_ROLE_ID
    assert "/first-phase" in result["onboarding"]["redirect_url"]
    # A persona session, so later requests and /users/session work.
    from src.security.auth import decode_jwt

    payload = decode_jwt(result["tokens"]["access_token"])
    assert payload["test_operator"] == 1 and payload["test_cohort"] == cohort["cohort_uuid"]
    assert sessions.validate(db, payload)[0].id == user.id
    assert result["test_persona"]["user_id"] == user.id
    # The invitation sent before they signed up is in their inbox now.
    assert db.exec(select(TestMail).where(TestMail.to_address == nia["email"])).one().to_user_id == user.id
    # From now on the console opens them like any persona.
    link = tickets.mint_invitee(db, 1, nia["invitee_id"])
    assert db.get(TestLoginTicket, tickets._hash(link["path"].split("t=", 1)[1])).persona_user_id == user.id
    assert [row["user_id"] for row in cohorts.serialize(db, cohorts.get_cohort(db, cohort["cohort_uuid"]), detail=True)["personas"]].count(user.id) == 1
    # A second sign-up with the same cookie is refused.
    with pytest.raises(HTTPException):
        _signup(db, nia["email"], {invitees.INVITEE_COOKIE: invitees.entry_token(db.get(TestInvitee, nia["invitee_id"]), 1, cohorts.get_cohort(db, cohort["cohort_uuid"]))})

    # The adopted account closes and purges with its run.
    assert cleanup.audit(db, cohort["cohort_uuid"])["clean"]
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    cleanup.purge(db, cohort["cohort_uuid"], dry_run=False)
    assert db.get(User, user.id) is None and db.exec(select(TestInvitee)).all() == []


def test_an_invitee_link_needs_an_open_run(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    nia = _add_invitee(db, cohort)
    cookie = _entry_cookie(db, nia)
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException):
        tickets.mint_invitee(db, 1, nia["invitee_id"])
    with pytest.raises(HTTPException):
        _signup(db, nia["email"], cookie)
