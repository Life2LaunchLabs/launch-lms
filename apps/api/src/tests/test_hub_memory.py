from sqlmodel import Session, SQLModel, create_engine

from src.db.hub import (
    HubConversation,
    HubConversationMessage,
    HubConversationMessageMemory,
    HubMemory,
    HubMemoryPreference,
    HubMemorySource,
)
from src.db.organizations import Organization  # noqa: F401
from src.db.users import User  # noqa: F401
from src.services import hub_memory
from src.services.hub_advisor import AdvisorMessage


def _session(monkeypatch):
    monkeypatch.setattr(hub_memory, "require_org_membership", lambda *_args: None)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[
        HubConversation.__table__,
        HubConversationMessage.__table__,
        HubMemoryPreference.__table__,
        HubMemory.__table__,
        HubMemorySource.__table__,
        HubConversationMessageMemory.__table__,
    ])
    return Session(engine)


def _message(db: Session) -> HubConversationMessage:
    conversation = HubConversation(
        conversation_uuid="conversation_one", org_id=7, user_id=11, title="A goal",
    )
    db.add(conversation)
    db.flush()
    message = HubConversationMessage(
        message_uuid="message_one", conversation_id=int(conversation.id),
        sequence=1, role="user", content="I want to become a nurse",
    )
    db.add(message)
    db.commit()
    return message


def test_memory_is_opt_in_tenant_scoped_and_stops_without_deleting(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        assert hub_memory.memory_settings(db, 7, 11) == {"enabled": False}
        assert hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "goal", "content": "You want to become a nurse"}],
            extraction_model="test",
        ) == []

        hub_memory.set_memory_enabled(db, 7, 11, True)
        changed = hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "goal", "content": "You want to become a nurse"}],
            extraction_model="test",
        )
        assert changed[0]["content"] == "You want to become a nurse"
        assert len(hub_memory.list_memories(db, 7, 11)) == 1
        assert hub_memory.list_memories(db, 8, 11) == []

        hub_memory.set_memory_enabled(db, 7, 11, False)
        assert hub_memory.select_memories(db, 7, 11, "nursing") == []
        assert len(hub_memory.list_memories(db, 7, 11)) == 1


def test_memory_selection_grounding_receipts_edit_and_delete(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        hub_memory.set_memory_enabled(db, 7, 11, True)
        changed = hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "goal", "content": "You want to become a nurse", "explicit": True}],
            extraction_model="test",
        )
        memory_uuid = changed[0]["memory_uuid"]
        selected = hub_memory.select_memories(db, 7, 11, "What should I study for nursing?")
        grounded = hub_memory.ground_messages_with_memories(
            [AdvisorMessage(role="user", content="What next?")], selected,
        )
        assert "You want to become a nurse" in grounded[0].content
        receipts = hub_memory.message_memory_receipts(db, [1])
        assert receipts[1][0]["relationship"] == "created"

        updated = hub_memory.update_memory(
            db, memory_uuid, 7, 11, "You want to become a pediatric nurse",
        )
        assert updated["version"] == 2
        hub_memory.delete_memory(db, memory_uuid, 7, 11)
        assert hub_memory.list_memories(db, 7, 11) == []
        assert hub_memory.message_memory_receipts(db, [1])[1][0]["editable"] is False


def test_sensitive_memory_is_rejected_and_cross_owner_message_is_hidden_not_found(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        hub_memory.set_memory_enabled(db, 7, 11, True)
        assert hub_memory.memory_is_sensitive("My password is secret") is True
        assert hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "background", "content": "Your medical condition is private"}],
            extraction_model="test",
        ) == []
        hub_memory.set_memory_enabled(db, 7, 12, True)
        try:
            hub_memory.apply_memory_candidates(
                db, org_id=7, user_id=12, message_uuid="message_one",
                candidates=[{"category": "goal", "content": "You want a new career"}],
                extraction_model="test",
            )
            assert False, "another learner must not attach memory to this message"
        except Exception as error:
            assert getattr(error, "status_code", None) == 404


def test_forget_receipt_preserves_snapshot_without_offering_stale_actions(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        hub_memory.set_memory_enabled(db, 7, 11, True)
        created = hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "goal", "content": "You want to become a nurse"}],
            extraction_model="test",
        )[0]

        changed = hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{
                "action": "forget", "category": "goal",
                "content": "You want to become a nurse",
                "memory_uuid": created["memory_uuid"],
            }],
            extraction_model="test",
        )

        assert changed[0]["relationship"] == "deleted"
        assert changed[0]["editable"] is False
        assert changed[0]["content"] == "You want to become a nurse"
