"""Discover: listed plans and collections, adding them (copied when editable), and asking for them."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.plan_collections import PlanCollection, PlanCollectionCreate, PlanCollectionItem
from src.db.template_marketplace import TemplateListingUpdate
from src.db.users import User
from src.services.goals import collections, discover, template_marketplace as market, templates
from src.tests.plan_world import PARTNER, STEPS
from src.tests.test_goals import ADMIN, NOW, _published, _user
from src.tests.test_template_marketplace import _market


NEWCOMER = 20


def _world():
    db, _ = _market()
    for model in (PlanCollection, PlanCollectionItem):
        model.__table__.create(db.get_bind(), checkfirst=True)
    return db


def _shared(db, title: str, mode: str = "open", access: str = "open"):
    template = _published(db, *STEPS)
    template.title = title
    db.add(template)
    db.commit()
    market.set_listing(db, _user(ADMIN), 1, template.template_uuid, TemplateListingUpdate(listed=True, mode=mode, access=access))
    return template


def _status(db, uuid: str) -> str:
    return next(plan for plan in discover.discover(db, _user(ADMIN), PARTNER)["plans"] if plan["template_uuid"] == uuid)["status"]


def test_a_collection_with_two_shared_plans_is_in_discover_and_adding_it_copies_editable_plans():
    db = _world()
    with db:
        first, second, private = _shared(db, "Resume"), _shared(db, "Interview"), _published(db, *STEPS)
        collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(
            name="Job ready", categories=["Career exploration"], template_uuids=[first.template_uuid, second.template_uuid, private.template_uuid]))

        page = discover.discover(db, _user(ADMIN), PARTNER)
        [shared] = page["collections"]
        # Only the shared plans show, and they carry the collection's categories.
        assert (shared["name"], shared["template_uuids"]) == ("Job ready", [first.template_uuid, second.template_uuid])
        assert {plan["template_uuid"]: plan["categories"] for plan in page["plans"]} == {first.template_uuid: ["Career exploration"], second.template_uuid: ["Career exploration"]}
        assert page["featured"]["collection_uuid"] == shared["collection_uuid"]  # the owner organization is a partner
        assert discover.discover(db, _user(ADMIN), PARTNER, "interview")["plans"][0]["template_uuid"] == second.template_uuid

        added = discover.add_collection(db, _user(ADMIN), PARTNER, shared["collection_uuid"])
        assert added["status"] == "added"
        local = collections.get_collection(db, _user(ADMIN), PARTNER, added["local_collection_uuid"])
        assert local["name"] == "Job ready" and len(local["template_uuids"]) == 2
        # Each plan is the partner's own copy, live and ready to assign.
        for uuid in local["template_uuids"]:
            copy = templates.template_or_404(db, PARTNER, uuid)
            assert copy.published_version_id is not None and copy.draft is None
            templates.issuable_version(db, copy)
        assert {_status(db, first.template_uuid), _status(db, second.template_uuid)} == {"added"}
        # Adding again keeps the same copies and collection.
        again = discover.add_collection(db, _user(ADMIN), PARTNER, shared["collection_uuid"])
        assert again["local_collection_uuid"] == added["local_collection_uuid"]
        assert collections.get_collection(db, _user(ADMIN), PARTNER, added["local_collection_uuid"])["template_uuids"] == local["template_uuids"]


def test_a_plan_by_request_shows_as_requested_until_approved_then_arrives_as_a_copy():
    db = _world()
    with db:
        plan = _shared(db, "Portfolio", access="request")
        mine = collections.create_collection(db, _user(ADMIN), PARTNER, PlanCollectionCreate(name="Fall"))
        assert discover.add_plan(db, _user(ADMIN), PARTNER, plan.template_uuid)["status"] == "requested"
        [waiting] = discover.added_plans(db, _user(ADMIN), PARTNER)
        assert (waiting["template_uuid"], waiting["requested"]) == (plan.template_uuid, True)
        # A requested plan can sit in a collection; once approved, the collection holds the copy.
        collections.add_plans(db, _user(ADMIN), PARTNER, mine["collection_uuid"], [plan.template_uuid])
        [request] = market.list_authorizations(db, _user(ADMIN), 1, "creator")
        market.decide(db, _user(ADMIN), request["authorization_uuid"], True)
        assert _status(db, plan.template_uuid) == "added"
        assert discover.added_plans(db, _user(ADMIN), PARTNER) == []
        [held] = collections.get_collection(db, _user(ADMIN), PARTNER, mine["collection_uuid"])["template_uuids"]
        assert templates.template_or_404(db, PARTNER, held).source_template_uuid == plan.template_uuid


def test_a_request_can_be_canceled_and_a_locked_plan_is_run_as_is():
    db = _world()
    with db:
        asked = _shared(db, "Badge route", mode="locked", access="request")
        discover.add_plan(db, _user(ADMIN), PARTNER, asked.template_uuid)
        assert discover.cancel_request(db, _user(ADMIN), PARTNER, asked.template_uuid)["status"] == "none"
        with pytest.raises(HTTPException) as nothing:
            discover.cancel_request(db, _user(ADMIN), PARTNER, asked.template_uuid)
        assert nothing.value.status_code == 422

        locked = _shared(db, "Run as-is", mode="locked")
        result = discover.add_plan(db, _user(ADMIN), PARTNER, locked.template_uuid)
        assert (result["status"], result["local_template_uuid"]) == ("added", locked.template_uuid)
        [running] = discover.added_plans(db, _user(ADMIN), PARTNER)
        assert (running["template_uuid"], running["requested"]) == (locked.template_uuid, False)
        # Your own plans aren't added from Discover.
        with pytest.raises(HTTPException) as own:
            discover.add_plan(db, _user(ADMIN), 1, locked.template_uuid)
        assert own.value.status_code == 422


def test_start_suggests_open_plans_for_a_role_and_sets_up_a_space_once():
    import asyncio

    from src.db.organization_config import OrganizationConfig
    from src.services.orgs import onboarding

    db = _world()
    OrganizationConfig.__table__.create(db.get_bind(), checkfirst=True)
    db.add(User(id=NEWCOMER, user_uuid="user_20", username="dana", email="dana@example.com", first_name="", last_name="", creation_date=NOW, update_date=NOW))
    db.commit()
    with db:
        money, careers = _shared(db, "Money basics"), _shared(db, "Careers")
        _shared(db, "Ask first", access="request")
        collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Money", categories=["Financial literacy"], template_uuids=[money.template_uuid]))
        collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Work", categories=["Career exploration"], template_uuids=[careers.template_uuid]))
        # A parent sees money first; plans by request aren't suggested.
        assert [plan["title"] for plan in onboarding.suggested(db, "parent")] == ["Money basics", "Careers"]
        with pytest.raises(HTTPException):
            onboarding.suggested(db, "astronaut")

        payload = onboarding.SetUpRequest(role="parent", name="Dana Ruiz", color="#2F66D6", plan_uuids=[money.template_uuid])
        first = asyncio.run(onboarding.set_up(None, db, _user(NEWCOMER), payload))
        assert first["org"]["name"] == "Dana’s space" and [item["status"] for item in first["added"]] == ["added"]
        config = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == first["org"]["id"])).one().config
        assert (config["setup"]["role"], config["setup"]["solo"], config["customization"]["general"]["color"]) == ("parent", True, "#2F66D6")
        # Again (a refresh): the same space, nothing new made.
        again = asyncio.run(onboarding.set_up(None, db, _user(NEWCOMER), payload))
        assert again["org"]["id"] == first["org"]["id"]
        assert len(templates.list_templates(db, _user(NEWCOMER), first["org"]["id"])) == 1


def test_covers_lists_only_plans_counting_toward_those_requirements_most_first():
    from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode

    db = _world()
    for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode):
        model.__table__.create(db.get_bind(), checkfirst=True)
    with db:
        one, both, neither = _shared(db, "One"), _shared(db, "Both"), _shared(db, "Neither")
        for template, nodes in ((one, ["gap_a"]), (both, ["gap_a", "gap_b"])):
            live = templates.published_version(db, template)
            document = {**live.document, "stages": [{**stage, "steps": [{**step, "requirement_node_uuids": nodes} for step in stage["steps"]]} for stage in live.document["stages"]]}
            live.document = document
            db.add(live)
        db.commit()
        page = discover.discover(db, _user(ADMIN), PARTNER, covers=["gap_a", "gap_b"])
        assert [(plan["template_uuid"], plan["covers"]) for plan in page["plans"]] == [(both.template_uuid, ["gap_a", "gap_b"]), (one.template_uuid, ["gap_a"])]
        assert page["collections"] == [] and neither.template_uuid not in {plan["template_uuid"] for plan in page["plans"]}
