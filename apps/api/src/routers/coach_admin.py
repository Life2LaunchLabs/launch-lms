"""Platform › Coach: the coaching policy, provider keys, playbooks, routines and conversation starters."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.coach import CoachKeyCreate, CoachKeyUpdate, CoachOrder, CoachPlaybookWrite, CoachPolicyUpdate, CoachRoutineWrite
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services import hub_launch
from src.services.coach import keys, policy
from src.services.hub_launch import HubLaunchCardsUpdate

router = APIRouter(dependencies=[Depends(require_superadmin)])


@router.get("")
def get_coach_policy(db_session: Session = Depends(get_db_session)):
    return policy.policy_view(db_session)


@router.put("")
def update_coach_policy(payload: CoachPolicyUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return policy.update_policy(db_session, current_user, payload)


@router.post("/keys")
def create_coach_key(payload: CoachKeyCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return keys.create_key(db_session, current_user, payload)


@router.patch("/keys/{key_uuid}")
def update_coach_key(key_uuid: str, payload: CoachKeyUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return keys.update_key(db_session, current_user, key_uuid, payload)


@router.delete("/keys/{key_uuid}", status_code=204)
def delete_coach_key(key_uuid: str, db_session: Session = Depends(get_db_session)):
    keys.delete_key(db_session, key_uuid)


@router.get("/keys/{key_uuid}/models")
async def list_coach_key_models(key_uuid: str, db_session: Session = Depends(get_db_session)):
    return await keys.list_models(db_session, key_uuid)


@router.post("/playbooks")
def create_coach_playbook(payload: CoachPlaybookWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return policy.save_playbook(db_session, current_user, payload)


@router.put("/playbooks/order")
def order_coach_playbooks(payload: CoachOrder, db_session: Session = Depends(get_db_session)):
    return policy.reorder(db_session, "playbooks", payload)


@router.put("/playbooks/{playbook_uuid}")
def update_coach_playbook(playbook_uuid: str, payload: CoachPlaybookWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return policy.save_playbook(db_session, current_user, payload, playbook_uuid)


@router.delete("/playbooks/{playbook_uuid}", status_code=204)
def delete_coach_playbook(playbook_uuid: str, db_session: Session = Depends(get_db_session)):
    policy.delete_playbook(db_session, playbook_uuid)


@router.post("/routines")
def create_coach_routine(payload: CoachRoutineWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return policy.save_routine(db_session, current_user, payload)


@router.put("/routines/order")
def order_coach_routines(payload: CoachOrder, db_session: Session = Depends(get_db_session)):
    return policy.reorder(db_session, "routines", payload)


@router.put("/routines/{routine_uuid}")
def update_coach_routine(routine_uuid: str, payload: CoachRoutineWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return policy.save_routine(db_session, current_user, payload, routine_uuid)


@router.delete("/routines/{routine_uuid}", status_code=204)
def delete_coach_routine(routine_uuid: str, db_session: Session = Depends(get_db_session)):
    policy.delete_routine(db_session, routine_uuid)


@router.get("/launch-cards")
def get_coach_launch_cards(db_session: Session = Depends(get_db_session)):
    return hub_launch.launch_cards_settings(db_session)


@router.put("/launch-cards")
def update_coach_launch_cards(payload: HubLaunchCardsUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    """Save the cards, or send cards: null to restore the defaults."""
    return hub_launch.save_launch_cards(db_session, current_user, payload.cards)
