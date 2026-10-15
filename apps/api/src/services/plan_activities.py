"""Interactive activities as plan steps.

A template objective of kind "activity" owns one activity. Live plans made
from the template point at it; the learner plays it through a run scoped to
that activity on their plan objective, and finishing the activity finishes
the step (or sends it for review when it needs sign-off or manual grading).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningRun, LearningRunStatus
from src.db.planning import Plan, PlanObjective, PlanObjectiveStatus
from src.db.programs import Objective
from src.db.users import PublicUser


def _now_string() -> str:
    return datetime.now().isoformat()


def create_objective_activity(db: Session, objective: Objective) -> LearningActivity:
    """Give a new activity objective its (empty) activity, edited later as an Activity Document."""
    now = _now_string()
    activity = LearningActivity(
        activity_uuid=f"learning_activity_{uuid4()}", objective_id=objective.id, org_id=objective.org_id,
        title=objective.title, description=objective.description or "", settings={}, creation_date=now, update_date=now,
    )
    db.add(activity)
    db.flush()
    return activity


def activity_summary(db: Session, objective: Objective) -> dict:
    """What a template objective dict says about its activity."""
    from src.services.template_versions import working_activity

    activity = working_activity(db, int(objective.id))  # type: ignore[arg-type]
    if not activity:
        return {}
    pages = db.exec(select(LearningPage.id).where(LearningPage.activity_id == activity.id)).all()
    return {"activity_id": activity.id, "activity": {"activity_uuid": activity.activity_uuid, "title": activity.title, "page_count": len(pages)}}


def _objective_in_plan(db: Session, plan: Plan, objective_uuid: str) -> PlanObjective:
    objective = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id, PlanObjective.objective_uuid == objective_uuid)).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    if not objective.activity_id:
        raise HTTPException(status_code=422, detail="This step is not an activity")
    return objective


def _activity_payload(db: Session, objective: PlanObjective) -> dict:
    from src.services.learning import lookups

    activity = db.get(LearningActivity, objective.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="This step's activity is no longer available")
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()
    return lookups._serialize_activity(activity, list(pages)).model_dump()


def _existing_run(db: Session, objective: PlanObjective, user_id: int) -> LearningRun | None:
    return db.exec(select(LearningRun).where(
        LearningRun.plan_objective_id == objective.id,
        LearningRun.activity_id == objective.activity_id,
        LearningRun.user_id == user_id,
    )).first()


def get_objective_activity(db: Session, current_user: PublicUser, identifier: str, objective_uuid: str) -> dict:
    """The activity a step plays, with the learner's run if they started it."""
    from src.services.learning import run_navigation
    from src.services.planning import _plan_or_404, _require

    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "view_plan")
    objective = _objective_in_plan(db, plan, objective_uuid)
    run = _existing_run(db, objective, int(plan.subject_user_id or current_user.id))
    return {
        "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name},
        "objective": {"objective_uuid": objective.objective_uuid, "title": objective.title, "description": objective.description},
        "activity": _activity_payload(db, objective),
        "run": run_navigation._serialize_run(db, run).model_dump() if run else None,
    }


def start_objective_activity(db: Session, current_user: PublicUser, identifier: str, objective_uuid: str) -> dict:
    """Start (or resume) the learner's run of a step's activity."""
    from src.services.learning import run_navigation
    from src.services.planning import _plan_or_404, _progress_for, _require
    from src.services.plan_availability import plan_availability

    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "update_progress")
    if plan.subject_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the person this plan is for can play its activities")
    objective = _objective_in_plan(db, plan, objective_uuid)
    availability = plan_availability(db, plan).get(int(objective.id), {"state": "open"})
    if availability["state"] == "not_ready":
        raise HTTPException(status_code=409, detail={"message": "This step is not ready yet", "availability": availability})
    activity = db.get(LearningActivity, objective.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="This step's activity is no longer available")
    run = _existing_run(db, objective, int(current_user.id))
    now = datetime.utcnow()
    if not run:
        run = LearningRun(
            run_uuid=f"learning_run_{uuid4()}", activity_id=activity.id, org_id=activity.org_id,
            issuing_org_id=plan.source_org_id, plan_id=plan.id, plan_objective_id=objective.id,
            user_id=current_user.id, started_at=now, creation_date=str(now), update_date=str(now),
        )
        db.add(run)
    progress = _progress_for(db, objective)
    if progress.status == PlanObjectiveStatus.NOT_STARTED:
        progress.status = PlanObjectiveStatus.IN_PROGRESS
        progress.update_date = _now_string()
        db.add(progress)
    db.commit()
    db.refresh(run)
    return {
        "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name},
        "objective": {"objective_uuid": objective.objective_uuid, "title": objective.title, "description": objective.description},
        "activity": _activity_payload(db, objective),
        "run": run_navigation._serialize_run(db, run).model_dump(),
    }


def sync_objective_from_run(db: Session, run: LearningRun) -> None:
    """Carry an objective run's result onto its plan step."""
    from src.services.learning import grading
    from src.services.planning import _progress_for

    if run.goal_step_id:
        from src.services.goals.completion import on_run_changed

        on_run_changed(db, run)
        return
    if not run.plan_objective_id or not run.activity_id:
        return
    objective = db.get(PlanObjective, run.plan_objective_id)
    plan = db.get(Plan, objective.plan_id) if objective else None
    if not objective or not plan:
        return
    finished = run.status == LearningRunStatus.COMPLETED
    waiting = grading._has_pending_required_manual_grades(db, run) or (
        (run.data or {}).get("completion_result", {}).get("reason") == "pending_manual_grades"
    )
    progress = _progress_for(db, objective)
    current = progress.status.value if hasattr(progress.status, "value") else str(progress.status)
    if current in {PlanObjectiveStatus.COMPLETED.value, PlanObjectiveStatus.CANCELED.value}:
        return
    if finished and not waiting:
        target = PlanObjectiveStatus.SUBMITTED if objective.completion_restricted else PlanObjectiveStatus.COMPLETED
    elif waiting:
        target = PlanObjectiveStatus.SUBMITTED
    else:
        target = PlanObjectiveStatus.IN_PROGRESS
    if target.value == current:
        return
    progress.status = target
    progress.completed_at = datetime.utcnow() if target == PlanObjectiveStatus.COMPLETED else None
    progress.updated_by_user_id = run.user_id
    progress.update_date = _now_string()
    db.add(progress)
    db.flush()
    from src.services.requirements import sync_live_progress
    sync_live_progress(db, progress, objective, plan)
    db.commit()
    from src.services.badge_routes import award_if_plan_complete
    award_if_plan_complete(db, plan)


def get_template_activity(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, activity_uuid: str) -> dict:
    """A template objective's activity with its pages, for the activity editor."""
    from src.db.programs import Program, ProgramObjective
    from src.services.learning import lookups
    from src.services.programs import require_org_admin

    require_org_admin(current_user.id, org_id, db)
    program = db.exec(select(Program).where(Program.program_uuid == template_uuid, Program.org_id == org_id)).first()
    activity = lookups._get_activity(db, activity_uuid)
    relation = db.exec(select(ProgramObjective).where(
        ProgramObjective.program_id == (program.id if program else 0), ProgramObjective.objective_id == activity.objective_id,
    )).first() if activity.objective_id else None
    if not program or not relation:
        raise HTTPException(status_code=404, detail="Activity not found in this template")
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()
    return {
        "template": {"program_uuid": program.program_uuid, "name": program.name, "org_id": program.org_id},
        "activity": lookups._serialize_activity(activity, list(pages)).model_dump(),
    }
