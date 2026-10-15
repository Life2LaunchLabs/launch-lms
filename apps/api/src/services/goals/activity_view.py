"""What an activity step plays, for the learner's activity page: the activity with its pages and the subject's run."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningRun
from src.db.users import PublicUser
from src.services.goals import access
from src.services.goals.goals import step_or_404


def step_activity(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str) -> dict:
    """{goal, step, activity, run}: anyone who can view the goal; the run is the subject's (null until started)."""
    from src.services.learning import lookups, run_navigation

    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    step = step_or_404(db, goal, step_uuid)
    if step.type != "activity" or not step.activity_id:
        raise HTTPException(status_code=422, detail="This step is not an activity")
    activity = db.get(LearningActivity, step.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="This step's activity is no longer available")
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()  # type: ignore[arg-type]
    run = db.exec(select(LearningRun).where(LearningRun.goal_step_id == step.id, LearningRun.user_id == goal.subject_user_id)).first() if goal.subject_user_id else None
    return {
        "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title},
        "step": {"step_uuid": step.step_uuid, "title": step.title, "description": step.description},
        "activity": lookups._serialize_activity(activity, list(pages)).model_dump(),
        "run": run_navigation._serialize_run(db, run).model_dump() if run else None,
    }
