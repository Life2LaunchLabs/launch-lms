"""Dashboards on the Riverside fixture: starters, sharing, saving at a revision, and the library."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.insights import InsightDashboard
from src.services.insights import context, dashboards, engine, library
from src.services.insights.spec import CardSpec, check
from src.tests.test_insights import ADMIN, ANA, REPORTS, TODAY, _user
from src.tests.test_insights import db as riverside  # noqa: F401


@pytest.fixture
def db(riverside: Session) -> Session:  # noqa: F811
    InsightDashboard.__table__.create(riverside.get_bind())
    return riverside


def _codes(fn, *args, **kwargs) -> int:
    with pytest.raises(HTTPException) as caught:
        fn(*args, **kwargs)
    return caught.value.status_code


@pytest.mark.parametrize("item", library.TEMPLATES, ids=lambda item: item["key"])
def test_every_template_card_fits_its_scope(item):
    keys = [card["key"] for card in item["cards"]]
    assert len(keys) == len(set(keys))
    for card in item["cards"]:
        assert card["span"] in dashboards.SPANS
        assert check(CardSpec.model_validate(card["spec"]), item["scope"], see_reports=True) == [], card["key"]


@pytest.mark.parametrize("scope", context.SCOPES)
def test_every_question_fits_some_scope_and_the_library_filters_by_scope(scope):
    offered = library.library(scope, see_reports=True)
    assert offered["templates"] and offered["questions"]
    for item in offered["questions"]:
        assert check(CardSpec.model_validate(item["spec"]), scope, see_reports=True) == []
    assert all(any(not check(CardSpec.model_validate(item["spec"]), kind, see_reports=True) for kind in context.SCOPES) for item in library.QUESTIONS)


def test_starters_are_made_once_shared_with_staff_and_run(db):
    listed = dashboards.list_dashboards(db, _user(ANA), 1)
    assert [item["source_template"] for item in listed] == [f"starter:{key}" for key in library.STARTERS]
    assert all(item["visibility"] == "staff" and not item["mine"] and not item["editable"] for item in listed)
    assert len(dashboards.list_dashboards(db, _user(ADMIN), 1)) == len(library.STARTERS)

    for item, key in zip(listed, (None, "tpl_cl", "grp_fall", "user_13")):
        board = dashboards.get_dashboard(db, _user(ADMIN), 1, item["dashboard_uuid"])
        results = engine.run_cards(engine.context(db, _user(ADMIN), 1, board["scope"], key, today=TODAY), board["document"]["cards"], board["document"]["range"])
        assert all("error" not in result for result in results.values()), item["source_template"]


def test_deleting_every_starter_does_not_bring_them_back(db):
    for item in dashboards.list_dashboards(db, _user(ADMIN), 1):
        dashboards.delete_dashboard(db, _user(ADMIN), 1, item["dashboard_uuid"])
    assert dashboards.list_dashboards(db, _user(ADMIN), 1) == []
    assert len(db.exec(select(InsightDashboard)).all()) == len(library.STARTERS)


def test_personal_dashboards_are_only_the_owners(db):
    made = dashboards.create_dashboard(db, _user(ANA), 1, scope="group", template="group.weekly")
    assert made["title"] == "Weekly check-in" and made["mine"] and [card["key"] for card in made["document"]["cards"]] == ["status", "active_days", "waiting", "turnaround"]
    assert made["dashboard_uuid"] in {item["dashboard_uuid"] for item in dashboards.list_dashboards(db, _user(ANA), 1, "group")}
    assert made["dashboard_uuid"] not in {item["dashboard_uuid"] for item in dashboards.list_dashboards(db, _user(ADMIN), 1)}
    assert _codes(dashboards.get_dashboard, db, _user(REPORTS), 1, made["dashboard_uuid"]) == 404


def test_sharing_needs_see_reports_and_admins_only_needs_an_admin(db):
    assert _codes(dashboards.create_dashboard, db, _user(ANA), 1, scope="org", visibility="staff") == 403
    assert _codes(dashboards.create_dashboard, db, _user(REPORTS), 1, scope="org", visibility="admins") == 403
    shared = dashboards.create_dashboard(db, _user(REPORTS), 1, scope="org", title="Board", visibility="staff")
    assert shared["dashboard_uuid"] in {item["dashboard_uuid"] for item in dashboards.list_dashboards(db, _user(ANA), 1)}
    admins = dashboards.create_dashboard(db, _user(ADMIN), 1, scope="org", visibility="admins")
    assert _codes(dashboards.get_dashboard, db, _user(REPORTS), 1, admins["dashboard_uuid"]) == 404
    assert _codes(dashboards.save_dashboard, db, _user(ANA), 1, made_uuid(db, ANA), revision=1, visibility="staff") == 403


def made_uuid(db: Session, user_id: int) -> str:
    return dashboards.create_dashboard(db, _user(user_id), 1, scope="org")["dashboard_uuid"]


def test_saving_bumps_the_revision_and_a_stale_save_gets_the_current_one(db):
    uuid = made_uuid(db, ADMIN)
    document = {"cards": [{"key": "starts", "span": 4, "spec": {"measure": "plan_starts"}}], "range": "28d"}
    saved = dashboards.save_dashboard(db, _user(ADMIN), 1, uuid, revision=1, document=document, title="Starts")
    assert saved["revision"] == 2 and saved["title"] == "Starts" and saved["document"]["range"] == "28d"
    assert saved["document"]["cards"][0]["spec"] == {"measure": "plan_starts", "v": 1}
    with pytest.raises(HTTPException) as caught:
        dashboards.save_dashboard(db, _user(ADMIN), 1, uuid, revision=1, title="Lost")
    assert caught.value.status_code == 409 and caught.value.detail["current"]["title"] == "Starts"


def test_someone_who_cant_edit_saves_their_own_copy(db):
    starter = dashboards.list_dashboards(db, _user(ANA), 1)[0]
    copy = dashboards.save_dashboard(db, _user(ANA), 1, starter["dashboard_uuid"], revision=7,
                                     document={"cards": [{"key": "active", "span": 12, "spec": {"measure": "active_learners"}}]})
    assert copy["copied"] and copy["mine"] and copy["visibility"] == "me" and copy["title"] == "Org overview (my copy)"
    assert dashboards.get_dashboard(db, _user(ADMIN), 1, starter["dashboard_uuid"])["revision"] == 1
    assert _codes(dashboards.delete_dashboard, db, _user(ANA), 1, starter["dashboard_uuid"]) == 403


def test_an_admin_edits_a_shared_dashboard_in_place(db):
    shared = dashboards.create_dashboard(db, _user(REPORTS), 1, scope="plan", template="plan.badge", visibility="staff")
    saved = dashboards.save_dashboard(db, _user(ADMIN), 1, shared["dashboard_uuid"], revision=1, description="For the board")
    assert not saved["copied"] and saved["revision"] == 2


def test_cards_that_dont_fit_the_scope_are_refused_with_their_errors(db):
    with pytest.raises(HTTPException) as caught:
        dashboards.create_dashboard(db, _user(ADMIN), 1, scope="plan", document={"cards": [
            {"key": "a", "span": 6, "spec": {"measure": "new_learners"}},
            {"key": "a", "span": 2, "spec": {"measure": "plan_starts", "by": "plan"}},
        ]})
    errors = caught.value.detail["errors"]
    assert {(item["card"], item["field"]) for item in errors} >= {("a", "key"), ("a", "span"), ("a", "measure"), ("a", "by")}
    assert _codes(dashboards.create_dashboard, db, _user(ADMIN), 1, scope="org", document={"cards": [{"key": "x", "spec": {"measure": "plan_starts", "colour": "red"}}]}) == 422
    assert _codes(dashboards.create_dashboard, db, _user(ADMIN), 1, scope="org", template="plan.badge") == 404


def test_duplicate_is_a_personal_copy(db):
    starter = dashboards.list_dashboards(db, _user(REPORTS), 1)[1]
    copy = dashboards.duplicate_dashboard(db, _user(REPORTS), 1, starter["dashboard_uuid"])
    assert copy["mine"] and copy["visibility"] == "me" and copy["scope"] == "plan" and copy["title"] == "Plan performance (copy)"


def test_objects_are_the_plans_and_groups_the_viewer_can_open(db):
    admin, ana = context.population(db, _user(ADMIN), 1), context.population(db, _user(ANA), 1)
    assert [(row["key"], row["learners"]) for row in context.objects(db, admin, "plan")] == [("tpl_cl", 7), ("tpl_rr", 7)]
    assert [(row["key"], row["learners"]) for row in context.objects(db, ana, "plan")] == [("tpl_cl", 6), ("tpl_rr", 2)]
    assert [row["key"] for row in context.objects(db, admin, "group")] == ["grp_fall", "grp_evening"]
    assert [row["key"] for row in context.objects(db, ana, "group")] == ["grp_fall"]
