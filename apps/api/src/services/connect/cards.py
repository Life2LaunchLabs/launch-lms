"""Cards the app posts into chats for people, such as "3 comments on your portfolio"."""

from __future__ import annotations

from typing import Callable

from sqlmodel import Session, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.services.connect import chats
from src.services.goals.sharing_roles import _stamp

PORTFOLIO_COMMENTS = "portfolio_comments"
PORTFOLIO_SHARED = "portfolio_shared"
GROUP_REPORT = "group_report"


def _summary(card: dict, school: bool = False) -> str:
    title = card.get("goal_title") or card.get("item_title") or "your portfolio"
    # In a school chat everyone reads the same card, so "mentioned you" would be wrong for most of them.
    mentioned = bool(card.get("mentioned")) and not school
    if card["count"] == 1:
        return f"{'Mentioned you' if mentioned else 'Commented'} on {title}"
    return f"{card['count']} comments on {title}" + (", and mentioned you" if mentioned else "")


def _gather(db: Session, author_id: int | None, recipient_id: int, same: Callable[[dict], bool], card: dict) -> ConversationMessage | None:
    """Post a comment card where the author and recipient talk.

    That's their direct chat, or the student's school chat when one of them is the other's
    staff. Comments that pile up before the recipient looks are gathered into one card, so a
    burst of comments reads as "3 comments on X" rather than three rows; in a school chat each
    comment is counted once however many staff hear about it.
    """
    from src.services.school import chats as school_chats

    if not author_id:
        return None
    conversation = school_chats.for_pair(db, int(author_id), recipient_id) or chats.ensure_direct(db, int(author_id), recipient_id)
    if not conversation:
        return None
    school = conversation.kind == school_chats.SCHOOL
    mentioned_ids = [recipient_id] if card.get("mentioned") else []
    reader = db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == recipient_id,
    )).first()
    last = chats._last(db, conversation)
    similar = last and last.kind == "card" and last.sender_user_id == author_id and last.card and last.card.get("type") == card["type"] and same(last.card)
    if similar:
        previous = dict(last.card)  # type: ignore[union-attr, arg-type]
        seen_comments = list(previous.get("comment_uuids") or [previous.get("comment_uuid")])
        repeat = card.get("comment_uuid") in seen_comments
        unseen = not reader or not reader.last_read_at or reader.last_read_at < last.update_date  # type: ignore[union-attr]
        if repeat or unseen:
            merged = {**previous, **card, "comment_uuids": seen_comments if repeat else [*seen_comments, card.get("comment_uuid")],
                      "mentioned": bool(previous.get("mentioned")) or bool(card.get("mentioned")),
                      "mentioned_user_ids": sorted({*(previous.get("mentioned_user_ids") or []), *mentioned_ids})}
            merged["count"] = len(merged["comment_uuids"])
            now = _stamp()
            last.card, last.body = merged, _summary(merged, school)  # type: ignore[union-attr]
            if not repeat:
                last.update_date = now  # type: ignore[union-attr]
                conversation.last_message_at, conversation.update_date = now, now
                db.add(conversation)
            db.add(last)
            db.flush()
            return last  # type: ignore[return-value]
    fresh = {**card, "count": 1, "comment_uuids": [card.get("comment_uuid")], "mentioned_user_ids": mentioned_ids}
    return chats.post(db, conversation, int(author_id), _summary(fresh, school), kind="card", card=fresh)


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


def group_report(db: Session, sender_id: int, recipient_id: int, card: dict) -> ConversationMessage | None:
    """Send a group's progress report to a colleague, in their direct chat. The card links to the live report."""
    conversation = chats.ensure_direct(db, sender_id, recipient_id)
    if not conversation:
        return None
    body = card.get("message") or f"Progress report: {card.get('group_name') or 'a group'}"
    return chats.post(db, conversation, sender_id, body, kind="card", card=card)
