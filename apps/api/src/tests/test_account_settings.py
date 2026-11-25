"""Settings › Account (PF-3, DEV-213): the username, the account's one phone and the ways to sign in."""

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.db.users import User, UserReadPublic
from src.services.users import account_emails, account_settings


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.services.auth.google_oauth.enabled", lambda: True)
    with Session(engine) as session:
        session.add(User(id=1, email="maya@ridge.example.com", username="maya", first_name="Maya", last_name="Lopez", user_uuid="user_maya",
                         email_verified=True, password="hashed"))
        session.add(User(id=2, email="jo@example.com", username="jordan", first_name="Jo", last_name="Kim", user_uuid="user_jo", email_verified=True))
        session.commit()
        yield session


def test_one_phone_on_the_account_kept_out_of_what_others_see(db):
    maya = db.get(User, 1)
    assert account_settings.set_phone(db, maya, " (541)  555-0123 ") == {"phone": "(541) 555-0123"}
    assert account_settings.phone_of(maya) == "(541) 555-0123"
    assert account_emails.listing(db, maya)["phone"] == "(541) 555-0123"
    assert "phone" not in (UserReadPublic.model_validate(maya).details or {})
    for bad in ("12", "call me", "555-0123-abc"):
        with pytest.raises(HTTPException):
            account_settings.set_phone(db, maya, bad)
    assert account_settings.set_phone(db, maya, "") == {"phone": ""}
    assert "phone" not in (maya.details or {})


def test_the_resume_prints_the_main_email_and_the_account_phone(db):
    from src.services.portfolio_display import resume_contact

    maya = db.get(User, 1)
    account_settings.set_phone(db, maya, "541-555-0123")
    assert resume_contact(maya) == {"email": "maya@ridge.example.com", "phone": "541-555-0123"}


def test_change_username_checks_format_and_taken_with_no_limit(db):
    maya = db.get(User, 1)
    assert account_settings.change_username(db, maya, "maya.lopez")["username"] == "maya.lopez"
    assert account_settings.change_username(db, maya, "maya_l")["username"] == "maya_l"
    assert maya.username == "maya_l"
    with pytest.raises(HTTPException) as taken:
        account_settings.change_username(db, maya, "JORDAN")
    assert taken.value.status_code == 409
    for bad in ("ab", "-maya", "maya lopez", "maya@home", "x" * 31):
        with pytest.raises(HTTPException) as refused:
            account_settings.change_username(db, maya, bad)
        assert refused.value.status_code == 422


def test_sign_in_methods_and_google_connect_disconnect(db):
    maya = db.get(User, 1)
    methods = account_settings.sign_in_methods(db, maya)
    assert methods["email"] == {"verified": 1, "total": 1}
    assert methods["password"] == {"set": True}
    assert methods["google"]["connected"] is False

    methods = account_settings.connect_google(db, maya, "Maya.Lopez@gmail.com")
    assert methods["google"]["connected"] is True and methods["email"]["verified"] == 2
    # Google's email joined the account, so Google sign-in finds it.
    assert account_emails.find_user(db, "maya.lopez@gmail.com").id == 1
    account_settings.check_google_sign_in(maya)

    methods = account_settings.disconnect_google(db, maya)
    assert methods["google"]["connected"] is False
    with pytest.raises(HTTPException) as off:
        account_settings.check_google_sign_in(maya)
    assert off.value.status_code == 403
    # Signing in somewhere else doesn't turn it back on; connecting again does.
    account_settings.connect_google(db, maya, "maya.lopez@gmail.com")
    account_settings.check_google_sign_in(maya)


def test_google_cant_connect_someone_elses_email_or_leave_an_account_without_a_way_in(db):
    maya, jo = db.get(User, 1), db.get(User, 2)
    with pytest.raises(HTTPException) as taken:
        account_settings.connect_google(db, maya, "jo@example.com")
    assert taken.value.status_code == 409
    account_settings.connect_google(db, jo, "jo@example.com")
    with pytest.raises(HTTPException) as no_password:
        account_settings.disconnect_google(db, jo)
    assert no_password.value.status_code == 409


def test_a_profile_save_keeps_the_phone_and_google_state(db):
    import asyncio
    from unittest.mock import AsyncMock, patch

    from src.db.users import PublicUser, UserUpdate
    from src.services.users.users import update_user

    maya = db.get(User, 1)
    account_settings.set_phone(db, maya, "541-555-0123")
    account_settings.connect_google(db, maya, "maya.lopez@gmail.com")
    me = PublicUser.model_validate(maya.model_dump())
    with patch("src.services.users.users.rbac_check", AsyncMock()):
        asyncio.run(update_user(None, db, 1, me, UserUpdate(username="maya", email=maya.email, details={"phone": "x"})))
    db.refresh(maya)
    assert account_settings.phone_of(maya) == "541-555-0123" and account_settings.google_connected(maya)
