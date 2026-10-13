from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.planning import PlanHomePace
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import plan_home as service
from src.services.plan_celebration import mark_plan_celebrated

router = APIRouter()


@router.get("/home")
def api_home(
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """This week's steps across the learner's own plans, then next week, months and later."""
    return service.home(db, current_user)


@router.post("/home/more")
def api_home_more(
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Ready for more: add a few more open steps to this week."""
    return service.ready_for_more(db, current_user)


@router.put("/home/pace")
def api_home_pace(
    payload: PlanHomePace,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Change how many steps a week My plans aims for."""
    return service.set_pace(db, current_user, payload.target)


@router.post("/home/plans/{plan_uuid}/pull")
def api_home_pull_plan(
    plan_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Bring a plan started mid-week into this week."""
    return service.pull_in_plan(db, current_user, plan_uuid)


@router.post("/plans/{identifier}/celebrated")
def api_plan_celebrated(
    identifier: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """The learner has seen their finished plan's reward; it will not greet them again."""
    return mark_plan_celebrated(db, current_user, identifier)
