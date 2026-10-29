"""Who the learner is, edited from their portfolio: legal first and last name, and the name they go by.

The account keeps sign-in only. Rosters, reports and official documents use the legal name; everywhere
else shows the name someone goes by when they've given one.
"""

from fastapi import HTTPException
from sqlmodel import Session

from src.db.portfolio_records import IdentityUpdate
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service


def legal_name(user) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part).strip()


def shown_name(user) -> str:
    """The name to show outside rosters and reports."""
    return (getattr(user, "preferred_name", "") or "").strip() or legal_name(user) or user.username


def identity_dto(user) -> dict:
    return {
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "preferred_name": user.preferred_name or "",
        "legal_name": legal_name(user),
        "shown_name": shown_name(user),
    }


def update_identity(payload: IdentityUpdate, current_user: PublicUser, db_session: Session) -> dict:
    user = db_session.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        setattr(user, field, (value or "").strip())
    if not user.first_name:
        raise HTTPException(status_code=422, detail="First name is required")
    # A "goes by" that's just the legal first name or full name adds nothing.
    if user.preferred_name in (user.first_name, legal_name(user)):
        user.preferred_name = ""
    user.update_date = portfolio_service._now()
    db_session.add(user)
    # The portfolio's display name follows until screens read the identity instead.
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    portfolio.display_name = shown_name(user)
    portfolio_service._save(portfolio, db_session)
    db_session.refresh(user)
    return identity_dto(user)
