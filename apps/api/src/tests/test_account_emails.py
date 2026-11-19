"""One account, several emails (DEV-197, PF-2): add with a code, make main, remove, sign in with any."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.core.events.database import get_db_session
from src.db.users import PublicUser, User
from src.security.auth import get_authenticated_user
from src.services.users import account_emails


class FakeRedis:
    def __init__(self):
        self.values, self.ttls = {}, {}

    def setex(self, key, ttl, value):
        self.values[key], self.ttls[key] = value, ttl

    def get(self, key):
        return self.values.get(key)

    def delete(self, key):
        self.values.pop(key, None)

    def ttl(self, key):
        return self.ttls.get(key, -1)

    def incr(self, key):
        self.values[key] = int(self.values.get(key, 0)) + 1
        return self.values[key]

    def expire(self, key, seconds):
        self.ttls[key] = seconds


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    with Session(engine) as session:
        session.add(User(id=1, email="maya@ridge.example.com", username="maya", first_name="Maya", last_name="Lopez",
                         user_uuid="user_maya", email_verified=True))
        session.add(User(id=2, email="jo@example.com", username="jo", first_name="Jo", last_name="Kim", user_uuid="user_jo",
                         email_verified=True))
        session.commit()
        yield session


@pytest.fixture
def sent(monkeypatch):
    fake, mail = FakeRedis(), []
    monkeypatch.setattr(account_emails, "_redis", lambda: fake)
    monkeypatch.setattr("src.services.users.emails.send_add_email_code", lambda email, code, user: mail.append((email, code)))
    return mail


@pytest.fixture
def client(db, sent):
    from src.routers import account_emails as router

    app = FastAPI()
    app.include_router(router.router, prefix="/api/v1")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_authenticated_user] = lambda: PublicUser.model_validate(db.get(User, 1).model_dump())
    with TestClient(app) as test_client:
        yield test_client


def test_add_a_personal_email_with_a_code_sign_in_with_it_and_make_it_main(client, db, sent):
    assert client.post("/api/v1/users/me/emails", json={"email": "Maya.Lopez@Gmail.com"}).status_code == 200
    [(to, code)] = sent
    assert to == "Maya.Lopez@gmail.com"
    wrong = client.post("/api/v1/users/me/emails/confirm", json={"email": to, "code": "000000" if code != "000000" else "111111"})
    assert wrong.status_code == 400 and "doesn't match" in wrong.json()["detail"]
    added = client.post("/api/v1/users/me/emails/confirm", json={"email": to, "code": code}).json()
    assert [item["email"] for item in added["spares"]] == ["Maya.Lopez@gmail.com"]

    # Sign-in, password reset and lookups find the account by either email, whatever the case.
    assert account_emails.find_user(db, "maya.lopez@gmail.com").id == 1
    assert account_emails.find_user(db, "MAYA@ridge.example.com").id == 1
    assert account_emails.emails_of(db, 1) == {"maya@ridge.example.com", "maya.lopez@gmail.com"}

    # Making it main moves notifications there and keeps the school address as a spare; the session moves too.
    main = client.post("/api/v1/users/me/emails/main", json={"email": "maya.lopez@gmail.com"})
    assert main.status_code == 200 and main.json()["main"]["email"] == "Maya.Lopez@gmail.com"
    assert db.get(User, 1).email == "Maya.Lopez@gmail.com"
    assert [item["email"] for item in main.json()["spares"]] == ["maya@ridge.example.com"]
    assert main.json()["tokens"]["access_token"]

    # The old main can be removed now; the main one can't.
    assert client.post("/api/v1/users/me/emails/remove", json={"email": "Maya.Lopez@gmail.com"}).status_code == 409
    assert client.post("/api/v1/users/me/emails/remove", json={"email": "maya@ridge.example.com"}).json()["spares"] == []
    assert account_emails.find_user(db, "maya@ridge.example.com") is None


def test_an_email_on_someone_elses_account_cant_be_added(client, sent):
    taken = client.post("/api/v1/users/me/emails", json={"email": "JO@example.com"})
    assert taken.status_code == 409 and taken.json()["detail"] == account_emails.TAKEN and not sent
    mine = client.post("/api/v1/users/me/emails", json={"email": "maya@ridge.example.com"})
    assert mine.status_code == 409 and mine.json()["detail"] == account_emails.YOURS


def test_a_code_expires_after_too_many_wrong_tries(client, sent):
    client.post("/api/v1/users/me/emails", json={"email": "maya@home.example.com"})
    for _ in range(account_emails.CODE_ATTEMPTS):
        last = client.post("/api/v1/users/me/emails/confirm", json={"email": "maya@home.example.com", "code": "x"})
    assert "Too many" in last.json()["detail"]
    code = sent[0][1]
    assert client.post("/api/v1/users/me/emails/confirm", json={"email": "maya@home.example.com", "code": code}).status_code == 400


def test_canvas_vouched_email_is_added_without_a_code_but_never_taken_from_another_account(db):
    maya = db.get(User, 1)
    assert account_emails.add_verified(db, maya, "maya.l@students.ridge.example.com")
    assert not account_emails.add_verified(db, maya, "jo@example.com")
    db.commit()
    assert account_emails.find_user(db, "maya.l@students.ridge.example.com").id == 1


def test_an_approved_domain_link_takes_any_verified_email():
    from src.services.orgs import invites

    class Link:
        approved_email_domain, redemption_count, max_redemptions, status = "ridge.example.com", 0, 5, "active"

    class Exec:
        def first(self):
            return Link

    class FakeDb:
        def exec(self, _statement):
            return Exec()

        def add(self, _row):
            pass

    with pytest.raises(Exception):
        invites.redeem_join_link(FakeDb(), "link", "maya@example.com")
    assert invites.redeem_join_link(FakeDb(), "link", "maya@example.com", {"maya@example.com", "maya@ridge.example.com"}) is Link


def test_a_school_only_learner_is_asked_for_a_personal_email_until_they_dismiss_or_add_one(db, sent):
    from src.db.organizations import Organization
    from src.db.user_organizations import UserOrganization
    from src.db.canvas import CanvasUserLink
    from src.services.users import personal_email_prompt as prompt

    db.add(Organization(id=10, org_uuid="org_owner", name="Life2Launch", slug="l2l", email="o@example.com"))
    db.add(Organization(id=11, org_uuid="org_ridge", name="Ridge High", slug="ridge", email="r@example.com"))
    db.add(UserOrganization(user_id=1, org_id=11, role_id=4, creation_date="", update_date=""))
    db.commit()
    maya = db.get(User, 1)
    assert not prompt.should_prompt(db, maya)  # nothing says the school gave this email
    db.add(CanvasUserLink(connection_id=1, user_id=1, canvas_user_id="c-1", creation_date=""))
    db.commit()
    assert account_emails.listing(db, maya)["ask_for_personal"] is True

    prompt.dismiss(db, maya)
    assert not prompt.should_prompt(db, maya)
    row = db.exec(__import__("sqlmodel").select(UserOrganization).where(UserOrganization.user_id == 1)).one()
    row.status = "alumni"
    db.add(row)
    db.commit()
    assert prompt.should_prompt(db, maya)  # leaving school: ask again

    account_emails.start_add(db, maya, "maya@example.org")
    account_emails.confirm_add(db, maya, "maya@example.org", sent[-1][1])
    assert not prompt.should_prompt(db, maya)


def test_staff_are_not_asked(db):
    from src.db.organizations import Organization
    from src.db.user_organizations import UserOrganization
    from src.db.canvas import CanvasUserLink
    from src.services.users import personal_email_prompt as prompt

    db.add(Organization(id=10, org_uuid="org_owner", name="Life2Launch", slug="l2l", email="o@example.com"))
    db.add(Organization(id=11, org_uuid="org_ridge", name="Ridge High", slug="ridge", email="r@example.com"))
    db.add(UserOrganization(user_id=1, org_id=11, role_id=2, creation_date="", update_date=""))
    db.add(CanvasUserLink(connection_id=1, user_id=1, canvas_user_id="c-1", creation_date=""))
    db.commit()
    assert not prompt.should_prompt(db, db.get(User, 1))


def test_a_spare_typed_into_the_profile_form_becomes_main_without_a_duplicate(db, sent):
    import asyncio

    from src.db.users import UserUpdate
    from src.services.users import users as user_service

    maya = db.get(User, 1)
    account_emails.start_add(db, maya, "maya@example.org")
    account_emails.confirm_add(db, maya, "maya@example.org", sent[-1][1])

    async def allow(*_args, **_kwargs):
        return True

    user_service.rbac_check, real = allow, user_service.rbac_check
    try:
        asyncio.run(user_service.update_user(None, db, 1, PublicUser.model_validate(maya, from_attributes=True),
                                             UserUpdate(username="maya", email="maya@example.org")))
    finally:
        user_service.rbac_check = real
    listing = account_emails.listing(db, db.get(User, 1))
    assert listing["main"]["email"] == "maya@example.org"
    assert [spare["email"] for spare in listing["spares"]] == ["maya@ridge.example.com"]
