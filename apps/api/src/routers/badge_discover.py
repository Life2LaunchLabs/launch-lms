from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.discover import DiscoverSettings
from src.services import discover_featured
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.services import badge_discover as service

router = APIRouter()


@router.get("/discover")
def api_discover_badges(
    org_id: int | None = None,
    site_org_id: int | None = None,
    db: Session = Depends(get_db_session),
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    """The Discover feed: featured badges, the learner's badges in progress, collections and everything else."""
    return service.discover(db, current_user, org_id, site_org_id)


@router.get("/discover/settings")
def api_read_discover_settings(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return discover_featured.read_settings(db, current_user, org_id)


@router.put("/discover/settings")
def api_save_discover_settings(payload: DiscoverSettings, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return discover_featured.save_settings(db, current_user, org_id, payload)


@router.get("/collections/{collection_uuid}")
def api_badge_collection_page(
    collection_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    """A collection's page: its credibility story and every badge in the set."""
    return service.collection_page(db, current_user, collection_uuid)


@router.get("/{badge_uuid}/page")
def api_badge_page(
    badge_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    """A badge's page: what it proves, the ways to earn it and the rest of its set."""
    return service.badge_page(db, current_user, badge_uuid)
