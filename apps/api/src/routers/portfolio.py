from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.portfolio import TimelineEntryCreate, TimelineEntryUpdate, PortfolioBadgeVisibilityUpdate, PortfolioFeaturedBadgesUpdate, PortfolioFeaturedTimelineUpdate, PortfolioFeaturedProjectUpdate, PortfolioSectionsUpdate, PortfolioTraitsUpdate, PortfolioUpdate, PublishRequest, ProjectItemCreate, ProjectItemUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import portfolio as portfolio_service


router = APIRouter()
public_router = APIRouter()


@router.get("/me")
async def api_get_portfolio(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_owner_shell(current_user, db_session)


@router.patch("/me")
async def api_update_portfolio(payload: PortfolioUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_portfolio(payload, current_user, db_session)


@router.put("/me/traits")
async def api_update_traits(payload: PortfolioTraitsUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_traits(payload, current_user, db_session)


@router.put("/me/featured-badges")
async def api_update_featured_badges(payload: PortfolioFeaturedBadgesUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_featured_badges(payload, current_user, db_session)


@router.put("/me/featured-projects")
async def api_update_featured_projects(payload: PortfolioFeaturedProjectUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_featured_projects(payload, current_user, db_session)


@router.put("/me/featured-timeline")
async def api_update_featured_timeline(payload: PortfolioFeaturedTimelineUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_featured_timeline(payload, current_user, db_session)


@router.put("/me/badge-visibility")
async def api_update_badge_visibility(payload: PortfolioBadgeVisibilityUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_badge_visibility(payload, current_user, db_session)


@router.put("/me/sections")
async def api_update_sections(payload: PortfolioSectionsUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_sections(payload, current_user, db_session)


@router.get("/me/preview")
async def api_preview_portfolio(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_owner_shell(current_user, db_session, mark_previewed=True)


@router.post("/me/publish")
async def api_publish_portfolio(payload: PublishRequest, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.publish_portfolio(payload, current_user, db_session)


@router.post("/me/unpublish")
async def api_unpublish_portfolio(revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.unpublish_portfolio(revision, current_user, db_session)


@router.post("/me/projects")
async def api_create_project(payload: ProjectItemCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.create_project(payload, current_user, db_session)


@router.patch("/me/projects/{project_uuid}")
async def api_update_project(project_uuid: str, payload: ProjectItemUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_project(project_uuid, payload, current_user, db_session)


@router.delete("/me/projects/{project_uuid}")
async def api_archive_project(project_uuid: str, revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.archive_project(project_uuid, revision, current_user, db_session)

@router.post("/me/timeline")
async def api_create_timeline(payload: TimelineEntryCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.create_timeline(payload, current_user, db_session)

@router.patch("/me/timeline/{timeline_uuid}")
async def api_update_timeline(timeline_uuid: str, payload: TimelineEntryUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_timeline(timeline_uuid, payload, current_user, db_session)

@router.delete("/me/timeline/{timeline_uuid}")
async def api_archive_timeline(timeline_uuid: str, revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.archive_timeline(timeline_uuid, revision, current_user, db_session)


@router.get("/me/legacy-import")
async def api_preview_legacy_import(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.legacy_import_preview(current_user, db_session)


@router.post("/me/legacy-import")
async def api_execute_legacy_import(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.execute_legacy_import(current_user, db_session)


@router.post("/me/legacy-import/dismiss")
async def api_dismiss_legacy_import(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.dismiss_legacy_import(current_user, db_session)


@public_router.get("/{org_id}/{username}")
async def api_get_public_portfolio(org_id: int, username: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_shell(org_id, username, db_session)


@public_router.get("/{org_id}/{username}/projects/{slug}")
async def api_get_public_project(org_id: int, username: str, slug: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_project(org_id, username, slug, db_session)

@public_router.get("/{org_id}/{username}/timeline/{slug}")
async def api_get_public_timeline(org_id: int, username: str, slug: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_timeline(org_id, username, slug, db_session)
