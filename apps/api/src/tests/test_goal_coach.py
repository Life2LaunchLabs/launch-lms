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
from src.services.goals.coach_sessions import goal_outline, goal_suggestions, start_goal_session
from src.services.goals.coach_tools import (
    CONCLUDE_EDIT_TOOL, GOAL_DETAILS_TOOL, GOAL_STAGES_TOOL, GOAL_STEPS_TOOL, STAGE_CHANGES_TOOL, STEP_CHANGES_TOOL,
    attach_catalog_resources, goal_edit_tools, parse_goal_tool_call, record_goal_proposals,
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
    settings = {"prompt": "", "max_words": 0, "list_label": "", "list_target": 0, "slot_labels": [], "options": [], "multiple": False, "event_date": "", "place": "", "per_week": 0, "follow_up_days": 0}
    return {"steps": [{"type": "task", "title": "", "description": "", "stage_title": "", "due_date": "", "resource_uuid": "", **item,
                       "settings": {**settings, **item.get("settings", {})}} for item in items]}


# Tools ---------------------------------------------------------------------------------

def test_tools_are_scope_bounded_and_accept_plan_era_scopes():
    goal_tools = [GOAL_STAGES_TOOL, GOAL_STEPS_TOOL, STEP_CHANGES_TOOL, STAGE_CHANGES_TOOL, GOAL_DETAILS_TOOL, CONCLUDE_EDIT_TOOL]
    assert goal_edit_tools("openai", None) == []
    assert [tool["name"] for tool in goal_edit_tools("openai", "goal")] == goal_tools
    assert [tool["name"] for tool in goal_edit_tools("anthropic", "plan")] == goal_tools
    # Coach never writes a new goal: a run begun for one before that rule can only finish.
    assert [tool["name"] for tool in goal_edit_tools("openai", "new_plan")] == [CONCLUDE_EDIT_TOOL]
    for tool in goal_edit_tools("openai", "goal"):
        assert tool["strict"] and _strict(tool["parameters"])
    strict = goal_edit_tools("openai", "goal")[1]["parameters"]["properties"]["steps"]["items"]
    assert set(strict["required"]) == set(strict["properties"]) and strict["properties"]["type"]["enum"] == ["task", "write", "upload", "event", "decision", "routine", "explore"]


def _strict(schema) -> bool:
    """Every object in a strict tool schema requires all of its properties and allows no others."""
    if schema.get("type") == "object":
        return set(schema["required"]) == set(schema["properties"]) and schema["additionalProperties"] is False and all(_strict(item) for item in schema["properties"].values())
    return _strict(schema["items"]) if schema.get("type") == "array" else True


def test_stage_tools_validate_complete_values():
    assert parse_goal_tool_call("propose_new_goal_details", {"title": "Explore nursing", "description": "", "target_date": ""}) is None
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


# Sessions on an existing goal ------------------------------------------------------------------

def _changes(**items):
    step = {"step_id": "", "title": "", "description": "", "stage_id": "", "remove": False, "reason": ""}
    return {"changes": [{**step, **item} for item in items.get("steps", [])]}


def _goal_session(db, monkeypatch):
    from src.services import hub_conversations
    from src.services.goals import coach_sessions
    for module in (hub_edit_runs, hub_conversations, coach_sessions):
        monkeypatch.setattr(module, "require_org_membership", lambda *_args: None)
    _hub(db)
    goal_uuid, step_uuid = _personal(db)
    return goal_uuid, step_uuid


def test_a_session_starts_only_on_the_learners_own_goal_and_is_picked_back_up(monkeypatch):
    with _session() as db:
        goal_uuid, _ = _goal_session(db, monkeypatch)
        run = start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=goal_uuid)
        assert run["scope"] == {"kind": "goal", "target_uuid": goal_uuid, "label": "Design career", "route": f"/plans/{goal_uuid}"}
        assert run["status"] == "active" and run["goal"] == "Plan “Design career” together"
        # Asking again from the goal page, or from another conversation, returns the same session.
        assert start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=goal_uuid, conversation_uuid="conversation_other")["run_uuid"] == run["run_uuid"]
        with pytest.raises(HTTPException) as other:
            start_goal_session(db, org_id=1, user_id=OTHER, goal_uuid=goal_uuid)
        assert other.value.status_code == 404
        external = _issue(db, _published(db, {"type": "task", "title": "Visit"}))
        with pytest.raises(HTTPException):
            start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=external.goal_uuid)

        # A conversation already running a session on something else gets a fresh conversation instead.
        hub_edit_runs.conclude_edit_run(db, run["run_uuid"], 1, LEARNER, "cancelled")
        busy = HubConversation(conversation_uuid="conversation_busy", org_id=1, user_id=LEARNER, title="Busy")
        db.add(busy)
        db.commit()
        db.add(HubEditRun(run_uuid="run_busy", conversation_id=busy.id, org_id=1, user_id=LEARNER, goal="Other", scope_kind="goal",
                          target_uuid="goal_other", target_label="Other", route="/plans", started_from_action_id="action_busy"))
        db.commit()
        fresh = start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=goal_uuid, conversation_uuid="conversation_busy")
        assert fresh["run_uuid"] != run["run_uuid"] and fresh["conversation_uuid"] not in {"conversation_busy", run["conversation_uuid"]}


def test_change_suggestions_name_real_rows_and_carry_what_they_change(monkeypatch):
    with _session() as db:
        goal_uuid, step_uuid = _goal_session(db, monkeypatch)
        stage_uuid = goals.get_goal(db, _user(LEARNER), goal_uuid)["stages"][0]["stage_uuid"]
        run = start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=goal_uuid)
        outline = json.loads(goal_outline(db, goal_uuid, LEARNER))
        assert outline["steps"] == [{"id": step_uuid, "title": "Why this career?", "type": "write", "stage_id": stage_uuid, "done": False}]

        steps = parse_goal_tool_call(STEP_CHANGES_TOOL, _changes(steps=[
            {"step_id": step_uuid, "title": "Why this work matters to me", "reason": "Clearer"},
            {"step_id": "step_forged", "remove": True},
            {"step_id": step_uuid, "title": "Why this career?"},
        ]))
        stages = parse_goal_tool_call(STAGE_CHANGES_TOOL, {"changes": [
            {"stage_id": stage_uuid, "title": "", "milestone": "A shortlist of roles", "timing": "", "remove": False, "reason": ""},
            {"stage_id": stage_uuid, "title": "", "milestone": "", "timing": "", "remove": True, "reason": "Has a step"},
        ]})
        details = parse_goal_tool_call(GOAL_DETAILS_TOOL, {"title": "Design my career", "description": "", "reason": ""})
        recorded = record_goal_proposals(db, run["run_uuid"], [steps, stages, details])
        by_type = {item["type"]: item["changes"] for item in recorded}
        # A forged id and a change to what's already there are dropped; a stage with steps can't be removed.
        assert [(item["title"], item["from"]["title"]) for item in by_type["change_goal_steps"]] == [("Why this work matters to me", "Why this career?")]
        assert [(item["milestone"], item["from"]["milestone"]) for item in by_type["change_goal_stages"]] == [("A shortlist of roles", "")]
        assert by_type["set_goal_details"][0]["title"] == "Design my career"


def test_suggestions_outlive_the_session_until_added_or_dropped(monkeypatch):
    with _session() as db:
        goal_uuid, _ = _goal_session(db, monkeypatch)
        run = start_goal_session(db, org_id=1, user_id=LEARNER, goal_uuid=goal_uuid)
        stages = parse_goal_tool_call(GOAL_STAGES_TOOL, {"stages": [{"title": "Explore", "description": "", "timing": ""}, {"title": "Prepare", "description": "", "timing": ""}]})
        record_goal_proposals(db, run["run_uuid"], [stages])
        # Steps wait while suggested stages are still on the goal.
        assert record_goal_proposals(db, run["run_uuid"], [parse_goal_tool_call(GOAL_STEPS_TOOL, _steps({"title": "Compare"}))]) == []
        hub_edit_runs.conclude_edit_run(db, run["run_uuid"], 1, LEARNER, "cancelled")

        left = goal_suggestions(db, 1, LEARNER, goal_uuid)
        assert [(item["active"], [stage["title"] for stage in item["operations"][0]["stages"]]) for item in left] == [(False, ["Explore", "Prepare"])]
        first = left[0]["operations"][0]["stages"][0]["local_id"]
        # Dropping one after the session ended is still recorded; editing it is not.
        hub_edit_runs.save_object_state(db, run_uuid=run["run_uuid"], org_id=1, user_id=LEARNER, object_key=first, object_type="stage",
                                        current_fields={"title": "Explore"}, proposal_fields={}, status="cancelled")
        with pytest.raises(HTTPException):
            hub_edit_runs.save_object_state(db, run_uuid=run["run_uuid"], org_id=1, user_id=LEARNER, object_key="other", object_type="stage",
                                            current_fields={}, proposal_fields={}, status="editing")
        assert [stage["title"] for stage in goal_suggestions(db, 1, LEARNER, goal_uuid)[0]["operations"][0]["stages"]] == ["Prepare"]
        with pytest.raises(HTTPException):
            goal_suggestions(db, 1, OTHER, goal_uuid)
