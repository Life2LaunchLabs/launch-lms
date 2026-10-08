import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine

from src.db.hub import HubAdvisorConfiguration
from src.db.users import PublicUser, User
from src.services.hub_launch import DEFAULT_LAUNCH_CARDS, HubLaunchCard, effective_launch_cards, launch_cards_settings, save_launch_cards


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, HubAdvisorConfiguration.__table__])
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
    from src.routers.superadmin_hub_launch import router as admin_router
    from src.security.superadmin import require_superadmin

    assert any(dep.dependency is require_superadmin for dep in admin_router.dependencies)
    paths = {route.path for route in v1_router.routes}
    assert "/api/v1/superadmin/settings/hub-launch-cards" in paths and "/api/v1/hub/launch-cards" in paths
