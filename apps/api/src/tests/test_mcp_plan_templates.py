"""Launch LMS MCP server: plan template tools."""

import json
from copy import deepcopy

import pytest
from sqlmodel import select

from src.db.programs import Objective, ObjectiveCreate, Program, ProgramAssignment, ProgramCreate, ProgramObjective, ProgramPhase, ProgramPhaseUpdate
from src.services.programs import add_program_objective, create_program, update_program_phase
from src.tests.test_mcp import _token
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)


@pytest.fixture
def templates(mcp):  # noqa: F811
    client, session, rpc, base_call, alice = mcp
    token = _token(session, alice.id, 1, scope="activities:read plans:read plans:write")

    def call(name, arguments=None, auth=token):
        return base_call(name, arguments, auth=auth)

    for model in (Program, ProgramPhase, Objective, ProgramObjective, ProgramAssignment):
        model.__table__.create(session.get_bind(), checkfirst=True)
    template = create_program(session, alice, ProgramCreate(org_id=1, name="Career Ready", description="Get ready"))
    uuid = template["program_uuid"]
    phase_uuid = template["phases"][0]["phase_uuid"]
    update_program_phase(session, alice, 1, uuid, phase_uuid, ProgramPhaseUpdate(name="Explore", suggested_duration_weeks=4))
    add_program_objective(session, alice, 1, uuid, ObjectiveCreate(title="Draft a resume", custom_fields=[{"field_uuid": "resume", "title": "Resume", "type": "media", "allowed_types": ["document"]}]))
    add_program_objective(session, alice, 1, uuid, ObjectiveCreate(title="Mock interview", suggested_due_week=3))
    return session, call, alice, uuid


def test_tools_are_listed_with_their_scopes(templates):
    _, call, _, uuid = templates
    listed = [item for item in call("list_plan_templates", {"query": "career"})["structuredContent"]["templates"] if item["template_uuid"] == uuid]
    assert [(item["name"], item["phase_count"], item["objective_count"]) for item in listed] == [("Career Ready", 1, 2)]
    assert listed[0]["editor_url"].endswith(f"/admin/plans/{listed[0]['template_uuid']}/objectives")
    schema = call("get_plan_template_schema")["structuredContent"]
    assert "## Steps" in schema["guide"] and "PlanTemplateObjective" in schema["schema"]["$defs"]


def test_read_edit_and_save_round_trip(templates):
    session, call, _, uuid = templates
    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    document = current["document"]
    assert [item["title"] for item in document["phases"][0]["objectives"]] == ["Draft a resume", "Mock interview"]
    assert "access" not in document["phases"][0]["objectives"][0]["steps"][0]

    unchanged = call("save_plan_template", {"template_uuid": uuid, "document": document, "base_etag": current["etag"]})
    assert unchanged["structuredContent"]["changed"] is False and unchanged["structuredContent"]["etag"] == current["etag"]
    assert "No changes" in unchanged["content"][0]["text"]

    edited = deepcopy(document)
    explore = edited["phases"][0]
    interview = explore["objectives"].pop(1)
    interview["schedule"]["suggested_due_week"] = None
    explore["objectives"][0]["steps"].append({"title": "Reviewer notes", "type": "text", "restricted": True})
    edited["phases"].insert(0, {"name": "Launch", "suggested_duration_weeks": 2, "objectives": [interview, {"title": "Set a goal", "allow_learner_confirmation": True}]})
    edited["template"]["instructions"] = "Meet weekly."

    report = call("validate_plan_template", {"template_uuid": uuid, "document": edited})["structuredContent"]
    assert report == {"valid": True, "errors": [], "warnings": []}
    saved = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
    assert "isError" not in saved and "Saved plan template" in saved["content"][0]["text"]
    result = saved["structuredContent"]["document"]
    assert [phase["name"] for phase in result["phases"]] == ["Launch", "Explore"]
    assert [item["title"] for item in result["phases"][0]["objectives"]] == ["Mock interview", "Set a goal"]
    new_step = result["phases"][1]["objectives"][0]["steps"][1]
    assert new_step["restricted"] is True and new_step["field_uuid"].startswith("field_")
    program = session.exec(select(Program).where(Program.program_uuid == uuid)).one()
    assert program.instructions == "Meet weekly." and program.version == current["context"]["version"] + 1
    goal = session.exec(select(Objective).where(Objective.title == "Set a goal")).one()
    assert goal.completion_policy == "either" and goal.evidence_policy == "none"

    stale = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
    detail = json.loads(stale["content"][0]["text"])
    assert stale["isError"] is True and detail["status"] == 409
    assert detail["current"]["etag"] == saved["structuredContent"]["etag"]


def test_validation_reports_paths_and_saves_can_remove_objectives_and_phases(templates):
    session, call, _, uuid = templates
    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    broken = deepcopy(current["document"])
    objectives = broken["phases"][0]["objectives"]
    objectives[0]["schedule"]["suggested_due_week"] = 9
    objectives[0]["steps"][0]["type"] = "essay"
    objectives[1]["objective_uuid"] = "objective_nope"
    objectives.append({"title": "Earn it", "badge_uuid": "badge_missing", "requirement_node_uuids": ["node_x"]})
    report = call("validate_plan_template", {"template_uuid": uuid, "document": broken})["structuredContent"]
    assert report["valid"] is False
    paths = {error["path"] for error in report["errors"]}
    assert "phases[0].objectives[0].steps[0].type" in paths  # schema errors come first and stop there
    del objectives[0]["steps"][0]["type"]
    paths = {error["path"] for error in call("validate_plan_template", {"template_uuid": uuid, "document": broken})["structuredContent"]["errors"]}
    assert {
        "phases[0].objectives[0].schedule.suggested_due_week",
        "phases[0].objectives[1].objective_uuid",
        "phases[0].objectives[2].badge_uuid",
        "phases[0].objectives[2].requirement_node_uuids",
    } <= paths

    # Leaving things out removes them; validation lists what would go.
    reshaped = deepcopy(current["document"])
    interview = reshaped["phases"][0]["objectives"].pop()
    reshaped["phases"] = [{"name": "Launch", "objectives": reshaped["phases"][0]["objectives"]}]
    report = call("validate_plan_template", {"template_uuid": uuid, "document": reshaped})["structuredContent"]
    assert report["valid"] is True
    assert {item["message"] for item in report["warnings"]} == {
        'Removes phase "Explore"', 'Removes objective "Mock interview"; plans already assigned keep it',
    }
    saved = call("save_plan_template", {"template_uuid": uuid, "document": reshaped, "base_etag": current["etag"]})
    assert "Warning at phases: Removes objective" in saved["content"][0]["text"]
    result = saved["structuredContent"]["document"]
    assert [(phase["name"], [item["title"] for item in phase["objectives"]]) for phase in result["phases"]] == [("Launch", ["Draft a resume"])]
    removed = session.exec(select(Objective).where(Objective.objective_uuid == interview["objective_uuid"])).one()
    assert removed.archived is True
    assert session.exec(select(ProgramPhase).where(ProgramPhase.phase_uuid == current["document"]["phases"][0]["phase_uuid"])).first() is None


def test_create_copies_a_template_with_a_badge_objective(templates):
    session, call, _, uuid = templates
    document = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]["document"]
    document["template"]["name"] = "Career Ready (Spring)"
    document["phases"][0]["objectives"].append({"title": "Explorer badge", "badge_uuid": "badge_1"})
    created = call("create_plan_template", {"document": document})["structuredContent"]
    assert created["context"]["template_uuid"] != uuid
    objectives = created["document"]["phases"][0]["objectives"]
    assert [item["title"] for item in objectives] == ["Draft a resume", "Mock interview", "Explorer badge"]
    badge = objectives[2]
    assert badge["badge_uuid"] == "badge_1" and badge["allow_learner_confirmation"] is True
    assert badge["steps"][0]["type"] == "badge" and badge["steps"][0]["badge_uuid"] == "badge_1"
    # Copies own their objectives: editing one never edits the source template.
    def objective_ids(template_uuid):
        program = session.exec(select(Program).where(Program.program_uuid == template_uuid)).one()
        return {row.objective_id for row in session.exec(select(ProgramObjective).where(ProgramObjective.program_id == program.id)).all()}

    source_ids, copy_ids = objective_ids(uuid), objective_ids(created["context"]["template_uuid"])
    assert source_ids and not source_ids & copy_ids

    edited = deepcopy(created["document"])
    edited["phases"][0]["objectives"][2]["badge_uuid"] = "badge_other"
    report = call("validate_plan_template", {"template_uuid": created["context"]["template_uuid"], "document": edited})["structuredContent"]
    assert report["errors"] == [{"path": "phases[0].objectives[2].badge_uuid", "message": "An objective's badge cannot change; add a new objective for another badge"}]


def test_template_scopes_and_org_are_enforced(templates):
    session, call, alice, uuid = templates
    activities_only = _token(session, alice.id, 1, scope="activities:read")
    blocked = call("get_plan_template", {"template_uuid": uuid}, auth=activities_only)
    assert blocked["isError"] is True and "plans:read" in blocked["content"][0]["text"]
    read_only = _token(session, alice.id, 1, scope="plans:read")
    assert "plans:write" in call("create_plan_template", {"document": {}}, auth=read_only)["content"][0]["text"]

    other = _token(session, alice.id, 2, scope="plans:read plans:write")
    denied = call("get_plan_template", {"template_uuid": uuid}, auth=other)
    assert denied["isError"] is True


def test_activity_objectives_are_added_in_the_template_and_edited_with_activity_tools(templates):
    session, call, alice, uuid = templates
    from src.db.learning import LearningActivity, LearningPage

    token = _token(session, alice.id, 1, scope="activities:read activities:write plans:read plans:write")
    current = call("get_plan_template", {"template_uuid": uuid})["structuredContent"]
    edited = deepcopy(current["document"])
    edited["template"]["step_order"] = "in_order"
    resume = edited["phases"][0]["objectives"][0]
    edited["phases"][0]["objectives"].append({"title": "Spot the change", "type": "activity", "after_objective_uuids": [resume["objective_uuid"]]})
    saved = call("save_plan_template", {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})["structuredContent"]["document"]
    assert saved["template"]["step_order"] == "in_order"
    activity_objective = saved["phases"][0]["objectives"][-1]
    assert activity_objective["type"] == "activity" and activity_objective["activity_uuid"].startswith("learning_activity_")
    assert activity_objective["after_objective_uuids"] == [resume["objective_uuid"]]

    changing = deepcopy(saved)
    changing["phases"][0]["objectives"][0]["type"] = "activity"
    report = call("validate_plan_template", {"template_uuid": uuid, "document": changing})["structuredContent"]
    assert report["valid"] is False and report["errors"][0]["path"].endswith(".type")

    listed = call("list_activities", {"template_uuid": uuid})["structuredContent"]["activities"]
    assert [(item["title"], item["page_count"]) for item in listed] == [("Spot the change", 0)]
    assert "/admin/plans/" in listed[0]["editor_url"]
    activity = call("get_activity", {"activity_uuid": listed[0]["activity_uuid"]})["structuredContent"]
    assert activity["context"]["template_uuid"] == uuid
    document = deepcopy(activity["document"])
    document["pages"] = [{"page_uuid": "start", "title": "What changed?", "content": {"version": 2, "blocks": []}}]
    result = call("save_activity", {"activity_uuid": listed[0]["activity_uuid"], "document": document, "base_etag": activity["etag"]}, auth=token)
    assert "isError" not in result
    stored = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == listed[0]["activity_uuid"])).one()
    assert [page.title for page in session.exec(select(LearningPage).where(LearningPage.activity_id == stored.id)).all()] == ["What changed?"]
