"""Plan collections group an organization's plans: a plan can be in many, and removing a collection keeps its plans."""

import pytest
from fastapi import HTTPException

from src.db.plan_collections import PlanCollection, PlanCollectionCreate, PlanCollectionItem, PlanCollectionUpdate
from src.services.goals import collections, templates
from src.tests.test_goal_assignment_versions import V1
from src.tests.test_goal_assignments_admin import _session as _admin_session
from src.tests.test_goals import ADMIN, LEARNER, _user


def _session():
    db = _admin_session()
    for model in (PlanCollection, PlanCollectionItem):
        model.__table__.create(db.get_bind(), checkfirst=True)
    return db


def _plan(db, title: str) -> str:
    return templates.create_template(db, _user(ADMIN), 1, {**V1, "template": {"title": title}})["template_uuid"]


def test_collections_group_plans_without_owning_them():
    with _session() as db:
        a, b = _plan(db, "Alpha"), _plan(db, "Beta")
        first = collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Portfolio", categories=["Portfolio"], template_uuids=[a, b]))
        second = collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Careers", template_uuids=[a]))
        assert (first["plan_count"], [thumb["title"] for thumb in first["thumbs"]]) == (2, ["Alpha", "Beta"])

        listed = templates.list_templates(db, _user(ADMIN), 1)
        assert {row["title"]: sorted(item["name"] for item in row["collections"]) for row in listed} == {"Alpha": ["Careers", "Portfolio"], "Beta": ["Portfolio"]}
        assert [item["name"] for item in templates.get_template(db, _user(ADMIN), 1, b)["collections"]] == ["Portfolio"]

        # Adding again is a no-op; removing a plan or the whole collection leaves the plans.
        assert collections.add_plans(db, _user(ADMIN), 1, second["collection_uuid"], [a, b])["template_uuids"] == [a, b]
        assert collections.remove_plan(db, _user(ADMIN), 1, second["collection_uuid"], a)["template_uuids"] == [b]
        collections.delete_collection(db, _user(ADMIN), 1, first["collection_uuid"])
        assert len(templates.list_templates(db, _user(ADMIN), 1)) == 2
        assert [row["name"] for row in collections.list_collections(db, _user(ADMIN), 1)["collections"]] == ["Careers"]


def test_most_recently_opened_comes_first_and_categories_are_checked():
    with _session() as db:
        old = collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Old"))
        collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="New"))
        collections.opened(db, _user(ADMIN), 1, old["collection_uuid"])
        assert [row["name"] for row in collections.list_collections(db, _user(ADMIN), 1)["collections"]] == ["Old", "New"]

        for bad in (["Astrology"], ["Portfolio", "Wellbeing", "Life skills", "Financial literacy"]):
            with pytest.raises(HTTPException) as refused:
                collections.update_collection(db, _user(ADMIN), 1, old["collection_uuid"], PlanCollectionUpdate(categories=bad))
            assert refused.value.status_code == 422
        assert collections.update_collection(db, _user(ADMIN), 1, old["collection_uuid"], PlanCollectionUpdate(categories=["Wellbeing", "Wellbeing"]))["categories"] == ["Wellbeing"]


def test_learners_cant_make_collections():
    with _session() as db:
        with pytest.raises(HTTPException) as refused:
            collections.create_collection(db, _user(LEARNER), 1, PlanCollectionCreate(name="Mine"))
        assert refused.value.status_code == 403
