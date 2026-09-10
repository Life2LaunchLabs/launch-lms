from sqlmodel import Session, SQLModel, create_engine

from src.db.hub import (
    HubConversation,
    HubConversationMessage,
    HubConversationMessageResource,
    HubConversationResource,
    HubConversationMessageMemory,
    HubMemory,
    HubMemoryPreference,
    HubMemorySource,
)
from src.db.organizations import Organization  # noqa: F401
from src.db.users import User  # noqa: F401
from src.services import hub_conversations


def _session(monkeypatch):
    monkeypatch.setattr(hub_conversations, "require_org_membership", lambda *_args: None)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[
        HubConversation.__table__,
        HubConversationMessage.__table__,
        HubConversationMessageResource.__table__,
        HubConversationResource.__table__,
        HubMemoryPreference.__table__,
        HubMemory.__table__,
        HubMemorySource.__table__,
        HubConversationMessageMemory.__table__,
    ])
    return Session(engine)


def _resource(uuid: str, title: str) -> dict:
    return {
        "resource_uuid": uuid,
        "title": title,
        "description": "Useful context",
        "resource_type": "guide",
        "provider_name": "Launch",
        "external_url": f"https://example.com/{uuid}",
        "access_mode": "free",
        "tags": [{"name": "Career"}],
    }


def test_search_creates_private_resumable_rich_conversation(monkeypatch):
    with _session(monkeypatch) as db:
        created = hub_conversations.record_search(
            db, org_id=7, user_id=11, conversation_uuid=None,
            query="career guides", learner_resource_uuids=["resource_one"],
            context_resource_uuids=["resource_one"],
            page_receipt={"status": "unavailable", "captured_at": "2026-09-09T12:00:00Z", "sources": [], "page_path": "/orgs/acme/portfolio", "page_title": "Portfolio"},
        )

        summaries = hub_conversations.list_conversations(db, 7, 11)
        detail = hub_conversations.conversation_detail(
            db, created["conversation_uuid"], 7, 11,
            [_resource("resource_one", "Career guide")],
        )

        assert summaries[0]["title"] == "career guides"
        assert summaries[0]["resource_count"] == 1
        assert summaries[0]["latest_user_message"] == "career guides"
        assert summaries[0]["latest_user_resource_count"] == 1
        assert [message["role"] for message in detail["messages"]] == ["user", "assistant"]
        assert detail["messages"][1]["search_query"] == "career guides"
        assert detail["messages"][0]["resources"][0]["title"] == "Career guide"
        assert detail["messages"][0]["page_context"]["page_title"] == "Portfolio"
        assert detail["messages"][1]["page_context"]["page_path"] == "/orgs/acme/portfolio"
        assert detail["context_resources"][0]["resource_uuid"] == "resource_one"

        hub_conversations.save_state(
            db, created["conversation_uuid"], 7, 11,
            ["resource_one", "resource_two"],
            [{
                "message_uuid": created["user_message_uuid"],
                "resource_uuids": ["resource_one", "resource_two"],
                "label": "You added",
            }],
            {"resource_one", "resource_two"},
        )
        updated = hub_conversations.conversation_detail(
            db, created["conversation_uuid"], 7, 11,
            [_resource("resource_one", "Career guide"), _resource("resource_two", "Resume guide")],
        )
        assert [item["resource_uuid"] for item in updated["messages"][0]["resources"]] == [
            "resource_one", "resource_two",
        ]


def test_advice_uses_authoritative_history_and_revalidates_resources(monkeypatch):
    with _session(monkeypatch) as db:
        first = hub_conversations.record_advice(
            db, org_id=7, user_id=11, conversation_uuid=None,
            user_content="What should I do?", assistant_content="Start small.",
            learner_resource_uuids=[], context_resource_uuids=["resource_prior", "resource_visible"],
            suggested_resource_uuids=["resource_visible", "resource_revoked"],
            model="test", input_tokens=3, output_tokens=2,
            suggested_actions=[{
                "action_id": "hub_action_plan", "schema_version": 1,
                "capability": "navigate", "destination": "create_plan",
                "label": "Start a plan", "state": "proposed",
            }],
        )
        history = hub_conversations.advisor_history(
            db, first["conversation_uuid"], 7, 11, "What next?"
        )
        detail = hub_conversations.conversation_detail(
            db, first["conversation_uuid"], 7, 11,
            [_resource("resource_prior", "Prior"), _resource("resource_visible", "Visible")],
        )

        assert [(item.role, item.content) for item in history] == [
            ("user", "What should I do?"),
            ("assistant", "Start small."),
            ("user", "What next?"),
        ]
        assert [item["resource_uuid"] for item in detail["context_resources"]] == ["resource_prior", "resource_visible"]
        assert "resource_revoked" not in str(detail)
        assert detail["messages"][1]["suggested_actions"][0]["destination"] == "create_plan"


def test_state_rename_delete_and_owner_boundary(monkeypatch):
    with _session(monkeypatch) as db:
        created = hub_conversations.record_search(
            db, org_id=7, user_id=11, conversation_uuid=None,
            query="resume help", learner_resource_uuids=[], context_resource_uuids=[],
        )
        uuid = created["conversation_uuid"]

        hub_conversations.rename_conversation(db, uuid, 7, 11, "My next step")
        assert hub_conversations.list_conversations(db, 7, 11)[0]["title"] == "My next step"

        try:
            hub_conversations.get_owned_conversation(db, uuid, 7, 12)
            assert False, "another learner must not access the conversation"
        except Exception as error:
            assert getattr(error, "status_code", None) == 404

        hub_conversations.archive_conversation(db, uuid, 7, 11)
        assert hub_conversations.list_conversations(db, 7, 11) == []
        assert hub_conversations.get_owned_conversation(db, uuid, 7, 11).archived_at is not None

        hub_conversations.delete_conversation(db, uuid, 7, 11)
