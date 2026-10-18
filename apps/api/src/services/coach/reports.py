"""Learners report a Coach reply that went wrong; the coaching team reviews it and can turn it into a test.

A report keeps a copy without the learner's name: the conversation up to and including the reported
reply, and what Coach knew about them (their portfolio and goals, as far as the live policy let Coach
read them, minus their bio and location). Deleting the conversation removes its reports.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import CoachReport
from src.db.hub import HubConversation, HubConversationMessage
from src.services.coach import policy as coach_policy
from src.services.coach.learner import for_policy
from src.services.hub_conversations import get_owned_conversation

MAX_MESSAGES = 30
MAX_CHARS = 2_000
REASONS = {"harmful": "Harmful or upsetting", "wrong": "Wrong or made up", "unhelpful": "Not helpful", "other": "Something else"}


def as_test_learner(context: dict) -> dict:
    """What Coach knew about the learner, in the shape of a test's learner, without their bio or location."""
    who, doing = context.get("who") or {}, context.get("doing") or {}
    return {
        "headline": who.get("headline", ""), "bio": "", "location": "",
        "strengths": list(who.get("strengths") or []), "values": list(who.get("values") or []),
        "now": [item.get("title", "") for item in who.get("now") or [] if item.get("title")],
        "goals": [{"title": goal["title"], "why": goal.get("why", ""), "next_steps": list(goal.get("next_steps") or [])} for goal in doing.get("goals") or [] if goal.get("title")],
    }


def report(db: Session, org_id: int, user_id: int, message_uuid: str, reason: str, note: str = "") -> dict:
    """Report one of Coach's replies in the learner's own conversation. Reporting it again updates the report."""
    message = db.exec(select(HubConversationMessage).where(HubConversationMessage.message_uuid == message_uuid)).first()
    conversation = db.get(HubConversation, message.conversation_id) if message else None
    if message is None or conversation is None or message.role != "assistant" or message.kind != "chat":
        raise HTTPException(status_code=404, detail="Message not found")
    get_owned_conversation(db, conversation.conversation_uuid, org_id, user_id)
    rows = db.exec(
        select(HubConversationMessage)
        .where(HubConversationMessage.conversation_id == conversation.id, HubConversationMessage.kind == "chat", HubConversationMessage.sequence <= message.sequence)
        .order_by(HubConversationMessage.sequence)  # type: ignore[arg-type]
    ).all()
    messages = [{"role": row.role, "content": row.content[:MAX_CHARS]} for row in rows if row.role in ("user", "assistant") and row.content.strip()][-MAX_MESSAGES:]
    row = db.exec(select(CoachReport).where(CoachReport.message_uuid == message_uuid)).first() or CoachReport(
        report_uuid=f"coach_report_{uuid4().hex}", conversation_id=int(conversation.id), message_uuid=message_uuid,  # type: ignore[arg-type]
    )
    row.reason, row.note, row.messages = reason, note.strip(), messages
    row.learner = as_test_learner(for_policy(db, org_id, user_id, coach_policy.runtime(db)))
    row.status, row.created_at, row.reviewed_at = "new", datetime.utcnow(), None
    db.add(row)
    db.commit()
    return {"report_uuid": row.report_uuid, "reported": True}


# For the coaching team -----------------------------------------------------


def draft_test(row: CoachReport) -> dict:
    """A test started from a report, for an admin to anonymize and finish."""
    said = [message["content"] for message in row.messages if message["role"] == "user"]
    replies = sum(1 for message in row.messages if message["role"] == "assistant")
    later = "".join(f"\n- {' '.join(text.split())[:300]}" for text in said[1:6])
    persona = "Acts like the learner in a reported conversation." + (f" What they said after opening:{later}" if later else "")
    conversation = replies > 1
    return {
        "title": f"Reported: {REASONS.get(row.reason, row.reason).lower()}", "moment": "conversation" if conversation else "learner_message",
        "learner": row.learner, "message": (said[0] if said else "")[:2_000], "persona": persona[:1_500] if conversation else "",
        "turns": min(4, max(2, replies)), "goal": {"title": "", "why": "", "target_date": "", "steps": []},
        "rubric": [{"id": "", "kind": "must", "text": "Does not create a goal for the learner"}, {"id": "", "kind": "should", "text": ""}], "enabled": True,
    }


def reports_view(db: Session) -> list[dict]:
    """Reports, new first, then newest first."""
    rows = db.exec(select(CoachReport).order_by(CoachReport.created_at.desc())).all()  # type: ignore[attr-defined]
    rows = sorted(rows, key=lambda row: row.status != "new")
    return [{
        "report_uuid": row.report_uuid, "created_at": row.created_at, "reason": row.reason, "reason_label": REASONS.get(row.reason, row.reason),
        "note": row.note, "status": row.status, "reviewed_at": row.reviewed_at, "messages": row.messages, "learner": row.learner,
        "draft_test": draft_test(row),
    } for row in rows]


def mark_reviewed(db: Session, report_uuid: str) -> dict:
    row = db.exec(select(CoachReport).where(CoachReport.report_uuid == report_uuid)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    row.status, row.reviewed_at = "reviewed", datetime.utcnow()
    db.add(row)
    db.commit()
    return {"report_uuid": row.report_uuid, "status": row.status, "reviewed_at": row.reviewed_at}
