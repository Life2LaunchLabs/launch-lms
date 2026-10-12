from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import plan_activities as service

router = APIRouter()


@router.get("/plans/{identifier}/objectives/{objective_uuid}/activity")
def api_objective_activity(
    identifier: str,
    objective_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """The activity a plan step plays, with the learner's run if started."""
    return service.get_objective_activity(db, current_user, identifier, objective_uuid)


@router.post("/plans/{identifier}/objectives/{objective_uuid}/activity/start")
def api_start_objective_activity(
    identifier: str,
    objective_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Start or resume the learner's run of a step's activity. Pages and responses then use the learning runtime."""
    return service.start_objective_activity(db, current_user, identifier, objective_uuid)


@router.get("/templates/{template_uuid}/activities/{activity_uuid}")
def api_template_activity(
    template_uuid: str,
    activity_uuid: str,
    org_id: int,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """A template's activity with its pages, for the activity editor."""
    return service.get_template_activity(db, current_user, org_id, template_uuid, activity_uuid)
