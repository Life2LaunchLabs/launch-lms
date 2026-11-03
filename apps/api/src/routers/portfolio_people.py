"""People on a portfolio, and the portfolio as one of them sees it. Comments on it are Connect chats (/connect/portfolios)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.portfolio_people import PortfolioPersonCreate, PortfolioPersonUpdate
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services import portfolio_people

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/me/people")
async def list_people(current_user: PublicUser = USER, db_session: Session = DB):
    return portfolio_people.list_people(db_session, current_user)


@router.post("/me/people")
async def add_person(payload: PortfolioPersonCreate, current_user: PublicUser = USER, db_session: Session = DB):
    return portfolio_people.add_person(db_session, current_user, payload)


@router.patch("/me/people/{user_uuid}")
async def update_person(user_uuid: str, payload: PortfolioPersonUpdate, current_user: PublicUser = USER, db_session: Session = DB):
    return portfolio_people.update_person(db_session, current_user, user_uuid, payload.role)


@router.delete("/me/people/{user_uuid}")
async def remove_person(user_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return portfolio_people.remove_person(db_session, current_user, user_uuid)


@router.get("/shared/{org_id}/{username}")
async def shared_portfolio(org_id: int, username: str, current_user: PublicUser = USER, db_session: Session = DB):
    return portfolio_people.shared_shell(db_session, current_user, org_id, username)
