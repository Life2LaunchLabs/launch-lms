"""Staff views across goals: the review inbox and queue, assignment matrices, cohorts and managed learners."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.goal_admin import StaffNote, StepConfirmMany, StepDecision, StepProgressBulk
from src.db.goal_templates import GoalAssignmentUpdate, StepRemind, StepSettle
from src.db.goals import GoalAssignment
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.features_utils.plan_check import get_org_plan
from src.security.features_utils.plans import plan_meets_requirement
from src.services.goals import assignment_steps, assignments, review, staff_views

router = APIRouter()
GROUPS_NEED = "Group goal assignments require a Full plan or higher"


def _require_group_plans(org_id: int, db: Session) -> None:
    if not plan_meets_requirement(get_org_plan(org_id, db), "full"):
        raise HTTPException(status_code=403, detail=GROUPS_NEED)


def _require_assignment_plan(org_id: int, assignment_uuid: str, db: Session) -> None:
    if plan_meets_requirement(get_org_plan(org_id, db), "full"):
        return
    group = db.exec(select(GoalAssignment.usergroup_id).where(GoalAssignment.org_id == org_id, GoalAssignment.assignment_uuid == assignment_uuid)).first()
    if group:
        raise HTTPException(status_code=403, detail=GROUPS_NEED)


# Review inbox ---------------------------------------------------------------------------

@router.get("/inbox")
def api_inbox(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return review.inbox(db, user, org_id)


@router.get("/inbox/queue")
def api_inbox_queue(org_id: int, assignment_uuid: str, step_key: str | None = None, step_uuid: str | None = None,
                    db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return review.review_queue(db, user, org_id, assignment_uuid, step_key, step_uuid)


@router.post("/inbox/decide")
def api_inbox_decide(org_id: int, payload: StepDecision, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return review.decide(db, user, org_id, payload.step_uuid, payload.action, payload.message)


@router.post("/inbox/confirm")
def api_inbox_confirm(org_id: int, payload: StepConfirmMany, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return review.confirm_many(db, user, org_id, payload.step_uuids, payload.message)


@router.post("/inbox/staff-notes")
def api_inbox_staff_note(org_id: int, payload: StaffNote, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return review.add_staff_note(db, user, org_id, payload.step_uuid, payload.message)


# Assignments ----------------------------------------------------------------------------

@router.get("/assignments")
def api_assignments(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return staff_views.list_assignments(db, user, org_id)


@router.post("/assignments/progress")
def api_assignment_progress(org_id: int, payload: StepProgressBulk, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return staff_views.update_progress(db, user, org_id, payload)


@router.patch("/assignments/{assignment_uuid}")
def api_assignment_update(assignment_uuid: str, org_id: int, payload: GoalAssignmentUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignments.update(db, user, org_id, assignment_uuid, payload)


@router.post("/assignments/{assignment_uuid}/pause")
def api_assignment_pause(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignments.pause(db, user, org_id, assignment_uuid)


@router.post("/assignments/{assignment_uuid}/resume")
def api_assignment_resume(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignments.resume(db, user, org_id, assignment_uuid)


@router.post("/assignments/{assignment_uuid}/end")
def api_assignment_end(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignments.end(db, user, org_id, assignment_uuid)


@router.post("/assignments/{assignment_uuid}/steps/{step_key}/remind")
def api_assignment_step_remind(assignment_uuid: str, step_key: str, org_id: int, payload: StepRemind,
                               db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignment_steps.remind(db, user, org_id, assignment_uuid, step_key, payload)


@router.post("/assignments/{assignment_uuid}/steps/{step_key}/settle")
def api_assignment_step_settle(assignment_uuid: str, step_key: str, org_id: int, payload: StepSettle,
                               db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return assignment_steps.settle(db, user, org_id, assignment_uuid, step_key, payload)


@router.get("/assignments/{assignment_uuid}/matrix")
def api_assignment_matrix(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return staff_views.assignment_matrix(db, user, org_id, assignment_uuid)


@router.get("/assignments/{assignment_uuid}/reviews")
def api_assignment_reviews(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_assignment_plan(org_id, assignment_uuid, db)
    return staff_views.assignment_reviews(db, user, org_id, assignment_uuid)


@router.get("/goals/{goal_uuid}/reviews")
def api_goal_reviews(goal_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return staff_views.goal_reviews(db, user, org_id, goal_uuid)


@router.get("/cohorts/{usergroup_id}")
def api_cohort(usergroup_id: int, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_group_plans(org_id, db)
    return staff_views.cohort(db, user, org_id, usergroup_id)


@router.get("/managed-users/{user_id}")
def api_managed_user(user_id: int, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return staff_views.managed_user(db, user, org_id, user_id)
