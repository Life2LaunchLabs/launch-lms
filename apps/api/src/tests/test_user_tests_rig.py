"""User tests: a persona that starts at sign-up, switching personas from the banner, and the step log."""

import asyncio

import pytest
from fastapi import HTTPException
from src.db.user_tests import TestLoginTicket, TestPersona
from src.db.users import User
from src.services.user_tests import cohorts, personas, sessions, stories, tickets
from src.tests.test_user_tests_stories import _run, db  # noqa: F401  (fixture)


def _target(session, link: dict) -> str:
    token = link["path"].split("t=", 1)[1]
    return session.get(TestLoginTicket, tickets._hash(token)).target_path


def test_a_new_sign_up_persona_lands_where_a_front_page_sign_up_does(db):  # noqa: F811
    cohort = cohorts.create_cohort(db, 1, cohorts.CreateCohort(name="New learners"))
    (jo, sam) = asyncio.run(personas.create_personas(db, cohort["cohort_uuid"], personas.CreatePersonas(personas=[
        personas.CreatePersona(first_name="Jo", brief="Just found the site", start_state="new_signup"),
        personas.CreatePersona(first_name="Sam", brief="Has used it for a while")])))
    assert _target(db, tickets.mint(db, 1, jo["user_id"])) == "/welcome"  # sends them on to their first phase
    assert _target(db, tickets.mint(db, 1, sam["user_id"])) == "/"
    new_account, existing = db.get(User, jo["user_id"]), db.get(User, sam["user_id"])
    assert new_account.profile["onboarding"]["started_at"] == new_account.details["onboarding"]["started_at"]
    assert new_account.profile["timelineEnabled"] is True  # the profile a welcome signup starts with
    assert not existing.profile and not existing.details


def test_an_org_creator_persona_first_opens_org_set_up(db):  # noqa: F811
    cohort = cohorts.create_cohort(db, 1, cohorts.CreateCohort(name="Badge creators"))
    (robin,) = asyncio.run(personas.create_personas(db, cohort["cohort_uuid"], personas.CreatePersonas(
        personas=[personas.CreatePersona(first_name="Robin", brief="Wants to make a badge", start_state="org_creator")])))
    assert _target(db, tickets.mint(db, 1, robin["user_id"])) == "/start"
    assert db.get(User, robin["user_id"]).profile["onboarding"]["started_at"]
    assert _target(db, tickets.mint(db, 1, robin["user_id"], "/plans")) == "/plans"  # a chosen page wins
    from src.db.user_tests import TestCohortOrg
    db.add(TestCohortOrg(org_id=1, cohort_id=db.get(TestPersona, robin["user_id"]).cohort_id, created_by_user_id=robin["user_id"]))
    db.commit()
    assert _target(db, tickets.mint(db, 1, robin["user_id"])) == "/"  # once their org exists, they land at home
    row = cohorts.persona_row(db, db.get(TestPersona, robin["user_id"]), db.get(User, robin["user_id"]))
    assert [org["id"] for org in row["orgs"]] == [1]  # the cohort page names the org they made


def test_a_persona_switches_to_another_persona_of_its_run_only(db, monkeypatch):  # noqa: F811
    from src.routers import user_tests as router
    from src.routers.user_tests import SwitchRequest, switch_persona

    monkeypatch.setattr(router, "check_rate_limit", lambda *args: (True, 0, 0))

    cohort, dana, maya = _run(db)
    other = cohorts.create_cohort(db, 1, cohorts.CreateCohort(name="Someone else's run"))
    (sam,) = asyncio.run(personas.create_personas(db, other["cohort_uuid"], personas.CreatePersonas(personas=[personas.CreatePersona(first_name="Sam")])))
    me = (db.get(TestPersona, dana["user_id"]), db.get(User, dana["user_id"]))
    view = stories.persona_view(db, *me)
    assert view["others"] == [{"user_id": maya["user_id"], "name": "Maya"}]
    token = sessions.current_test_operator.set(1)
    try:
        link = switch_persona(SwitchRequest(user_id=maya["user_id"]), me, db)
        assert link["url"].startswith("http") and link["url"].endswith(link["path"])  # always on the main site
        assert db.get(TestLoginTicket, tickets._hash(link["path"].split("t=", 1)[1])).persona_user_id == maya["user_id"]
        for target in (sam["user_id"], dana["user_id"], 1):
            with pytest.raises(HTTPException) as refused:
                switch_persona(SwitchRequest(user_id=target), me, db)
            assert refused.value.status_code == 404
    finally:
        sessions.current_test_operator.reset(token)


def test_logged_steps_make_the_story_map_in_the_report(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    stories.log_step(db, db.get(TestPersona, dana["user_id"]), stories.Step(did="Made a badge", stage_key="invite-your-students", page="/plans"))
    stories.log_step(db, db.get(TestPersona, maya["user_id"]), stories.Step(did="Looked for the invite | twice", outcome="couldnt", wanted="A join button"))
    report = stories.report(db, cohort["cohort_uuid"])
    assert "Release: " in report and "No findings yet." in report
    assert "## Steps (2)" in report
    assert "| Dana | Invite your students | Made a badge | Worked |  | /plans |" in report
    assert "| Maya |  | Looked for the invite \\| twice | Couldn't | A join button |  |" in report


def test_a_test_orgs_discover_listing_reaches_only_its_own_run(db):  # noqa: F811
    from sqlmodel import select
    from src.db.organizations import Organization
    from src.db.template_marketplace import GoalTemplateListing
    from src.db.user_tests import TestCohortOrg
    from src.services.user_tests.seal import TEST_FORBIDDEN_TABLES
    from src.services.user_tests.visibility import listed_for_viewer

    cohort, dana, maya = _run(db)
    other = cohorts.create_cohort(db, 1, cohorts.CreateCohort(name="Another run"))
    (sam,) = asyncio.run(personas.create_personas(db, other["cohort_uuid"], personas.CreatePersonas(personas=[personas.CreatePersona(first_name="Sam")])))
    test_org = db.exec(select(TestCohortOrg.org_id).where(TestCohortOrg.created_by_user_id == dana["user_id"])).one()
    db.add(Organization(id=99, name="Real school", slug="real", email="x@example.com", org_uuid="org_real", creation_date="", update_date=""))
    db.add(GoalTemplateListing(template_id=1, org_id=99, listed=True))
    db.add(GoalTemplateListing(template_id=2, org_id=test_org, listed=True))
    db.commit()

    def seen(viewer):
        token = sessions.current_test_persona.set(viewer)
        try:
            return set(db.exec(select(GoalTemplateListing.template_id).where(listed_for_viewer(db, GoalTemplateListing.org_id))).all())
        finally:
            sessions.current_test_persona.reset(token)

    assert seen(None) == {1}  # real people never see a test org's listing
    assert seen(maya["user_id"]) == {1, 2}  # the run's own personas do
    assert seen(sam["user_id"]) == {1}  # another run's don't
    assert "goal_template_listing" not in TEST_FORBIDDEN_TABLES


def test_an_org_admin_persona_lands_on_its_orgs_admin_and_links_can_wait_for_a_relay(db):  # noqa: F811
    from datetime import datetime, timedelta
    from urllib.parse import parse_qs, urlsplit

    _, dana, maya = _run(db)

    def redeem(link: dict) -> dict:
        return tickets.redeem(db, parse_qs(urlsplit(link["path"]).query)["t"][0])

    landing = redeem(tickets.mint(db, 1, dana["user_id"]))
    assert landing["target_path"] == "/admin" and landing["target_org_slug"]  # Dana runs Riverside High
    assert redeem(tickets.mint(db, 1, dana["user_id"], "/plans"))["target_org_slug"] is None  # a chosen page wins
    invite = redeem(tickets.mint(db, 1, dana["user_id"], "/admin/threads?invite=staff"))
    assert invite["target_path"] == "/admin/threads?invite=staff" and invite["target_org_slug"] == landing["target_org_slug"]  # on her org's site
    assert redeem(tickets.mint(db, 1, maya["user_id"]))["target_org_slug"] is None  # a learner starts at home
    later = tickets.mint(db, 1, maya["user_id"], ttl=timedelta(hours=5))
    assert datetime.fromisoformat(later["expires_at"].rstrip("Z")) - datetime.utcnow() <= timedelta(minutes=30)
