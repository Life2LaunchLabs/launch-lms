"""Permission is to use a plan: locked templates run as-is, open ones are copied; running a plan that earns a badge awards it."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalAssignment, GoalTemplate
from src.db.badges import BadgeAward
from src.db.roles import Role
from src.db.template_marketplace import (
    GoalTemplateAuthorization,
    TemplateAuthorizationRequest,
    TemplateListingUpdate,
)
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.goals import plan_issuers, template_marketplace as market, templates
from src.tests.plan_world import PARTNER, STEPS, STRANGER, _assign, _world
from src.tests.test_goals import ADMIN, LEARNER, NOW, _published, _user

STAFF = 7


def _market():
    """Partner holds no permission on Studio's plans here."""
    db, routes = _world(plans=False)
    db.add(User(id=STAFF, user_uuid="user_7", username="tia", email="tia@example.com", first_name="Tia", last_name="Teacher", creation_date=NOW, update_date=NOW))
    db.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.add(UserOrganization(user_id=STAFF, org_id=PARTNER, role_id=5, creation_date=NOW, update_date=NOW))
    db.commit()
    return db, routes


def _plain(db) -> GoalTemplate:
    """A published Studio template with no badge and no requirements."""
    return _published(db, *STEPS)


def _list(db, template: GoalTemplate, mode: str, access: str) -> dict:
    return market.set_listing(db, _user(ADMIN), 1, template.template_uuid, TemplateListingUpdate(listed=True, mode=mode, access=access))


def _request(db, template: GoalTemplate, org_id: int = PARTNER) -> dict:
    return market.request_use(db, _user(ADMIN), TemplateAuthorizationRequest(template_uuid=template.template_uuid, issuer_org_id=org_id, message="We'd like to run it"))


def test_a_locked_template_without_a_badge_runs_as_is_once_the_creator_approves():
    db, _ = _market()
    with db:
        template = _plain(db)
        draft = templates.create_template(db, _user(ADMIN), 1, {"template": {"title": "Unpublished"}, "stages": [{"key": "s", "title": "S", "steps": [dict(STEPS[0])]}]})
        with pytest.raises(HTTPException) as unpublished:
            market.set_listing(db, _user(ADMIN), 1, draft["template_uuid"], TemplateListingUpdate(listed=True))
        assert unpublished.value.status_code == 422
        listing = _list(db, template, "locked", "request")
        assert (listing["listed"], listing["mode"], listing["access"]) == (True, "locked", "request")

        # Before approval the template isn't Partner's to assign.
        with pytest.raises(HTTPException) as hidden:
            _assign(db, PARTNER, template.template_uuid)
        assert hidden.value.status_code == 404
        request = _request(db, template)
        assert request["status"] == "requested"
        assert market.requests_summary(db, _user(ADMIN), 1) == {"incoming_requested": 1, "outgoing_pending": 0}
        assert market.requests_summary(db, _user(ADMIN), PARTNER)["outgoing_pending"] == 1
        with pytest.raises(HTTPException):
            _assign(db, PARTNER, template.template_uuid)

        approved = market.decide(db, _user(ADMIN), request["authorization_uuid"], True)
        assert approved["status"] == "approved"
        assert market.requests_summary(db, _user(ADMIN), 1)["incoming_requested"] == 0
        result = _assign(db, PARTNER, template.template_uuid)
        assert result["badge"] is None
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
        assert (assignment.org_id, assignment.template_id) == (PARTNER, template.id)
        # It stays the creator's: read-only for Partner, on the creator's published version, and it can't be copied.
        view = plan_issuers.template_view(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert view["read_only"] and view["badge"] is None and view["published_version"] == 1
        with pytest.raises(HTTPException) as no_copy:
            market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert no_copy.value.status_code == 403
        creator_side = market.list_authorizations(db, _user(ADMIN), 1, "creator")
        assert creator_side[0]["issuer_org"]["name"] == "Partner" and creator_side[0]["learner_count"] == 1

        # Revoking stops new assignments and the running one.
        market.revoke(db, _user(ADMIN), request["authorization_uuid"])
        assert plan_issuers.still_runs(db, assignment) is False
        with pytest.raises(HTTPException):
            _assign(db, PARTNER, template.template_uuid)


def test_an_open_template_is_copied_into_a_template_of_ones_own_with_provenance():
    db, _ = _market()
    with db:
        template = _plain(db)
        with pytest.raises(HTTPException) as unlisted:
            market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert unlisted.value.status_code == 403
        _list(db, template, "open", "open")
        copied = market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert copied["org_id"] == PARTNER and copied["template_uuid"] != template.template_uuid
        assert copied["based_on"]["title"] == template.title and copied["based_on"]["org"]["name"] == "Studio" and copied["based_on"]["version"] == 1
        assert copied["document"]["stages"][0]["steps"][0]["title"] == "Notice change"
        # The copy is Partner's to change; the original isn't Partner's to run as-is.
        document = copied["document"]
        document["stages"][0]["steps"][0]["title"] = "Our version"
        saved = templates.save_template(db, _user(ADMIN), PARTNER, copied["template_uuid"], document)
        assert saved["document"]["stages"][0]["steps"][0]["title"] == "Our version"
        assert templates.template_or_404(db, 1, template.template_uuid).document["stages"][0]["steps"][0]["title"] == "Notice change"
        with pytest.raises(HTTPException):
            _assign(db, PARTNER, template.template_uuid)
        authorization = db.exec(select(GoalTemplateAuthorization)).one()
        assert authorization.status == "approved" and authorization.copied_template_id is not None
        assert market.list_authorizations(db, _user(ADMIN), PARTNER, "issuer")[0]["copied_template_uuid"] == copied["template_uuid"]


def test_request_access_on_an_open_template_waits_for_the_creator_and_can_be_declined():
    db, _ = _market()
    with db:
        template = _plain(db)
        _list(db, template, "open", "request")
        with pytest.raises(HTTPException) as waiting:
            market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert waiting.value.status_code == 403
        request = _request(db, template)
        declined = market.decide(db, _user(ADMIN), request["authorization_uuid"], False)
        assert declined["status"] == "rejected"
        with pytest.raises(HTTPException):
            market.decide(db, _user(ADMIN), request["authorization_uuid"], True)
        # Asking again reopens the request.
        assert _request(db, template)["status"] == "requested"


def test_browse_lists_published_listings_with_badges_and_this_orgs_permission_for_staff_but_not_learners():
    db, (route_template, _) = _market()
    with db:
        plain = _plain(db)
        hidden = _plain(db)
        _list(db, plain, "open", "open")
        _list(db, route_template, "locked", "request")
        _list(db, hidden, "locked", "request")
        market.set_listing(db, _user(ADMIN), 1, hidden.template_uuid, TemplateListingUpdate(listed=False))
        _request(db, route_template)

        cards = {card["template_uuid"]: card for card in market.browse(db, _user(STAFF), PARTNER)}
        assert set(cards) == {plain.template_uuid, route_template.template_uuid}
        assert cards[plain.template_uuid]["badge"] is None and cards[plain.template_uuid]["mode"] == "open"
        assert cards[route_template.template_uuid]["badge"]["name"] == "Adaptability"
        assert cards[route_template.template_uuid]["authorization"]["status"] == "requested"
        assert cards[plain.template_uuid]["creator_org"]["name"] == "Studio" and cards[plain.template_uuid]["step_count"] == 2
        assert market.browse(db, _user(STAFF), PARTNER, creator_org_id=STRANGER) == []
        assert market.get_listing(db, _user(ADMIN), 1, route_template.template_uuid)["usage"] == {"approved": 0, "requested": 1}

        with pytest.raises(HTTPException) as learner:
            market.browse(db, _user(LEARNER), PARTNER)
        assert learner.value.status_code == 403
        # Staff browse, but asking, approving and copying stay with admins.
        with pytest.raises(HTTPException) as staff_request:
            market.request_use(db, _user(STAFF), TemplateAuthorizationRequest(template_uuid=plain.template_uuid, issuer_org_id=PARTNER))
        assert staff_request.value.status_code == 403
        with pytest.raises(HTTPException):
            market.copy_template(db, _user(STAFF), PARTNER, plain.template_uuid)
        with pytest.raises(HTTPException):
            market.requests_summary(db, _user(STAFF), PARTNER)


def test_permission_on_a_plan_that_earns_a_badge_is_permission_to_award_it_through_the_plan():
    from src.tests.plan_world import _finish, _goal_of

    db, (route_template, _) = _market()
    with db:
        _list(db, route_template, "locked", "open")
        # Stranger had nothing to do with Studio; approval on the plan lets it run the plan, and finishing earns the badge.
        assert _request(db, route_template, STRANGER)["status"] == "approved"
        result = _assign(db, STRANGER, route_template.template_uuid)
        assert result["badge"]["name"] == "Adaptability"
        _finish(db, _goal_of(db, result))
        award = db.exec(select(BadgeAward)).one()
        assert (award.template_id, award.issuing_org_id, award.creator_org_id, award.user_id) == (route_template.id, STRANGER, 1, LEARNER)
        assert award.achievement["creator"]["name"] == "Studio"
        # Revoking the plan permission stops the running assignment.
        authorization = db.exec(select(GoalTemplateAuthorization).where(GoalTemplateAuthorization.issuer_org_id == STRANGER)).one()
        market.revoke(db, _user(ADMIN), authorization.authorization_uuid)
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
        assert plan_issuers.still_runs(db, assignment) is False


def test_the_owner_approves_organizations_on_one_plan_at_a_time():
    db, (direct, full) = _market()
    with db:
        # Without a plan permission Partner runs nothing.
        with pytest.raises(HTTPException) as unapproved:
            _assign(db, PARTNER, full.template_uuid)
        assert unapproved.value.status_code == 403
        # The owner authorizes Partner on the full plan only (by slug, unlisted is fine); the direct plan stays the owner's.
        invited = plan_issuers.invite(db, _user(ADMIN), 1, full.template_uuid, "partner")
        assert invited["status"] == "approved" and invited["issuer_org"]["name"] == "Partner"
        assert _assign(db, PARTNER, full.template_uuid)["badge"]["name"] == "Adaptability"
        with pytest.raises(HTTPException) as untrusted:
            _assign(db, PARTNER, direct.template_uuid)
        assert untrusted.value.status_code == 403
        # The owner always runs its own plans.
        assert _assign(db, 1, direct.template_uuid)["badge"]["name"] == "Adaptability"
        _list(db, direct, "locked", "request")
        _request(db, direct, STRANGER)

        # Inviting an organization that asked approves it; a stranger to the template can't invite, nor the owner itself.
        assert plan_issuers.invite(db, _user(ADMIN), 1, direct.template_uuid, "stranger")["status"] == "approved"
        with pytest.raises(HTTPException) as own:
            plan_issuers.invite(db, _user(ADMIN), 1, direct.template_uuid, "studio")
        assert own.value.status_code in (404, 422)
        with pytest.raises(HTTPException):
            plan_issuers.invite(db, _user(STAFF), PARTNER, direct.template_uuid, "stranger")
        with pytest.raises(HTTPException) as missing:
            plan_issuers.invite(db, _user(ADMIN), 1, direct.template_uuid, "nobody")
        assert missing.value.status_code == 404
        assert [item["issuer_org"]["name"] for item in market.list_authorizations(db, _user(ADMIN), 1, "creator", template_uuid=direct.template_uuid)] == ["Stranger"]


def test_template_metrics_count_permissions_assignments_learners_and_badges_earned():
    from src.tests.plan_world import _finish, _goal_of

    db, (route_template, _) = _market()
    with db:
        plan_issuers.invite(db, _user(ADMIN), 1, route_template.template_uuid, "partner")
        result = _assign(db, PARTNER, route_template.template_uuid)
        metrics = plan_issuers.template_metrics(db, _user(ADMIN), 1, route_template.template_uuid)
        assert metrics == {"authorized_orgs": 1, "pending_requests": 0, "orgs_running": 1, "assignments": 1, "active_learners": 1, "completions": 0, "badges_earned": 0}
        _finish(db, _goal_of(db, result))
        metrics = plan_issuers.template_metrics(db, _user(ADMIN), 1, route_template.template_uuid)
        assert (metrics["active_learners"], metrics["completions"], metrics["badges_earned"]) == (0, 1, 1)
        with pytest.raises(HTTPException):
            plan_issuers.template_metrics(db, _user(ADMIN), PARTNER, route_template.template_uuid)


def test_staff_browse_the_template_and_framework_libraries_but_learners_cannot():
    from src.db.requirements import RequirementFramework
    from src.services.goals import library
    from src.services.requirements import list_framework_library

    db, _ = _market()
    with db:
        RequirementFramework.__table__.create(db.get_bind(), checkfirst=True)
        assert library.list_library(db, _user(STAFF), PARTNER) == []
        assert list_framework_library(db, _user(STAFF), PARTNER) == []
        for listing in (library.list_library, list_framework_library):
            with pytest.raises(HTTPException) as denied:
                listing(db, _user(LEARNER), PARTNER)
            assert denied.value.status_code == 403
        # Copying from the library stays with admins.
        with pytest.raises(HTTPException) as staff_copy:
            library.copy_from_library(db, _user(STAFF), PARTNER, "goal_template_missing")
        assert staff_copy.value.status_code == 403


# Publishing from Template › Settings ---------------------------------------------------------------

OWNER_ADMIN = 8  # an admin of the owner org who isn't a platform superadmin


def _http(monkeypatch):
    """The marketplace router over one shared in-memory database, signed in as ``OWNER_ADMIN``."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool
    from sqlmodel import create_engine

    from src.core.events.database import get_db_session
    from src.routers import marketplace
    from src.security.auth import get_current_user
    from src.tests import test_goals

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    monkeypatch.setattr(test_goals, "create_engine", lambda *args, **kwargs: engine)
    db, _ = _market()
    db.add(User(id=OWNER_ADMIN, user_uuid="user_8", username="owner", email="owner@example.com", first_name="Own", last_name="Er", creation_date=NOW, update_date=NOW))
    for org_id in (1, PARTNER):
        db.add(UserOrganization(user_id=OWNER_ADMIN, org_id=org_id, role_id=1, creation_date=NOW, update_date=NOW))
    db.commit()
    app = FastAPI()
    app.include_router(marketplace.router, prefix="/api/v1/plan-marketplace")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: _user(OWNER_ADMIN)
    return db, TestClient(app)


def test_an_owner_org_admin_publishes_to_the_marketplace_and_sees_it_listed(monkeypatch):
    db, client = _http(monkeypatch)
    with db:
        template = _plain(db)
        url = f"/api/v1/plan-marketplace/templates/{template.template_uuid}/listing?org_id=1"
        assert client.get(url).json()["listed"] is False
        published = client.put(url, json={"listed": True, "mode": "open", "access": "open"})
        assert published.status_code == 200, published.text
        assert (published.json()["listed"], published.json()["mode"], published.json()["access"]) == (True, "open", "open")
        assert client.get(url).json()["listed"] is True
        # The owner's own marketplace returns it, marked as its own (the browse page shows it as "Yours").
        own = [card for card in client.get("/api/v1/plan-marketplace/templates?org_id=1").json() if card["template_uuid"] == template.template_uuid]
        assert len(own) == 1 and own[0]["is_own"] is True


def test_publishing_is_refused_with_a_reason_when_the_org_is_not_a_plan_publisher(monkeypatch):
    db, client = _http(monkeypatch)
    with db:
        created = templates.create_template(db, _user(ADMIN), PARTNER, {"template": {"title": "Partner plan"}, "stages": [{"key": "s", "title": "S", "steps": [dict(STEPS[0])]}]})
        templates.publish(db, _user(ADMIN), PARTNER, created["template_uuid"], "First")
        refused = client.put(f"/api/v1/plan-marketplace/templates/{created['template_uuid']}/listing?org_id={PARTNER}", json={"listed": True})
        assert refused.status_code == 403
        assert "plan publish" in refused.json()["detail"].lower()


def test_the_library_is_the_listings_anyone_may_copy():
    from src.services.goals import library

    db, _ = _market()
    with db:
        template = _plain(db)

        def in_library() -> list[str]:
            return [item["template_uuid"] for item in library.list_library(db, _user(ADMIN), PARTNER)]

        _list(db, template, "locked", "request")
        assert in_library() == []
        # Open to copy without asking: that listing is the library (and MCP search_library).
        _list(db, template, "open", "open")
        assert in_library() == [template.template_uuid]
        assert library.library_status(db, template)["published_to_library"] is True
        # Copying takes the live version, not the draft.
        document = deepcopy(templates.template_or_404(db, 1, template.template_uuid).document)
        document["stages"][0]["steps"][0]["title"] = "Notice change, draft"
        templates.save_template(db, _user(ADMIN), 1, template.template_uuid, document)
        copied = library.copy_from_library(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert copied["based_on"]["template_uuid"] == template.template_uuid
        assert templates.template_or_404(db, PARTNER, copied["template_uuid"]).document["stages"][0]["steps"][0]["title"] == "Notice change"
        # Asking first, locking it, or taking it out of the marketplace takes it out of the library too.
        _list(db, template, "open", "request")
        assert in_library() == []
        with pytest.raises(HTTPException) as gone:
            library.copy_from_library(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert gone.value.status_code == 404
        _list(db, template, "open", "open")
        market.set_listing(db, _user(ADMIN), 1, template.template_uuid, TemplateListingUpdate(listed=False, mode="open", access="open"))
        assert in_library() == []
