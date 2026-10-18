"""Cards the app posts into chats for people, such as "3 comments on Earn a nursing degree"."""

from __future__ import annotations

from typing import Callable

from sqlmodel import Session, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.db.goal_comments import GoalComment
from src.db.goals import Goal
from src.services.connect import chats
from src.services.goals.sharing_roles import _stamp

GOAL_COMMENTS = "goal_comments"
PORTFOLIO_COMMENTS = "portfolio_comments"
PORTFOLIO_SHARED = "portfolio_shared"


def _summary(card: dict) -> str:
    title = card.get("goal_title") or card.get("item_title") or "your portfolio"
    if card["count"] == 1:
        return f"{'Mentioned you' if card.get('mentioned') else 'Commented'} on {title}"
    return f"{card['count']} comments on {title}" + (", and mentioned you" if card.get("mentioned") else "")


def _gather(db: Session, author_id: int | None, recipient_id: int, same: Callable[[dict], bool], card: dict) -> ConversationMessage | None:
    """Post a comment card in the author's chat with the recipient.

    Comments that pile up before the recipient looks are gathered into one card, so a burst
    of comments reads as "3 comments on X" rather than three rows.
    """
    conversation = chats.ensure_direct(db, int(author_id), recipient_id) if author_id else None
    if not conversation:
        return None
    reader = db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == recipient_id,
    )).first()
    last = chats._last(db, conversation)
    unseen = last and (not reader or not reader.last_read_at or reader.last_read_at < last.update_date)
    if unseen and last.kind == "card" and last.sender_user_id == author_id and last.card and last.card.get("type") == card["type"] and same(last.card):  # type: ignore[union-attr]
        merged = {**last.card, **card, "count": int(last.card.get("count") or 1) + 1, "mentioned": bool(last.card.get("mentioned")) or bool(card.get("mentioned"))}  # type: ignore[union-attr]
        now = _stamp()
        last.card, last.body, last.update_date = merged, _summary(merged), now  # type: ignore[union-attr]
        conversation.last_message_at, conversation.update_date = now, now
        db.add(last)
        db.add(conversation)
        db.flush()
        return last  # type: ignore[return-value]
    return chats.post(db, conversation, int(author_id), _summary({**card, "count": 1}), kind="card", card={**card, "count": 1})  # type: ignore[arg-type]


def goal_comment(db: Session, goal: Goal, comment: GoalComment, recipient_id: int, mentioned: bool = False) -> ConversationMessage | None:
    """Tell someone about a comment on a goal, in their chat with its author."""
    card = {
        "type": GOAL_COMMENTS, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "mentioned": mentioned,
        "comment_uuid": comment.comment_uuid, "step_uuid": comment.step_uuid, "excerpt": comment.body[:140],
    }
    return _gather(db, comment.author_user_id, recipient_id, lambda last: last.get("goal_uuid") == goal.goal_uuid, card)


def portfolio_comment(db: Session, username: str, item_title: str, comment_uuid: str, body: str, author_id: int, recipient_id: int) -> ConversationMessage | None:
    """Tell someone about a comment on a portfolio, in their chat with its author."""
    card = {"type": PORTFOLIO_COMMENTS, "username": username, "item_title": item_title, "comment_uuid": comment_uuid, "excerpt": body[:140]}
    return _gather(db, author_id, recipient_id, lambda last: last.get("username") == username, card)


def portfolio_shared(db: Session, owner_id: int, username: str, recipient_id: int, role: str) -> ConversationMessage | None:
    """Tell someone they were added to a portfolio."""
    conversation = chats.ensure_direct(db, owner_id, recipient_id)
    if not conversation:
        return None
    verb = "comment on" if role == "commenter" else "see"
    card = {"type": PORTFOLIO_SHARED, "username": username, "role": role}
    return chats.post(db, conversation, owner_id, f"Added you to their portfolio, so you can {verb} it", kind="card", card=card)
