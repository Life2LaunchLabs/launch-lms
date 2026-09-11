import json

import httpx
import pytest

from src.services.hub_advisor import AnthropicMessagesProvider, AdvisorMessage, OpenAIResponsesProvider
from src.db.hub import HubConversation, HubEditObjectState, HubEditRun, HubEditRunEvent
from src.services.hub_plan_tools import CONCLUDE_EDIT_TOOL, NEW_PLAN_TOOL, PLAN_OBJECTIVES_TOOL, PLAN_PHASES_TOOL, parse_plan_tool_call, plan_edit_tools, record_plan_proposals


def test_new_plan_tool_is_scope_bounded_and_validates_complete_values():
    assert plan_edit_tools("openai", None) == []
    assert [tool["name"] for tool in plan_edit_tools("openai", "plan")] == [PLAN_PHASES_TOOL, PLAN_OBJECTIVES_TOOL, CONCLUDE_EDIT_TOOL]
    assert plan_edit_tools("openai", "new_plan")[0]["name"] == NEW_PLAN_TOOL
    assert parse_plan_tool_call(NEW_PLAN_TOOL, {
        "name": "Explore nursing", "description": "Compare two programs.", "due_date": "2027-06-01",
    })["fields"] == {
        "name": "Explore nursing", "description": "Compare two programs.", "due_date": "2027-06-01",
    }
    assert parse_plan_tool_call(NEW_PLAN_TOOL, {
        "name": "Explore nursing", "description": "", "due_date": "someday",
    }) is None


def test_plan_objective_and_conclusion_tools_validate_complete_operations():
    operation = parse_plan_tool_call(PLAN_OBJECTIVES_TOOL, {"objectives": [
        {"title": "Compare programs", "description": "Review cost and outcomes.", "due_date": "2027-02-01", "phase_name": "Explore"},
        {"title": "Invalid date", "description": "Skip this item.", "due_date": "soon", "phase_name": "Explore"},
    ]})
    assert operation["type"] == "add_plan_objectives"
    assert [item["title"] for item in operation["objectives"]] == ["Compare programs"]
    assert parse_plan_tool_call(CONCLUDE_EDIT_TOOL, {"summary": "The first milestones are ready."})["type"] == "propose_edit_conclusion"
    assert parse_plan_tool_call(CONCLUDE_EDIT_TOOL, {"summary": ""}) is None


def test_plan_phase_tool_validates_complete_phase_operations():
    operation = parse_plan_tool_call(PLAN_PHASES_TOOL, {"phases": [
        {"name": "Explore", "description": "Compare directions.", "due_date": "2027-01-10"},
        {"name": "Invalid", "description": "Skip.", "due_date": "later"},
    ]})
    assert operation["type"] == "add_plan_phases"
    assert [item["name"] for item in operation["phases"]] == ["Explore"]


def test_recorder_stages_phases_before_objectives_and_waits_for_review():
    from sqlmodel import Session, SQLModel, create_engine

    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[
        HubConversation.__table__, HubEditRun.__table__, HubEditRunEvent.__table__, HubEditObjectState.__table__,
    ])
    with Session(engine) as db:
        conversation = HubConversation(conversation_uuid="conversation_tools", org_id=7, user_id=11, title="Plan")
        db.add(conversation)
        db.commit()
        run = HubEditRun(
            run_uuid="run_tools", conversation_id=conversation.id, org_id=7, user_id=11,
            goal="Build it", scope_kind="plan", target_uuid="plan_one", target_label="Plan",
            route="/plans/one", started_from_action_id="action_tools",
        )
        db.add(run)
        db.commit()
        phase = parse_plan_tool_call(PLAN_PHASES_TOOL, {"phases": [{"name": "Explore", "description": "", "due_date": ""}]})
        objective = parse_plan_tool_call(PLAN_OBJECTIVES_TOOL, {"objectives": [{"title": "Compare", "description": "", "due_date": "", "phase_name": "Explore"}]})

        accepted = record_plan_proposals(db, run.run_uuid, [phase, objective])
        assert [item["type"] for item in accepted] == ["add_plan_phases"]

        db.add(HubEditObjectState(
            run_id=run.id, object_key="hub_phase_pending", object_type="phase",
            current_fields={"name": "Explore"}, proposal_fields={"name": "Explore"}, status="editing",
        ))
        db.commit()
        assert record_plan_proposals(db, run.run_uuid, [objective]) == []


@pytest.mark.asyncio
async def test_both_providers_return_the_same_typed_new_plan_operation():
    fields = {"name": "Explore nursing", "description": "Compare programs.", "due_date": "2027-06-01"}

    async def openai_handler(request: httpx.Request):
        payload = json.loads(request.content)
        assert [tool["name"] for tool in payload["tools"]] == ["suggest_navigation", NEW_PLAN_TOOL, CONCLUDE_EDIT_TOOL]
        return httpx.Response(200, json={
            "model": "gpt-test",
            "output": [
                {"type": "message", "content": [{"type": "output_text", "text": "I prepared a starting point."}]},
                {"type": "function_call", "name": NEW_PLAN_TOOL, "arguments": json.dumps(fields)},
            ],
        })

    async def anthropic_handler(request: httpx.Request):
        payload = json.loads(request.content)
        assert [tool["name"] for tool in payload["tools"]] == ["suggest_navigation", NEW_PLAN_TOOL, CONCLUDE_EDIT_TOOL]
        return httpx.Response(200, json={
            "model": "claude-test",
            "content": [
                {"type": "text", "text": "I prepared a starting point."},
                {"type": "tool_use", "name": NEW_PLAN_TOOL, "input": fields},
            ],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(openai_handler)) as client:
        openai = await OpenAIResponsesProvider("test-key", "gpt-test", client, edit_scope="new_plan").respond(
            [AdvisorMessage(role="user", content="Help me make the plan")], "safe-user",
        )
    async with httpx.AsyncClient(transport=httpx.MockTransport(anthropic_handler)) as client:
        anthropic = await AnthropicMessagesProvider("test-key", "claude-test", client, edit_scope="new_plan").respond(
            [AdvisorMessage(role="user", content="Help me make the plan")], "safe-user",
        )

    assert len(openai.plan_operations) == len(anthropic.plan_operations) == 1
    assert openai.plan_operations[0]["fields"] == fields
    assert anthropic.plan_operations[0]["fields"] == fields
