"""Reactions: a cheer on a message, from anyone who can read it.

Reactions on a staff-only message stay with it, so learners never see them either.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.conversations import ConversationMessage, ConversationReaction
from src.db.users import PublicUser
from src.services.connect import visibility
from src.services.goals.sharing_roles import _stamp


def of(db: Session, message_id: int, viewer_id: int, cache: dict | None = None) -> list[dict]:
    """Each emoji on a message with how many and whether the viewer is one of them."""
    rows = cache.get(message_id) if cache is not None and message_id in cache else db.exec(
        select(ConversationReaction.emoji, ConversationReaction.user_id).where(ConversationReaction.message_id == message_id).order_by(col(ConversationReaction.id))).all()
    found: dict[str, dict] = {}
    for emoji, user_id in rows:
        entry = found.setdefault(emoji, {"emoji": emoji, "count": 0, "mine": False})
        entry["count"] += 1
        entry["mine"] = entry["mine"] or user_id == viewer_id
    return list(found.values())


def prefetch(db: Session, message_ids: list[int]) -> dict[int, list[tuple[str, int]]]:
    """Reactions for a page of messages in one query, for ``of``."""
    found: dict[int, list[tuple[str, int]]] = {message_id: [] for message_id in message_ids}
    if message_ids:
        for message_id, emoji, user_id in db.exec(select(ConversationReaction.message_id, ConversationReaction.emoji, ConversationReaction.user_id).where(
                col(ConversationReaction.message_id).in_(message_ids)).order_by(col(ConversationReaction.id))).all():
            found[int(message_id)].append((emoji, int(user_id)))
    return found


def toggle(db: Session, current_user: PublicUser, conversation_uuid: str, message_uuid: str, emoji: str) -> dict:
    """Add the viewer's reaction, or take it back when it's already there."""
    from src.services.connect import chats

    conversation, _ = chats._membership(db, conversation_uuid, current_user.id)
    query = select(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id, ConversationMessage.message_uuid == message_uuid)
    message = db.exec(visibility.for_viewer(query, db, conversation, current_user.id)).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    mine = db.exec(select(ConversationReaction).where(ConversationReaction.message_id == message.id, ConversationReaction.user_id == current_user.id,
                                                      ConversationReaction.emoji == emoji)).first()
    if mine:
        db.delete(mine)
    else:
        db.add(ConversationReaction(message_id=int(message.id), user_id=int(current_user.id), emoji=emoji, creation_date=_stamp()))  # type: ignore[arg-type]
    db.commit()
    return {"message_uuid": message_uuid, "reactions": of(db, int(message.id), int(current_user.id))}  # type: ignore[arg-type]
