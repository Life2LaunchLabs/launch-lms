from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.roadmap_blocks import (
    RoadmapBlockCreate,
    RoadmapBlockRead,
    RoadmapBlockRequirementCreate,
    RoadmapBlockRequirementRead,
    RoadmapBlockUpdate,
    RoadmapPathwayBlockCreate,
    RoadmapPathwayBlockUpdate,
    RoadmapPathwayCreate,
    RoadmapPathwayDetailRead,
    RoadmapPathwayUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.roadmap_blocks import (
    create_block,
    create_block_requirement,
    create_pathway,
    create_pathway_block,
    delete_block,
    delete_block_requirement,
    delete_pathway_block,
    ensure_default_pathway,
    get_pathway,
    list_blocks,
    list_pathways,
    update_block,
    update_pathway,
    update_pathway_block,
)

router = APIRouter()


@router.get("/org/{org_id}/blocks", response_model=list[RoadmapBlockRead])
async def api_list_blocks(org_id: int, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await list_blocks(current_user, org_id, db_session)


@router.post("/org/{org_id}/blocks", response_model=RoadmapBlockRead)
async def api_create_block(org_id: int, block_data: RoadmapBlockCreate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await create_block(current_user, org_id, block_data, db_session)


@router.put("/org/{org_id}/blocks/{block_uuid}", response_model=RoadmapBlockRead)
async def api_update_block(org_id: int, block_uuid: str, block_data: RoadmapBlockUpdate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await update_block(current_user, org_id, block_uuid, block_data, db_session)


@router.delete("/org/{org_id}/blocks/{block_uuid}")
async def api_delete_block(org_id: int, block_uuid: str, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await delete_block(current_user, org_id, block_uuid, db_session)


@router.post("/org/{org_id}/blocks/{block_uuid}/requirements", response_model=RoadmapBlockRequirementRead)
async def api_create_block_requirement(org_id: int, block_uuid: str, requirement_data: RoadmapBlockRequirementCreate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await create_block_requirement(current_user, org_id, block_uuid, requirement_data, db_session)


@router.delete("/org/{org_id}/block-requirements/{requirement_uuid}")
async def api_delete_block_requirement(org_id: int, requirement_uuid: str, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await delete_block_requirement(current_user, org_id, requirement_uuid, db_session)


@router.get("/org/{org_id}/pathways", response_model=list[RoadmapPathwayDetailRead])
async def api_list_pathways(org_id: int, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await list_pathways(current_user, org_id, db_session)


@router.post("/org/{org_id}/pathways", response_model=RoadmapPathwayDetailRead)
async def api_create_pathway(org_id: int, pathway_data: RoadmapPathwayCreate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await create_pathway(current_user, org_id, pathway_data, db_session)


@router.post("/org/{org_id}/pathways/ensure-default", response_model=RoadmapPathwayDetailRead)
async def api_ensure_default_pathway(org_id: int, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await ensure_default_pathway(current_user, org_id, db_session)


@router.get("/org/{org_id}/pathways/{pathway_uuid}", response_model=RoadmapPathwayDetailRead)
async def api_get_pathway(org_id: int, pathway_uuid: str, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await get_pathway(current_user, org_id, pathway_uuid, db_session)


@router.put("/org/{org_id}/pathways/{pathway_uuid}", response_model=RoadmapPathwayDetailRead)
async def api_update_pathway(org_id: int, pathway_uuid: str, pathway_data: RoadmapPathwayUpdate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await update_pathway(current_user, org_id, pathway_uuid, pathway_data, db_session)


@router.post("/org/{org_id}/pathways/{pathway_uuid}/blocks", response_model=RoadmapPathwayDetailRead)
async def api_create_pathway_block(org_id: int, pathway_uuid: str, block_data: RoadmapPathwayBlockCreate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await create_pathway_block(current_user, org_id, pathway_uuid, block_data, db_session)


@router.put("/org/{org_id}/pathway-blocks/{pathway_block_uuid}", response_model=RoadmapPathwayDetailRead)
async def api_update_pathway_block(org_id: int, pathway_block_uuid: str, block_data: RoadmapPathwayBlockUpdate, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await update_pathway_block(current_user, org_id, pathway_block_uuid, block_data, db_session)


@router.delete("/org/{org_id}/pathway-blocks/{pathway_block_uuid}", response_model=RoadmapPathwayDetailRead)
async def api_delete_pathway_block(org_id: int, pathway_block_uuid: str, current_user: PublicUser = Depends(get_authenticated_user), db_session: Session = Depends(get_db_session)):
    return await delete_pathway_block(current_user, org_id, pathway_block_uuid, db_session)
