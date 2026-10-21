from fastapi import APIRouter, Depends, Request
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.organization_config import DarkLogoConfig
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.orgs.branding import update_org_dark_logo_config

router = APIRouter()


@router.put("/{org_id}/config/dark_logo")
async def api_update_org_dark_logo_config(
    request: Request,
    org_id: int,
    dark_logo: DarkLogoConfig,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """
    Use one logo in both themes, or a separate logo in dark mode
    """
    return await update_org_dark_logo_config(request, dark_logo, org_id, current_user, db_session)
