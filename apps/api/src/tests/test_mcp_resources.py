"""Connector resources: add, file in channels, tag, list and change resources and channels through the MCP server."""

import pytest
from sqlmodel import select

from src.db.resource_library import OrgSavedChannel, OrgSavedResource
from src.db.resources import (
    Resource, ResourceChannel, ResourceChannelResource, ResourceComment, ResourceTag, ResourceTagLink,
    UserResourceChannel, UserSavedResource, UserSavedResourceChannel,
)
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.services import resources as resource_service
from src.tests.test_mcp import _token
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)


@pytest.fixture
def resources_mcp(mcp, monkeypatch):  # noqa: F811
    client, session, rpc, base_call, alice = mcp
    bind = session.get_bind()
    for model in (ResourceChannel, Resource, ResourceChannelResource, ResourceTag, ResourceTagLink, UserSavedResource, ResourceComment,
                  UserResourceChannel, UserSavedResourceChannel,
                  OrgSavedChannel, OrgSavedResource, UserGroupResource, UserGroupUser):
        model.__table__.create(bind, checkfirst=True)
    monkeypatch.setattr(resource_service, "refresh_resource_search_document", lambda *args, **kwargs: None)
    monkeypatch.setattr(resource_service, "enrich_resource_metadata", lambda url: {"provider_name": "Example", "provider_url": "https://example.com", "cover_image_url": "https://example.com/og.png"})
    token = _token(session, alice.id, 1, scope="resources:read resources:write")

    def call(name, arguments=None, auth=token):
        return base_call(name, arguments, auth=auth)

    return session, rpc, call, alice


def test_tools_are_listed_with_scopes_and_hints(resources_mcp):
    _, rpc, _, _ = resources_mcp
    tools = {tool["name"]: tool for tool in rpc("tools/list").json()["result"]["tools"]}
    assert tools["list_resources"]["annotations"]["readOnlyHint"] is True
    assert tools["save_resource"]["annotations"]["readOnlyHint"] is False and tools["save_resource"]["annotations"]["destructiveHint"] is False


def test_add_a_resource_into_a_channel_then_change_and_unfile_it(resources_mcp):
    session, _, call, _ = resources_mcp
    channel = call("save_resource_channel", {"name": "Careers", "description": "Find work you like", "color": "#2563eb"})
    assert not channel.get("isError"), channel
    channel = channel["structuredContent"]
    assert channel["created"] is True and channel["audience"] == "org" and channel["own"] is True

    added = call("save_resource", {"title": "Career quiz", "external_url": "https://example.com/quiz", "resource_type": "assessment",
                                   "estimated_time": 15, "tags": ["careers", "Quiz"], "channel_uuids": [channel["channel_uuid"]]})
    assert not added.get("isError"), added
    resource = added["structuredContent"]
    assert resource["created"] is True and resource["provider_name"] == "Example" and resource["cover_image_url"] == "https://example.com/og.png"
    assert sorted(resource["tags"]) == ["Quiz", "careers"] and [c["name"] for c in resource["channels"]] == ["Careers"]
    assert "warning" not in resource and resource["discover_url"].endswith("/discover?r=" + resource["resource_uuid"].removeprefix("resource_"))

    listed = call("list_resources", {"resource_types": ["assessment"]})["structuredContent"]["resources"]
    assert [item["title"] for item in listed] == ["Career quiz"]
    assert call("list_resource_channels")["structuredContent"]["channels"][0]["resource_count"] == 1

    second = call("save_resource_channel", {"name": "Money"})["structuredContent"]
    changed = call("save_resource", {"resource_uuid": resource["resource_uuid"], "title": "Career interest quiz", "tags": ["careers"],
                                     "channel_uuids": [second["channel_uuid"]]})["structuredContent"]
    assert changed["title"] == "Career interest quiz" and changed["tags"] == ["careers"] and [c["name"] for c in changed["channels"]] == ["Money"]
    assert changed["resource_type"] == "assessment" and changed["estimated_time"] == 15  # untouched fields stay

    unfiled = call("save_resource", {"resource_uuid": resource["resource_uuid"], "channel_uuids": []})["structuredContent"]
    assert unfiled["channels"] == [] and "staff" in unfiled["warning"]
    assert call("get_resource", {"resource_uuid": resource["resource_uuid"]})["structuredContent"]["title"] == "Career interest quiz"
    assert call("list_resource_channels")["structuredContent"]["channels"][1]["resource_count"] == 0


def test_bad_input_saves_nothing(resources_mcp):
    session, _, call, _ = resources_mcp
    missing = call("save_resource", {"title": "No link"})
    assert missing["isError"] and "external_url" in missing["content"][0]["text"]
    wrong_type = call("save_resource", {"title": "X", "external_url": "https://example.com", "resource_type": "podcast"})
    assert wrong_type["isError"] and "resource_type" in wrong_type["content"][0]["text"]
    wrong_channel = call("save_resource", {"title": "X", "external_url": "https://example.com", "channel_uuids": ["channel_nope"]})
    assert wrong_channel["isError"] and "channel_nope" in wrong_channel["content"][0]["text"]
    assert session.exec(select(Resource)).all() == []
    assert call("save_resource_channel", {"description": "no name"})["isError"]


def test_scopes_and_organization_are_enforced(resources_mcp):
    session, _, call, alice = resources_mcp
    read_only = _token(session, alice.id, 1, scope="resources:read")
    assert "resources:write" in call("save_resource", {"title": "X", "external_url": "https://example.com"}, auth=read_only)["content"][0]["text"]
    plans_only = _token(session, alice.id, 1, scope="plans:read plans:write")
    assert "resources:read" in call("list_resources", {}, auth=plans_only)["content"][0]["text"]

    session.add(Resource(org_id=2, resource_uuid="resource_other", title="Theirs", external_url="https://example.com", creation_date="", update_date=""))
    session.commit()
    assert call("save_resource", {"resource_uuid": "resource_other", "title": "Mine now"})["isError"]
    assert call("get_resource", {"resource_uuid": "resource_other"})["isError"]
    assert session.exec(select(Resource).where(Resource.resource_uuid == "resource_other")).one().title == "Theirs"
