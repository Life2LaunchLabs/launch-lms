"""This week across a learner's goals: the paced week, ready for more and pace."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import home as service

router = APIRouter()


class HomePace(BaseModel):
    target: int = Field(ge=1, le=20)


@router.get("/home")
def api_home(db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """This week's steps across the learner's goals, then next week, months and later."""
    return service.home(db, user)


@router.post("/home/more")
def api_home_more(db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Ready for more: add a few more open steps to this week."""
    return service.ready_for_more(db, user)


@router.put("/home/pace")
def api_home_pace(payload: HomePace, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Change how many steps a week This week aims for."""
    return service.set_pace(db, user, payload.target)


@router.post("/home/goals/{goal_uuid}/pull")
def api_home_pull_goal(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Bring a goal started mid-week into this week."""
    return service.pull_in_goal(db, user, goal_uuid)


@router.post("/home/goals/{goal_uuid}/celebrated")
def api_home_goal_celebrated(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The learner has seen their finished goal's reward; it won't greet them again."""
    return service.mark_celebrated(db, user, goal_uuid)
