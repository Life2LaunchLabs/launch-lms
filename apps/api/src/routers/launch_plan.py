from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.launch_plan import LaunchPlanWorkspaceUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.launch_plan import get_workspace, list_canvases, mark_intro_seen, update_workspace

router = APIRouter()


@router.get("/org/{org_id}")
async def api_list_canvases(org_id: int, user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return await list_canvases(user, org_id, db_session)


@router.get("/org/{org_id}/sections/{section_uuid}")
async def api_get_workspace(org_id: int, section_uuid: str, user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return await get_workspace(user, org_id, section_uuid, db_session)


@router.post("/org/{org_id}/sections/{section_uuid}/intro-seen")
async def api_mark_intro_seen(org_id: int, section_uuid: str, user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return await mark_intro_seen(user, org_id, section_uuid, db_session)


@router.put("/org/{org_id}/sections/{section_uuid}")
async def api_update_workspace(org_id: int, section_uuid: str, data: LaunchPlanWorkspaceUpdate, user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return await update_workspace(user, org_id, section_uuid, data, db_session)
