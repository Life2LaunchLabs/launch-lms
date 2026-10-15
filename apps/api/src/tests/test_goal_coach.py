"""Coach on goals: typed proposal tools, page context, idempotent applies and edit-run binding.

Ported from test_hub_plan_tools, test_hub_context and test_hub_edit_runs.
"""

import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import select

from src.db.goals import GoalCreate, GoalStep, StepStatus, StepSubmission
from src.db.hub import HubConversation, HubEditObjectState, HubEditRun, HubEditRunEvent
from src.services import hub_edit_runs
from src.services.goals import coach_apply, goals, structure
from src.services.goals.coach_apply import CoachStageCreate, CoachStepCreate, add_stage_once, add_step_once, bind_created_goal
from src.services.goals.coach_context import GoalSurfaceHint, page_context, visible_receipt
from src.services.goals.coach_tools import (
    CONCLUDE_EDIT_TOOL, GOAL_STAGES_TOOL, GOAL_STEPS_TOOL, NEW_GOAL_TOOL, attach_catalog_resources, goal_edit_tools, parse_goal_tool_call, record_goal_proposals,
)
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _issue, _published, _session, _status, _step, _user  # noqa: F401


def _hub(db):
    for model in (HubConversation, HubEditRun, HubEditRunEvent, HubEditObjectState):
        model.__table__.create(db.get_bind(), checkfirst=True)


def _run(db, scope_kind="goal", target_uuid="goal_one"):
    _hub(db)
    conversation = HubConversation(conversation_uuid=f"conversation_{scope_kind}", org_id=1, user_id=LEARNER, title="Goal")
    db.add(conversation)
    db.commit()
    run = HubEditRun(run_uuid=f"run_{scope_kind}", conversation_id=conversation.id, org_id=1, user_id=LEARNER, goal="Build it",
                     scope_kind=scope_kind, target_uuid=target_uuid, target_label="Goal", route="/plans", started_from_action_id=f"action_{scope_kind}")
    db.add(run)
    db.commit()
    return conversation, run


def _steps(*items):
    settings = {"prompt": "", "max_words": 0, "list_label": "", "list_target": 0, "slot_labels": [], "options": [], "multiple": False, "event_date": "", "place": ""}
    return {"steps": [{"type": "task", "title": "", "description": "", "stage_title": "", "due_date": "", "resource_uuid": "", **item,
                       "settings": {**settings, **item.get("settings", {})}} for item in items]}


# Tools ---------------------------------------------------------------------------------

def test_tools_are_scope_bounded_and_accept_plan_era_scopes():
    assert goal_edit_tools("openai", None) == []
    assert [tool["name"] for tool in goal_edit_tools("openai", "goal")] == [GOAL_STAGES_TOOL, GOAL_STEPS_TOOL, CONCLUDE_EDIT_TOOL]
    assert [tool["name"] for tool in goal_edit_tools("anthropic", "plan")] == [GOAL_STAGES_TOOL, GOAL_STEPS_TOOL, CONCLUDE_EDIT_TOOL]
    assert goal_edit_tools("openai", "new_plan")[0]["name"] == NEW_GOAL_TOOL
    strict = goal_edit_tools("openai", "goal")[1]["parameters"]["properties"]["steps"]["items"]
    assert set(strict["required"]) == set(strict["properties"]) and strict["properties"]["type"]["enum"] == ["task", "write", "upload", "event", "decision"]


def test_new_goal_and_stage_tools_validate_complete_values():
    fields = parse_goal_tool_call(NEW_GOAL_TOOL, {"title": "Explore nursing", "description": "Compare two programs.", "target_date": "2027-06-01"})["fields"]
    assert fields == {"title": "Explore nursing", "description": "Compare two programs.", "target_date": "2027-06-01"}
    assert parse_goal_tool_call(NEW_GOAL_TOOL, {"title": "Try", "description": "", "target_date": ""})["fields"]["target_date"] == ""
    assert parse_goal_tool_call(NEW_GOAL_TOOL, {"title": "Explore", "description": "", "target_date": "someday"}) is None
    stages = parse_goal_tool_call(GOAL_STAGES_TOOL, {"stages": [{"title": "Explore", "description": "Compare.", "timing": "This fall"}, {"title": "", "description": "", "timing": ""}]})
    assert stages["type"] == "add_goal_stages" and [(item["title"], item["timing"]) for item in stages["stages"]] == [("Explore", "This fall")]
    assert parse_goal_tool_call(CONCLUDE_EDIT_TOOL, {"summary": "The first steps are ready."})["type"] == "propose_edit_conclusion"
    assert parse_goal_tool_call(CONCLUDE_EDIT_TOOL, {"summary": ""}) is None


def test_step_tool_builds_typed_configs_through_the_registry():
    operation = parse_goal_tool_call(GOAL_STEPS_TOOL, _steps(
        {"type": "task", "title": "Contact schools", "settings": {"list_label": "Schools", "list_target": 3}},
        {"type": "write", "title": "Why nursing?", "settings": {"prompt": "What draws you?", "max_words": 200}},
        {"type": "upload", "title": "Transcripts", "settings": {"slot_labels": ["Transcript", "Letter"]}},
        {"type": "decision", "title": "Pick a program", "settings": {"prompt": "Which one?", "options": ["State", "City"]}},
        {"type": "event", "title": "Open day", "settings": {"event_date": "2027-03-01", "place": "Campus"}},
    ))
    steps = {step["type"]: step for step in operation["steps"]}
    assert operation["type"] == "add_goal_steps" and len(steps) == 5
    assert steps["task"]["config"] == {"list": {"label": "Schools", "target": 3, "item_kind": "text"}}
    assert steps["write"]["config"] == {"prompt": "What draws you?", "max_words": 200}
    assert [slot["label"] for slot in steps["upload"]["config"]["slots"]] == ["Transcript", "Letter"]
    assert [option["label"] for option in steps["decision"]["config"]["options"]] == ["State", "City"]
    assert steps["event"]["config"]["date"] == "2027-03-01"
    skipped = parse_goal_tool_call(GOAL_STEPS_TOOL, _steps(
        {"type": "activity", "title": "Play"}, {"type": "task", "title": "Bad date", "due_date": "soon"},
        {"type": "decision", "title": "Nothing to choose", "settings": {"options": []}},
    ))
    # Coach can't write activities or bad dates; a decision with no options still takes a written-in choice.
    assert [(step["type"], step["config"]["allow_other"]) for step in skipped["steps"]] == [("decision", True)]
    assert parse_goal_tool_call(GOAL_STEPS_TOOL, _steps({"type": "upload", "title": "", "settings": {"slot_labels": ["A"]}})) is None


def test_step_resources_come_from_shown_catalog_entries_only():
    shown = [
        {"resource_uuid": "res_quiz", "title": "Interest quiz", "external_url": "https://example.org/quiz"},
        {"resource_uuid": "res_script", "title": "Odd", "external_url": "javascript:alert(1)"},
    ]
    operation = parse_goal_tool_call(GOAL_STEPS_TOOL, _steps(*({"title": f"Step {index}", "resource_uuid": uuid} for index, uuid in enumerate(["res_quiz", "res_script", "https://evil.example"]))))
    resolved = attach_catalog_resources([operation], shown)[0]["steps"]
    assert resolved[0]["materials"] == [{"kind": "resource", "resource_uuid": "res_quiz", "title": "Interest quiz", "url": "https://example.org/quiz"}]
    assert all(item["materials"] == [] and "resource_uuid" not in item for item in resolved[1:])
    assert "resource" not in json.dumps(attach_catalog_resources([operation], None)[0]["steps"][0]["materials"])


def test_recorder_stages_before_steps_and_waits_for_review():
    with _session() as db:
        _, run = _run(db, scope_kind="plan")
        stage = parse_goal_tool_call(GOAL_STAGES_TOOL, {"stages": [{"title": "Explore", "description": "", "timing": ""}]})
        step = parse_goal_tool_call(GOAL_STEPS_TOOL, _steps({"title": "Compare", "stage_title": "Explore"}))
        assert [item["type"] for item in record_goal_proposals(db, run.run_uuid, [stage, step])] == ["add_goal_stages"]
        assert db.exec(select(HubEditRunEvent).where(HubEditRunEvent.run_id == run.id)).one().kind == "stages.proposed"
        db.add(HubEditObjectState(run_id=run.id, object_key="hub_stage_pending", object_type="stage", current_fields={}, proposal_fields={}, status="editing"))
        db.commit()
        assert record_goal_proposals(db, run.run_uuid, [step]) == []


# Page context ----------------------------------------------------------------------------

def _personal(db):
    goal_uuid = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Design career", org_id=1))["goal_uuid"]
    view = goals.get_goal(db, _user(LEARNER), goal_uuid)
    stage_uuid = view["stages"][0]["stage_uuid"]
    from src.db.goals import StepCreate

    view = structure.add_step(db, _user(LEARNER), goal_uuid, StepCreate(stage_uuid=stage_uuid, type="write", title="Why this career?", config={"prompt": "Why?"}))
    step = _step(view, "Why this career?")
    goals.save_submission(db, _user(LEARNER), goal_uuid, step["step_uuid"], StepSubmission(submission={"text": "I like helping people."}))
    return goal_uuid, step["step_uuid"]


def test_goal_context_reads_saved_answers_but_never_private_fields():
    with _session() as db, patch("src.services.goals.coach_context.require_org_membership"):
        goal_uuid, step_uuid = _personal(db)
        hint = GoalSurfaceHint(surface="plan", entity_id=goal_uuid, selected_objective_id=step_uuid, page_path="/orgs/studio/plans", page_title="Plans | Career")
        result = page_context(db, 1, LEARNER, hint)
        assert result["receipt"]["status"] == "ready" and result["receipt"]["sources"][0]["page_title"] == "Plans | Career"
        fact = result["facts"][0]
        assert fact["title"] == "Design career" and fact["stages"][0]["total"] == 1
        assert fact["steps"][0]["type"] == "write" and fact["steps"][0]["result"] == {"kind": "text", "text": "I like helping people."}
        assert result["receipt"]["sources"][0]["step_id"] == step_uuid
        assert "reviewer_note" not in json.dumps(result) and "staff_notes" not in json.dumps(result)


def test_forged_inaccessible_and_deleted_targets_do_not_supply_context():
    with _session() as db, patch("src.services.goals.coach_context.require_org_membership"):
        goal_uuid, step_uuid = _personal(db)
        hint = GoalSurfaceHint(surface="goal", entity_id=goal_uuid)
        receipt = page_context(db, 1, LEARNER, hint)["receipt"]
        assert page_context(db, 1, OTHER, hint)["facts"] == []
        assert visible_receipt(db, receipt, 1, OTHER)["sources"] == []
        assert visible_receipt(db, {**receipt, "sources": [{"plan_id": goal_uuid, "objective_id": step_uuid, "title": "x"}]}, 1, LEARNER)["sources"]
        hint.selected_step_id = "foreign-step"
        assert page_context(db, 1, LEARNER, hint)["receipt"]["status"] == "unavailable"
        assert page_context(db, 1, LEARNER, None)["receipt"]["status"] == "off"
    with pytest.raises(ValidationError):
        GoalSurfaceHint(surface="goal", entity_id="x", capabilities=["view_plan"])
    with pytest.raises(ValidationError):
        GoalSurfaceHint(surface="goals", visible_ids=["x"] * 21)


def test_group_context_uses_the_shared_definition_and_group_progress_only():
    from src.db.goals import GoalAssignmentCreate
    from src.services.goals import assignments

    with _session() as db, patch("src.services.goals.coach_context.require_org_membership"):
        template = _published(db, {"type": "task", "title": "Talk to our counselor"})
        assignment = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
        hint = GoalSurfaceHint(surface="group_plan", entity_id=assignment["assignment_uuid"])
        result = page_context(db, 1, ADMIN, hint)
        assert result["receipt"]["status"] == "ready"
        fact = result["facts"][0]
        assert fact["title"] == "Fall’s goal" and fact["steps"][0]["title"] == "Talk to our counselor" and fact["learner_count"] == 2
        assert "Lee" not in json.dumps(result) and "Arner" not in json.dumps(result)
        assert visible_receipt(db, result["receipt"], 1, ADMIN)["sources"][0]["assignment_id"] == assignment["assignment_uuid"]


# Applying proposals -------------------------------------------------------------------

def test_applying_a_proposal_twice_never_duplicates_and_deleted_items_stay_deleted():
    with _session() as db:
        goal_uuid, _ = _personal(db)
        user = _user(LEARNER)
        first = add_stage_once(db, user, goal_uuid, CoachStageCreate(title="Prepare", timing="Next month", request_key="hub_stage_1"))
        again = add_stage_once(db, user, goal_uuid, CoachStageCreate(title="Prepare", request_key="hub_stage_1"))
        assert first["applied"] == "created" and again["applied"] == "existing" and again["created_stage_uuid"] == first["created_stage_uuid"]
        assert [stage["title"] for stage in again["stages"]].count("Prepare") == 1

        payload = CoachStepCreate(stage_uuid=first["created_stage_uuid"], type="task", title="Visit", config={"list": {"label": "Places", "target": 2}}, request_key="hub_step_1")
        made = add_step_once(db, user, goal_uuid, payload)
        assert made["applied"] == "created" and add_step_once(db, user, goal_uuid, payload)["applied"] == "existing"
        assert len(db.exec(select(GoalStep).where(GoalStep.title == "Visit")).all()) == 1

        structure.delete_step(db, user, goal_uuid, made["created_step_uuid"])
        assert add_step_once(db, user, goal_uuid, payload)["applied"] == "removed"
        assert db.exec(select(GoalStep).where(GoalStep.title == "Visit")).first() is None

        with pytest.raises(HTTPException, match="slots"):
            add_step_once(db, user, goal_uuid, CoachStepCreate(type="upload", title="Files", config={"slots": []}, request_key="hub_step_2"))
        with pytest.raises(HTTPException, match="never wait on staff"):
            add_step_once(db, user, goal_uuid, CoachStepCreate(type="task", title="Sign off", completed_by="staff", request_key="hub_step_3"))
        with pytest.raises(HTTPException):
            add_stage_once(db, _user(OTHER), goal_uuid, CoachStageCreate(title="Intrude", request_key="x"))


def test_external_goal_steps_can_be_completed_after_a_keyed_apply():
    with _session() as db:
        goal = _issue(db, _published(db, {"type": "task", "title": "Visit"}))
        made = add_step_once(db, _user(ADMIN), goal.goal_uuid, CoachStepCreate(type="task", title="Make-up", request_key="hub_step_makeup"))
        step = next(item for item in made["unstaged_steps"] if item["title"] == "Make-up")
        assert step["step_uuid"] == made["created_step_uuid"]
        _status(db, LEARNER, goal, step, StepStatus.COMPLETED)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert next(item for item in view["unstaged_steps"] if item["title"] == "Make-up")["status"] == "completed"


# Edit runs ----------------------------------------------------------------------------------

def test_new_goal_run_binds_to_the_learners_new_personal_goal(monkeypatch):
    monkeypatch.setattr(hub_edit_runs, "require_org_membership", lambda *_args: None)
    monkeypatch.setattr(coach_apply, "require_org_membership", lambda *_args: None)
    with _session() as db:
        _hub(db)
        conversation = HubConversation(conversation_uuid="conversation_new", org_id=1, user_id=LEARNER, title="Goal")
        db.add(conversation)
        db.commit()
        run = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=1, user_id=LEARNER, action_id="hub_action_one",
            route="/plans?hub_action=create-plan", scope_kind="new_plan", target_label="New personal goal", goal="Create a goal together",
        )
        hub_edit_runs.save_object_state(db, run_uuid=run["run_uuid"], org_id=1, user_id=LEARNER, object_key="new-plan", object_type="goal",
                                        current_fields={"title": "Career"}, proposal_fields={}, expected_revision=0)
        goal_uuid, _ = _personal(db)
        external = _issue(db, _published(db, {"type": "task", "title": "Visit"}))
        with pytest.raises(HTTPException) as not_personal:
            bind_created_goal(db, run["run_uuid"], 1, LEARNER, external.goal_uuid)
        assert not_personal.value.status_code == 404
        with pytest.raises(HTTPException):
            bind_created_goal(db, run["run_uuid"], 1, OTHER, goal_uuid)

        bound = bind_created_goal(db, run["run_uuid"], 1, LEARNER, goal_uuid)
        assert bound["scope"] == {"kind": "goal", "target_uuid": goal_uuid, "label": "Design career", "route": f"/plans/{goal_uuid}"}
        assert bound["events"][-1]["kind"] == "goal.created" and bound["objects"][0]["status"] == "saved"
        with pytest.raises(HTTPException) as again:
            bind_created_goal(db, run["run_uuid"], 1, LEARNER, goal_uuid)
        assert again.value.status_code == 409
        assert [tool["name"] for tool in goal_edit_tools("openai", bound["scope"]["kind"])][0] == GOAL_STAGES_TOOL
