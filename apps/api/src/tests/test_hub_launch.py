import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine

from src.db.coach import CoachPolicy
from src.db.users import PublicUser, User
from src.services.hub_launch import (
    DEFAULT_LAUNCH_CARDS, DEFAULT_STAFF_LAUNCH_CARDS, HubLaunchCard, effective_launch_cards, launch_card_audience, launch_cards_settings, save_launch_cards,
)


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, CoachPolicy.__table__])
    return Session(engine)


def _admin() -> PublicUser:
    return PublicUser(id=1, user_uuid="user_1", username="admin", email="a@example.com", first_name="A", last_name="B")


def _card(label="Hello", hint="", message="Hi there"):
    return HubLaunchCard(label=label, hint=hint, first_message=message)


def test_defaults_when_nothing_is_stored():
    db = _db()
    assert launch_cards_settings(db)["is_default"] is True
    assert len(effective_launch_cards(db)) == len(DEFAULT_LAUNCH_CARDS) >= 4


def test_save_creates_the_config_row_and_serves_the_cards():
    db = _db()
    result = save_launch_cards(db, _admin(), [_card(" First ", " hint ", " Open me "), _card("Second")])
    assert result["is_default"] is False
    assert effective_launch_cards(db) == [
        {"label": "First", "hint": "hint", "first_message": "Open me"},
        {"label": "Second", "hint": "", "first_message": "Hi there"},
    ]


def test_reset_restores_defaults():
    db = _db()
    save_launch_cards(db, _admin(), [_card()])
    result = save_launch_cards(db, _admin(), None)
    assert result["is_default"] is True and len(result["cards"]) == len(DEFAULT_LAUNCH_CARDS)


def test_demo_learners_see_the_platform_cards(monkeypatch):
    from src.core.events import database
    from src.services.demo.context import DemoContext, current_demo

    control = _db()
    save_launch_cards(control, _admin(), [_card("Platform card")])
    # The demo copy never holds platform settings, so its own table is empty.
    monkeypatch.setattr(database, "engine", control.get_bind())
    token = current_demo.set(DemoContext("demo", "demo_" + "a" * 32, "visitor"))
    try:
        assert [card["label"] for card in effective_launch_cards(_db())] == ["Platform card"]
    finally:
        current_demo.reset(token)


@pytest.mark.parametrize("cards", [[], [_card()] * 7])
def test_invalid_card_sets_are_rejected(cards):
    with pytest.raises(HTTPException) as error:
        save_launch_cards(_db(), _admin(), cards)
    assert error.value.status_code == 422


def test_length_limits_are_enforced_by_the_model():
    with pytest.raises(ValueError):
        HubLaunchCard(label="x" * 81, first_message="ok")
    with pytest.raises(ValueError):
        HubLaunchCard(label="ok", first_message="x" * 301)


@pytest.mark.parametrize("field", ["label", "first_message"])
def test_blank_text_is_rejected_after_trimming(field):
    values = {"label": "ok", "first_message": "ok", field: "   "}
    with pytest.raises(ValueError):
        HubLaunchCard(**values)


def test_admin_routes_are_superadmin_only_and_served_under_superadmin():
    from src.router import v1_router
    from src.routers.coach_admin import router as admin_router
    from src.security.superadmin import require_superadmin

    assert any(dep.dependency is require_superadmin for dep in admin_router.dependencies)
    paths = {route.path for route in v1_router.routes}
    assert "/api/v1/superadmin/coach/launch-cards" in paths and "/api/v1/hub/launch-cards" in paths


def test_staff_get_their_own_default_starters():
    db = _db()
    learner = [card["label"] for card in effective_launch_cards(db, "learner")]
    staff = [card["label"] for card in effective_launch_cards(db, "staff")]
    assert staff == [card.label for card in DEFAULT_STAFF_LAUNCH_CARDS]
    assert not set(staff) & set(learner)
    assert launch_cards_settings(db, "staff") == {"audience": "staff", "cards": effective_launch_cards(db, "staff"), "is_default": True}


def test_each_audience_is_saved_and_reset_on_its_own():
    db = _db()
    save_launch_cards(db, _admin(), [_card("Learner card")], "learner")
    result = save_launch_cards(db, _admin(), [_card("Staff card")], "staff")
    assert result["is_default"] is False and [c["label"] for c in result["cards"]] == ["Staff card"]
    assert [c["label"] for c in effective_launch_cards(db, "learner")] == ["Learner card"]

    save_launch_cards(db, _admin(), None, "staff")
    assert [c["label"] for c in effective_launch_cards(db, "learner")] == ["Learner card"]
    assert launch_cards_settings(db, "staff")["is_default"] is True


def test_cards_stored_as_a_bare_list_stay_the_learner_set():
    db = _db()
    db.add(CoachPolicy(id=1, launch_cards=[{"label": "Old", "hint": "", "first_message": "Hi"}]))
    db.commit()
    assert [c["label"] for c in effective_launch_cards(db, "learner")] == ["Old"]
    assert launch_cards_settings(db, "staff")["is_default"] is True
    save_launch_cards(db, _admin(), [_card("Staff card")], "staff")
    assert [c["label"] for c in effective_launch_cards(db, "learner")] == ["Old"]


def test_audience_follows_the_role_in_that_organization():
    from src.db.roles import Role
    from src.db.user_organizations import UserOrganization
    from src.security.rbac.constants import ADMIN_ROLE_ID

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[Role.__table__, UserOrganization.__table__])
    db = Session(engine)
    db.add(UserOrganization(user_id=1, org_id=10, role_id=ADMIN_ROLE_ID, creation_date="", update_date=""))
    db.add(UserOrganization(user_id=2, org_id=10, role_id=4, creation_date="", update_date=""))
    db.add(UserOrganization(user_id=1, org_id=20, role_id=4, creation_date="", update_date=""))
    db.commit()
    assert launch_card_audience(db, 1, 10) == "staff"
    assert launch_card_audience(db, 2, 10) == "learner"
    assert launch_card_audience(db, 1, 20) == "learner"
    assert launch_card_audience(db, 1, None) == "learner"
