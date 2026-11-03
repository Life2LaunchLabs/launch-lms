"""My people access: link someone in My people to their account, and switch on what they may see.

A person in My people can be anyone; only someone with an account can be given access. Each has two
switches, "portfolio" and "plans" (the life plan, budget included), with no time limit. Both live on the
portfolio's PortfolioPerson row for that account, which goes away when both are off.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.portfolio import Portfolio
from src.db.portfolio_people import PersonAccess, PersonLink, PortfolioPerson
from src.db.portfolio_records import PortfolioContact
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service
from src.services import portfolio_people
from src.services.connect import cards, people as connect_people
from src.services.portfolio_records import contact_dto


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display(user: User) -> str:
    return (getattr(user, "preferred_name", "") or "").strip() or " ".join(p for p in (user.first_name, user.last_name) if p).strip() or user.username


def _account(db: Session, current_user: PublicUser, handle: str) -> User:
    user = portfolio_people._target(db, handle)
    if user.id == current_user.id:
        raise HTTPException(status_code=422, detail="That's you")
    if connect_people.blocked(db, current_user.id, int(user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail=f"No one goes by {handle.strip()}")
    return user


def _contact(db: Session, portfolio: Portfolio, contact_uuid: str) -> PortfolioContact:
    contact = db.exec(select(PortfolioContact).where(PortfolioContact.portfolio_id == portfolio.id, PortfolioContact.contact_uuid == contact_uuid)).first()
    if not contact:
        raise HTTPException(status_code=404, detail="That person isn't in My people")
    return contact


def add_account(payload: PersonLink, current_user: PublicUser, db: Session) -> dict:
    """Add someone with an account to My people, or return them if they're already there."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    user = _account(db, current_user, payload.handle)
    contact = db.exec(select(PortfolioContact).where(PortfolioContact.portfolio_id == portfolio.id, PortfolioContact.linked_user_id == user.id)).first()
    if not contact:
        now = _now()
        contact = PortfolioContact(
            contact_uuid=f"con_{uuid4().hex}", portfolio_id=portfolio.id or 0, name=_display(user), linked_user_id=user.id,
            creation_date=now, update_date=now,
        )
        db.add(contact)
        db.commit()
    return contact_dto(contact, db)


def link(contact_uuid: str, payload: PersonLink, current_user: PublicUser, db: Session) -> dict:
    """Say which account someone already in My people has."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    contact = _contact(db, portfolio, contact_uuid)
    user = _account(db, current_user, payload.handle)
    taken = db.exec(select(PortfolioContact).where(PortfolioContact.portfolio_id == portfolio.id, PortfolioContact.linked_user_id == user.id, PortfolioContact.id != contact.id)).first()
    if taken:
        raise HTTPException(status_code=409, detail=f"{taken.name} is already that account")
    if contact.linked_user_id and contact.linked_user_id != user.id:
        _clear(db, portfolio, contact.linked_user_id)
    contact.linked_user_id, contact.update_date = user.id, _now()
    db.add(contact)
    db.commit()
    return contact_dto(contact, db)


def _clear(db: Session, portfolio: Portfolio, user_id: int) -> None:
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == user_id)).first()
    if row:
        db.delete(row)


def set_access(contact_uuid: str, payload: PersonAccess, current_user: PublicUser, db: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    contact = _contact(db, portfolio, contact_uuid)
    if not contact.linked_user_id:
        raise HTTPException(status_code=422, detail=f"Link {contact.name}'s account first")
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == contact.linked_user_id)).first()
    now = _now()
    if not payload.portfolio and not payload.plans:
        if row:
            db.delete(row)
        db.commit()
        return contact_dto(contact, db)
    newly_shared = payload.portfolio and not (row and row.portfolio)
    if not row:
        row = PortfolioPerson(portfolio_id=int(portfolio.id), user_id=contact.linked_user_id, role="commenter", added_by_user_id=current_user.id, creation_date=now)  # type: ignore[arg-type]
    row.role, row.portfolio, row.plans, row.update_date = "commenter", payload.portfolio, payload.plans, now
    db.add(row)
    db.flush()
    if newly_shared:
        cards.portfolio_shared(db, current_user.id, current_user.username, contact.linked_user_id, "commenter")  # type: ignore[arg-type]
    db.commit()
    return contact_dto(contact, db)


def access_of(contact: PortfolioContact, db: Session) -> dict | None:
    """The switches and the account for someone in My people, or None when they have no account linked."""
    if not contact.linked_user_id:
        return None
    user = db.get(User, contact.linked_user_id)
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == contact.portfolio_id, PortfolioPerson.user_id == contact.linked_user_id)).first()
    return {
        "username": user.username if user else "", "user_uuid": user.user_uuid if user else "",
        "portfolio": bool(row and row.portfolio), "plans": bool(row and row.plans),
    }
