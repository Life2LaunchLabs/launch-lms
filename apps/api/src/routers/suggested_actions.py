from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.suggested_actions import SuggestedAction, SuggestedActionEventCreate, SuggestedActionStateRead
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.suggested_actions import get_suggested_actions, record_suggested_action_event

router = APIRouter()


@router.get("/org/{org_id}", response_model=list[SuggestedAction])
async def api_get_suggested_actions(
    org_id: int,
    surface: str = "journey",
    slot: str = "primary",
    context: str | None = None,
    limit: int = Query(default=3, ge=1, le=20),
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_suggested_actions(
        user=current_user,
        org_id=org_id,
        surface=surface,
        slot=slot,
        context=context,
        limit=limit,
        db_session=db_session,
    )


@router.post("/org/{org_id}/events", response_model=SuggestedActionStateRead)
async def api_record_suggested_action_event(
    org_id: int,
    event: SuggestedActionEventCreate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    state = await record_suggested_action_event(
        user=current_user,
        org_id=org_id,
        event=event,
        db_session=db_session,
    )
    return SuggestedActionStateRead(
        **state.model_dump(exclude={"metadata_json"}),
        metadata=state.metadata_json or {},
    )
