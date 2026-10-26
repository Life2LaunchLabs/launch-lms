"""At a glance on Home: starter cards picked from what the viewer does, and the cards they pin, on the Riverside fixture."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.insights import InsightDashboard
from src.services.goals import admin_home_glance as glance
from src.services.goals.admin_home_glance import HomePin
from src.services.insights import dashboards
from src.tests.test_insights import ANA, REPORTS, _user
from src.tests.test_insights import db as riverside  # noqa: F401


@pytest.fixture
def db(riverside: Session) -> Session:  # noqa: F811
    InsightDashboard.__table__.create(riverside.get_bind())
    return riverside


def _starter(db: Session, template: str) -> dict:
    return next(item for item in dashboards.list_dashboards(db, _user(REPORTS), 1) if item["source_template"] == f"starter:{template}")


def test_starters_follow_permissions_and_the_first_assignment(db):
    shown = glance.glance(db, _user(REPORTS), 1, {"see_reports"}, [], None)
    assert shown["starter"] is True
    assert [card["key"].split(":", 1)[1] for card in shown["cards"]] == ["active:"]
    assert shown["cards"][0]["dashboard_uuid"] == _starter(db, "org.overview")["dashboard_uuid"] and "error" not in shown["cards"][0]["result"]

    # A coach on the Fall group's assignment sees how that group is going, and how its plan is started.
    focus = {"target": {"type": "group", "uuid": "grp_fall", "name": "Fall"}, "template_uuid": "tpl_cl"}
    cards = glance.glance(db, _user(ANA), 1, {"run_assignments", "review_work"}, [], focus)["cards"]
    assert [(card["scope"]["kind"], card["scope"]["name"]) for card in cards] == [("group", "Fall"), ("plan", "Career Launch")]


def test_pinned_cards_replace_the_starters_and_keep_their_scope(db):
    group = _starter(db, "group.progress")["dashboard_uuid"]
    pins = glance.clean_pins(db, _user(REPORTS), 1, [HomePin(dashboard_uuid=group, card_key="active", scope_key="grp_fall"),
                                                      HomePin(dashboard_uuid=group, card_key="active", scope_key="grp_fall")])
    assert pins == [{"dashboard_uuid": group, "card_key": "active", "scope_key": "grp_fall"}]
    shown = glance.glance(db, _user(REPORTS), 1, {"see_reports"}, pins, None)
    assert shown["starter"] is False and [(card["source"], card["scope"]["name"]) for card in shown["cards"]] == [("pin", "Fall")]

    # A scoped card needs its group; a card has to be on the dashboard.
    with pytest.raises(HTTPException) as unscoped:
        glance.clean_pins(db, _user(REPORTS), 1, [HomePin(dashboard_uuid=group, card_key="active")])
    assert unscoped.value.status_code == 422
    with pytest.raises(HTTPException) as missing:
        glance.clean_pins(db, _user(REPORTS), 1, [HomePin(dashboard_uuid=group, card_key="weather", scope_key="grp_fall")])
    assert missing.value.status_code == 404

    # A pin whose dashboard is gone drops off quietly.
    dashboards.delete_dashboard(db, _user(1), 1, group)
    assert glance.glance(db, _user(REPORTS), 1, {"see_reports"}, pins, None)["cards"] == []
