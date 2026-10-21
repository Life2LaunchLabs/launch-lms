"""Only the badge's owner and organizations it authorized run its routes; the owner says which versions earn it."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.badge_routes import BadgeRoute, BadgeRouteEligibilityUpdate, BadgeRouteOffer
from src.db.goal_templates import AssignmentCollaborator, GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalStep, StepStatus, StepStatusChange
from src.db.learning import BadgeIssuerAuthorization, BadgeIssuerAuthorizationStatus, LearningBadge, LearningBadgeAward, LearningBadgeStatus
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.services.goals import assignments, badge_authority, badge_templates, goals, templates
from src.services.goals.badges import start_badge_goal
from src.tests.plan_permissions import approve_badge_issuers_on_plans, set_plan_permission
from src.tests.test_goal_sharing import _session as _sharing_session
from src.tests.test_goals import ADMIN, LEARNER, NOW, _published, _user

PARTNER, STRANGER = 2, 3
STEPS = ({"key": "notice", "type": "task", "title": "Notice change"}, {"key": "story", "type": "task", "title": "Your story"})


def _world(plans: bool = True):
    """Studio (1) owns the badge and its two routes; Partner (2) is authorized to issue it; Stranger (3) isn't.

    ``plans``: Partner's badge approval is also on the badge's plans (as after migration a8c4e1f7d2b9)."""
    db = _sharing_session()
    for model in (BadgeRoute, BadgeRouteOffer, BadgeIssuerAuthorization):
        model.__table__.create(db.get_bind(), checkfirst=True)
    for org_id, name in ((PARTNER, "Partner"), (STRANGER, "Stranger")):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=name, slug=name.lower(), email=f"{name}@example.com", creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=ADMIN, org_id=org_id, role_id=1, creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=LEARNER, org_id=org_id, role_id=4, creation_date=NOW, update_date=NOW))
    db.add(LearningBadge(id=1, badge_uuid="badge_adapt", org_id=1, name="Adaptability", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW))
    db.add(BadgeIssuerAuthorization(authorization_uuid="auth_2", badge_id=1, creator_org_id=1, issuer_org_id=PARTNER, status=BadgeIssuerAuthorizationStatus.APPROVED,
                                    learner_access="open", open_to_all=True, creation_date=NOW, update_date=NOW))
    db.commit()
    routes = []
    for position in range(2):
        template = _published(db, *STEPS)
        db.add(BadgeRoute(id=position + 1, route_uuid=f"route_{position}", badge_id=1, goal_template_id=template.id, recommended=position == 0,
                          position=position, creation_date=NOW))
        routes.append(template)
    db.commit()
    if plans:
        approve_badge_issuers_on_plans(db)
    return db, routes


def _assign(db, org_id: int, template_uuid: str, **extra) -> dict:
    payload = GoalAssignmentRequest(user_id=LEARNER, collaborators=[AssignmentCollaborator(user_id=ADMIN)], **extra)
    return assignments.assign(db, _user(ADMIN), org_id, template_uuid, payload)


def _finish(db, goal: Goal) -> None:
    if db.get(Goal, goal.id).status == "pending":
        goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
    view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
    for stage in view["stages"]:
        for step in stage["steps"]:
            goals.change_status(db, _user(LEARNER), goal.goal_uuid, step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))


def _goal_of(db, result: dict) -> Goal:
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
    return db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).one()


def test_organizations_without_an_authorization_cannot_assign_or_start_a_badge_route():
    db, (first, second) = _world()
    with db:
        with pytest.raises(HTTPException) as assign_denied:
            _assign(db, STRANGER, first.template_uuid)
        assert assign_denied.value.status_code == 403
        with pytest.raises(HTTPException) as named_denied:
            _assign(db, STRANGER, first.template_uuid, badge_uuid="badge_adapt")
        assert named_denied.value.status_code == 403
        with pytest.raises(HTTPException) as start_denied:
            start_badge_goal(db, _user(LEARNER), db.get(LearningBadge, 1), None, STRANGER)
        assert start_denied.value.status_code == 403
        # Someone else's template that earns no badge isn't there at all.
        other = templates.create_template(db, _user(ADMIN), 1, {"template": {"title": "Private"}, "stages": [{"key": "s", "title": "S", "steps": [dict(STEPS[0])]}]})
        with pytest.raises(HTTPException) as hidden:
            _assign(db, PARTNER, other["template_uuid"])
        assert hidden.value.status_code == 404
        assert badge_templates.issuer_routes(db, _user(ADMIN), STRANGER) == []

        # Partner offers only the second route, so it can't run the first.
        db.add(BadgeRouteOffer(route_id=2, issuer_org_id=PARTNER, creation_date=NOW))
        db.commit()
        with pytest.raises(HTTPException) as not_offered:
            _assign(db, PARTNER, first.template_uuid)
        assert not_offered.value.status_code == 403
        assert [item["template"]["template_uuid"] for item in badge_templates.issuer_routes(db, _user(ADMIN), PARTNER)] == [second.template_uuid]

        # Once its permission on the plans is revoked, Partner can neither assign nor let learners start the badge
        # with it, though its old badge-level record still says approved.
        set_plan_permission(db, PARTNER, "revoked")
        with pytest.raises(HTTPException) as revoked:
            _assign(db, PARTNER, second.template_uuid)
        assert revoked.value.status_code == 403
        with pytest.raises(HTTPException) as revoked_start:
            start_badge_goal(db, _user(LEARNER), db.get(LearningBadge, 1), second.template_uuid, PARTNER)
        assert revoked_start.value.status_code == 403
        assert db.exec(select(Goal)).all() == []


def test_an_authorized_issuer_assigns_the_owners_template_and_finishing_earns_the_badge():
    db, (first, _) = _world()
    with db:
        result = _assign(db, PARTNER, first.template_uuid)
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
        assert (assignment.org_id, assignment.badge_id) == (PARTNER, 1)
        assert result["badge"]["badge_uuid"] == "badge_adapt" and result["version_eligible"] is True and result["update_available"] is False
        goal = _goal_of(db, result)
        assert (goal.org_id, goal.badge_id, goal.source) == (PARTNER, 1, "assignment")

        # The owner's list of the template's assignments is its own; the issuer sees its own.
        assert assignments.list_assignments(db, _user(ADMIN), 1, first.template_uuid) == []
        assert [item["assignment_uuid"] for item in assignments.list_assignments(db, _user(ADMIN), PARTNER, first.template_uuid)] == [result["assignment_uuid"]]
        routes = badge_templates.issuer_routes(db, _user(ADMIN), PARTNER)
        assert routes[0]["badge"]["owner_org"]["name"] == "Studio" and routes[0]["assignments"][0]["assignment_uuid"] == result["assignment_uuid"]
        view = badge_templates.template_view(db, _user(ADMIN), PARTNER, first.template_uuid)
        assert view["read_only"] and view["published_version"] == 1 and view["document"]["stages"][0]["steps"][0]["title"] == "Notice change"

        # Once accepted, the learner's plan is the badge's: starting the badge again returns it.
        goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
        assert start_badge_goal(db, _user(LEARNER), db.get(LearningBadge, 1), None, PARTNER).id == goal.id
        _finish(db, goal)
        award = db.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == LEARNER)).one()
        assert (award.badge_id, award.issuing_org_id) == (1, PARTNER)


def test_the_owner_assigns_its_own_route_with_or_without_the_badge():
    db, (first, _) = _world()
    with db:
        plain = _assign(db, 1, first.template_uuid)
        assert plain["badge"] is None and plain["version_eligible"] is None
        earning = _assign(db, 1, first.template_uuid, badge_uuid="badge_adapt")
        assert earning["badge"]["name"] == "Adaptability"


def test_only_versions_the_owner_accepts_earn_the_badge_and_the_issuer_is_told():
    db, (first, _) = _world()
    with db:
        result = _assign(db, PARTNER, first.template_uuid)
        with pytest.raises(HTTPException) as not_owner:
            badge_authority.set_eligibility(db, _user(LEARNER), "badge_adapt", "route_0", BadgeRouteEligibilityUpdate(rule="latest"))
        assert not_owner.value.status_code == 403
        with pytest.raises(HTTPException) as unpublished:
            badge_authority.set_eligibility(db, _user(ADMIN), "badge_adapt", "route_0", BadgeRouteEligibilityUpdate(rule="from", from_version=2))
        assert unpublished.value.status_code == 422

        templates.publish(db, _user(ADMIN), 1, first.template_uuid, "Second")
        listed = badge_authority.set_eligibility(db, _user(ADMIN), "badge_adapt", "route_0", BadgeRouteEligibilityUpdate(rule="from", from_version=2))
        route = next(item for item in listed["routes"] if item["route_uuid"] == "route_0")
        assert route["eligible_versions"] == {"rule": "from", "from_version": 2} and route["published_version"] == 2

        summary = assignments.list_assignments(db, _user(ADMIN), PARTNER, first.template_uuid)[0]
        assert (summary["version"], summary["latest_version"], summary["update_available"], summary["version_eligible"]) == (1, 2, True, False)
        # Publishing changed nothing for the learner, and finishing on version 1 no longer earns the badge.
        goal = _goal_of(db, result)
        assert db.get(Goal, goal.id).version_id == db.exec(select(GoalAssignment)).one().version_id
        _finish(db, goal)
        assert db.exec(select(LearningBadgeAward)).all() == []
        assert db.get(Goal, goal.id).status == "finished"
        assert db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()
