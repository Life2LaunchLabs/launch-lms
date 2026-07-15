from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.portfolio import JourneyEntryCreate, JourneyEntryUpdate, PortfolioUpdate, PublishRequest, WorkItemCreate, WorkItemUpdate
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


@router.get("/me/preview")
async def api_preview_portfolio(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_owner_shell(current_user, db_session, mark_previewed=True)


@router.post("/me/publish")
async def api_publish_portfolio(payload: PublishRequest, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.publish_portfolio(payload, current_user, db_session)


@router.post("/me/unpublish")
async def api_unpublish_portfolio(revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.unpublish_portfolio(revision, current_user, db_session)


@router.post("/me/work")
async def api_create_work(payload: WorkItemCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.create_work(payload, current_user, db_session)


@router.patch("/me/work/{work_uuid}")
async def api_update_work(work_uuid: str, payload: WorkItemUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_work(work_uuid, payload, current_user, db_session)


@router.delete("/me/work/{work_uuid}")
async def api_archive_work(work_uuid: str, revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.archive_work(work_uuid, revision, current_user, db_session)

@router.post("/me/journey")
async def api_create_journey(payload: JourneyEntryCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.create_journey(payload, current_user, db_session)

@router.patch("/me/journey/{journey_uuid}")
async def api_update_journey(journey_uuid: str, payload: JourneyEntryUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.update_journey(journey_uuid, payload, current_user, db_session)

@router.delete("/me/journey/{journey_uuid}")
async def api_archive_journey(journey_uuid: str, revision: int = Query(...), current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.archive_journey(journey_uuid, revision, current_user, db_session)


@router.get("/me/legacy-import")
async def api_preview_legacy_import(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.legacy_import_preview(current_user, db_session)


@router.post("/me/legacy-import")
async def api_execute_legacy_import(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return portfolio_service.execute_legacy_import(current_user, db_session)


@public_router.get("/{org_id}/{username}")
async def api_get_public_portfolio(org_id: int, username: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_shell(org_id, username, db_session)


@public_router.get("/{org_id}/{username}/work/{slug}")
async def api_get_public_work(org_id: int, username: str, slug: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_work(org_id, username, slug, db_session)

@public_router.get("/{org_id}/{username}/journey/{slug}")
async def api_get_public_journey(org_id: int, username: str, slug: str, db_session: Session = Depends(get_db_session)):
    return portfolio_service.get_public_journey(org_id, username, slug, db_session)
