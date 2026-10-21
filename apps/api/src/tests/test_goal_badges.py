"""Starting a badge issues the learner's own goal from one of its routes."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute, BadgeRouteOffer
from src.db.goals import Goal, StepStatus, StepStatusChange
from src.db.learning import LearningBadge, LearningBadgeAward, LearningBadgeStatus
from src.db.organizations import Organization
from src.services.goals import goals
from src.services.goals.badges import goal_summaries, goal_summary, start_badge_goal
from src.services.goals.plan_access import set_access
from src.tests.plan_permissions import approve_on_plans
from src.tests.test_goals import LEARNER, NOW, _published, _session as _goal_session, _user


def _world(issuer_access: str = "open", creator_access: str = "open") -> tuple[Session, LearningBadge, list[str]]:
    db = _goal_session()
    for model in (BadgeRoute, BadgeRouteOffer):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
    badge = LearningBadge(id=1, badge_uuid="badge_adapt", org_id=1, name="Adaptability", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW)
    db.add(badge)
    db.commit()
    uuids = []
    for position, titles in enumerate((["Notice change", "Your story"], ["Write it up"])):
        template = _published(db, *({"type": "task", "title": title} for title in titles))
        db.add(BadgeRoute(route_uuid=f"route_{position}", badge_id=1, goal_template_id=template.id, recommended=position == 0, position=position, creation_date=NOW))
        uuids.append(template.template_uuid)
        # Who may start each plan is set per running organization: the creator open, the partner as asked.
        set_access(db, template.id, 1, creator_access, None)
        set_access(db, template.id, 2, issuer_access, None)
    db.commit()
    # The partner issues the badge: approved on both of its plans.
    approve_on_plans(db, 2)
    return db, badge, uuids


def test_starting_a_badge_issues_the_learners_own_locked_goal_and_finishing_it_awards_the_badge():
    db, badge, routes = _world()
    with db:
        goal = start_badge_goal(db, _user(LEARNER), badge, None, None)
        assert (goal.title, goal.source, goal.badge_id, goal.owner_user_id, goal.subject_user_id, goal.org_id) == ("Adaptability", "badge", 1, LEARNER, LEARNER, 1)
        assert start_badge_goal(db, _user(LEARNER), badge, routes[1], None).id == goal.id
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert [step["title"] for step in view["stages"][0]["steps"]] == ["Notice change", "Your story"]
        assert "edit_structure" not in view["capabilities"] and "complete_plan" not in view["capabilities"]
        assert goal_summary(db, LEARNER, badge) == {"goal_uuid": goal.goal_uuid, "title": "Adaptability", "done": 0, "total": 2, "status": "active"}

        for step in view["stages"][0]["steps"]:
            goals.change_status(db, _user(LEARNER), goal.goal_uuid, step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        assert db.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == LEARNER)).one().badge_id == 1
        db.refresh(goal)
        assert goal.status == "finished"
        assert goal_summaries(db, LEARNER, [1]) == {}
        # A finished badge goal is still the learner's: starting again doesn't issue another.
        assert start_badge_goal(db, _user(LEARNER), badge, None, None).id == goal.id


def test_issuers_offer_routes_and_their_access_is_respected():
    db, badge, routes = _world()
    with db:
        db.add(BadgeRouteOffer(route_id=2, issuer_org_id=2, creation_date=NOW))
        db.commit()
        with pytest.raises(HTTPException) as not_offered:
            start_badge_goal(db, _user(LEARNER), badge, routes[0], 2)
        assert not_offered.value.status_code == 403
        with pytest.raises(HTTPException) as not_a_route:
            start_badge_goal(db, _user(LEARNER), badge, "goal_template_other", 2)
        assert not_a_route.value.status_code == 404
        goal = start_badge_goal(db, _user(LEARNER), badge, routes[1], 2)
        assert goal.org_id == 2 and db.exec(select(Goal)).one().id == goal.id


def test_request_only_issuers_need_an_accepted_request():
    db, badge, _ = _world(issuer_access="request")
    with db:
        with pytest.raises(HTTPException) as waiting:
            start_badge_goal(db, _user(LEARNER), badge, None, 2)
        assert waiting.value.status_code == 409


def test_a_badge_without_routes_cannot_be_started():
    db, badge, _ = _world()
    with db:
        for route in db.exec(select(BadgeRoute)).all():
            db.delete(route)
        db.commit()
        with pytest.raises(HTTPException) as no_way:
            start_badge_goal(db, _user(LEARNER), badge, None, None)
        assert no_way.value.status_code == 409
