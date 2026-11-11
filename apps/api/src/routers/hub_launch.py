from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_launch import HubLaunchCard, effective_launch_cards, launch_card_audience

router = APIRouter()


@router.get("/launch-cards", response_model=list[HubLaunchCard])
def api_hub_launch_cards(org_id: int | None = None, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    """The starters for this person in this organization: the staff set for its staff and admins."""
    return effective_launch_cards(db, launch_card_audience(db, current_user.id, org_id))
