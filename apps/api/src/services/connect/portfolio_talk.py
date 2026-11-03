"""Talking about someone's portfolio in Connect: the portfolio as a chat topic, its experiences and projects as its steps.

A portfolio is a topic in the direct chat between its owner and each person they let see it from
My people. A message about it is tagged like a plan step, so the chat filters to the whole portfolio
or to one experience or project, and that's how people comment on them. Refs have no goal: the
portfolio's own uuid marks a message about it, and an item's uuid marks one about that item.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.portfolio import Portfolio, PortfolioModerationStatus, PortfolioVisibility, ProjectItem, TimelineEntry
from src.db.portfolio_people import PortfolioPerson
from src.db.users import PublicUser, User
from src.services.connect import chats, people

DIRECT = "direct"
SOURCE = "portfolio"


class PortfolioChatOpen(BaseModel):
    """Open a chat about a portfolio: the owner names who with; anyone else talks with the owner."""

    portfolio_uuid: str
    user_uuid: str | None = None
    item_uuid: str | None = None


def _value(item) -> str:
    return getattr(item, "value", item)


def _sees(db: Session, portfolio: Portfolio, viewer_id: int) -> bool:
    """Whether the owner let this person see their portfolio, from My people."""
    if _value(portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value or people.blocked(db, portfolio.user_id, viewer_id):
        return False
    return bool(db.exec(select(PortfolioPerson.id).where(
        PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == viewer_id, PortfolioPerson.portfolio == True,  # noqa: E712
    )).first())


def _pair(conversation: Conversation) -> tuple[int, int] | None:
    if conversation.kind != DIRECT or ":" not in (conversation.direct_key or ""):
        return None
    low, high = conversation.direct_key.split(":")  # type: ignore[union-attr]
    return int(low), int(high)


def portfolios_in(db: Session, conversation: Conversation) -> list[Portfolio]:
    """The portfolios a direct chat can talk about: either person's, if they let the other see it."""
    pair = _pair(conversation)
    if not pair:
        return []
    found = []
    for owner_id, viewer_id in (pair, pair[::-1]):
        portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == owner_id)).first()
        if portfolio and _sees(db, portfolio, viewer_id):
            found.append(portfolio)
    return found


def items(db: Session, portfolio: Portfolio) -> list[dict]:
    """Its experiences, then its projects: the ones it shows to its people (not the private ones)."""
    shown = lambda model: db.exec(select(model).where(model.portfolio_id == portfolio.id, model.visibility != PortfolioVisibility.PRIVATE.value)  # noqa: E731
                                  .order_by(col(model.id))).all()
    return [*({"step_uuid": entry.timeline_uuid, "title": entry.title, "item_kind": "experience"} for entry in shown(TimelineEntry)),
            *({"step_uuid": project.project_uuid, "title": project.title, "item_kind": "project"} for project in shown(ProjectItem))]


def _name(db: Session, portfolio: Portfolio) -> str:
    if portfolio.display_name:
        return portfolio.display_name
    user = db.get(User, portfolio.user_id)
    return " ".join(part for part in (user.first_name, user.last_name) if part) or user.username if user else "Someone"


def _title(db: Session, portfolio: Portfolio) -> str:
    return f"{_name(db, portfolio).split(' ')[0]}’s portfolio"


def topics(db: Session, conversation: Conversation, viewer_id: int | None = None) -> list[dict]:
    """Each portfolio the chat can talk about, shaped like a plan topic: its items are the steps."""
    from src.services.connect.workspace import readable_refs

    portfolios = portfolios_in(db, conversation)
    if not portfolios:
        return []
    counts = {str(key): int(count) for key, count in db.exec(readable_refs(
        select(ConversationMessageRef.step_uuid, func.count(func.distinct(ConversationMessageRef.message_id)))
        .where(ConversationMessageRef.conversation_id == conversation.id, col(ConversationMessageRef.goal_id).is_(None), col(ConversationMessageRef.step_uuid).is_not(None)),
        db, conversation, viewer_id).group_by(ConversationMessageRef.step_uuid)
    ).all()}
    result = []
    for portfolio in portfolios:
        steps = [{**item, "status": "not_started", "due_date": None, "behind": False, "count": counts.get(item["step_uuid"], 0)} for item in items(db, portfolio)]
        owner = db.get(User, portfolio.user_id)
        result.append({
            "goal_uuid": portfolio.portfolio_uuid, "title": "Your portfolio" if portfolio.user_id == viewer_id else _title(db, portfolio), "status": "active", "source": SOURCE,
            "count": counts.get(portfolio.portfolio_uuid, 0), "progress": {"done": 0, "total": len(steps), "submitted": 0, "behind": 0}, "steps": steps,
            "portfolio": {"username": owner.username if owner else "", "user_uuid": owner.user_uuid if owner else "", "mine": portfolio.user_id == viewer_id},
        })
    return result


def find(db: Session, conversation: Conversation, portfolio_uuid: str | None) -> Portfolio | None:
    return next((item for item in portfolios_in(db, conversation) if item.portfolio_uuid == portfolio_uuid), None)


def tag(db: Session, conversation: Conversation, kind: str, first: str, second: str | None) -> tuple[dict, list[str]] | None:
    """A plan or step tag naming a portfolio in this chat, or one of its items: the ref, and the uuids to filter it by."""
    portfolio = find(db, conversation, first)
    if not portfolio:
        return None
    if kind == "plan" or not second:
        return {"kind": "plan", "goal_uuid": first, "portfolio": True}, [first]
    if not any(item["step_uuid"] == second for item in items(db, portfolio)):
        return None
    return {"kind": "step", "goal_uuid": first, "step_uuid": second, "portfolio": True}, [first, second]


def filtered(query, db: Session, conversation: Conversation, goal_uuid: str | None, step_uuid: str | None):
    """Narrow a direct chat to the messages about a portfolio, or one experience or project in it."""
    if not find(db, conversation, goal_uuid):
        raise HTTPException(status_code=404, detail="That portfolio isn't in this chat")
    about = select(ConversationMessageRef.message_id).where(
        ConversationMessageRef.conversation_id == conversation.id, col(ConversationMessageRef.goal_id).is_(None), ConversationMessageRef.step_uuid == (step_uuid or goal_uuid),
    )
    return query.where(col(ConversationMessage.id).in_(about))


def resolve_one(db: Session, ref: dict) -> dict | None:
    """A portfolio tag as readers see it now: the item's current title, gone once it's deleted or made private."""
    portfolio = db.exec(select(Portfolio).where(Portfolio.portfolio_uuid == ref.get("goal_uuid"))).first()
    if not portfolio:
        return None
    title = _title(db, portfolio)
    if ref.get("kind") == "plan":
        return {"kind": "plan", "goal_uuid": portfolio.portfolio_uuid, "title": title, "portfolio": True}
    item = next((item for item in items(db, portfolio) if item["step_uuid"] == ref.get("step_uuid")), None)
    return {"kind": "step", "goal_uuid": portfolio.portfolio_uuid, "step_uuid": item["step_uuid"], "title": item["title"], "plan_title": title,
            "status": "not_started", "item_kind": item["item_kind"], "portfolio": True} if item else None


# The buttons on a portfolio and its items


def _portfolio(db: Session, portfolio_uuid: str) -> Portfolio:
    portfolio = db.exec(select(Portfolio).where(Portfolio.portfolio_uuid == portfolio_uuid)).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _member(db: Session, conversation: Conversation, user_id: int) -> bool:
    return bool(db.exec(select(ConversationMember.id).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == user_id, ConversationMember.status == "active",
    )).first())


def _about(db: Session, conversation: Conversation | None, viewer_id: int, uuid: str) -> int:
    """How many messages in a chat the viewer is in are about the portfolio, or one item in it."""
    if not conversation or not _member(db, conversation, viewer_id):
        return 0
    return int(db.exec(select(func.count(func.distinct(ConversationMessageRef.message_id))).where(
        ConversationMessageRef.conversation_id == conversation.id, col(ConversationMessageRef.goal_id).is_(None), ConversationMessageRef.step_uuid == uuid,
    )).one())


def portfolio_chats(db: Session, current_user: PublicUser, portfolio_uuid: str, item_uuid: str | None = None) -> dict:
    """Who you can talk about a portfolio (or one item in it) with, and how much each chat says about it.

    The owner gets everyone they let see it; one of those people gets the owner. Anyone else gets a 404.
    """
    portfolio = _portfolio(db, portfolio_uuid)
    owner = portfolio.user_id == current_user.id
    if not owner and not _sees(db, portfolio, current_user.id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if item_uuid and not any(item["step_uuid"] == item_uuid for item in items(db, portfolio)):
        raise HTTPException(status_code=404, detail="That isn't on this portfolio")
    others = [int(user_id) for user_id in db.exec(select(PortfolioPerson.user_id).where(
        PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.portfolio == True,  # noqa: E712
    ).order_by(col(PortfolioPerson.id))).all() if not people.blocked(db, current_user.id, int(user_id))] if owner else [int(portfolio.user_id)]
    result = []
    for user_id in others:
        conversation = chats._direct(db, current_user.id, user_id)
        result.append({"person": people.person(db, user_id), "conversation_uuid": conversation.conversation_uuid if conversation else None,
                       "count": _about(db, conversation, current_user.id, item_uuid or portfolio_uuid)})
    return {"goal_uuid": portfolio_uuid, "step_uuid": item_uuid, "mine": owner, "people": result}


def open_chat(db: Session, current_user: PublicUser, payload: PortfolioChatOpen) -> dict:
    """The direct chat to talk about a portfolio or one of its items in, started if needed, with where to filter it."""
    portfolio = _portfolio(db, payload.portfolio_uuid)
    owner = portfolio.user_id == current_user.id
    other = db.exec(select(User).where(User.user_uuid == payload.user_uuid)).first() if owner else db.get(User, portfolio.user_id)
    viewer_id = int(other.id) if owner and other else current_user.id  # type: ignore[union-attr]
    if not other or other.id == current_user.id or not _sees(db, portfolio, viewer_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if payload.item_uuid and not any(item["step_uuid"] == payload.item_uuid for item in items(db, portfolio)):
        raise HTTPException(status_code=404, detail="That isn't on this portfolio")
    # Letting someone see your portfolio is the trust a chat needs: no request to accept.
    conversation = chats.ensure_direct(db, current_user.id, int(other.id))  # type: ignore[arg-type]
    if not conversation:
        raise HTTPException(status_code=403, detail="This chat isn't available")
    db.commit()
    return {"conversation_uuid": conversation.conversation_uuid, "goal_uuid": portfolio.portfolio_uuid, "step_uuid": payload.item_uuid}
