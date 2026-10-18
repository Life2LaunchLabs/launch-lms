"""Platform › Coach: the coaching policy, its releases, tests, provider keys, playbooks, routines and conversation starters."""

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.coach import CoachKeyCreate, CoachKeyUpdate, CoachOrder, CoachPlaybookWrite, CoachPolicyUpdate, CoachReleaseCreate, CoachRoutineWrite, CoachTestWrite
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services import hub_launch
from src.services.coach import keys, policy, releases, scenarios
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


@router.get("/releases")
def list_coach_releases(db_session: Session = Depends(get_db_session)):
    return releases.releases_view(db_session)


@router.post("/releases")
def release_coach_draft(payload: CoachReleaseCreate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    releases.release(db_session, current_user, payload.note)
    return releases.releases_view(db_session)


@router.post("/releases/discard-draft")
def discard_coach_draft(current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    """Put the draft back to the live release."""
    releases.discard_draft(db_session, current_user)
    return releases.releases_view(db_session)


@router.post("/releases/{release_uuid}/roll-back")
def roll_back_coach_release(release_uuid: str, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    releases.roll_back(db_session, current_user, release_uuid)
    return releases.releases_view(db_session)


@router.get("/tests")
def list_coach_tests(db_session: Session = Depends(get_db_session)):
    return scenarios.tests_view(db_session)


@router.post("/tests")
def create_coach_test(payload: CoachTestWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return scenarios.save_test(db_session, current_user, payload)


@router.put("/tests/{test_uuid}")
def update_coach_test(test_uuid: str, payload: CoachTestWrite, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return scenarios.save_test(db_session, current_user, payload, test_uuid)


@router.delete("/tests/{test_uuid}", status_code=204)
def delete_coach_test(test_uuid: str, db_session: Session = Depends(get_db_session)):
    scenarios.delete_test(db_session, test_uuid)


@router.post("/tests/runs")
def run_coach_tests(background: BackgroundTasks, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    """Run every test on the draft and the live release; poll the run for results."""
    run, arguments = scenarios.begin(db_session, current_user)
    background.add_task(scenarios.execute, **arguments)
    return scenarios.run_dict(run)


@router.get("/tests/runs/{run_uuid}")
def get_coach_test_run(run_uuid: str, db_session: Session = Depends(get_db_session)):
    return scenarios.get_run(db_session, run_uuid)


@router.get("/launch-cards")
def get_coach_launch_cards(db_session: Session = Depends(get_db_session)):
    return hub_launch.launch_cards_settings(db_session)


@router.put("/launch-cards")
def update_coach_launch_cards(payload: HubLaunchCardsUpdate, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    """Save the cards, or send cards: null to restore the defaults."""
    return hub_launch.save_launch_cards(db_session, current_user, payload.cards)
