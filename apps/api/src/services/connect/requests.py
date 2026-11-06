"""Asking to connect from someone's shared portfolio (FEED-58).

A learner can let people who see their shared portfolio ask to connect. It is off until they turn
it on. Asking needs an account: the visitor writes a short note, and it reaches the learner as a
Connect request they accept or decline. Declining is silent, and a visitor asks only once: they
can't write again until the learner accepts. Requests are between the two people; an organization
the learner belongs to doesn't see them, since it is a connection to the learner, not their owner.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.db.portfolio import Portfolio, PortfolioModerationStatus, PortfolioVisibility
from src.db.users import PublicUser, User
from src.services.connect import chats, people

SETTING = "connect_requests"
NOTE_MAX = 500


class ConnectRequestCreate(BaseModel):
    note: str = Field(min_length=1, max_length=NOTE_MAX)


def _value(item) -> str:
    return getattr(item, "value", item)


def taking_requests(portfolio: Portfolio) -> bool:
    """Whether the learner lets visitors ask to connect: off unless they turned it on."""
    return (portfolio.theme_settings or {}).get(SETTING) is True


def _shared(db: Session, portfolio_uuid: str) -> Portfolio:
    portfolio = db.exec(select(Portfolio).where(Portfolio.portfolio_uuid == portfolio_uuid)).first()
    if (not portfolio or not portfolio.published_at or _value(portfolio.visibility) == PortfolioVisibility.PRIVATE.value
            or _value(portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _state(db: Session, me: int, portfolio: Portfolio) -> dict:
    from src.services.school import chats as school_chats, messaging

    owner = int(portfolio.user_id)
    if owner == me:
        return {"open": False, "status": "self", "chat_uuid": None}
    if people.blocked(db, me, owner) or messaging.direct_block(db, me, owner):
        return {"open": False, "status": "unavailable", "chat_uuid": None}
    conversation = chats._direct(db, me, owner)
    if conversation:
        members = {item.user_id: item for item in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
        theirs = members.get(owner)
        if theirs and theirs.status == "active":
            return {"open": True, "status": "connected", "chat_uuid": conversation.conversation_uuid}
        asked = db.exec(select(ConversationMessage.id).where(
            ConversationMessage.conversation_id == conversation.id, ConversationMessage.sender_user_id == me,
        )).first()
        if asked:
            # A decline looks the same as no answer yet.
            return {"open": False, "status": "asked", "chat_uuid": None}
    if people.knows(db, me, owner) or school_chats.relation(db, me, owner):
        # They already work together: no request needed, the button opens their chat.
        return {"open": True, "status": "known", "chat_uuid": None}
    return {"open": taking_requests(portfolio), "status": "none", "chat_uuid": None}


def request_state(db: Session, current_user: PublicUser, portfolio_uuid: str) -> dict:
    """What the Connect button on someone's portfolio does for this visitor."""
    return _state(db, current_user.id, _shared(db, portfolio_uuid))


def ask(db: Session, current_user: PublicUser, portfolio_uuid: str, payload: ConnectRequestCreate) -> dict:
    """Send the learner a request to connect, with a note."""
    from src.db.conversations import DirectChatOpen

    note = " ".join((payload.note or "").split())
    if not note:
        raise HTTPException(status_code=422, detail="Write a short note first")
    portfolio = _shared(db, portfolio_uuid)
    state = _state(db, current_user.id, portfolio)
    if state["status"] == "asked":
        raise HTTPException(status_code=409, detail="You already asked to connect")
    if state["status"] in ("self", "unavailable") or not state["open"]:
        raise HTTPException(status_code=403, detail="They aren't taking requests to connect")
    owner = db.get(User, portfolio.user_id)
    if state["status"] == "none":
        conversation = chats._direct(db, current_user.id, int(portfolio.user_id)) or chats._create_direct(db, current_user.id, int(portfolio.user_id), "request")
        db.commit()
        chat_uuid = conversation.conversation_uuid
    else:
        chat_uuid = chats.open_direct(db, current_user, DirectChatOpen(user_uuid=owner.user_uuid))["conversation_uuid"]  # type: ignore[union-attr]
    chats.send(db, current_user, chat_uuid, note)
    return _state(db, current_user.id, portfolio)


def set_taking_requests(db: Session, current_user: PublicUser, on: bool) -> dict:
    from src.services import portfolio as portfolio_service

    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    portfolio.theme_settings = {**(portfolio.theme_settings or {}), SETTING: bool(on)}
    portfolio_service._save(portfolio, db)
    return {SETTING: bool(on)}
