"""Resources: who sees a channel, any staff adds resources, the Library is for resource partners,
org saves, and comment rules with held links, reports and moderation (services/resources.py)."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.goals import GoalTemplate
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.resources import (
    OrgSavedChannel,
    OrgSavedResource,
    Resource,
    ResourceChannel,
    ResourceChannelCreate,
    ResourceChannelResource,
    ResourceChannelUpdate,
    ResourceComment,
    ResourceCommentCreate,
    ResourceCommentReport,
    ResourceTag,
    ResourceTagLink,
    UserSavedResource,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.services import resources as service

NOW = "2026-01-01T00:00:00+00:00"
HUB, PARTNER, PLAIN = 1, 2, 3
# Partner staff and learner; Plain staff, learner, and a learner in Plain's group.
P_STAFF, P_LEARNER, STAFF, LEARNER, GROUPIE = 21, 22, 31, 32, 33


def _user(user_id: int) -> PublicUser:
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com", first_name="U", last_name=str(user_id))


def _world() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[model.__table__ for model in (
        Organization, OrganizationConfig, User, UserOrganization, UserGroupUser, UserGroupResource, GoalTemplate,
        Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink, UserSavedResource,
        ResourceComment, ResourceCommentReport, OrgSavedChannel, OrgSavedResource,
    )])
    db = Session(engine)
    for org_id, slug, partners in ((HUB, "hub", []), (PARTNER, "partner", ["resource_partner"]), (PLAIN, "plain", [])):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=slug.capitalize(), slug=slug, email=f"{slug}@example.com", creation_date=NOW, update_date=NOW))
        db.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": "free", "partners": partners}, creation_date=NOW, update_date=NOW))
    for user_id, org_id, role_id in ((P_STAFF, PARTNER, 2), (P_LEARNER, PARTNER, 4), (STAFF, PLAIN, 2), (LEARNER, PLAIN, 4), (GROUPIE, PLAIN, 4)):
        db.add(User(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com", first_name="U", last_name=str(user_id), creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW, update_date=NOW))
    db.add(UserGroupUser(usergroup_id=9, user_id=GROUPIE, org_id=PLAIN, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _channel(db: Session, channel_id: int, org_id: int, *, audience="org", listed=False, comment_rule="all", hold_links=True) -> ResourceChannel:
    channel = ResourceChannel(id=channel_id, org_id=org_id, channel_uuid=f"channel_{channel_id}", name=f"Channel {channel_id}",
                              audience=audience, listed=listed, comment_rule=comment_rule, hold_links=hold_links, creation_date=NOW, update_date=NOW)
    db.add(channel)
    db.commit()
    return channel


def _resource(db: Session, resource_id: int, org_id: int, *channel_ids: int) -> Resource:
    resource = Resource(id=resource_id, org_id=org_id, resource_uuid=f"resource_{resource_id}", title=f"Resource {resource_id}",
                        resource_type="guide", external_url=f"https://example.com/{resource_id}", creation_date=NOW, update_date=NOW)
    db.add(resource)
    for channel_id in channel_ids:
        db.add(ResourceChannelResource(channel_id=channel_id, resource_id=resource_id))
    db.commit()
    return resource


def test_audience_decides_who_sees_a_channel():
    with _world() as db:
        everyone, groups, staff_only = _channel(db, 1, PLAIN), _channel(db, 2, PLAIN, audience="groups"), _channel(db, 3, PLAIN, audience="staff")
        db.add(UserGroupResource(usergroup_id=9, resource_uuid=groups.channel_uuid, org_id=PLAIN, creation_date=NOW, update_date=NOW))
        db.commit()
        seen = lambda user_id: {c.id for c in (everyone, groups, staff_only) if service._channel_is_accessible(c, db, _user(user_id))}  # noqa: E731
        assert seen(STAFF) == {1, 2, 3}
        assert seen(LEARNER) == {1}
        assert seen(GROUPIE) == {1, 2}
        # Another org's people see none of them until one is in the Library.
        assert seen(P_STAFF) == set()
        staff_only.listed = True
        assert seen(P_LEARNER) == {3}


@pytest.mark.asyncio
async def test_any_staff_adds_channels_but_only_partners_list_them():
    with _world() as db:
        created = await service.create_channel(None, PLAIN, ResourceChannelCreate(name="Jobs"), _user(STAFF), db)
        assert created["audience"] == "org" and created["listed"] is False
        with pytest.raises(HTTPException):
            await service.create_channel(None, PLAIN, ResourceChannelCreate(name="Mine"), _user(LEARNER), db)
        with pytest.raises(HTTPException) as refused:
            await service.update_channel(None, created["channel_uuid"], ResourceChannelUpdate(listed=True), _user(STAFF), db)
        assert refused.value.status_code == 403

        partner = await service.create_channel(None, PARTNER, ResourceChannelCreate(name="Careers"), _user(P_STAFF), db)
        listed = await service.update_channel(None, partner["channel_uuid"], ResourceChannelUpdate(listed=True, audience="staff"), _user(P_STAFF), db)
        assert listed["listed"] is True and listed["listed_at"]


@pytest.mark.asyncio
async def test_an_org_saves_library_channels_and_resources_into_its_resources():
    with _world() as db:
        _channel(db, 1, PLAIN)
        _channel(db, 2, PARTNER, listed=True)
        _channel(db, 3, PARTNER)
        _resource(db, 10, PLAIN, 1)
        _resource(db, 20, PARTNER, 2)
        _resource(db, 21, PARTNER, 2)
        _resource(db, 30, PARTNER, 3)

        found = await service.library(None, PLAIN, _user(STAFF), db)
        assert [card["channel_uuid"] for card in found["channels"]] == ["channel_2"]
        assert {row["resource_uuid"] for row in found["resources"]} == {"resource_20", "resource_21"}

        # Not in the Library, or already theirs: no save.
        for channel_uuid in ("channel_3", "channel_1"):
            with pytest.raises(HTTPException):
                await service.save_channel_for_org(None, PLAIN, channel_uuid, _user(STAFF), db)
        with pytest.raises(HTTPException):
            await service.save_channel_for_org(None, PLAIN, "channel_2", _user(LEARNER), db)

        saved = await service.save_channel_for_org(None, PLAIN, "channel_2", _user(STAFF), db)
        assert saved["saved"] is True and saved["save_count"] == 1
        workspace = await service.org_workspace(None, PLAIN, _user(STAFF), db)
        assert [card["channel_uuid"] for card in workspace["channels"]] == ["channel_1", "channel_2"]
        assert {row["resource_uuid"] for row in workspace["resources"]} == {"resource_10", "resource_20", "resource_21"}
        assert workspace["can_list"] is False

        # The org's learners see the saved channel in their list too.
        learner_view = await service.list_resources(None, PLAIN, _user(LEARNER), db)
        assert {row["resource_uuid"] for row in learner_view} == {"resource_10", "resource_20", "resource_21"}

        # Saving one resource keeps it after the channel is unsaved; unlisting drops it from Plain's resources.
        await service.save_resource_for_org(None, PLAIN, "resource_20", _user(STAFF), db)
        await service.unsave_channel_for_org(None, PLAIN, "channel_2", _user(STAFF), db)
        workspace = await service.org_workspace(None, PLAIN, _user(STAFF), db)
        assert {row["resource_uuid"] for row in workspace["resources"]} == {"resource_10", "resource_20"}
        db.get(ResourceChannel, 2).listed = False
        db.commit()
        workspace = await service.org_workspace(None, PLAIN, _user(STAFF), db)
        assert {row["resource_uuid"] for row in workspace["resources"]} == {"resource_10"}


@pytest.mark.asyncio
async def test_learners_cannot_ask_for_private_resources():
    with _world() as db:
        _channel(db, 1, PLAIN, audience="staff")
        _resource(db, 10, PLAIN, 1)
        _resource(db, 11, PLAIN)
        assert await service.list_resources(None, PLAIN, _user(LEARNER), db, include_private=True) == []
        staff_view = await service.list_resources(None, PLAIN, _user(STAFF), db, include_private=True)
        assert {row["resource_uuid"] for row in staff_view} == {"resource_10", "resource_11"}


@pytest.mark.asyncio
async def test_comment_rules_held_links_reports_and_moderation():
    with _world() as db:
        _channel(db, 1, PARTNER, listed=True)
        _channel(db, 2, PARTNER, listed=True, comment_rule="staff")
        _channel(db, 3, PARTNER, listed=True, comment_rule="off")
        _resource(db, 10, PARTNER, 1)
        _resource(db, 20, PARTNER, 2)
        _resource(db, 30, PARTNER, 3)
        post = lambda user_id, resource_id, text: service.create_comment(None, f"resource_{resource_id}", ResourceCommentCreate(content=text), _user(user_id), db)  # noqa: E731

        with pytest.raises(HTTPException):
            await post(LEARNER, 30, "Hello")
        with pytest.raises(HTTPException):
            await post(LEARNER, 20, "Hello")
        assert (await post(STAFF, 20, "Staff from another org can comment"))["status"] == "live"
        assert (await post(P_STAFF, 30, "The owner's staff always can"))["status"] == "live"

        plain = await post(LEARNER, 10, "Great guide")
        held = await post(LEARNER, 10, "See www.example.com for more")
        assert (plain["status"], held["status"]) == ("live", "held")
        # Others don't see the held comment; its author and the owner's staff do.
        assert [c["comment_uuid"] for c in await service.list_comments(None, "resource_10", _user(GROUPIE), db)] == [plain["comment_uuid"]]
        assert len(await service.list_comments(None, "resource_10", _user(LEARNER), db)) == 2

        await service.report_comment(None, plain["comment_uuid"], _user(GROUPIE), db)
        await service.report_comment(None, plain["comment_uuid"], _user(GROUPIE), db)
        queue = await service.list_channel_comments(None, "channel_1", _user(P_STAFF), db)
        assert {c["comment_uuid"] for c in queue["needs_look"]} == {plain["comment_uuid"], held["comment_uuid"]}
        assert next(c for c in queue["needs_look"] if c["comment_uuid"] == plain["comment_uuid"])["report_count"] == 1
        with pytest.raises(HTTPException):
            await service.list_channel_comments(None, "channel_1", _user(STAFF), db)
        with pytest.raises(HTTPException):
            await service.moderate_comment(None, held["comment_uuid"], "approve", _user(STAFF), db)

        await service.moderate_comment(None, held["comment_uuid"], "approve", _user(P_STAFF), db)
        await service.moderate_comment(None, plain["comment_uuid"], "hide", _user(P_STAFF), db)
        queue = await service.list_channel_comments(None, "channel_1", _user(P_STAFF), db)
        assert queue["needs_look"] == []
        assert [c["comment_uuid"] for c in await service.list_comments(None, "resource_10", _user(GROUPIE), db)] == [held["comment_uuid"]]


@pytest.mark.asyncio
async def test_resource_detail_lists_the_plans_that_use_it():
    with _world() as db:
        _channel(db, 1, PLAIN)
        _resource(db, 10, PLAIN, 1)
        document = {"stages": [{"steps": [
            {"key": "a", "title": "Explore careers", "type": "explore", "suggestions": [{"resource_uuid": "resource_10"}]},
            {"key": "b", "title": "Reflect", "type": "task"},
        ]}]}
        db.add(GoalTemplate(id=1, org_id=PLAIN, template_uuid="template_1", title="Career plan", document=document, creation_date=NOW, update_date=NOW))
        db.commit()
        detail = await service.resource_detail(None, PLAIN, "resource_10", _user(STAFF), db)
        assert detail["used_in"][0]["template_uuid"] == "template_1" and detail["used_in"][0]["steps"] == ["Explore careers"]
        assert detail["can_edit"] is True
