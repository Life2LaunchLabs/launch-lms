from fastapi import APIRouter, Depends, Request
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.organization_config import DarkFaviconConfig, DarkLogoConfig
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.orgs import people_words
from src.services.orgs.branding import update_org_dark_favicon_config, update_org_dark_logo_config

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


@router.put("/{org_id}/config/dark_favicon")
async def api_update_org_dark_favicon_config(
    request: Request,
    org_id: int,
    dark_favicon: DarkFaviconConfig,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """
    Use one favicon in both themes, or a separate favicon in dark mode
    """
    return await update_org_dark_favicon_config(request, dark_favicon, org_id, current_user, db_session)


@router.put("/{org_id}/config/people")
async def api_update_org_people_words(
    request: Request,
    org_id: int,
    payload: people_words.PeopleWords,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """What the organization calls the people it supports, such as students, trainees or team members."""
    return await people_words.update(request, db_session, current_user, org_id, payload)
