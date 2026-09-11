from fastapi import HTTPException
import pytest
from sqlmodel import Session, SQLModel, create_engine

from src.db.hub import HubConversation, HubConversationMessage
from src.services import hub_actions


def _session(monkeypatch):
    monkeypatch.setattr(hub_actions, "require_org_membership", lambda *_args: None)
    monkeypatch.setattr(hub_actions, "_org_config", lambda *_args: {})
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[HubConversation.__table__, HubConversationMessage.__table__])
    return Session(engine)


def test_actions_are_code_labeled_bounded_and_unknown_destinations_are_dropped(monkeypatch):
    with _session(monkeypatch) as db:
        actions = hub_actions.build_navigation_actions(
            ["create_plan", "invented_url", "add_timeline", "badges"], db, 7
        )

    assert [item["destination"] for item in actions] == ["create_plan", "add_timeline"]
    assert [item["label"] for item in actions] == ["Start a plan", "Add to Timeline"]
    assert all("route" not in item for item in actions)
    assert actions[0]["primary_behavior"] == "begin_edit"
    assert actions[0]["alternate_label"] == "Open plan without editing"
    assert "primary_behavior" not in actions[1]


def test_persisted_create_plan_actions_receive_current_split_button_contract():
    action = hub_actions.decorate_navigation_action({
        "action_id": "old", "schema_version": 1, "capability": "navigate",
        "destination": "create_plan", "label": "Start a plan", "state": "proposed",
    })

    assert action["primary_label"] == "Work on this plan"
    assert action["edit_scope"] == {"kind": "new_plan", "label": "New personal plan"}


@pytest.mark.parametrize("content", [
    "Create a plan",
    "Can you create a plan for me?",
    "Please help me build a plan to become a firefighter",
    "I would like you to start a career plan",
])
def test_explicit_plan_creation_requests_are_recognized(content):
    assert hub_actions.requests_plan_creation(content)


@pytest.mark.parametrize("content", [
    "How do plans work?",
    "What should a good plan include?",
    "Show me my plans",
])
def test_plan_questions_do_not_automatically_request_creation(content):
    assert not hub_actions.requests_plan_creation(content)


def test_action_resolution_rechecks_message_owner_and_uses_allowlisted_route(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(
            conversation_uuid="conversation_owner", org_id=7, user_id=11, title="Plan"
        )
        db.add(conversation)
        db.flush()
        action = hub_actions.build_navigation_actions(["create_plan"], db, 7)[0]
        message = HubConversationMessage(
            message_uuid="hub_message_assistant", conversation_id=conversation.id,
            sequence=2, role="assistant", content="Let's make a plan.", suggested_actions=[action],
        )
        db.add(message)
        db.commit()

        resolved = hub_actions.resolve_navigation_action(
            db, org_id=7, user_id=11, conversation_uuid="conversation_owner",
            message_uuid="hub_message_assistant", action_id=action["action_id"],
        )
        assert resolved["route"] == "/plans?hub_action=create-plan"
        assert resolved["edit_scope"] == {"kind": "new_plan", "label": "New personal plan"}

        with pytest.raises(HTTPException) as caught:
            hub_actions.resolve_navigation_action(
                db, org_id=7, user_id=12, conversation_uuid="conversation_owner",
                message_uuid="hub_message_assistant", action_id=action["action_id"],
            )
        assert caught.value.status_code == 404
