"""Invitations and notices as messages from whoever sent them.

An organization's invitation (to join it, to start a plan it assigned you, to help on a plan) or
notice (a welcome) is a card in your chat with that organization, and a person's invitation is a
card in your chat with them. Cards are answered right there and show how they were answered.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMessage
from src.db.goals import Goal, GoalOwnership, GoalStatus
from src.db.messages import InboxMessage
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.services.connect import chats, people
from src.services.connect.workspace import ORG_SOURCES, _value
from src.services.school import chats as school_chats

INVITATION = "invitation"
NOTICE = "notice"


def _stamp(value: datetime | str | None) -> str:
    if isinstance(value, str) and value:
        return value
    value = value if isinstance(value, datetime) else datetime.now(timezone.utc)
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _where(db: Session, user_id: int, org_id: int | None, sender_id: int | None) -> Conversation | None:
    """An organization's chat with you, or (while it has too few staff to start) your chat with the person who sent it."""
    conversation = school_chats.school_chat(db, org_id, user_id) if org_id else None
    if conversation:
        return conversation
    if sender_id and sender_id != user_id:
        return chats.ensure_direct(db, sender_id, user_id)
    return None


def _inbox_card(message: InboxMessage) -> tuple[str, dict]:
    if message.action_kind:
        data = message.action_data or {}
        card = {"type": INVITATION, "source": "inbox", "inbox_uuid": message.message_uuid, "action_kind": message.action_kind,
                "subject": message.subject, "text": message.body, "goal_uuid": data.get("goal_uuid") if isinstance(data.get("goal_uuid"), str) else None}
        return message.body or message.subject, card
    return message.subject, {"type": NOTICE, "subject": message.subject, "text": message.body}


def _goal_card(db: Session, goal: Goal) -> tuple[str, dict]:
    org = db.get(Organization, goal.org_id) if goal.org_id else None
    body = f"{org.name if org else 'An organization'} invited you to start {goal.title}"
    return body, {"type": INVITATION, "source": "goal", "goal_uuid": goal.goal_uuid, "subject": goal.title, "text": body}


def deliver(db: Session, current_user: PublicUser) -> None:
    """Put invitations and notices sent to you into the chats they belong in, once each."""
    from src.services.messages import _claim_email_messages

    _claim_email_messages(current_user, db)
    user_id = int(current_user.id)
    wanted: dict[str, tuple[int | None, int | None, str, str, dict]] = {}
    for message in db.exec(select(InboxMessage).where(InboxMessage.recipient_user_id == user_id)).all():
        body, card = _inbox_card(message)
        wanted[f"chat_message_inbox_{message.message_uuid}"] = (message.sender_org_id, message.sender_user_id, _stamp(message.created_at), body, card)
    # A plan an organization assigned you waits for your yes in your chat with it.
    for goal in db.exec(select(Goal).where(
        Goal.subject_user_id == user_id, Goal.ownership == GoalOwnership.EXTERNAL.value, col(Goal.source).in_(ORG_SOURCES), Goal.status == GoalStatus.PENDING.value,
    )).all():
        body, card = _goal_card(db, goal)
        wanted[f"chat_message_invite_{goal.goal_uuid}_{user_id}"] = (goal.org_id, None, _stamp(goal.creation_date), body, card)
        # Without an organization chat yet, the invitation waits in your chat with whoever assigned it.
        if not school_chats.find(db, int(goal.org_id), user_id) and goal.owner_user_id != user_id:  # type: ignore[arg-type]
            wanted[f"chat_message_invite_{goal.goal_uuid}_{user_id}"] = (goal.org_id, goal.owner_user_id, _stamp(goal.creation_date), body, card)
    if not wanted:
        return
    have = set(db.exec(select(ConversationMessage.message_uuid).where(col(ConversationMessage.message_uuid).in_(list(wanted)))).all())
    placed = False
    for uuid, (org_id, sender_id, stamp, body, card) in wanted.items():
        conversation = None if uuid in have else _where(db, user_id, org_id, sender_id)
        if not conversation:
            continue
        db.add(ConversationMessage(message_uuid=uuid, conversation_id=int(conversation.id), sender_user_id=sender_id, kind="card",  # type: ignore[arg-type]
                                   body=body, card={**card, "recipient_user_id": user_id}, creation_date=stamp, update_date=stamp))
        if not conversation.last_message_at or conversation.last_message_at < stamp:
            conversation.last_message_at = conversation.update_date = stamp
            db.add(conversation)
        placed = True
    if placed:
        db.commit()


def live(db: Session, card: dict | None, viewer_id: int) -> dict | None:
    """An invitation card as it stands now: waiting, accepted or declined, and whether it's yours to answer."""
    if not card or card.get("type") != INVITATION:
        return card
    recipient = card.get("recipient_user_id")
    state = "pending"
    if card.get("source") == "goal":
        goal = db.exec(select(Goal).where(Goal.goal_uuid == card.get("goal_uuid"))).first()
        status = _value(goal.status) if goal else GoalStatus.ARCHIVED.value
        state = "pending" if status == GoalStatus.PENDING.value else "declined" if status == GoalStatus.ARCHIVED.value else "accepted"
    else:
        message = db.exec(select(InboxMessage).where(InboxMessage.message_uuid == card.get("inbox_uuid"))).first()
        state = (message.action_status or "pending") if message else "expired"
    mine = recipient == viewer_id
    summary = None if mine else people.person(db, recipient)
    return {**card, "state": state, "for_me": mine, "for_name": summary["name"] if summary else None}
