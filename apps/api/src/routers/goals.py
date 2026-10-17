"""Live goals, for learners and staff."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.goals import (
    GoalCreate,
    GoalUpdate,
    StageCreate,
    StageUpdate,
    StepCreate,
    StepEntryCreate,
    StepEntryUpdate,
    StepMove,
    StepNote,
    StepStatusChange,
    StepSubmission,
    StepUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import entries, goals as service, schedule, structure

router = APIRouter()


class GoalResponse(BaseModel):
    accept: bool


class StageOrder(BaseModel):
    stage_uuids: list[str]


class CurrentStage(BaseModel):
    stage_uuid: str


@router.get("")
def api_my_goals(include_finished: bool = True, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.list_my_goals(db, user, include_finished)


@router.post("")
def api_create_goal(payload: GoalCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.create_personal_goal(db, user, payload)


@router.get("/{goal_uuid}")
def api_goal(goal_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.get_goal(db, user, goal_uuid)


@router.patch("/{goal_uuid}")
def api_update_goal(goal_uuid: str, payload: GoalUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.update_goal(db, user, goal_uuid, payload)


@router.post("/{goal_uuid}/respond")
def api_respond(goal_uuid: str, payload: GoalResponse, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.respond(db, user, goal_uuid, payload.accept)


@router.post("/{goal_uuid}/stages")
def api_add_stage(goal_uuid: str, payload: StageCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.add_stage(db, user, goal_uuid, payload)


@router.put("/{goal_uuid}/stages/order")
def api_reorder_stages(goal_uuid: str, payload: StageOrder, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.reorder_stages(db, user, goal_uuid, payload.stage_uuids)


@router.put("/{goal_uuid}/stages/current")
def api_set_current_stage(goal_uuid: str, payload: CurrentStage, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    goal = schedule.set_current_stage(db, user, goal_uuid, payload.stage_uuid)
    return service.goal_dict(db, goal, user.id)


@router.patch("/{goal_uuid}/stages/{stage_uuid}")
def api_update_stage(goal_uuid: str, stage_uuid: str, payload: StageUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.update_stage(db, user, goal_uuid, stage_uuid, payload)


@router.delete("/{goal_uuid}/stages/{stage_uuid}")
def api_delete_stage(goal_uuid: str, stage_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.delete_stage(db, user, goal_uuid, stage_uuid)


@router.post("/{goal_uuid}/steps")
def api_add_step(goal_uuid: str, payload: StepCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.add_step(db, user, goal_uuid, payload)


@router.patch("/{goal_uuid}/steps/{step_uuid}")
def api_update_step(goal_uuid: str, step_uuid: str, payload: StepUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.update_step(db, user, goal_uuid, step_uuid, payload)


@router.put("/{goal_uuid}/steps/{step_uuid}/move")
def api_move_step(goal_uuid: str, step_uuid: str, payload: StepMove, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.move_step(db, user, goal_uuid, step_uuid, payload)


@router.delete("/{goal_uuid}/steps/{step_uuid}")
def api_delete_step(goal_uuid: str, step_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return structure.delete_step(db, user, goal_uuid, step_uuid)


@router.put("/{goal_uuid}/steps/{step_uuid}/status")
def api_step_status(goal_uuid: str, step_uuid: str, payload: StepStatusChange, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.change_status(db, user, goal_uuid, step_uuid, payload)


@router.put("/{goal_uuid}/steps/{step_uuid}/submission")
def api_step_submission(goal_uuid: str, step_uuid: str, payload: StepSubmission, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.save_submission(db, user, goal_uuid, step_uuid, payload)


@router.put("/{goal_uuid}/steps/{step_uuid}/note")
def api_step_note(goal_uuid: str, step_uuid: str, payload: StepNote, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.save_note(db, user, goal_uuid, step_uuid, payload)


@router.post("/{goal_uuid}/steps/{step_uuid}/entries")
def api_add_entry(goal_uuid: str, step_uuid: str, payload: StepEntryCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return entries.add_entry(db, user, goal_uuid, step_uuid, payload)


@router.patch("/{goal_uuid}/steps/{step_uuid}/entries/{entry_uuid}")
def api_update_entry(goal_uuid: str, step_uuid: str, entry_uuid: str, payload: StepEntryUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return entries.update_entry(db, user, goal_uuid, step_uuid, entry_uuid, payload)


@router.delete("/{goal_uuid}/steps/{step_uuid}/entries/{entry_uuid}")
def api_delete_entry(goal_uuid: str, step_uuid: str, entry_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return entries.delete_entry(db, user, goal_uuid, step_uuid, entry_uuid)


@router.get("/{goal_uuid}/steps/{step_uuid}/activity")
def api_step_activity(goal_uuid: str, step_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The activity a step plays, with its pages and the subject's run (null until started)."""
    from src.services.goals.activity_view import step_activity

    return step_activity(db, user, goal_uuid, step_uuid)


@router.post("/{goal_uuid}/steps/{step_uuid}/activity")
def api_start_activity(goal_uuid: str, step_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.start_activity(db, user, goal_uuid, step_uuid)
