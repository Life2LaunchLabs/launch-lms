"""Learner access per plan: who may start a plan an organization runs, Discover, starting a badge and the migration."""

import importlib.util
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.badge_routes import BadgeRoute, BadgeRouteOffer
from src.db.goals import GoalTemplate
from src.db.learning import BadgeCollection, LearningBadgeAward, LearningBadgeStatus
from src.db.template_marketplace import BadgeRoutePartner, GoalTemplateLearnerAccess, TemplateLearnerAccessUpdate
from src.db.users import AnonymousUser
from src.services import badge_discover, learning_issuers
from src.services.goals import plan_access, template_learners
from src.services.goals.badge_routes import list_routes
from src.services.goals.badges import start_badge_goal
from src.tests.plan_permissions import set_plan_permission
from src.tests.test_badge_discover import approve_publishing
from src.tests.test_goal_badges import _world
from src.tests.test_goals import ADMIN, LEARNER, NOW, _user

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "f7a3c9d2b8e4_plan_learner_access.py"


def _setup(issuer_access: str = "open", creator_access: str = "open"):
    db, badge, routes = _world(issuer_access, creator_access)
    for model in (BadgeCollection, LearningBadgeAward, BadgeRoutePartner):
        model.__table__.create(db.get_bind(), checkfirst=True)
    approve_publishing(db, 1)
    return db, badge, routes


def _listed(db) -> set[str]:
    return {card["badge_uuid"] for card in badge_discover.discover(db, AnonymousUser())["badges"]}


def _template_id(db, template_uuid: str) -> int:
    return int(db.exec(select(GoalTemplate.id).where(GoalTemplate.template_uuid == template_uuid)).one())


def test_discover_lists_a_badge_only_while_an_issuing_org_lets_learners_start_one_of_its_plans():
    db, badge, routes = _setup(issuer_access="invite", creator_access="invite")
    with db:
        # Every plan invite-only: nobody can find it on Discover, though its owner is an approved publisher.
        assert _listed(db) == set()
        # One plan by request at the partner is enough.
        plan_access.set_access(db, _template_id(db, routes[1]), 2, "request", None)
        db.commit()
        assert _listed(db) == {"badge_adapt"}
        # A partner no longer approved on that plan doesn't count, even with its old badge-level record.
        set_plan_permission(db, 2, "revoked", _template_id(db, routes[1]))
        assert _listed(db) == set()
        # A trusted-partners-only plan is one whose owner approves only trusted partners: approving it again lists it.
        set_plan_permission(db, 2, "approved", _template_id(db, routes[1]))
        assert _listed(db) == {"badge_adapt"}
        # Coming-soon badges are previews: listed without anyone offering them yet.
        plan_access.set_access(db, _template_id(db, routes[1]), 2, "invite", None)
        badge.status = LearningBadgeStatus.COMING_SOON
        db.add(badge)
        db.commit()
        assert _listed(db) == {"badge_adapt"}


def test_starting_a_badge_goes_to_an_org_that_lets_the_learner_start_and_uses_that_plans_access():
    db, badge, routes = _setup(issuer_access="invite", creator_access="invite")
    with db:
        # The creator is invite-only; the partner runs only the second plan, openly.
        plan_access.set_access(db, _template_id(db, routes[1]), 2, "open", None)
        db.add(BadgeRouteOffer(route_id=2, issuer_org_id=2, creation_date=NOW))
        db.commit()
        ways = list_routes(db, _user(LEARNER), "badge_adapt")["routes"]
        assert {route["route_uuid"]: [(item["org"]["id"], item["access"]) for item in route["issuers"]] for route in ways} == {"route_0": [], "route_1": [(2, "open")]}
        with pytest.raises(HTTPException) as invited:
            start_badge_goal(db, _user(LEARNER), badge, routes[0], 1)
        assert invited.value.status_code == 403
        goal = start_badge_goal(db, _user(LEARNER), badge, None, None)
        assert goal.org_id == 2 and goal.template_id == _template_id(db, routes[1])


def test_the_badge_level_setting_writes_through_to_the_plans():
    db, badge, routes = _setup(issuer_access="invite", creator_access="invite")
    with db:
        learning_issuers.update_issuing_settings(db, badge, learning_issuers.BadgeIssuingSettingsUpdate(creator_access="request"), ADMIN)
        assert {plan_access.access_of(db, _template_id(db, uuid), 1) for uuid in routes} == {"request"}
        settings = learning_issuers.issuing_settings(db, badge)
        assert settings["creator_access"] == "request" and [plan["access"] for plan in settings["creator_plans"]] == ["request", "request"]
        assert learning_issuers.issuer_access(db, badge, 2) == "invite"
        # Stopping and resuming issuing leaves each plan's setting alone.
        Update = learning_issuers.BadgeIssuingSettingsUpdate
        assert learning_issuers.update_issuing_settings(db, badge, Update(creator_issues=False), ADMIN)["creator_access"] == "none"
        assert _listed(db) == set()
        assert learning_issuers.update_issuing_settings(db, badge, Update(creator_issues=True), ADMIN)["creator_access"] == "request"
        assert _listed(db) == {"badge_adapt"}


def test_template_learners_card_shows_the_badge_and_is_the_running_orgs_own_setting():
    db, badge, routes = _setup(issuer_access="invite", creator_access="open")
    with db:
        own = template_learners.template_learners(db, _user(ADMIN), 1, routes[0])
        assert own["access"] == "open" and own["owned"] and own["earns_badge"]
        [earned] = own["badges"]
        assert (earned["badge_uuid"], earned["route_uuid"], earned["eligible_versions"]["rule"]) == ("badge_adapt", "route_0", "any")
        assert [(item["org"]["id"], item["access"]) for item in earned["offered_by"]] == [(1, "open")]
        # The partner runs the creator's template read-only, but who may start it there is its own call.
        partner = template_learners.set_template_access(db, _user(ADMIN), 2, routes[0], TemplateLearnerAccessUpdate(access="request"))
        assert partner["access"] == "request" and not partner["owned"] and partner["earns_badge"]
        assert plan_access.access_of(db, _template_id(db, routes[0]), 1) == "open"
        assert [(item["org"]["id"], item["access"]) for item in partner["badges"][0]["offered_by"]] == [(1, "open"), (2, "request")]


def test_template_learners_refuses_a_template_the_org_does_not_run():
    db, _, routes = _setup()
    with db:
        set_plan_permission(db, 2, "revoked")
        with pytest.raises(HTTPException) as refused:
            template_learners.set_template_access(db, _user(ADMIN), 2, routes[0], TemplateLearnerAccessUpdate(access="open"))
        assert refused.value.status_code in (403, 404)


def test_migration_copies_badge_level_access_onto_the_plans_each_issuer_runs():
    spec = importlib.util.spec_from_file_location("plan_learner_access_migration", MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)  # type: ignore[union-attr]
    db, _, routes = _setup(issuer_access="request")
    with db:
        for row in db.exec(select(GoalTemplateLearnerAccess)).all():
            db.delete(row)
        # The partner offers only the second plan; the first is trusted-partners only (partner not approved).
        db.add(BadgeRouteOffer(route_id=2, issuer_org_id=2, creation_date=NOW))
        db.exec(select(BadgeRoute).where(BadgeRoute.route_uuid == "route_0")).one().trusted_only = True
        db.commit()
        assert migration.backfill(db.connection()) == 3
        rows = {(row.template_id, row.org_id): row.access for row in db.exec(select(GoalTemplateLearnerAccess)).all()}
        first, second = _template_id(db, routes[0]), _template_id(db, routes[1])
        # The creator never recorded a setting, so it was open: it stays open on both plans.
        assert rows == {(first, 1): "open", (second, 1): "open", (second, 2): "request"}
        # Running it again adds nothing.
        assert migration.backfill(db.connection()) == 0
    # Most open wins across badges, and a creator that stopped issuing gets nothing.
    assert migration.plan_access_rows(
        [(1, 10, 100, False, 1), (2, 11, 100, False, 1)],
        [(10, 2, "approved", "request", True), (11, 2, "approved", "open", True), (11, 1, "revoked", "open", True)],
        [], [],
    ) == {(100, 1): "open", (100, 2): "open"}
