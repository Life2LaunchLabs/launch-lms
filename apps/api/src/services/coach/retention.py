"""How long Coach keeps what it knows about a learner, and the daily job that deletes the rest.

The periods are the published retention policy (the Data page, /data#retention, reads the same
numbers from apps/web/lib/legal/facts.ts). Henry approved them on 2026-11-16 (DEV-125):

- a memory is erased 12 months after Coach last used it (or after it was saved or edited);
- a conversation is deleted 24 months after its last message, with its messages, receipts,
  questions and reports;
- a report of a Coach reply is deleted 12 months after it was made;
- when a learner leaves an organization, that organization's Coach memories and conversations
  are deleted 60 days later, unless they rejoin first.

Closing an account deletes everything tied to it within 30 days (services/users/files.py).
Deletion is real: memories go through hub_memory.erase_memories, and conversations are deleted
with everything that hangs off them. The job logs counts, never text.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, tuple_
from sqlmodel import Session, col, select

from src.db.coach import CoachDeparture, CoachReport
from src.db.hub import HubConversation, HubMemory
from src.db.user_organizations import UserOrganization
from src.services.hub_memory import erase_memories

logger = logging.getLogger(__name__)

MEMORY_UNUSED = timedelta(days=365)
CONVERSATION_IDLE = timedelta(days=730)
REPORT_AGE = timedelta(days=365)
AFTER_LEAVING = timedelta(days=60)
BATCH = 500


def note_departure(db: Session, org_id: int, user_id: int, when: datetime | None = None) -> None:
    """Record that a learner left an organization (called as their membership is removed; the caller commits)."""
    row = db.exec(select(CoachDeparture).where(CoachDeparture.org_id == org_id, CoachDeparture.user_id == user_id)).first()
    if row is None:
        db.add(CoachDeparture(org_id=org_id, user_id=user_id, left_at=when or datetime.utcnow()))


def _delete_conversations(db: Session, ids: list[int]) -> int:
    """Delete conversations; their messages, receipts, questions, edit runs and reports go with them (ON DELETE CASCADE)."""
    if not ids:
        return 0
    db.exec(delete(CoachReport).where(col(CoachReport.conversation_id).in_(ids)))  # type: ignore[call-overload]
    db.exec(delete(HubConversation).where(col(HubConversation.id).in_(ids)))  # type: ignore[call-overload]
    return len(ids)


def _memories(db: Session, where) -> int:
    total = 0
    while True:
        rows = list(db.exec(select(HubMemory).where(where).limit(BATCH)).all())
        if not rows:
            return total
        total += erase_memories(db, rows)
        db.commit()


def _conversations(db: Session, where) -> int:
    total = 0
    while True:
        ids = [int(i) for i in db.exec(select(HubConversation.id).where(where).limit(BATCH)).all()]
        if not ids:
            return total
        total += _delete_conversations(db, ids)
        db.commit()


def _record_unnoticed_departures(db: Session, now: datetime) -> None:
    """Coach data in an organization the learner no longer belongs to, with no departure noted (older removals): start the clock now."""
    members = select(UserOrganization.org_id, UserOrganization.user_id)
    noted = select(CoachDeparture.org_id, CoachDeparture.user_id)
    owners = set()
    for model in (HubMemory, HubConversation):
        pair = tuple_(model.org_id, model.user_id)
        owners |= set(db.exec(select(model.org_id, model.user_id).where(pair.not_in(members), pair.not_in(noted)).distinct()).all())
    for org_id, user_id in owners:
        db.add(CoachDeparture(org_id=org_id, user_id=user_id, left_at=now))
    db.commit()


def _departures(db: Session, now: datetime) -> tuple[int, int]:
    memories = conversations = 0
    for row in db.exec(select(CoachDeparture)).all():
        rejoined = db.exec(select(UserOrganization.id).where(UserOrganization.org_id == row.org_id, UserOrganization.user_id == row.user_id)).first()
        if rejoined is None and row.left_at > now - AFTER_LEAVING:
            continue
        if rejoined is None:
            mine = (HubMemory.org_id == row.org_id) & (HubMemory.user_id == row.user_id)
            memories += _memories(db, mine)
            conversations += _conversations(db, (HubConversation.org_id == row.org_id) & (HubConversation.user_id == row.user_id))
        db.delete(row)
        db.commit()
    return memories, conversations


def run_once(db: Session, now: datetime | None = None) -> dict:
    """Delete everything past its period. Returns counts."""
    now = now or datetime.utcnow()
    last_touched = func.coalesce(HubMemory.last_used_at, HubMemory.updated_at)
    memories = _memories(db, or_(last_touched < now - MEMORY_UNUSED, last_touched.is_(None) & (HubMemory.created_at < now - MEMORY_UNUSED)))
    conversations = _conversations(db, HubConversation.updated_at < now - CONVERSATION_IDLE)
    reports = len(db.exec(select(CoachReport.id).where(CoachReport.created_at < now - REPORT_AGE)).all())
    if reports:
        db.exec(delete(CoachReport).where(CoachReport.created_at < now - REPORT_AGE))  # type: ignore[call-overload]
        db.commit()
    _record_unnoticed_departures(db, now)
    left_memories, left_conversations = _departures(db, now)
    return {
        "memories": memories + left_memories,
        "conversations": conversations + left_conversations,
        "reports": reports,
    }


def run_with(engine) -> dict:
    with Session(engine) as db:
        counts = run_once(db)
    if any(counts.values()):
        logger.info("Coach retention deleted %(memories)s memories, %(conversations)s conversations, %(reports)s reports", counts)
    return counts


async def run_forever(engine, every: int = 6 * 3600) -> None:
    """Started with the app: applies the retention periods every six hours (each run is idempotent)."""
    import asyncio

    while True:
        try:
            await asyncio.to_thread(run_with, engine)
        except Exception:
            logger.exception("Coach retention run failed; will retry")
        await asyncio.sleep(every)
