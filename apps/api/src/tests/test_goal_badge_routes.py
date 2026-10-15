"""Badge routes on goal templates, the step activity view and the goal's source badge."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.badge_routes import BadgeRoute, BadgeRouteOffersUpdate
from src.db.goals import Goal
from src.db.learning import LearningActivity, LearningPage, LearningPageType, LearningRun
from src.services.goals import badge_routes, goals
from src.services.goals.activity_view import step_activity
from src.services.goals.home import route
from src.tests.test_goal_badges import _world
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _issue, _published, _user


def test_routes_list_set_offer_and_start_on_goal_templates():
    db, _, uuids = _world()
    with db:
        listed = badge_routes.list_routes(db, None, "badge_adapt")
        assert [(item["template_uuid"], item["name"], item["recommended"], item["step_count"]) for item in listed["routes"]] == [
            (uuids[0], "College ready", True, 2), (uuids[1], "College ready", False, 1)]
        assert listed["routes"][0]["steps"][0] == {"title": "Notice change", "kind": "task", "chapter": "Apply"} and listed["goal"] is None

        # Reorder and recommend the second, by template_uuid or the web's legacy program_uuid.
        update = badge_routes.GoalBadgeRoutesUpdate(routes=[
            badge_routes.GoalBadgeRouteInput(program_uuid=uuids[1], recommended=True), badge_routes.GoalBadgeRouteInput(template_uuid=uuids[0])])
        result = badge_routes.set_routes(db, _user(ADMIN), "badge_adapt", update)
        assert [(item["template_uuid"], item["recommended"]) for item in result["routes"]] == [(uuids[1], True), (uuids[0], False)]
        assert {route.goal_template_id for route in db.exec(select(BadgeRoute)).all()} and db.exec(select(BadgeRoute)).all()[0].program_id is None
        with pytest.raises(HTTPException) as foreign:
            badge_routes.set_routes(db, _user(ADMIN), "badge_adapt", badge_routes.GoalBadgeRoutesUpdate(routes=[badge_routes.GoalBadgeRouteInput(template_uuid="nope")]))
        assert foreign.value.status_code == 422

        offered = badge_routes.set_offered_routes(db, _user(ADMIN), "badge_adapt", 2, BadgeRouteOffersUpdate(route_uuids=["route_0"]))
        assert offered["offers"] == {"2": ["route_0"]}

        started = badge_routes.start(db, _user(LEARNER), "badge_adapt", badge_routes.GoalBadgeStart(program_uuid=uuids[0], issuer_org_id=2))
        goal = db.exec(select(Goal)).one()
        assert started == {"goal_uuid": goal.goal_uuid, "title": "Adaptability", "status": "active", "done": 0, "total": 2}
        assert badge_routes.list_routes(db, _user(LEARNER), "badge_adapt")["goal"]["goal_uuid"] == goal.goal_uuid
        # The goal page names its badge even for viewers who don't list it.
        assert goals.get_goal(db, _user(LEARNER), goal.goal_uuid)["source_badge"]["badge_uuid"] == "badge_adapt"


def _activity_goal(db):
    template = _published(db, {"type": "activity", "title": "Spot the change"})
    working = db.exec(select(LearningActivity).where(LearningActivity.goal_template_id == template.id, LearningActivity.frozen_from_id.is_(None))).one()
    db.add(LearningPage(activity_id=working.id, org_id=1, page_uuid="start", page_type=LearningPageType.STANDARD, title="Start", order=1, creation_date=NOW, update_date=NOW))
    db.commit()
    goal = _issue(db, template, org_id=1)
    view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
    return goal, view["stages"][0]["steps"][0]["step_uuid"]


def test_step_activity_shows_the_activity_and_the_subjects_run():
    db, _, _ = _world()
    with db:
        goal, step_uuid = _activity_goal(db)
        shown = step_activity(db, _user(LEARNER), goal.goal_uuid, step_uuid)
        assert shown["goal"] == {"goal_uuid": goal.goal_uuid, "title": goal.title}
        assert shown["step"]["step_uuid"] == step_uuid and shown["step"]["title"] == "Spot the change"
        assert shown["activity"]["title"] and shown["run"] is None
        started = goals.start_activity(db, _user(LEARNER), goal.goal_uuid, step_uuid)
        assert step_activity(db, _user(LEARNER), goal.goal_uuid, step_uuid)["run"]["run_uuid"] == started["run"]["run_uuid"]
        assert db.exec(select(LearningRun)).one().goal_step_id is not None
        with pytest.raises(HTTPException) as hidden:
            step_activity(db, _user(OTHER), goal.goal_uuid, step_uuid)
        assert hidden.value.status_code in (403, 404)


def test_step_activity_refuses_steps_that_are_not_activities():
    db, _, _ = _world()
    with db:
        goal = _issue(db, _published(db, {"type": "task", "title": "Call"}), org_id=1)
        step_uuid = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)["stages"][0]["steps"][0]["step_uuid"]
        with pytest.raises(HTTPException) as wrong:
            step_activity(db, _user(LEARNER), goal.goal_uuid, step_uuid)
        assert wrong.value.status_code == 422


def test_home_routes_open_the_goal_page():
    assert route("goal_1") == "/plans/goal_1" and route("goal_1", "step_1") == "/plans/goal_1?step=step_1"


def test_start_badge_plans_outcome_starts_picked_badges_as_goals():
    from src.db.learning import LearningBadge, LearningBadgeStatus
    from src.db.portfolio import Portfolio, PortfolioSection
    from src.db.users import User
    from src.services.learning_portfolio_actions import apply_portfolio_outcomes

    db, badge, _ = _world()
    with db:
        for model in (Portfolio, PortfolioSection):
            model.__table__.create(db.get_bind(), checkfirst=True)
        db.add(LearningBadge(badge_uuid="badge_draft", org_id=1, name="Draft", status=LearningBadgeStatus.DRAFT, creation_date=NOW, update_date=NOW))
        badge.public = True
        db.add(badge)
        db.commit()
        outcomes = {"version": 1, "actions": [{"id": "start", "type": "start_badge_plans", "badge_uuids": {"$source": "binding", "key": "picked"}}]}
        learner = db.get(User, LEARNER)
        receipts, _ = apply_portfolio_outcomes(db, learner, 1, outcomes, {"answers": {}, "bindings": {"picked": ["badge_adapt", "badge_draft", "badge_missing"]}})
        db.commit()
        assert receipts["start"] == {"type": "start_badge_plans", "badge_uuids": ["badge_adapt"]}
        goal = db.exec(select(Goal).where(Goal.subject_user_id == LEARNER, Goal.badge_id == badge.id)).one()
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert [step["title"] for step in view["stages"][0]["steps"]] == ["Notice change", "Your story"]
        # Picking it again keeps the one goal.
        apply_portfolio_outcomes(db, learner, 2, outcomes, {"answers": {}, "bindings": {"picked": ["badge_adapt"]}})
        db.commit()
        assert len(db.exec(select(Goal).where(Goal.subject_user_id == LEARNER, Goal.badge_id == badge.id)).all()) == 1


def test_publishing_a_major_version_names_goal_templates_still_on_the_earlier_one():
    from src.services.badge_documents.store import _templates_on_older_major
    from src.services.goals import templates

    db, badge, _ = _world()
    with db:
        created = templates.create_template(db, _user(ADMIN), 1, {"template": {"title": "Earn it"}, "stages": [{"title": "Go", "steps": [
            {"type": "badge", "title": "Adaptability", "config": {"badge_uuid": "badge_adapt", "major_version": 1}}]}]})
        assert _templates_on_older_major(db, badge, 2) == [{"template_uuid": created["template_uuid"], "name": "Earn it", "org_id": 1}]
        assert _templates_on_older_major(db, badge, 1) == []
