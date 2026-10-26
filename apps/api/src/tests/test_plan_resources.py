"""A plan in the marketplace only hands other organizations resources in the Library (services/goals/plan_resources.py)."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel

from src.db.resources import Resource, ResourceChannel, ResourceChannelResource
from src.db.template_marketplace import TemplateListingUpdate
from src.services.goals import plan_resources, template_marketplace as market, templates
from src.tests.plan_world import PARTNER, _world
from src.tests.test_goals import ADMIN, NOW, _published, _user

EXPLORE = {"key": "look", "type": "explore", "title": "Look around", "config": {"suggestions": [{"resource_uuid": "resource_1", "title": "Our guide"}]},
           "materials": [{"kind": "resource", "resource_uuid": "resource_2", "title": "Our sheet", "url": "https://studio.example/sheet"}]}


def _resources(db) -> None:
    SQLModel.metadata.create_all(db.get_bind(), tables=[Resource.__table__, ResourceChannel.__table__, ResourceChannelResource.__table__])  # type: ignore[attr-defined]
    db.add(ResourceChannel(id=1, org_id=1, channel_uuid="channel_ours", name="Ours", creation_date=NOW, update_date=NOW))
    db.add(ResourceChannel(id=2, org_id=1, channel_uuid="channel_library", name="Shared", listed=True, creation_date=NOW, update_date=NOW))
    for resource_id, channel_id, title in ((1, 1, "Our guide"), (2, 1, "Our sheet"), (3, 2, "Library guide")):
        db.add(Resource(id=resource_id, org_id=1, resource_uuid=f"resource_{resource_id}", title=title, resource_type="guide",
                        external_url=f"https://example.com/{resource_id}", creation_date=NOW, update_date=NOW))
        db.add(ResourceChannelResource(channel_id=channel_id, resource_id=resource_id))
    db.commit()


def _listing(db, template) -> TemplateListingUpdate:
    return market.set_listing(db, _user(ADMIN), 1, template.template_uuid, TemplateListingUpdate(listed=True, mode="open", access="open"))


def test_listing_waits_until_each_private_resource_is_swapped_or_removed_for_other_orgs():
    db, _ = _world(plans=False)
    with db:
        _resources(db)
        template = _published(db, EXPLORE)
        listing = market.get_listing(db, _user(ADMIN), 1, template.template_uuid)
        assert [(item["resource_uuid"], item["fix"], item["channels"][0]["name"]) for item in listing["private_resources"]] == [("resource_1", None, "Ours"), ("resource_2", None, "Ours")]
        with pytest.raises(HTTPException) as blocked:
            _listing(db, template)
        assert blocked.value.status_code == 409 and "“Our guide”, “Our sheet”" in blocked.value.detail

        with pytest.raises(HTTPException):
            plan_resources.set_override(db, _user(ADMIN), 1, template.template_uuid, "resource_2", "swap", "resource_1")  # not in the Library
        plan_resources.set_override(db, _user(ADMIN), 1, template.template_uuid, "resource_1", "remove", None)
        fixed = plan_resources.set_override(db, _user(ADMIN), 1, template.template_uuid, "resource_2", "swap", "resource_3")
        assert [(item["fix"], (item["swap"] or {}).get("title")) for item in fixed["private_resources"]] == [("remove", None), ("swap", "Library guide")]
        assert _listing(db, template)["listed"] is True

        # Partner's copy gets the Library resource and loses the private one; Studio's plan keeps both.
        copied = market.copy_template(db, _user(ADMIN), PARTNER, template.template_uuid)
        step = copied["document"]["stages"][0]["steps"][0]
        assert step["config"]["suggestions"] == []
        assert [(item["resource_uuid"], item["title"], item["url"]) for item in step["materials"]] == [("resource_3", "Library guide", "https://example.com/3")]
        own = templates.published_version(db, template).document
        assert plan_resources.for_org(db, template, 1, own) is own


def test_a_listed_plan_cant_put_a_new_private_resource_live():
    db, _ = _world(plans=False)
    with db:
        _resources(db)
        template = _published(db, {"key": "read", "type": "task", "title": "Read"})
        _listing(db, template)
        document = templates.template_or_404(db, 1, template.template_uuid).document
        document["stages"][0]["steps"].append(EXPLORE)
        templates.save_template(db, _user(ADMIN), 1, template.template_uuid, document)
        # The draft's resources show on the listing so they can be settled before the release.
        assert [item["resource_uuid"] for item in market.get_listing(db, _user(ADMIN), 1, template.template_uuid)["private_resources"]] == ["resource_1", "resource_2"]
        with pytest.raises(HTTPException) as blocked:
            templates.publish(db, _user(ADMIN), 1, template.template_uuid, "Second")
        assert blocked.value.status_code == 409


def test_overrides_swap_once_and_drop_removed_items():
    document = {"a": [{"resource_uuid": "r1", "title": "One"}, {"resource_uuid": "r2", "title": "Two"}, {"resource_uuid": "r3"}], "b": {"resource_uuid": "r1", "url": "x"}}
    out = plan_resources.apply_overrides(document, {"r1": {"resource_uuid": "r3", "title": "Three", "url": "https://three"}, "r2": None})
    assert out == {"a": [{"resource_uuid": "r3", "title": "Three"}], "b": {"resource_uuid": "r3", "url": "https://three"}}
    assert document["a"][0]["resource_uuid"] == "r1"
    assert plan_resources.resource_uuids(document) == ["r1", "r2", "r3"]
