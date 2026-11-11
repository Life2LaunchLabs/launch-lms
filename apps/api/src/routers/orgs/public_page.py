"""An organization's public page settings (see services/orgs/public_page.py)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.organizations import OrganizationDiscoverRead, PublicPageUpdate
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.orgs.public_page import update_public_page

router = APIRouter()


@router.put("/{org_id}/public_page")
def api_update_public_page(org_id: int, payload: PublicPageUpdate, current_user: PublicUser = Depends(get_authenticated_user),
                           db_session: Session = Depends(get_db_session)) -> OrganizationDiscoverRead:
    """The Public page settings tab: tagline, story, highlights, links, which plans show, and listing in Discover."""
    return update_public_page(db_session, current_user, org_id, payload)
