from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services import hub_launch
from src.services.hub_launch import HubLaunchCardsUpdate

router = APIRouter(dependencies=[Depends(require_superadmin)])


@router.get("/settings/hub-launch-cards")
async def get_hub_launch_cards(db_session: Session = Depends(get_db_session)):
    return hub_launch.launch_cards_settings(db_session)


@router.put("/settings/hub-launch-cards")
async def update_hub_launch_cards(
    payload: HubLaunchCardsUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """Save the cards, or send cards: null to restore the defaults."""
    return hub_launch.save_launch_cards(db_session, current_user, payload.cards)
