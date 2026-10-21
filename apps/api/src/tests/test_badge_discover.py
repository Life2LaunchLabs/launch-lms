from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import GoalTemplate
from src.db.template_marketplace import GoalTemplateLearnerAccess
from src.db.learning import BadgeCollection, BadgeIssuerAuthorization, BadgeIssuerAuthorizationStatus, LearningBadge, LearningBadgeAward, LearningBadgeStatus
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.goals import StepStatus, StepStatusChange
from src.db.users import AnonymousUser
from src.services import badge_discover
from src.services.goals import goals
from src.services.goals.badges import start_badge_goal
from src.services.goals import plan_access
from src.services.goals.plan_access import set_access
from src.tests.plan_permissions import approve_badge_issuers_on_plans
from src.tests.test_goal_badges import _world
from src.tests.test_goals import LEARNER as LEARNER_ID, NOW, _user

LEARNER = _user(LEARNER_ID)


def approve_publishing(session: Session, org_id: int) -> None:
    """The platform approved this organization as a verified badge publisher."""
    OrganizationConfig.__table__.create(session.get_bind(), checkfirst=True)
    row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first() or OrganizationConfig(org_id=org_id, config={})
    row.config = {**(row.config or {}), "config_version": "3.0", "partners": ["badge_publisher"]}
    session.add(row)
    session.commit()


def _collect(session: Session) -> None:
    for model in (BadgeCollection, LearningBadgeAward):
        model.__table__.create(session.get_bind(), checkfirst=True)
    approve_publishing(session, 1)
    session.add(BadgeCollection(id=1, collection_uuid="badge_collection_work", org_id=1, name="Work ready", creation_date=NOW, update_date=NOW,
                                collection_metadata={"credibility": "Built with local employers", "endorsers": [{"name": "Chamber of Commerce"}]}))
    badge = session.get(LearningBadge, 1)
    badge.collection_id = 1
    badge.badge_metadata = {"overview_subtitle": "Roll with it", "overview_cards": [{"title": "Adjust fast", "body": "Change course when plans shift"}, {"title": ""}]}
    session.add(LearningBadge(id=2, badge_uuid="badge_lead", org_id=1, collection_id=1, name="Leadership", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW))
    session.commit()
    # Discover lists a badge only while some organization lets learners start one of its plans.
    if not plan_access.has_plans(session, session.get(LearningBadge, 1)):
        _open_route(session, 1, "route_adapt", org_id=1)
    _open_route(session, 2, "route_lead", org_id=1)


def _open_route(session: Session, badge_id: int, route_uuid: str, org_id: int, access: str = "open") -> int:
    """A way to earn the badge that ``org_id`` lets learners start (``access``); returns its template id."""
    for model in (GoalTemplate, GoalTemplateLearnerAccess):
        model.__table__.create(session.get_bind(), checkfirst=True)
    template = GoalTemplate(template_uuid=f"goal_template_{route_uuid}", org_id=1, title="Lead a meeting", document={"stages": []}, creation_date=NOW, update_date=NOW)
    session.add(template)
    session.flush()
    session.add(BadgeRoute(route_uuid=route_uuid, badge_id=badge_id, goal_template_id=template.id, recommended=True, creation_date=NOW))
    set_access(session, int(template.id), org_id, access, None)
    session.commit()
    return int(template.id)


def test_discover_groups_badges_and_follows_the_learner():
    session, _, _ = _world()
    with session:
        _collect(session)
        feed = badge_discover.discover(session, AnonymousUser())
        assert {card["name"] for card in feed["featured"]} == {"Leadership", "Adaptability"}
        assert feed["collections"][0]["name"] == "Work ready" and feed["collections"][0]["credibility"] == "Built with local employers"
        assert {card["name"] for card in feed["collections"][0]["badges"]} == {"Adaptability", "Leadership"}
        adapt = next(card for card in feed["badges"] if card["badge_uuid"] == "badge_adapt")
        assert adapt["subtitle"] == "Roll with it" and adapt["route_count"] == 2 and adapt["goal"] is None

        goal = start_badge_goal(session, LEARNER, session.get(LearningBadge, 1), None, None)
        first = goals.get_goal(session, LEARNER, goal.goal_uuid)["stages"][0]["steps"][0]
        goals.change_status(session, LEARNER, goal.goal_uuid, first["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        feed = badge_discover.discover(session, LEARNER)
        assert [(card["name"], card["goal"]["goal_uuid"], card["goal"]["done"], card["goal"]["total"]) for card in feed["keep_going"]] == [("Adaptability", goal.goal_uuid, 1, 2)]
        assert "badge_adapt" not in {card["badge_uuid"] for card in feed["badges"] + feed["featured"]}


def test_badge_page_tells_the_story_and_shows_the_set():
    session, _, _ = _world()
    with session:
        _collect(session)
        page = badge_discover.badge_page(session, LEARNER, "adapt")
        assert page["proves"] == [{"title": "Adjust fast", "body": "Change course when plans shift"}]
        assert [card["name"] for card in page["collection"]["badges"]] == ["Leadership"]
        assert page["collection"]["endorsers"] == [{"name": "Chamber of Commerce"}]
        assert page["ways"]["routes"][0]["recommended"] and page["ways"]["routes"][0]["steps"][0]["title"] == "Notice change"
        assert page["ways"]["goal"] is None and page["ways"]["routes"][0]["template_uuid"]

        collection = badge_discover.collection_page(session, None, "work")
        assert collection["creator"]["name"] == "Studio" and len(collection["badges"]) == 2


def test_discover_lists_approved_publishers_and_badges_offered_to_the_site_only():
    session, _, _ = _world()
    with session:
        _collect(session)
        session.add(Organization(id=3, org_uuid="org_3", name="Unvetted", slug="unvetted", email="u@example.com", creation_date=NOW, update_date=NOW))
        session.add(LearningBadge(id=3, badge_uuid="badge_unvetted", org_id=3, name="Unvetted", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW))
        session.commit()

        def names(**scope) -> set[str]:
            return {card["name"] for card in badge_discover.discover(session, AnonymousUser(), **scope)["badges"]}

        # An organization nobody approved to publish badges doesn't reach Discover, wherever it is browsed from.
        assert names() == {"Adaptability", "Leadership"}
        assert names(org_id=3) == set()
        assert names(site_org_id=2) == {"Adaptability", "Leadership"}
        # A badge offered to the site organization through an authorization is listed there, and only there.
        session.add(BadgeIssuerAuthorization(authorization_uuid="auth_3", badge_id=3, creator_org_id=3, issuer_org_id=2,
                                             status=BadgeIssuerAuthorizationStatus.APPROVED, creation_date=NOW, update_date=NOW))
        session.commit()
        _open_route(session, 3, "route_unvetted", org_id=2)
        approve_badge_issuers_on_plans(session)
        assert names(site_org_id=2) == {"Adaptability", "Leadership", "Unvetted"}
        assert names(org_id=2) == {"Adaptability", "Unvetted"}
        assert "Unvetted" not in names(site_org_id=1)
        # Once the platform approves the creator, it is listed everywhere.
        approve_publishing(session, 3)
        assert "Unvetted" in names(site_org_id=1)
