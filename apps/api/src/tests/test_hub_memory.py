from sqlmodel import Session, SQLModel, create_engine, select

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


def test_memory_defaults_on_is_tenant_scoped_and_stops_without_deleting(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        assert hub_memory.memory_settings(db, 7, 11) == {
            "enabled": True,
            "notice_dismissed": False,
        }
        changed = hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "goal", "content": "You want to become a nurse"}],
            extraction_model="test",
        )
        assert changed[0]["content"] == "You want to become a nurse"
        assert len(hub_memory.list_memories(db, 7, 11)) == 1
        assert hub_memory.list_memories(db, 8, 11) == []

        settings = hub_memory.update_memory_settings(
            db, 7, 11, enabled=False, notice_dismissed=True,
        )
        assert settings == {"enabled": False, "notice_dismissed": True}
        assert hub_memory.select_memories(db, 7, 11, "nursing") == []
        assert len(hub_memory.list_memories(db, 7, 11)) == 1


def test_memory_selection_grounding_receipts_edit_and_delete(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        hub_memory.update_memory_settings(db, 7, 11, enabled=True)
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
        hub_memory.update_memory_settings(db, 7, 11, enabled=True)
        assert hub_memory.memory_is_sensitive("My password is secret") is True
        assert hub_memory.apply_memory_candidates(
            db, org_id=7, user_id=11, message_uuid="message_one",
            candidates=[{"category": "background", "content": "Your medical condition is private"}],
            extraction_model="test",
        ) == []
        hub_memory.update_memory_settings(db, 7, 12, enabled=True)
        try:
            hub_memory.apply_memory_candidates(
                db, org_id=7, user_id=12, message_uuid="message_one",
                candidates=[{"category": "goal", "content": "You want a new career"}],
                extraction_model="test",
            )
            assert False, "another learner must not attach memory to this message"
        except Exception as error:
            assert getattr(error, "status_code", None) == 404


def test_forget_leaves_a_wordless_receipt_and_no_text(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        hub_memory.update_memory_settings(db, 7, 11, enabled=True)
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
        assert changed[0]["content"] == ""
        _assert_text_gone(db, "nurse")
        receipts = hub_memory.message_memory_receipts(db, [1])[1]
        assert [r["relationship"] for r in receipts] == ["created", "deleted"]
        assert all(r["content"] == "" and r["editable"] is False for r in receipts)


def _all_text(db: Session) -> str:
    memories = db.exec(select(HubMemory)).all()
    receipts = db.exec(select(HubConversationMessageMemory)).all()
    return " ".join([m.content for m in memories] + [r.content_snapshot for r in receipts])


def _assert_text_gone(db: Session, word: str) -> None:
    assert word not in _all_text(db)


def _remember(db: Session, content: str, **extra) -> dict:
    return hub_memory.apply_memory_candidates(
        db, org_id=7, user_id=11, message_uuid="message_one",
        candidates=[{"category": "goal", "content": content, **extra}], extraction_model="test",
    )[-1]


def _used_by_reply(db: Session) -> None:
    reply = HubConversationMessage(
        message_uuid="reply_one", conversation_id=1, sequence=2, role="assistant", content="Try a CNA course",
    )
    db.add(reply)
    db.commit()
    used = hub_memory.select_memories(db, 7, 11, "nurse welder")
    hub_memory.record_used_memories(db, "reply_one", used, 7, 11)


def test_delete_one_memory_removes_its_text_receipts_and_sources(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        nurse = _remember(db, "You want to become a nurse")
        _remember(db, "You like welding")
        _used_by_reply(db)
        assert "nurse" in _all_text(db)

        hub_memory.delete_memory(db, nurse["memory_uuid"], 7, 11)

        _assert_text_gone(db, "nurse")
        assert "welding" in _all_text(db)
        remaining = db.exec(select(HubMemory)).all()
        assert [m.content for m in remaining] == ["You like welding"]
        sources = db.exec(select(HubMemorySource)).all()
        assert [s.memory_id for s in sources] == [remaining[0].id]
        # The reply keeps a note that a memory was used, without its words.
        used = [r for r in hub_memory.message_memory_receipts(db, [2])[2] if r["memory_uuid"] == nurse["memory_uuid"]]
        assert used and used[0]["content"] == "" and used[0]["relationship"] == "used"
        assert all("nurse" not in m["content"] for m in hub_memory.select_memories(db, 7, 11, "nurse"))


def test_clear_all_removes_every_memory_text(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        _remember(db, "You want to become a nurse")
        _remember(db, "You like welding")
        _used_by_reply(db)

        hub_memory.clear_memories(db, 7, 11)

        assert db.exec(select(HubMemory)).all() == []
        assert db.exec(select(HubMemorySource)).all() == []
        assert _all_text(db).strip() == ""
        assert hub_memory.list_memories(db, 7, 11) == []


def test_replaced_or_edited_memory_keeps_no_old_text(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        old = _remember(db, "You want to become a nurse")
        _remember(db, "You want to become a pediatrician", action="supersede", memory_uuid=old["memory_uuid"])
        _assert_text_gone(db, "nurse")
        assert [m.content for m in db.exec(select(HubMemory)).all()] == ["You want to become a pediatrician"]

        current = hub_memory.list_memories(db, 7, 11)[0]
        _used_by_reply(db)
        hub_memory.update_memory(db, current["memory_uuid"], 7, 11, "You want to become a surgeon")
        _assert_text_gone(db, "pediatrician")
        assert "surgeon" in _all_text(db)

        _remember(db, "You want to become a dentist", action="update", memory_uuid=current["memory_uuid"])
        _assert_text_gone(db, "surgeon")
        assert "dentist" in _all_text(db)


def test_memory_deleted_mid_answer_is_skipped_not_an_error(monkeypatch):
    with _session(monkeypatch) as db:
        _message(db)
        _remember(db, "You want to become a nurse")
        db.add(HubConversationMessage(
            message_uuid="reply_one", conversation_id=1, sequence=2, role="assistant", content="Sure",
        ))
        db.commit()
        used = hub_memory.select_memories(db, 7, 11, "nurse")
        hub_memory.clear_memories(db, 7, 11)
        hub_memory.record_used_memories(db, "reply_one", used, 7, 11)
        assert hub_memory.message_memory_receipts(db, [2]) == {}
