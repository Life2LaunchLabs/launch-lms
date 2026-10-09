from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_next_actions import next_actions

router = APIRouter()


class HubNextAction(BaseModel):
    kind: str
    title: str
    reason: str
    route: str
    tier: int
    plan_uuid: str | None = None
    objective_uuid: str | None = None


@router.get("/next-actions", response_model=list[HubNextAction])
def api_hub_next_actions(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return next_actions(db, current_user.id)
