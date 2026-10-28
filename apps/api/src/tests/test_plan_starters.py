"""Starter plans: the platform's starter collections fill every organization's New plan picker, and starting one copies it."""

import pytest
from fastapi import HTTPException

from src.db.goal_templates import TemplateCover
from src.db.plan_collections import PlanCollectionCreate, PlanCollectionUpdate
from src.services.goals import collections, starters, templates
from src.tests.test_discover import _world
from src.tests.plan_world import PARTNER, STEPS
from src.tests.test_goals import ADMIN, _published, _user


def test_starter_collections_are_categories_and_using_one_copies_its_live_version():
    db = _world()
    with db:
        live, unpublished = _published(db, *STEPS), templates.template_or_404(db, 1, templates.create_template(db, _user(ADMIN), 1, title="Not yet")["template_uuid"])
        careers = collections.create_collection(db, _user(ADMIN), 1, PlanCollectionCreate(name="Career exploration", template_uuids=[live.template_uuid, unpublished.template_uuid]))
        assert starters.list_starters(db, _user(ADMIN), PARTNER) == {"categories": [], "starters": []}

        collections.update_collection(db, _user(ADMIN), 1, careers["collection_uuid"], PlanCollectionUpdate(starter=True))
        page = starters.list_starters(db, _user(ADMIN), PARTNER)
        # Only live plans are starters, each with a peek at its first steps.
        assert page["categories"] == [{"collection_uuid": careers["collection_uuid"], "name": "Career exploration", "count": 1}]
        [card] = page["starters"]
        assert (card["template_uuid"], card["categories"], card["step_count"]) == (live.template_uuid, [careers["collection_uuid"]], len(STEPS))
        assert [step["type"] for step in card["preview"]] == [step["type"] for step in STEPS[:3]]

        made = starters.use_starter(db, _user(ADMIN), PARTNER, live.template_uuid)
        copy = templates.template_or_404(db, PARTNER, made["template_uuid"])
        assert (copy.title, copy.published_version_id, made["draft"]["semver"]) == (live.title, None, "1.0.0")
        with pytest.raises(HTTPException) as missing:
            starters.use_starter(db, _user(ADMIN), PARTNER, unpublished.template_uuid)
        assert missing.value.status_code == 404


def test_only_the_platform_marks_starters_and_covers_are_editable():
    db = _world()
    with db:
        theirs = collections.create_collection(db, _user(ADMIN), PARTNER, PlanCollectionCreate(name="Ours"))
        with pytest.raises(HTTPException) as refused:
            collections.update_collection(db, _user(ADMIN), PARTNER, theirs["collection_uuid"], PlanCollectionUpdate(starter=True))
        assert refused.value.status_code == 403

        made = templates.create_template(db, _user(ADMIN), 1, title="Colorful", color="pink")
        assert (made["icon"], made["color"]) == ("target", "pink")
        assert templates.set_cover(db, _user(ADMIN), 1, made["template_uuid"], TemplateCover(icon="rocket")) == {"thumbnail_image": "", "icon": "rocket", "color": "pink"}
