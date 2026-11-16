"""Coach retention: memories, conversations and reports past their period are deleted, leaving no text (DEV-125)."""

import importlib
import pkgutil
from datetime import datetime, timedelta

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

import src.db as db_models
from src.db.coach import CoachDeparture, CoachReport
from src.db.hub import HubConversation, HubConversationMessage, HubConversationMessageMemory, HubMemory, HubMemorySource, HubQuestion
from src.db.user_organizations import UserOrganization
from src.services.coach import retention
from src.services.orgs.membership import cleanup_after_removal

for module in pkgutil.walk_packages(db_models.__path__, "src.db."):
    importlib.import_module(module.name)

NOW = datetime(2026, 11, 16, 12, 0)
ORG, OTHER_ORG, LEARNER = 7, 8, 11


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _fk(connection, _record):  # cascades run as they do on Postgres
        connection.execute("PRAGMA foreign_keys=ON")

    SQLModel.metadata.create_all(engine)
    db = Session(engine)
    from src.db.organizations import Organization
    from src.db.roles import Role
    from src.db.users import User
    db.add(Role(id=4, name="Learner", role_uuid="role_4", rights={}))
    for org_id in (ORG, OTHER_ORG):
        db.add(Organization(id=org_id, name=f"Org {org_id}", slug=f"org{org_id}", email="o@example.org", org_uuid=f"org_{org_id}", creation_date="", update_date=""))
    db.add(User(id=LEARNER, username="lee", first_name="Lee", last_name="", email="l@example.org", password="x", user_uuid="user_11", creation_date="", update_date=""))
    db.commit()
    return db


def _member(db: Session, org_id: int = ORG) -> None:
    db.add(UserOrganization(user_id=LEARNER, org_id=org_id, role_id=4, creation_date="", update_date=""))
    db.commit()


def _conversation(db: Session, uuid: str, last: datetime, org_id: int = ORG, words: str = "I want to be a nurse") -> HubConversation:
    conversation = HubConversation(conversation_uuid=uuid, org_id=org_id, user_id=LEARNER, title=words, created_at=last, updated_at=last)
    db.add(conversation)
    db.flush()
    message = HubConversationMessage(message_uuid=f"{uuid}_m", conversation_id=conversation.id, sequence=1, role="user", content=words, created_at=last)
    db.add(message)
    db.flush()
    db.add(HubQuestion(question_uuid=f"{uuid}_q", org_id=org_id, user_id=LEARNER, conversation_id=conversation.id, message_id=message.id, position=0, prompt=words, kind="text"))
    db.add(CoachReport(report_uuid=f"{uuid}_r", conversation_id=conversation.id, message_uuid=message.message_uuid, reason="wrong", messages=[{"role": "user", "content": words}], created_at=last))
    db.commit()
    return conversation


def _memory(db: Session, uuid: str, content: str, *, used: datetime | None, updated: datetime, org_id: int = ORG, message: HubConversationMessage | None = None) -> HubMemory:
    memory = HubMemory(memory_uuid=uuid, org_id=org_id, user_id=LEARNER, category="goal", content=content, normalized_key=content.lower(),
                       created_at=updated, updated_at=updated, last_used_at=used)
    db.add(memory)
    db.flush()
    if message is not None:
        db.add(HubMemorySource(memory_id=memory.id, message_id=message.id, message_uuid=message.message_uuid))
        db.add(HubConversationMessageMemory(message_id=message.id, memory_id=memory.id, memory_uuid=uuid, relationship="created",
                                            content_snapshot=content, category_snapshot="goal", memory_version=1))
    db.commit()
    return memory


def _text(db: Session) -> str:
    parts = [m.content for m in db.exec(select(HubMemory)).all()]
    parts += [r.content_snapshot for r in db.exec(select(HubConversationMessageMemory)).all()]
    parts += [m.content for m in db.exec(select(HubConversationMessage)).all()]
    parts += [str(r.messages) for r in db.exec(select(CoachReport)).all()]
    return " ".join(parts)


def test_memories_unused_for_a_year_are_erased_and_recent_ones_stay():
    with _session() as db:
        _member(db)
        recent = _conversation(db, "conv_recent", NOW - timedelta(days=10), words="Recent chat")
        message = db.exec(select(HubConversationMessage)).first()
        _memory(db, "mem_old", "OLDGOAL nurse", used=NOW - timedelta(days=400), updated=NOW - timedelta(days=500), message=message)
        _memory(db, "mem_never_used", "NEVERUSED welder", used=None, updated=NOW - timedelta(days=366))
        _memory(db, "mem_used", "USEDGOAL chef", used=NOW - timedelta(days=30), updated=NOW - timedelta(days=500))
        _memory(db, "mem_edited", "EDITED pilot", used=None, updated=NOW - timedelta(days=100))

        counts = retention.run_once(db, NOW)

        assert counts["memories"] == 2
        assert sorted(m.memory_uuid for m in db.exec(select(HubMemory)).all()) == ["mem_edited", "mem_used"]
        assert "OLDGOAL" not in _text(db) and "NEVERUSED" not in _text(db)
        assert db.exec(select(HubMemorySource)).all() == []
        assert db.get(HubConversation, recent.id) is not None


def test_conversations_idle_for_two_years_are_deleted_with_everything_on_them():
    with _session() as db:
        _member(db)
        _conversation(db, "conv_old", NOW - timedelta(days=731), words="OLDCHAT about nursing")
        _conversation(db, "conv_new", NOW - timedelta(days=700), words="Newer chat")

        counts = retention.run_once(db, NOW)

        assert counts["conversations"] == 1
        assert [c.conversation_uuid for c in db.exec(select(HubConversation)).all()] == ["conv_new"]
        assert "OLDCHAT" not in _text(db)
        assert [q.question_uuid for q in db.exec(select(HubQuestion)).all()] == ["conv_new_q"]


def test_reports_older_than_a_year_are_deleted():
    with _session() as db:
        _member(db)
        conversation = _conversation(db, "conv_new", NOW - timedelta(days=5))
        old = db.exec(select(CoachReport)).one()
        old.created_at = NOW - timedelta(days=400)
        db.add(old)
        db.add(CoachReport(report_uuid="fresh", conversation_id=conversation.id, message_uuid="x", reason="other", created_at=NOW - timedelta(days=5)))
        db.commit()

        assert retention.run_once(db, NOW)["reports"] == 1
        assert [r.report_uuid for r in db.exec(select(CoachReport)).all()] == ["fresh"]


def test_leaving_an_organization_deletes_its_coach_data_after_60_days_only():
    with _session() as db:
        _member(db, ORG)
        _member(db, OTHER_ORG)
        _conversation(db, "conv_left", NOW - timedelta(days=3), org_id=ORG, words="LEFTORG chat")
        _memory(db, "mem_left", "LEFTORG memory", used=NOW, updated=NOW, org_id=ORG)
        _conversation(db, "conv_stay", NOW - timedelta(days=3), org_id=OTHER_ORG, words="Other org chat")
        _memory(db, "mem_stay", "Other org memory", used=NOW, updated=NOW, org_id=OTHER_ORG)

        membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == ORG)).one()
        db.delete(membership)
        db.commit()  # the epp check inside cleanup inspects the schema, which on in-memory SQLite resets an open transaction
        cleanup_after_removal(db, ORG, LEARNER)
        db.commit()
        departure = db.exec(select(CoachDeparture)).one()
        departure.left_at = NOW - timedelta(days=59)
        db.add(departure)
        db.commit()

        retention.run_once(db, NOW)
        assert "LEFTORG" in _text(db)

        counts = retention.run_once(db, NOW + timedelta(days=2))
        assert counts == {"memories": 1, "conversations": 1, "reports": 0}
        assert "LEFTORG" not in _text(db)
        assert "Other org chat" in _text(db) and "Other org memory" in _text(db)
        assert db.exec(select(CoachDeparture)).all() == []


def test_rejoining_before_60_days_keeps_the_data_and_older_removals_start_the_clock():
    with _session() as db:
        _conversation(db, "conv_orphan", NOW - timedelta(days=3), words="ORPHAN chat")
        # No membership and no departure noted (removed before this job existed): the clock starts now.
        retention.run_once(db, NOW)
        assert db.exec(select(CoachDeparture)).one().left_at == NOW
        assert "ORPHAN" in _text(db)

        _member(db)  # rejoined
        retention.run_once(db, NOW + timedelta(days=61))
        assert "ORPHAN" in _text(db)
        assert db.exec(select(CoachDeparture)).all() == []
