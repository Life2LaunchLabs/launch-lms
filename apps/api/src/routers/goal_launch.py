"""The launch flow: start or resume setting up a personal goal, and the templates it can start from."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import launch

router = APIRouter()


class LaunchStart(BaseModel):
    org_id: int | None = None
    # Resume this draft instead of starting a new one.
    goal_uuid: str | None = None


@router.post("/launch")
def api_start_launch(payload: LaunchStart, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return launch.start(db, user, payload.org_id, payload.goal_uuid)


@router.get("/{goal_uuid}/launch")
def api_launch(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return launch.view(db, user, goal_uuid)


@router.get("/{goal_uuid}/launch/templates")
def api_launch_templates(goal_uuid: str, q: str = "", limit: int = launch.TEMPLATE_PICKS, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return launch.learner_templates(db, user, goal_uuid, q, limit)
