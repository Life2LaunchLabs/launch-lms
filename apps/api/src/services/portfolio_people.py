"""The portfolio is the profile: who a learner adds to it, and what each person can do.

A learner adds people by @handle, who can then see the portfolio even while it's private. They
comment on it, and on its projects and experiences, in their chat with the learner in Connect
(services/connect/portfolio_talk.py). Items the learner marked private stay hidden from everyone but them.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.portfolio import Portfolio, PortfolioModerationStatus, PortfolioVisibility
from src.db.portfolio_people import PortfolioPerson, PortfolioPersonCreate
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service
from src.services.connect import cards, people as connect_people
from src.services.goals.sharing_roles import _stamp

ROLES = {
    "viewer": {"name": "Viewer", "hint": "Can see your portfolio, even while it's private"},
    "commenter": {"name": "Commenter", "hint": "Can see it and comment on it"},
}


def choices() -> list[dict]:
    return [{"key": key, **value} for key, value in ROLES.items()]


def _role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(status_code=422, detail="Choose Viewer or Commenter")
    return role


def _target(db: Session, handle: str) -> User:
    raw = (handle or "").strip()
    if "@" in raw.lstrip("@"):
        user = db.exec(select(User).where(col(User.email).ilike(raw))).first()
    else:
        name = raw.lstrip("@")
        user = db.exec(select(User).where(col(User.username).ilike(name))).first()
        user = user if user and user.username.lower() == name.lower() else None
    if not user:
        raise HTTPException(status_code=404, detail=f"No one goes by {raw}")
    return user


def _own(db: Session, current_user: PublicUser) -> Portfolio:
    return portfolio_service.get_or_create_portfolio(current_user, db)


def _person_dict(db: Session, row: PortfolioPerson) -> dict:
    return {"user": connect_people.person(db, row.user_id), "role": row.role, "role_name": ROLES.get(row.role, {}).get("name", row.role), "creation_date": row.creation_date}


def list_people(db: Session, current_user: PublicUser) -> dict:
    portfolio = _own(db, current_user)
    rows = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.portfolio == True).order_by(col(PortfolioPerson.id))).all()  # noqa: E712
    return {"people": [_person_dict(db, row) for row in rows], "choices": choices(), "visibility": portfolio_service._enum_value(portfolio.visibility)}


def add_person(db: Session, current_user: PublicUser, payload: PortfolioPersonCreate) -> dict:
    portfolio = _own(db, current_user)
    role = _role(payload.role)
    target = _target(db, payload.handle)
    if target.id == current_user.id:
        raise HTTPException(status_code=422, detail="That's you")
    if connect_people.blocked(db, current_user.id, int(target.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail=f"No one goes by {payload.handle.strip()}")
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == target.id)).first()
    now = _stamp()
    if row:
        row.role, row.portfolio, row.update_date = role, True, now
    else:
        row = PortfolioPerson(portfolio_id=int(portfolio.id), user_id=int(target.id), role=role, added_by_user_id=current_user.id, creation_date=now, update_date=now)  # type: ignore[arg-type]
        db.add(row)
        db.flush()
        cards.portfolio_shared(db, current_user.id, current_user.username, int(target.id), role)  # type: ignore[arg-type]
    db.add(row)
    db.commit()
    return list_people(db, current_user)


def _row(db: Session, portfolio: Portfolio, user_uuid: str) -> PortfolioPerson:
    user = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == user.id)).first() if user else None
    if not row:
        raise HTTPException(status_code=404, detail="They aren't on your portfolio")
    return row


def update_person(db: Session, current_user: PublicUser, user_uuid: str, role: str) -> dict:
    row = _row(db, _own(db, current_user), user_uuid)
    row.role, row.update_date = _role(role), _stamp()
    db.add(row)
    db.commit()
    return list_people(db, current_user)


def remove_person(db: Session, current_user: PublicUser, user_uuid: str) -> dict:
    db.delete(_row(db, _own(db, current_user), user_uuid))
    db.commit()
    return list_people(db, current_user)


def _portfolio_for(db: Session, org_id: int, username: str) -> tuple[User, Portfolio]:
    user = db.exec(select(User).where(User.username == username)).first()
    member = user and db.exec(select(UserOrganization).where(UserOrganization.user_id == user.id, UserOrganization.org_id == org_id)).first()
    portfolio = portfolio_service._get_portfolio(db, int(user.id)) if member else None  # type: ignore[union-attr, arg-type]
    if not user or not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return user, portfolio


def role_for(db: Session, portfolio: Portfolio, viewer_id: int) -> str | None:
    if portfolio.user_id == viewer_id:
        return "owner"
    row = db.exec(select(PortfolioPerson).where(PortfolioPerson.portfolio_id == portfolio.id, PortfolioPerson.user_id == viewer_id)).first()
    return row.role if row and row.portfolio and not connect_people.blocked(db, portfolio.user_id, viewer_id) else None


def shared_shell(db: Session, current_user: PublicUser, org_id: int, username: str) -> dict:
    """The portfolio as this person may see it: as one of its people even while private, or as anyone once published."""
    _, portfolio = _portfolio_for(db, org_id, username)
    role = role_for(db, portfolio, current_user.id)
    if role and portfolio_service._enum_value(portfolio.moderation_status) == PortfolioModerationStatus.CLEAR.value:
        shell = portfolio_service.portfolio_shell(portfolio, db, public_only=True)
    else:
        shell = portfolio_service.get_public_shell(org_id, username, db)
    private = portfolio_service._enum_value(portfolio.visibility) == PortfolioVisibility.PRIVATE.value or not portfolio.published_at
    plans = role == "owner" or shares_plans(db, portfolio.user_id, current_user.id)
    return {**shell, "access": {"role": role or "public", "can_comment": role in ("owner", "commenter"), "shared_privately": bool(role) and private, "plans": plans}}


def shares_plans(db: Session, owner_id: int, viewer_id: int) -> bool:
    """Whether the owner switched on "plans" for this person in My people."""
    if owner_id == viewer_id:
        return True
    row = db.exec(
        select(PortfolioPerson.id).join(Portfolio, Portfolio.id == PortfolioPerson.portfolio_id)
        .where(Portfolio.user_id == owner_id, PortfolioPerson.user_id == viewer_id, PortfolioPerson.plans == True)  # noqa: E712
    ).first()
    return bool(row) and not connect_people.blocked(db, owner_id, viewer_id)
