from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.users import AnonymousUser, APITokenUser, PublicUser
from src.security.auth import get_current_user
from src.services.trending.trending import TrendingItemRead, get_trending_items

router = APIRouter()


@router.get("/orgs/{org_uuid}/trending", response_model=list[TrendingItemRead])
async def trending(
    request: Request,
    org_uuid: str,
    limit: int = 20,
    current_user: PublicUser | AnonymousUser | APITokenUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    org = db_session.exec(select(Organization).where(Organization.org_uuid == org_uuid)).first()
    if org is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Organization not found")

    limit = min(max(limit, 1), 50)
    return await get_trending_items(request, org, current_user, db_session, limit)
