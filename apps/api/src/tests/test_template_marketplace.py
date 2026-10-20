"""Permission is to use a plan: locked templates run as-is, open ones are copied; badge routes can be trusted-partners only."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalAssignment, GoalTemplate
from src.db.learning import LearningBadge
from src.db.roles import Role
from src.db.template_marketplace import (
    BadgeRoutePartner,
    BadgeRouteTrustUpdate,
    GoalTemplateAuthorization,
    TemplateAuthorizationRequest,
    TemplateListingUpdate,
)
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.goals import badge_authority, badge_routes, badge_templates, template_marketplace as market, templates
from src.services.goals.badges import start_badge_goal
from src.tests.test_goal_badge_authority import PARTNER, STEPS, STRANGER, _assign, _world
from src.tests.test_goals import ADMIN, LEARNER, NOW, _published, _user

STAFF = 7


def _market():
    db, routes = _world()
    BadgeRoutePartner.__table__.create(db.get_bind(), checkfirst=True)
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
        assert market.requests_summary(db, _user(ADMIN), 1)["templates"] == {"incoming_requested": 1, "outgoing_pending": 0}
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
        view = badge_templates.template_view(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert view["read_only"] and view["badge"] is None and view["published_version"] == 1
        with pytest.raises(HTTPException) as no_copy:
            market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        assert no_copy.value.status_code == 403
        creator_side = market.list_authorizations(db, _user(ADMIN), 1, "creator")
        assert creator_side[0]["issuer_org"]["name"] == "Partner" and creator_side[0]["learner_count"] == 1
        assert [item["template"]["template_uuid"] for item in market.added_templates(db, _user(ADMIN), PARTNER)] == [template.template_uuid]

        # Revoking stops new assignments and the running one.
        market.revoke(db, _user(ADMIN), request["authorization_uuid"])
        assert badge_authority.still_runs(db, assignment) is False
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
        assert cards[plain.template_uuid]["badges"] == [] and cards[plain.template_uuid]["mode"] == "open"
        assert cards[route_template.template_uuid]["badges"][0]["name"] == "Adaptability"
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


def test_a_locked_badge_route_used_by_template_permission_earns_no_badge_without_badge_authority():
    db, (route_template, _) = _market()
    with db:
        _list(db, route_template, "locked", "open")
        # Stranger has no authorization for the badge, only permission to use the plan.
        assert _request(db, route_template, STRANGER)["status"] == "approved"
        result = _assign(db, STRANGER, route_template.template_uuid)
        assert result["badge"] is None
        with pytest.raises(HTTPException):
            _assign(db, STRANGER, route_template.template_uuid, badge_uuid="badge_adapt")


def test_a_trusted_partners_only_route_runs_only_for_the_approved_partners():
    db, (direct, full) = _market()
    with db:
        route = db.exec(select(badge_routes.BadgeRoute).where(badge_routes.BadgeRoute.goal_template_id == direct.id)).one()
        listed = market.set_route_trust(db, _user(ADMIN), "badge_adapt", route.route_uuid, BadgeRouteTrustUpdate(trusted_only=True))
        direct_route = next(item for item in listed["routes"] if item["route_uuid"] == route.route_uuid)
        assert direct_route["trusted_only"] is True and direct_route["partners"] == []
        assert PARTNER not in {issuer["org"]["id"] for issuer in direct_route["issuers"]}

        # Partner is authorized for the badge, but not trusted on the direct route: the full route still works.
        with pytest.raises(HTTPException) as untrusted:
            _assign(db, PARTNER, direct.template_uuid)
        assert untrusted.value.status_code == 403
        with pytest.raises(HTTPException) as untrusted_start:
            start_badge_goal(db, _user(LEARNER), db.get(LearningBadge, 1), direct.template_uuid, PARTNER)
        assert untrusted_start.value.status_code == 403
        assert _assign(db, PARTNER, full.template_uuid)["badge"]["badge_uuid"] == "badge_adapt"
        # The owner always runs its own routes.
        assert _assign(db, 1, direct.template_uuid, badge_uuid="badge_adapt")["badge"]["badge_uuid"] == "badge_adapt"

        listed = market.set_route_trust(db, _user(ADMIN), "badge_adapt", route.route_uuid, BadgeRouteTrustUpdate(trusted_only=True, partner_org_ids=[PARTNER]))
        direct_route = next(item for item in listed["routes"] if item["route_uuid"] == route.route_uuid)
        assert [partner["name"] for partner in direct_route["partners"]] == ["Partner"]
        assert _assign(db, PARTNER, direct.template_uuid)["badge"]["badge_uuid"] == "badge_adapt"

        # Opening the route again drops the restriction.
        market.set_route_trust(db, _user(ADMIN), "badge_adapt", route.route_uuid, BadgeRouteTrustUpdate(trusted_only=False))
        assert badge_authority.may_run(db, db.get(LearningBadge, 1), PARTNER, db.get(badge_routes.BadgeRoute, route.id))
        with pytest.raises(HTTPException) as not_owner:
            market.set_route_trust(db, _user(STAFF), "badge_adapt", route.route_uuid, BadgeRouteTrustUpdate(trusted_only=True))
        assert not_owner.value.status_code == 403


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
