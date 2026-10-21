"""The connector's plan template tools, called through the MCP server: they read and write goal templates."""

import json
from copy import deepcopy

import pytest
from sqlmodel import select

from src.db.goals import GoalTemplate
from src.services.goals import templates as goal_templates
from src.tests.test_mcp import _token
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)


@pytest.fixture
def templates(mcp):  # noqa: F811
    client, session, rpc, base_call, alice = mcp
    token = _token(session, alice.id, 1, scope="activities:read plans:read plans:write")

    def call(name, arguments=None, auth=token):
        return base_call(name, arguments, auth=auth)

    created = goal_templates.create_template(session, alice, 1, {
        "template": {"title": "Career Ready", "description": "Get ready"},
        "stages": [{"key": "explore", "title": "Explore", "duration_weeks": 4, "steps": [
            {"key": "resume", "type": "upload", "title": "Draft a resume", "config": {"slots": [{"key": "resume", "label": "Resume", "kinds": ["document"]}]}},
            {"key": "interview", "type": "task", "title": "Mock interview", "due_week": 3},
        ]}],
    })
    return session, call, alice, created["template_uuid"], rpc


def test_tools_are_listed_with_their_scopes(templates):
    _, call, _, uuid, rpc = templates
    listed = [item for item in call("list_plan_templates", {"query": "career"})["structuredContent"]["templates"] if item["template_uuid"] == uuid]
    assert [(item["title"], item["stage_count"], item["step_count"]) for item in listed] == [("Career Ready", 1, 2)]
    assert listed[0]["editor_url"].endswith(f"/admin/plans/{uuid}")
    schema = call("get_plan_template_schema")["structuredContent"]
    assert schema["format_version"] == "launch-lms.goal-template/1" and "TemplateStep" in schema["schema"]["$defs"]
    tools = {tool["name"]: tool for tool in rpc("tools/list").json()["result"]["tools"]}
    requirements = tools["set_objective_requirements"]["inputSchema"]
    assert requirements["required"] == ["template_uuid", "node_uuids"] and {"step_key", "objective_uuid"} <= set(requirements["properties"])
    assert "launch-lms.goal-template" in tools["save_plan_template"]["inputSchema"]["properties"]["document"]["description"]


def test_read_edit_and_save_round_trip(templates):
    session, call, _, uuid, _ = templates
    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    document = current["document"]
    assert [step["title"] for step in document["stages"][0]["steps"]] == ["Draft a resume", "Mock interview"]

    unchanged = call("save_plan_template", {"template_uuid": uuid, "document": document, "base_etag": current["etag"]})
    assert unchanged["structuredContent"]["changed"] is False and "No changes to plan template" in unchanged["content"][0]["text"]

    edited = deepcopy(document)
    edited["stages"].insert(0, {"title": "Launch", "steps": [{"type": "write", "title": "Set a goal", "config": {"prompt": "What next?"}}]})
    assert call("validate_plan_template", {"template_uuid": uuid, "document": edited})["structuredContent"] == {"valid": True, "errors": [], "warnings": []}
    saved = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
    assert "isError" not in saved and 'Saved plan template "Career Ready" (2 stages, 3 steps)' in saved["content"][0]["text"]
    assert session.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == uuid)).one().document["stages"][0]["title"] == "Launch"

    stale = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
    detail = json.loads(stale["content"][0]["text"])
    assert stale["isError"] is True and detail["status"] == 409 and detail["current"]["etag"] == saved["structuredContent"]["etag"]


def test_template_scopes_and_org_are_enforced(templates):
    session, call, alice, uuid, _ = templates
    activities_only = _token(session, alice.id, 1, scope="activities:read")
    blocked = call("get_plan_template", {"template_uuid": uuid}, auth=activities_only)
    assert blocked["isError"] is True and "plans:read" in blocked["content"][0]["text"]
    read_only = _token(session, alice.id, 1, scope="plans:read")
    assert "plans:write" in call("create_plan_template", {"document": {}}, auth=read_only)["content"][0]["text"]
    other = _token(session, alice.id, 2, scope="plans:read plans:write")
    assert call("get_plan_template", {"template_uuid": uuid}, auth=other)["isError"] is True


def test_steps_link_to_requirements_by_step_key(templates):
    _, call, _, uuid, _ = templates
    linked = call("set_objective_requirements", {"template_uuid": uuid, "step_key": "resume", "node_uuids": []})
    assert "isError" not in linked and linked["structuredContent"]["step_key"] == "resume"
    legacy = call("set_objective_requirements", {"template_uuid": uuid, "objective_uuid": "interview", "node_uuids": []})
    assert legacy["structuredContent"]["step_key"] == "interview"
    assert call("set_objective_requirements", {"template_uuid": uuid, "step_key": "nope", "node_uuids": []})["isError"] is True


def test_activity_steps_are_added_in_the_template_and_edited_with_activity_tools(templates):
    session, call, alice, uuid, _ = templates
    from src.db.learning import LearningActivity, LearningPage

    token = _token(session, alice.id, 1, scope="activities:read activities:write plans:read plans:write")
    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    edited = deepcopy(current["document"])
    edited["stages"][0]["steps"].append({"type": "activity", "title": "Spot the change"})
    saved = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})["structuredContent"]["document"]
    activity_uuid = saved["stages"][0]["steps"][-1]["config"]["activity_uuid"]

    listed = call("list_activities", {"template_uuid": uuid})["structuredContent"]["activities"]
    assert [(item["activity_uuid"], item["page_count"]) for item in listed] == [(activity_uuid, 0)]
    assert f"/admin/plans/{uuid}/activity/" in listed[0]["editor_url"]
    activity = call("get_activity", {"activity_uuid": activity_uuid})["structuredContent"]
    assert activity["context"]["template_uuid"] == uuid and activity["context"]["template_name"] == "Career Ready"
    assert activity["editor_url"] == listed[0]["editor_url"]
    document = deepcopy(activity["document"])
    document["pages"] = [{"page_uuid": "start", "title": "What changed?", "content": {"version": 2, "blocks": []}}]
    result = call("save_activity", {"activity_uuid": activity_uuid, "document": document, "base_etag": activity["etag"]}, auth=token)
    assert "isError" not in result and 'in "Career Ready"' in result["content"][0]["text"]
    stored = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).one()
    assert [page.title for page in session.exec(select(LearningPage).where(LearningPage.activity_id == stored.id)).all()] == ["What changed?"]
    preview = call("preview_activity", {"template_uuid": uuid, "document": document}, auth=token)
    assert preview["structuredContent"]["unsaved"] is True

    # Published copies are frozen: the activity tools refuse to edit them.
    call("publish_plan_template", {"template_uuid": uuid})
    frozen = session.exec(select(LearningActivity).where(LearningActivity.frozen_from_id == stored.id)).one()
    copy = call("get_activity", {"activity_uuid": frozen.activity_uuid})["structuredContent"]
    refused = call("save_activity", {"activity_uuid": frozen.activity_uuid, "document": copy["document"], "base_etag": copy["etag"]}, auth=token)
    assert refused["isError"] is True and "published template version" in refused["content"][0]["text"]


def test_publish_list_and_roll_back_template_versions(templates):
    _, call, _, uuid, _ = templates
    first = call("publish_plan_template", {"template_uuid": uuid, "note": "Launch"})["structuredContent"]
    assert first["published"]["number"] == 1 and not first["has_unpublished_changes"]
    assert call("publish_plan_template", {"template_uuid": uuid})["isError"]  # nothing changed

    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    document = deepcopy(current["document"])
    document["stages"][0]["steps"].append({"type": "task", "title": "Reflect"})
    call("save_plan_template", {"template_uuid": uuid, "document": document, "base_etag": current["etag"]})
    second = call("publish_plan_template", {"template_uuid": uuid, "note": "Add reflection"})["structuredContent"]
    assert [(item["number"], item["step_count"], item["is_published"]) for item in second["versions"]] == [(2, 3, True), (1, 2, False)]

    rolled = call("restore_plan_template_version", {"template_uuid": uuid, "number": 1})["structuredContent"]
    assert (rolled["published"]["number"], rolled["published"]["restored_from_number"], rolled["published"]["step_count"]) == (3, 1, 2)
    assert [item["number"] for item in call("list_plan_template_versions", {"template_uuid": uuid})["structuredContent"]["versions"]] == [3, 2, 1]
