"""Cards the app posts into chats for people, such as "3 comments on Earn a nursing degree"."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.db.goal_comments import GoalComment
from src.db.goals import Goal
from src.services.connect import chats
from src.services.goals.sharing_roles import _stamp

GOAL_COMMENTS = "goal_comments"


def _summary(card: dict) -> str:
    title = card["goal_title"]
    if card["count"] == 1:
        return f"{'Mentioned you' if card['mentioned'] else 'Commented'} on {title}"
    return f"{card['count']} comments on {title}" + (", and mentioned you" if card["mentioned"] else "")


def goal_comment(db: Session, goal: Goal, comment: GoalComment, recipient_id: int, mentioned: bool = False) -> ConversationMessage | None:
    """Tell someone about a comment in their chat with its author.

    Comments that pile up before they look are gathered into one card, so a burst of
    comments reads as "3 comments on X" rather than three rows.
    """
    author_id = comment.author_user_id
    conversation = chats.ensure_direct(db, int(author_id), recipient_id) if author_id else None
    if not conversation:
        return None
    reader = db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == recipient_id,
    )).first()
    last = chats._last(db, conversation)
    unseen = last and (not reader or not reader.last_read_at or reader.last_read_at < last.update_date)
    if unseen and last.kind == "card" and last.sender_user_id == author_id and (last.card or {}).get("type") == GOAL_COMMENTS and last.card.get("goal_uuid") == goal.goal_uuid:  # type: ignore[union-attr]
        card = {**last.card, "count": int(last.card.get("count") or 1) + 1, "mentioned": bool(last.card.get("mentioned")) or mentioned,  # type: ignore[union-attr]
                "comment_uuid": comment.comment_uuid, "step_uuid": comment.step_uuid, "excerpt": comment.body[:140], "goal_title": goal.title}
        now = _stamp()
        last.card, last.body, last.update_date = card, _summary(card), now  # type: ignore[union-attr]
        conversation.last_message_at, conversation.update_date = now, now
        db.add(last)
        db.add(conversation)
        db.flush()
        return last  # type: ignore[return-value]
    card = {
        "type": GOAL_COMMENTS, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "count": 1, "mentioned": mentioned,
        "comment_uuid": comment.comment_uuid, "step_uuid": comment.step_uuid, "excerpt": comment.body[:140],
    }
    return chats.post(db, conversation, int(author_id), _summary(card), kind="card", card=card)  # type: ignore[arg-type]
