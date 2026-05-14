from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.roadmap import (
    RoadmapDetailRead,
    RoadmapEndStateOptionCreate,
    RoadmapEndStateOptionRead,
    RoadmapEndStateOptionUpdate,
    RoadmapEventCreate,
    RoadmapEventUpdate,
    RoadmapOptionCreate,
    RoadmapOptionUpdate,
    RoadmapRequirementCreate,
    RoadmapRequirementUpdate,
    RoadmapTemplateEventCreate,
    RoadmapTemplateEventUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.roadmap import (
    create_event,
    create_end_state_option,
    create_pathway_from_end_state,
    create_requirement,
    create_roadmap_option,
    create_template_event,
    delete_event,
    delete_requirement,
    delete_template_event,
    delete_roadmap_option,
    get_end_state_option,
    get_roadmap_option,
    list_end_state_options,
    list_roadmap_options,
    update_end_state_option,
    update_event,
    update_requirement,
    update_roadmap_option,
    update_template_event,
)

router = APIRouter()


@router.get("/org/{org_id}/end-states", response_model=list[RoadmapEndStateOptionRead])
async def api_list_end_state_options(
    org_id: int,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_end_state_options(current_user, org_id, db_session)


@router.post("/org/{org_id}/end-states", response_model=RoadmapEndStateOptionRead)
async def api_create_end_state_option(
    org_id: int,
    option_data: RoadmapEndStateOptionCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_end_state_option(current_user, org_id, option_data, db_session)


@router.get("/org/{org_id}/end-states/{option_uuid}", response_model=RoadmapEndStateOptionRead)
async def api_get_end_state_option(
    org_id: int,
    option_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_end_state_option(current_user, org_id, option_uuid, db_session)


@router.put("/org/{org_id}/end-states/{option_uuid}", response_model=RoadmapEndStateOptionRead)
async def api_update_end_state_option(
    org_id: int,
    option_uuid: str,
    option_data: RoadmapEndStateOptionUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_end_state_option(current_user, org_id, option_uuid, option_data, db_session)


@router.post("/org/{org_id}/end-states/{option_uuid}/template-events", response_model=RoadmapEndStateOptionRead)
async def api_create_template_event(
    org_id: int,
    option_uuid: str,
    event_data: RoadmapTemplateEventCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_template_event(current_user, org_id, option_uuid, event_data, db_session)


@router.put("/org/{org_id}/template-events/{template_event_uuid}", response_model=RoadmapEndStateOptionRead)
async def api_update_template_event(
    org_id: int,
    template_event_uuid: str,
    event_data: RoadmapTemplateEventUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_template_event(current_user, org_id, template_event_uuid, event_data, db_session)


@router.delete("/org/{org_id}/template-events/{template_event_uuid}", response_model=RoadmapEndStateOptionRead)
async def api_delete_template_event(
    org_id: int,
    template_event_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_template_event(current_user, org_id, template_event_uuid, db_session)


@router.post("/org/{org_id}/end-states/{option_uuid}/pathway", response_model=RoadmapDetailRead)
async def api_create_pathway_from_end_state(
    org_id: int,
    option_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_pathway_from_end_state(current_user, org_id, option_uuid, db_session)


@router.get("/org/{org_id}/options", response_model=list[RoadmapDetailRead])
async def api_list_roadmap_options(
    org_id: int,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_roadmap_options(current_user, org_id, db_session)


@router.post("/org/{org_id}/options", response_model=RoadmapDetailRead)
async def api_create_roadmap_option(
    org_id: int,
    roadmap_data: RoadmapOptionCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_roadmap_option(current_user, org_id, roadmap_data, db_session)


@router.get("/org/{org_id}/options/{roadmap_uuid}", response_model=RoadmapDetailRead)
async def api_get_roadmap_option(
    org_id: int,
    roadmap_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_roadmap_option(current_user, org_id, roadmap_uuid, db_session)


@router.put("/org/{org_id}/options/{roadmap_uuid}", response_model=RoadmapDetailRead)
async def api_update_roadmap_option(
    org_id: int,
    roadmap_uuid: str,
    roadmap_data: RoadmapOptionUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_roadmap_option(current_user, org_id, roadmap_uuid, roadmap_data, db_session)


@router.delete("/org/{org_id}/options/{roadmap_uuid}")
async def api_delete_roadmap_option(
    org_id: int,
    roadmap_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_roadmap_option(current_user, org_id, roadmap_uuid, db_session)


@router.post("/org/{org_id}/options/{roadmap_uuid}/requirements", response_model=RoadmapDetailRead)
async def api_create_requirement(
    org_id: int,
    roadmap_uuid: str,
    requirement_data: RoadmapRequirementCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_requirement(current_user, org_id, roadmap_uuid, requirement_data, db_session)


@router.put("/org/{org_id}/requirements/{requirement_uuid}", response_model=RoadmapDetailRead)
async def api_update_requirement(
    org_id: int,
    requirement_uuid: str,
    requirement_data: RoadmapRequirementUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_requirement(current_user, org_id, requirement_uuid, requirement_data, db_session)


@router.delete("/org/{org_id}/requirements/{requirement_uuid}", response_model=RoadmapDetailRead)
async def api_delete_requirement(
    org_id: int,
    requirement_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_requirement(current_user, org_id, requirement_uuid, db_session)


@router.post("/org/{org_id}/options/{roadmap_uuid}/events", response_model=RoadmapDetailRead)
async def api_create_event(
    org_id: int,
    roadmap_uuid: str,
    event_data: RoadmapEventCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_event(current_user, org_id, roadmap_uuid, event_data, db_session)


@router.put("/org/{org_id}/events/{event_uuid}", response_model=RoadmapDetailRead)
async def api_update_event(
    org_id: int,
    event_uuid: str,
    event_data: RoadmapEventUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_event(current_user, org_id, event_uuid, event_data, db_session)


@router.delete("/org/{org_id}/events/{event_uuid}", response_model=RoadmapDetailRead)
async def api_delete_event(
    org_id: int,
    event_uuid: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_event(current_user, org_id, event_uuid, db_session)
