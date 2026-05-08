from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.identity import (
    FrameworkNodeRead,
    IdentityNodeDetailRead,
    IdentitySummaryRead,
    UserFrameworkProfileRead,
    UserFrameworkProfileUpdate,
    UserInsightCreate,
    UserInsightRead,
    UserInsightUpdate,
    UserKnowledgeEntryCreate,
    UserKnowledgeEntryRead,
    UserKnowledgeEntryUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.identity import (
    create_entry,
    create_insight,
    get_framework,
    get_identity_summary,
    get_node_detail,
    update_entry,
    update_insight,
    update_profile,
)

router = APIRouter()


@router.get("/org/{org_id}/framework", response_model=list[FrameworkNodeRead])
async def api_get_framework(
    org_id: int,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_framework(current_user, org_id, db_session)


@router.get("/org/{org_id}/summary", response_model=IdentitySummaryRead)
async def api_get_identity_summary(
    org_id: int,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_identity_summary(current_user, org_id, db_session)


@router.get("/org/{org_id}/nodes/{node_key}", response_model=IdentityNodeDetailRead)
async def api_get_node_detail(
    org_id: int,
    node_key: str,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_node_detail(current_user, org_id, node_key, db_session)


@router.post("/org/{org_id}/entries", response_model=UserKnowledgeEntryRead)
async def api_create_entry(
    org_id: int,
    entry_data: UserKnowledgeEntryCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_entry(current_user, org_id, entry_data, db_session)


@router.put("/org/{org_id}/entries/{entry_uuid}", response_model=UserKnowledgeEntryRead)
async def api_update_entry(
    org_id: int,
    entry_uuid: str,
    entry_data: UserKnowledgeEntryUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_entry(current_user, org_id, entry_uuid, entry_data, db_session)


@router.post("/org/{org_id}/insights", response_model=UserInsightRead)
async def api_create_insight(
    org_id: int,
    insight_data: UserInsightCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_insight(current_user, org_id, insight_data, db_session)


@router.put("/org/{org_id}/insights/{insight_uuid}", response_model=UserInsightRead)
async def api_update_insight(
    org_id: int,
    insight_uuid: str,
    insight_data: UserInsightUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_insight(current_user, org_id, insight_uuid, insight_data, db_session)


@router.put("/org/{org_id}/profiles/{node_key}", response_model=UserFrameworkProfileRead)
async def api_update_profile(
    org_id: int,
    node_key: str,
    profile_data: UserFrameworkProfileUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_profile(current_user, org_id, node_key, profile_data, db_session)
