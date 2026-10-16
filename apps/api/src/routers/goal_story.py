"""A finished goal's story, served as an activity for the story player."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import story

router = APIRouter()


@router.get("/{goal_uuid}/story")
def api_goal_story(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return story.view(db, user, goal_uuid)
