"""No accounts for anyone under 13 (DEV-38): every self-service way to create an account checks the date of
birth in the API, refuses under 13 with nothing created, and keeps only that the person is over 13."""

from datetime import date, datetime

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.requests import Request
from starlette.responses import Response

from src.core.events.database import get_db_session
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.users import AnonymousUser, User
from src.security.auth import get_current_user
from src.services.auth import age_check

TODAY = date(2026, 11, 16)
THIRTEEN_TODAY = date(2013, 11, 16)
THIRTEEN_TOMORROW = date(2013, 11, 17)


def test_thirteen_is_counted_from_the_birthday():
    assert age_check.age_on(THIRTEEN_TODAY, TODAY) == 13
    assert age_check.age_on(THIRTEEN_TOMORROW, TODAY) == 12
    assert age_check.age_on(date(2008, 2, 29), date(2021, 2, 28)) == 12
    assert age_check.age_on(date(2008, 2, 29), date(2021, 3, 1)) == 13


def test_the_check_refuses_under_13_and_missing_or_impossible_dates():
    assert age_check.verify(THIRTEEN_TODAY, TODAY) == {"age_check": {"over_13": True, "checked_on": "2026-11-16"}}
    for birth_date, status, code in ((THIRTEEN_TOMORROW, 403, "under_13"), (None, 400, "birth_date_required"),
                                     (date(2027, 1, 1), 400, "birth_date_invalid"), (date(1850, 1, 1), 400, "birth_date_invalid")):
        with pytest.raises(HTTPException) as refused:
            age_check.verify(birth_date, TODAY)
        assert refused.value.status_code == status and refused.value.detail["code"] == code
    assert "13 and older" in age_check.UNDER_13_MESSAGE


def test_a_client_cannot_write_its_own_age_check():
    details = age_check.checked_details({"age_check": {"over_13": True, "checked_on": "1999-01-01"}, "other": 1}, date(2000, 1, 1))
    assert details["other"] == 1 and details["age_check"]["checked_on"] == date.today().isoformat()


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    with Session(engine) as session:
        stamp = datetime.utcnow().isoformat()
        session.add(Organization(id=1, org_uuid="org_owner", name="Life2Launch", slug="life2launch", email="hello@example.com"))
        session.add(OrganizationConfig(org_id=1, config={"config_version": "3.0", "tier": "enterprise"}, creation_date=stamp, update_date=stamp))
        for role_id, name in ((1, "Admin"), (2, "Staff"), (4, "Learner")):
            session.add(Role(id=role_id, name=name, role_uuid=f"role_{role_id}", rights={}))
        session.commit()
        yield session


@pytest.fixture
def client(db):
    from src.routers import users as users_router

    app = FastAPI()
    app.include_router(users_router.router, prefix="/users")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: AnonymousUser()
    with TestClient(app) as test_client:
        yield test_client


def _body(email: str, birth_date: str | None) -> dict:
    body = {"username": email.split("@")[0], "email": email, "password": "Str0ng!Passw0rd", "first_name": "Sam", "last_name": "Rivera"}
    return body if birth_date is None else {**body, "birth_date": birth_date}


@pytest.mark.parametrize("path", ["/users/1", "/users/"])
def test_the_api_refuses_an_under_13_account_made_without_the_form(client, db, path):
    too_young = date.today().replace(year=date.today().year - 12).isoformat()
    refused = client.post(path, json=_body("young@example.com", too_young))
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "under_13"
    missing = client.post(path, json=_body("young@example.com", None))
    assert missing.status_code == 400 and missing.json()["detail"]["code"] == "birth_date_required"
    assert db.exec(select(User).where(User.email == "young@example.com")).first() is None


def test_someone_13_or_older_signs_up_and_the_date_is_kept_but_never_sent_back(client, db):
    created = client.post("/users/1", json=_body("teen@example.com", "2010-01-15"))
    assert created.status_code == 200, created.text
    user = db.exec(select(User).where(User.email == "teen@example.com")).one()
    assert user.details["age_check"] == {"over_13": True, "checked_on": date.today().isoformat()}
    assert user.birth_date == date(2010, 1, 15)  # kept on the account (DEV-139)
    assert "2010-01-15" not in created.text and "birth_date" not in user.model_dump()


def test_the_kept_date_is_in_download_my_data(db):
    from src.services.users import data_export

    db.add(User(id=60, user_uuid="user_60", username="kept", email="kept@example.com", first_name="K", last_name="Ept", birth_date=date(2009, 4, 2)))
    db.commit()
    assert data_export.collect(db, 60)["account/profile"][0]["birth_date"] == "2009-04-02"


def _request() -> Request:
    return Request({"type": "http", "scheme": "https", "server": ("life2launch.example.com", 443), "path": "/", "headers": []})


@pytest.mark.asyncio
async def test_the_welcome_sign_up_refuses_under_13_and_keeps_the_check_otherwise(db):
    from src.routers import auth as auth_router

    young = auth_router.WelcomeSignupRequest(email="kid@example.com", password="Str0ng!Passw0rd", first_name="K", last_name="Id", birth_date=date.today().replace(year=date.today().year - 10))
    with pytest.raises(HTTPException) as refused:
        await auth_router.complete_welcome_signup(_request(), Response(), young, db)
    assert refused.value.status_code == 403
    assert db.exec(select(User).where(User.email == "kid@example.com")).first() is None

    teen = auth_router.WelcomeSignupRequest(email="new@example.com", password="Str0ng!Passw0rd", first_name="N", last_name="Ew", birth_date=date(2009, 6, 1))
    await auth_router.complete_welcome_signup(_request(), Response(), teen, db)
    user = db.exec(select(User).where(User.email == "new@example.com")).one()
    assert user.details["age_check"]["over_13"] is True and user.details["onboarding"]["started_at"]
    assert user.birth_date == date(2009, 6, 1)


@pytest.mark.asyncio
async def test_google_refuses_a_new_under_13_account_but_signs_in_an_existing_one(db, monkeypatch):
    from src.services.auth import utils as auth_utils

    async def google(_token):
        return {"email": google.email, "given_name": "G", "family_name": "Oogle"}

    monkeypatch.setattr(auth_utils, "get_google_user_info", google)
    google.email = "new.google@example.com"
    for birth_date in (None, date.today().replace(year=date.today().year - 12)):
        with pytest.raises(HTTPException) as refused:
            await auth_utils.signWithGoogle(_request(), "token", google.email, 1, AnonymousUser(), db, birth_date=birth_date)
        assert refused.value.status_code in (400, 403)
    assert db.exec(select(User).where(User.email == google.email)).first() is None

    created = await auth_utils.signWithGoogle(_request(), "token", google.email, 1, AnonymousUser(), db, birth_date=date(2005, 3, 3))
    assert created.details["age_check"]["over_13"] is True
    assert db.exec(select(User).where(User.email == google.email)).one().birth_date == date(2005, 3, 3)

    db.add(User(id=50, user_uuid="user_50", username="old", email="old@example.com", first_name="O", last_name="Ld"))
    db.commit()
    google.email = "old@example.com"
    signed_in = await auth_utils.signWithGoogle(_request(), "token", google.email, 1, AnonymousUser(), db)
    assert signed_in.email == "old@example.com"
