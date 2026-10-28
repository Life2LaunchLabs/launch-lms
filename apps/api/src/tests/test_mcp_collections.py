"""Connector tools for plan collections, listings and covers."""

import asyncio

import pytest
from fastapi import HTTPException

from src.db.plan_collections import PlanCollection, PlanCollectionItem
from src.db.template_marketplace import GoalTemplateListing
from src.services.goals import mcp_collections as tools
from src.services.goals import templates
from src.services.oauth.server import AccessContext
from src.tests.test_goal_assignment_versions import V1
from src.tests.test_goal_assignments_admin import _session as _admin_session
from src.tests.test_goals import ADMIN, _user


def _session():
    db = _admin_session()
    for model in (PlanCollection, PlanCollectionItem, GoalTemplateListing):
        model.__table__.create(db.get_bind(), checkfirst=True)
    return db


def call(db, handler, args=None, org_id=1):
    ctx = AccessContext(user=_user(ADMIN), org_id=org_id, scopes={"plans:read", "plans:write"}, client_id="lmc_test", client_name="Claude")
    return asyncio.run(handler(None, db, ctx, args or {}))


def _plan(db, title: str) -> str:
    return templates.create_template(db, _user(ADMIN), 1, {**V1, "template": {"title": title}})["template_uuid"]


def test_save_collection_creates_then_sets_the_whole_plan_list():
    db = _session()
    first, second, third = _plan(db, "Budget"), _plan(db, "Paycheck"), _plan(db, "Credit")
    made = call(db, tools.save_collection, {"name": "Financial literacy", "categories": ["Financial literacy"], "template_uuids": [first, second], "starter": True})
    assert made["template_uuids"] == [first, second] and made["starter"] is True and made["categories"] == ["Financial literacy"]
    changed = call(db, tools.save_collection, {"collection_uuid": made["collection_uuid"], "template_uuids": [second, third], "description": "Money basics"})
    assert changed["template_uuids"] == [second, third] and changed["description"] == "Money basics" and changed["name"] == "Financial literacy"
    listed = call(db, tools.list_collections)
    assert [item["collection_uuid"] for item in listed["collections"]] == [made["collection_uuid"]]
    assert "Financial literacy" in listed["categories"]


def test_save_collection_checks_its_input():
    db = _session()
    with pytest.raises(HTTPException):
        call(db, tools.save_collection, {"description": "no name"})
    with pytest.raises(HTTPException):
        call(db, tools.save_collection, {"name": "Too many", "categories": ["Wellbeing", "Life skills", "Portfolio", "Career exploration"]})


def test_cover_sets_an_image_and_goes_back_to_the_icon():
    db = _session()
    uuid = _plan(db, "Budget")
    cover = call(db, tools.set_plan_cover, {"template_uuid": uuid, "thumbnail_image": "/content/orgs/org_1/media/cover.jpg", "icon": "target"})
    assert cover["thumbnail_image"] == "/content/orgs/org_1/media/cover.jpg"
    assert call(db, tools.set_plan_cover, {"template_uuid": uuid, "thumbnail_image": ""})["thumbnail_image"] == ""
    with pytest.raises(Exception):
        call(db, tools.set_plan_cover, {"template_uuid": uuid, "thumbnail_image": "javascript:alert(1)"})
    with pytest.raises(HTTPException):
        call(db, tools.set_plan_cover, {"template_uuid": uuid})


def test_listing_needs_a_live_version_and_keeps_mode_and_access():
    db = _session()
    uuid = _plan(db, "Badge plan")
    with pytest.raises(HTTPException) as error:
        call(db, tools.set_plan_listing, {"template_uuid": uuid, "mode": "locked", "access": "open"})
    assert error.value.status_code == 422
    templates.publish(db, _user(ADMIN), 1, uuid, "First")
    listing = call(db, tools.set_plan_listing, {"template_uuid": uuid, "mode": "locked", "access": "open"})
    assert (listing["listed"], listing["mode"], listing["access"]) == (True, "locked", "open")
    assert call(db, tools.set_plan_listing, {"template_uuid": uuid, "listed": False})["listed"] is False
