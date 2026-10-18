"""Learners share a Coach conversation with the coaching team, who can learn from it or turn it into a test.

Sharing is the learner's choice, one conversation at a time, and they can stop sharing it. The team
gets a copy without the learner's name: the messages, and what Coach knew about them (their portfolio
and goals, as far as the live policy let Coach read them) when they shared it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import CoachSharedConversation
from src.db.hub import HubConversation, HubConversationMessage
from src.services.coach import policy as coach_policy
from src.services.coach.learner import for_policy
from src.services.hub_conversations import get_owned_conversation

MAX_MESSAGES = 30
MAX_CHARS = 2_000


def _share_for(db: Session, conversation: HubConversation) -> CoachSharedConversation | None:
    return db.exec(select(CoachSharedConversation).where(CoachSharedConversation.conversation_id == conversation.id)).first()


def as_test_learner(context: dict) -> dict:
    """What Coach knew about the learner, in the shape of a test's learner."""
    who, doing = context.get("who") or {}, context.get("doing") or {}
    return {
        "headline": who.get("headline", ""), "bio": who.get("bio", ""), "location": who.get("location", ""),
        "strengths": list(who.get("strengths") or []), "values": list(who.get("values") or []),
        "now": [item.get("title", "") for item in who.get("now") or [] if item.get("title")],
        "goals": [{"title": goal["title"], "why": goal.get("why", ""), "next_steps": list(goal.get("next_steps") or [])} for goal in doing.get("goals") or [] if goal.get("title")],
    }


def status(db: Session, org_id: int, user_id: int, conversation_uuid: str) -> dict:
    share = _share_for(db, get_owned_conversation(db, conversation_uuid, org_id, user_id))
    return {"shared": share is not None, "shared_at": share.shared_at if share else None, "note": share.note if share else ""}


def share(db: Session, org_id: int, user_id: int, conversation_uuid: str, note: str = "") -> dict:
    """Share the conversation as it is now; sharing again replaces the copy."""
    conversation = get_owned_conversation(db, conversation_uuid, org_id, user_id)
    rows = db.exec(
        select(HubConversationMessage)
        .where(HubConversationMessage.conversation_id == conversation.id, HubConversationMessage.kind == "chat")
        .order_by(HubConversationMessage.sequence)  # type: ignore[arg-type]
    ).all()
    messages = [{"role": row.role, "content": row.content[:MAX_CHARS]} for row in rows if row.role in ("user", "assistant") and row.content.strip()][-MAX_MESSAGES:]
    if not any(message["role"] == "user" for message in messages):
        raise HTTPException(status_code=422, detail="There's nothing in this conversation to share yet.")
    learner = as_test_learner(for_policy(db, org_id, user_id, coach_policy.runtime(db)))
    row = _share_for(db, conversation) or CoachSharedConversation(share_uuid=f"coach_share_{uuid4().hex}", conversation_id=int(conversation.id))  # type: ignore[arg-type]
    row.messages, row.learner, row.note, row.shared_at = messages, learner, note.strip(), datetime.utcnow()
    db.add(row)
    db.commit()
    return status(db, org_id, user_id, conversation_uuid)


def unshare(db: Session, org_id: int, user_id: int, conversation_uuid: str) -> dict:
    row = _share_for(db, get_owned_conversation(db, conversation_uuid, org_id, user_id))
    if row is not None:
        db.delete(row)
        db.commit()
    return {"shared": False, "shared_at": None, "note": ""}


# For the coaching team -----------------------------------------------------


def draft_test(row: CoachSharedConversation) -> dict:
    """A conversation test started from a shared conversation, for an admin to finish."""
    said = [message["content"] for message in row.messages if message["role"] == "user"]
    replies = sum(1 for message in row.messages if message["role"] == "assistant")
    later = "".join(f"\n- {' '.join(text.split())[:300]}" for text in said[1:6])
    persona = "Acts like the learner in a shared conversation." + (f" What they said after opening:{later}" if later else "")
    return {
        "title": "", "moment": "conversation", "learner": row.learner, "message": said[0][:2_000], "persona": persona[:1_500],
        "turns": min(4, max(2, replies)), "goal": {"title": "", "why": "", "target_date": "", "steps": []},
        "rubric": [{"id": "", "kind": "must", "text": "Does not create a goal for the learner"}, {"id": "", "kind": "should", "text": ""}], "enabled": True,
    }


def shared_view(db: Session) -> list[dict]:
    rows = db.exec(select(CoachSharedConversation).order_by(CoachSharedConversation.shared_at.desc())).all()  # type: ignore[attr-defined]
    return [{
        "share_uuid": row.share_uuid, "shared_at": row.shared_at, "note": row.note, "messages": row.messages, "learner": row.learner,
        "draft_test": draft_test(row),
    } for row in rows]


def dismiss(db: Session, share_uuid: str) -> None:
    row = db.exec(select(CoachSharedConversation).where(CoachSharedConversation.share_uuid == share_uuid)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Shared conversation not found.")
    db.delete(row)
    db.commit()
