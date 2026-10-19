"""Chats: the Connect list, opening a direct chat, sending, requests, blocking and reporting."""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import (
    ChatReportCreate,
    Conversation,
    ConversationMember,
    ConversationMessage,
    ConversationReport,
    DirectChatOpen,
    UserBlock,
)
from src.db.users import PublicUser, User
from src.services.connect import people
from src.services.goals.sharing_roles import _stamp, org_summary

PAGE = 60
# Statuses that keep a chat in someone's list.
LISTED = ("active", "request")
UNAVAILABLE = "This chat isn't available"


def _direct_key(a: int, b: int) -> str:
    low, high = sorted((a, b))
    return f"{low}:{high}"


def _members(db: Session, conversation: Conversation) -> list[ConversationMember]:
    return list(db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all())


def _membership(db: Session, conversation_uuid: str, user_id: int) -> tuple[Conversation, ConversationMember]:
    conversation = db.exec(select(Conversation).where(Conversation.conversation_uuid == conversation_uuid)).first()
    member = db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == user_id,
    )).first() if conversation else None
    if not conversation or not member:
        raise HTTPException(status_code=404, detail="Chat not found")
    return conversation, member


def _target(db: Session, payload: DirectChatOpen) -> User | None:
    if payload.user_uuid:
        return db.exec(select(User).where(User.user_uuid == payload.user_uuid)).first()
    handle = (payload.handle or "").strip().lstrip("@")
    if not handle:
        return None
    user = db.exec(select(User).where(col(User.username).ilike(handle))).first()
    return user if user and user.username.lower() == handle.lower() else None


def _create_direct(db: Session, a: int, b: int, b_status: str) -> Conversation:
    now = _stamp()
    conversation = Conversation(
        conversation_uuid=f"chat_{uuid4()}", kind="direct", direct_key=_direct_key(a, b), created_by_user_id=a,
        creation_date=now, update_date=now,
    )
    db.add(conversation)
    db.flush()
    for user_id, status in ((a, "active"), (b, b_status)):
        db.add(ConversationMember(conversation_id=int(conversation.id), user_id=user_id, status=status, creation_date=now, update_date=now))  # type: ignore[arg-type]
    db.flush()
    return conversation


def _direct(db: Session, a: int, b: int) -> Conversation | None:
    return db.exec(select(Conversation).where(Conversation.direct_key == _direct_key(a, b))).first()


def _set_status(db: Session, member: ConversationMember, status: str) -> None:
    member.status, member.update_date = status, _stamp()
    db.add(member)


def ensure_direct(db: Session, a: int, b: int) -> Conversation | None:
    """The direct chat between two people who share a goal, for the app to post into. None if either has stepped away."""
    if a == b or people.blocked(db, a, b):
        return None
    conversation = _direct(db, a, b)
    if not conversation:
        return _create_direct(db, a, b, "active")
    for member in _members(db, conversation):
        if member.status == "request":
            # They share a goal now, so an earlier request no longer needs accepting.
            _set_status(db, member, "active")
        elif member.status != "active":
            return None
    return conversation


def post(db: Session, conversation: Conversation, sender_id: int | None, body: str, kind: str = "text", card: dict | None = None, refs: list[dict] | None = None) -> ConversationMessage:
    now = _stamp()
    message = ConversationMessage(
        message_uuid=f"chat_message_{uuid4()}", conversation_id=int(conversation.id), sender_user_id=sender_id,  # type: ignore[arg-type]
        kind=kind, body=body, card=card, refs=refs or None, creation_date=now, update_date=now,
    )
    conversation.last_message_at, conversation.update_date = now, now
    db.add(message)
    db.add(conversation)
    if sender_id:
        sender = db.exec(select(ConversationMember).where(
            ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == sender_id,
        )).first()
        if sender:
            sender.last_read_at = now
            db.add(sender)
    db.flush()
    return message


def _unread(db: Session, conversation: Conversation, member: ConversationMember) -> int:
    query = select(func.count()).select_from(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id,
        col(ConversationMessage.sender_user_id).is_distinct_from(member.user_id),
    )
    if member.last_read_at:
        query = query.where(ConversationMessage.update_date > member.last_read_at)
    return int(db.exec(query).one())


def _last(db: Session, conversation: Conversation) -> ConversationMessage | None:
    return db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id).order_by(
        col(ConversationMessage.update_date).desc(), col(ConversationMessage.id).desc(),
    )).first()


def _message_dict(db: Session, message: ConversationMessage, viewer_id: int, cache: dict | None = None) -> dict:
    from src.services.connect import inbox, workspace

    refs = workspace.resolve(db, message.refs, {} if cache is None else cache, viewer_id)
    return {
        "message_uuid": message.message_uuid, "kind": message.kind, "body": message.body, "card": inbox.live(db, message.card, viewer_id), "refs": refs,
        "preview": workspace.plain(db, message.body, message.refs, viewer_id) if message.refs else message.body,
        "sender": people.person(db, message.sender_user_id), "mine": message.sender_user_id == viewer_id,
        "creation_date": message.creation_date, "update_date": message.update_date,
    }


def _chat_dict(db: Session, conversation: Conversation, member: ConversationMember) -> dict:
    others = [item for item in _members(db, conversation) if item.user_id != member.user_id]
    other_people = [summary for summary in (people.person(db, item.user_id) for item in others) if summary]
    # Someone who declined a request still looks like they haven't answered yet.
    waiting = conversation.kind == "direct" and any(item.status in ("request", "declined") for item in others)
    unavailable = conversation.kind == "direct" and (member.status == "blocked" or any(people.blocked(db, member.user_id, item.user_id) for item in others))
    last = _last(db, conversation)
    title = conversation.title or (other_people[0]["name"] if other_people else "Chat")
    return {
        "conversation_uuid": conversation.conversation_uuid, "kind": conversation.kind, "title": title,
        "people": other_people, "status": member.status,
        # Links and media stay off until both people have said yes to the chat.
        "accepted": member.status == "active" and not waiting,
        "waiting_for_them": waiting, "unavailable": unavailable,
        "unread": _unread(db, conversation, member) if member.status in LISTED else 0,
        "last_message": _message_dict(db, last, member.user_id) if last else None,
        "last_message_at": conversation.last_message_at,
        # An organization's chat with a learner names the organization, so it can be tagged.
        "org": org_summary(db, conversation.org_id) if conversation.kind == "school" else None,
    }


def list_chats(db: Session, current_user: PublicUser) -> dict:
    from src.services.connect import inbox

    # Invitations and notices are messages from whoever sent them.
    inbox.deliver(db, current_user)
    rows = db.exec(select(Conversation, ConversationMember).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(
        ConversationMember.user_id == current_user.id, col(ConversationMember.status).in_(LISTED),
        col(Conversation.last_message_at).is_not(None),
    ).order_by(col(Conversation.last_message_at).desc())).all()
    chats = [_chat_dict(db, conversation, member) for conversation, member in rows]
    return {
        "chats": chats,
        "unread": sum(chat["unread"] for chat in chats if chat["status"] == "active"),
        "requests": sum(1 for chat in chats if chat["status"] == "request"),
    }


def counts(db: Session, current_user: PublicUser) -> dict:
    listed = list_chats(db, current_user)
    return {"unread": listed["unread"], "requests": listed["requests"]}


def messages_of(db: Session, conversation: Conversation, viewer_id: int, before: str | None = None, goal_uuid: str | None = None, step_uuid: str | None = None) -> dict:
    """A page of a chat's messages, newest last, narrowed to one plan or step when asked."""
    from src.services.connect import workspace

    query = select(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id)
    if goal_uuid:
        query = workspace.filtered(query, db, conversation, goal_uuid, step_uuid)
    if before:
        query = query.where(ConversationMessage.creation_date < before)
    messages = list(reversed(db.exec(query.order_by(col(ConversationMessage.creation_date).desc(), col(ConversationMessage.id).desc()).limit(PAGE)).all()))
    cache: dict = {}
    return {
        "messages": [_message_dict(db, message, viewer_id, cache) for message in messages], "has_more": len(messages) == PAGE,
        # A shared workspace: the plans it's about, to filter by and to tag.
        "topics": workspace.topics(db, conversation) if conversation.kind in workspace.TOPIC_KINDS else [],
    }


def get_chat(db: Session, current_user: PublicUser, conversation_uuid: str, before: str | None = None, goal_uuid: str | None = None, step_uuid: str | None = None) -> dict:
    from src.services.connect import workspace

    conversation, member = _membership(db, conversation_uuid, current_user.id)
    return {
        **_chat_dict(db, conversation, member), "can_post": workspace.can_post(db, conversation, current_user.id),
        **messages_of(db, conversation, current_user.id, before, goal_uuid, step_uuid),
    }


def open_direct(db: Session, current_user: PublicUser, payload: DirectChatOpen) -> dict:
    """The chat with someone, started if needed. They must share a goal with you or have chosen to be findable."""
    target = _target(db, payload)
    target_id = int(target.id) if target else 0  # type: ignore[arg-type]
    if not target or target_id == current_user.id:
        raise HTTPException(status_code=404, detail="No one goes by that handle")
    if target_id in people.blocked_by_me(db, current_user.id):
        raise HTTPException(status_code=409, detail=f"You blocked @{target.username}. Unblock them to chat.")
    if people.blocked(db, current_user.id, target_id):
        raise HTTPException(status_code=404, detail="No one goes by that handle")
    from src.services.school import chats as school_chats

    school = school_chats.for_pair(db, current_user.id, target_id)
    if school:
        # Staff and their students talk in the student's school chat, never one to one.
        db.commit()
        return get_chat(db, current_user, school.conversation_uuid)
    conversation = _direct(db, current_user.id, target_id)
    if not conversation:
        known = people.knows(db, current_user.id, target_id)
        if not known and not people.discoverable(target):
            raise HTTPException(status_code=404, detail="No one goes by that handle")
        conversation = _create_direct(db, current_user.id, target_id, "active" if known else "request")
    _, member = _membership(db, conversation.conversation_uuid, current_user.id)
    if member.status in ("request", "declined"):
        # Reaching out yourself answers their request.
        _set_status(db, member, "active")
    db.commit()
    return get_chat(db, current_user, conversation.conversation_uuid)


def send(db: Session, current_user: PublicUser, conversation_uuid: str, body: str, scope: dict | None = None, share: dict[str, list[str]] | None = None) -> dict:
    """Send a message. Tagging your plan from elsewhere asks first whether to share it with the people here who can't see it."""
    from src.services.connect import linking, workspace

    conversation, member = _membership(db, conversation_uuid, current_user.id)
    text, refs, rows = workspace.prepare(db, conversation, body or "", current_user.id, scope)
    if not text:
        raise HTTPException(status_code=422, detail="Write a message first")
    if not workspace.can_post(db, conversation, current_user.id):
        raise HTTPException(status_code=403, detail="You can read this chat, but only people who can comment write in it")
    if member.status == "request":
        raise HTTPException(status_code=409, detail="Accept the request to reply")
    if member.status != "active":
        raise HTTPException(status_code=403, detail=UNAVAILABLE)
    others = [item for item in _members(db, conversation) if item.user_id != current_user.id]
    if conversation.kind == "direct":
        if any(people.blocked(db, current_user.id, item.user_id) for item in others):
            raise HTTPException(status_code=403, detail=UNAVAILABLE)
        if any(item.status in ("request", "declined") for item in others) and db.exec(select(ConversationMessage.id).where(
            ConversationMessage.conversation_id == conversation.id, ConversationMessage.sender_user_id == current_user.id,
        )).first():
            raise HTTPException(status_code=409, detail="You can send more once they accept your request")
    # A cohort chat never offers to share a learner's plan with the group: it stays private to whoever can't see it.
    blind = [] if conversation.kind == workspace.cohort.COHORT else linking.missing(db, conversation, refs, current_user.id)
    if blind and share is None:
        raise HTTPException(status_code=409, detail={"code": "needs_access", "plans": blind})
    shared = {item["goal_uuid"]: linking.share(db, current_user, conversation, item["goal_uuid"], (share or {}).get(item["goal_uuid"]) or [])
              for item in blind if (share or {}).get(item["goal_uuid"])}
    message = post(db, conversation, current_user.id, text, refs=refs)
    workspace.attach(db, message, rows)
    outcomes = workspace.after_send(db, current_user, conversation, message)
    db.commit()
    return {**_message_dict(db, message, current_user.id), "mentions": outcomes, "shared": shared}


def mark_read(db: Session, current_user: PublicUser, conversation_uuid: str) -> dict:
    conversation, member = _membership(db, conversation_uuid, current_user.id)
    last = _last(db, conversation)
    member.last_read_at = max(filter(None, [last.update_date if last else None, _stamp()]))
    db.add(member)
    db.commit()
    return counts(db, current_user)


def accept(db: Session, current_user: PublicUser, conversation_uuid: str) -> dict:
    _, member = _membership(db, conversation_uuid, current_user.id)
    if member.status not in ("request", "declined"):
        raise HTTPException(status_code=409, detail="This chat isn't waiting for you")
    _set_status(db, member, "active")
    db.commit()
    return get_chat(db, current_user, conversation_uuid)


def decline(db: Session, current_user: PublicUser, conversation_uuid: str) -> dict:
    """Delete a request: it leaves your list, and they aren't told."""
    _, member = _membership(db, conversation_uuid, current_user.id)
    if member.status != "request":
        raise HTTPException(status_code=409, detail="This chat isn't waiting for you")
    _set_status(db, member, "declined")
    db.commit()
    return counts(db, current_user)


def _other(db: Session, conversation: Conversation, user_id: int) -> int:
    others = [item.user_id for item in _members(db, conversation) if item.user_id != user_id]
    if conversation.kind != "direct" or not others:
        raise HTTPException(status_code=422, detail="Only direct chats can be blocked")
    return others[0]


def block(db: Session, current_user: PublicUser, conversation_uuid: str) -> dict:
    """Block the other person: neither of you can message the other, and the chat leaves your list."""
    conversation, member = _membership(db, conversation_uuid, current_user.id)
    other = _other(db, conversation, current_user.id)
    if other not in people.blocked_by_me(db, current_user.id):
        db.add(UserBlock(blocker_user_id=current_user.id, blocked_user_id=other, creation_date=_stamp()))
    _set_status(db, member, "blocked")
    db.commit()
    return counts(db, current_user)


def list_blocked(db: Session, current_user: PublicUser) -> list[dict]:
    return [summary for summary in (people.person(db, user_id) for user_id in sorted(people.blocked_by_me(db, current_user.id))) if summary]


def unblock(db: Session, current_user: PublicUser, user_uuid: str) -> dict:
    user = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    row = db.exec(select(UserBlock).where(UserBlock.blocker_user_id == current_user.id, UserBlock.blocked_user_id == user.id)).first() if user else None
    if not row:
        raise HTTPException(status_code=404, detail="You haven't blocked them")
    db.delete(row)
    conversation = _direct(db, current_user.id, int(user.id))  # type: ignore[union-attr, arg-type]
    if conversation:
        _, member = _membership(db, conversation.conversation_uuid, current_user.id)
        if member.status == "blocked":
            _set_status(db, member, "active")
    db.commit()
    return {"unblocked": True, "user_uuid": user_uuid}


def report(db: Session, current_user: PublicUser, conversation_uuid: str, payload: ChatReportCreate) -> dict:
    conversation, _ = _membership(db, conversation_uuid, current_user.id)
    message = db.exec(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id, ConversationMessage.message_uuid == payload.message_uuid,
    )).first() if payload.message_uuid else None
    if payload.message_uuid and not message:
        raise HTTPException(status_code=404, detail="Message not found")
    reported = message.sender_user_id if message else (_other(db, conversation, current_user.id) if conversation.kind == "direct" else None)
    db.add(ConversationReport(
        report_uuid=f"chat_report_{uuid4()}", conversation_id=conversation.id, message_id=message.id if message else None,
        reporter_user_id=current_user.id, reported_user_id=reported, reason=payload.reason.strip(),
        excerpt=message.body[:2000] if message else None, creation_date=_stamp(),
    ))
    db.commit()
    if payload.block and conversation.kind == "direct":
        block(db, current_user, conversation_uuid)
    return {"reported": True, "blocked": bool(payload.block and conversation.kind == "direct")}
