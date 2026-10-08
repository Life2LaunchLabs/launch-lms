from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_launch import HubLaunchCard, effective_launch_cards

router = APIRouter()


@router.get("/launch-cards", response_model=list[HubLaunchCard])
def api_hub_launch_cards(db: Session = Depends(get_db_session), _user: PublicUser = Depends(get_current_user)):
    return effective_launch_cards(db)
