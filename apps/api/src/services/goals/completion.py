"""The only code that changes a step's status.

Learners, staff, activity runs, badge awards and portfolio changes all come
through here. Every change records who made it and how, writes the goal's
activity log, credits or withdraws requirements, and checks whether the goal
(and its badge) is now complete.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from src.db.goals import (
    DONE_STEP_STATUSES,
    CompletionMethod,
    Goal,
    GoalOwnership,
    GoalSource,
    GoalStage,
    GoalStatus,
    GoalStep,
    StepEntry,
    StepProgress,
    StepStatus,
)
from src.db.learning import LearningBadge, LearningRun, LearningRunStatus
from src.services.goals import access
from src.services.goals.types import StepState, step_type


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


# Progress rows ----------------------------------------------------------------

def stored_progress(db: Session, step: GoalStep) -> StepProgress | None:
    return db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()


def _new_progress(step: GoalStep) -> StepProgress:
    now = _now()
    return StepProgress(progress_uuid=f"step_progress_{uuid4()}", step_id=int(step.id), creation_date=now, update_date=now)  # type: ignore[arg-type]


def progress_view(db: Session, step: GoalStep) -> StepProgress:
    """Progress for reading; never writes, so concurrent page loads can't deadlock on inserts."""
    return stored_progress(db, step) or _new_progress(step)


def progress_for(db: Session, step: GoalStep) -> StepProgress:
    """Progress for changing, created on first write; a racing writer takes the winner's row."""
    progress = stored_progress(db, step)
    if progress:
        return progress
    progress = _new_progress(step)
    try:
        with db.begin_nested():
            db.add(progress)
    except IntegrityError:
        progress = stored_progress(db, step)
        if progress is None:
            raise
    return progress


def entries(db: Session, step: GoalStep) -> list[StepEntry]:
    return list(db.exec(select(StepEntry).where(StepEntry.step_id == step.id).order_by(StepEntry.position, StepEntry.id)).all())  # type: ignore[arg-type]


def state_of(db: Session, step: GoalStep, progress: StepProgress | None = None) -> StepState:
    return StepState(step, progress or progress_view(db, step), entries(db, step))


# Who may move a step where ----------------------------------------------------

LEARNER_TARGETS = {StepStatus.NOT_STARTED, StepStatus.IN_PROGRESS, StepStatus.SUBMITTED, StepStatus.COMPLETED}


def _check_learner(state: StepState, current: str, target: StepStatus) -> StepStatus:
    """What a learner's request actually does, or why it can't."""
    step = state.step
    kind = step_type(step.type)
    if target not in LEARNER_TARGETS:
        raise HTTPException(status_code=403, detail="Only staff can do that")
    if current in DONE_STEP_STATUSES and target != StepStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="This step is already done")
    if target in {StepStatus.SUBMITTED, StepStatus.COMPLETED}:
        if _value(step.completed_by) == "staff":
            raise HTTPException(status_code=403, detail="Staff complete this step")
        if not kind.learner_can_complete:
            raise HTTPException(status_code=409, detail=f"{kind.label} steps finish on their own")
        blocker = kind.completion_blocker(state)
        if blocker:
            raise HTTPException(status_code=422, detail=blocker)
        # Reviewed steps go to staff instead of finishing.
        return StepStatus.SUBMITTED if step.review_required else StepStatus.COMPLETED
    return target


def _check_staff(current: str, target: StepStatus) -> StepStatus:
    if target == StepStatus.CHANGES_REQUESTED and current != StepStatus.SUBMITTED.value:
        raise HTTPException(status_code=409, detail="Only a submitted step can be sent back")
    return target


def set_status(
    db: Session,
    goal: Goal,
    step: GoalStep,
    target: StepStatus,
    *,
    actor_user_id: int | None,
    method: CompletionMethod,
    note: str | None = None,
) -> StepProgress:
    """Move a step to ``target`` (flushed and committed), then apply what follows from it.

    ``method`` says who is asking: the learner (rules of the step type apply),
    staff (review, complete on behalf, excuse, reopen) or auto (a run, an award).
    """
    progress = progress_for(db, step)
    current = _value(progress.status)
    if method == CompletionMethod.LEARNER:
        target = _check_learner(state_of(db, step, progress), current, target)
    elif method == CompletionMethod.STAFF:
        target = _check_staff(current, target)
    if target.value == current and note is None:
        return progress

    now = datetime.utcnow()
    progress.status = target
    if target == StepStatus.COMPLETED:
        progress.completed_at = progress.completed_at or now
        progress.completed_by_user_id = actor_user_id
        progress.completion_method = method
    elif target.value not in DONE_STEP_STATUSES:
        progress.completed_at, progress.completed_by_user_id, progress.completion_method = None, None, None
    if note is not None:
        if method == CompletionMethod.STAFF:
            progress.reviewer_note = note
            if target == StepStatus.CHANGES_REQUESTED:
                progress.feedback_history = [*(progress.feedback_history or []), {"message": note, "user_id": actor_user_id, "created_at": _now()}]
        else:
            progress.learner_note = note
    progress.updated_by_user_id = actor_user_id
    progress.update_date = _now()
    db.add(progress)
    db.flush()
    _after_change(db, goal, step, progress, actor_user_id, method, current)
    db.commit()
    db.refresh(progress)
    finish_if_complete(db, goal)
    return progress


def _after_change(db: Session, goal: Goal, step: GoalStep, progress: StepProgress, actor_user_id: int | None, method: CompletionMethod, previous: str) -> None:
    from src.services.goals.credit import sync_step_progress

    state = state_of(db, step, progress)
    evidence = {"submission": progress.submission or {}, "answer": progress.answer, "result": step_type(step.type).result(state)}
    sync_step_progress(db, progress, step, goal, evidence)
    access.log(db, goal, actor_user_id, "step.status", {
        "step_uuid": step.step_uuid, "from": previous, "to": _value(progress.status), "method": _value(method),
    })
    if step.stage_id is not None and _value(progress.status) in DONE_STEP_STATUSES and previous not in DONE_STEP_STATUSES:
        # Finishing a stage brings Coach's next check-in forward.
        stage_steps = [int(item.id) for item in db.exec(select(GoalStep).where(GoalStep.stage_id == step.stage_id)).all()]  # type: ignore[arg-type]
        done = db.exec(select(StepProgress.step_id).where(StepProgress.step_id.in_(stage_steps), StepProgress.status.in_(list(DONE_STEP_STATUSES)))).all()  # type: ignore[union-attr, attr-defined]
        if set(stage_steps) <= {int(item) for item in done} | {int(step.id)}:  # type: ignore[arg-type]
            from src.services.goals.check_ins import due_soon

            due_soon(db, goal)


def finish_if_complete(db: Session, goal: Goal) -> None:
    """External goals finish when every step is done (at least one completed), and award their badge.

    Personal goals finish only when the learner says so.
    """
    if _value(goal.ownership) != GoalOwnership.EXTERNAL.value or _value(goal.status) != GoalStatus.ACTIVE.value or not goal.subject_user_id:
        return
    steps = list(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all())
    if not steps:
        return
    statuses = {int(row.step_id): _value(row.status) for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_([step.id for step in steps]))).all()}  # type: ignore[union-attr]
    values = [statuses.get(int(step.id), StepStatus.NOT_STARTED.value) for step in steps]  # type: ignore[arg-type]
    if any(value not in DONE_STEP_STATUSES for value in values) or StepStatus.COMPLETED.value not in values:
        return
    badge = db.get(LearningBadge, goal.badge_id) if _value(goal.source) == GoalSource.BADGE.value and goal.badge_id else None
    if badge:
        from src.services.goals.badges import award_badge

        award_badge(db, badge, int(goal.subject_user_id), goal.org_id, {"goal_uuid": goal.goal_uuid})
    goal.status = GoalStatus.FINISHED
    goal.finished_at = datetime.utcnow()
    goal.update_date = _now()
    db.add(goal)
    access.log(db, goal, None, "goal.finished", {})
    db.commit()
    if badge:
        on_badge_awarded(db, int(goal.subject_user_id), int(badge.id))  # type: ignore[arg-type]


# Automatic completion -----------------------------------------------------------

def _auto(db: Session, step: GoalStep, target: StepStatus) -> None:
    goal = db.get(Goal, step.goal_id)
    if not goal:
        return
    progress = progress_view(db, step)
    if _value(progress.status) in DONE_STEP_STATUSES or _value(progress.status) == target.value:
        return
    if target == StepStatus.COMPLETED and step.review_required:
        target = StepStatus.SUBMITTED
    set_status(db, goal, step, target, actor_user_id=goal.subject_user_id, method=CompletionMethod.AUTO)


def end_routines(db: Session, goal: Goal, today: date | None = None) -> None:
    """End the goal's running routines whose end date (their own or their stage's) has passed."""
    from src.services.goals.schedule import stage_ends
    from src.services.goals.types.routine import ends_on

    if _value(goal.status) != GoalStatus.ACTIVE.value:
        return
    today = today or date.today()
    routines = list(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.type == "routine")).all())
    ends = stage_ends(goal, list(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all())) if routines else {}
    for step in routines:
        last_day = ends_on(step, ends.get(step.stage_id))  # type: ignore[arg-type]
        if last_day and last_day < today:
            _auto(db, step, StepStatus.COMPLETED)


def on_run_changed(db: Session, run: LearningRun) -> None:
    """Carry an activity run's result onto its goal step."""
    from src.services.learning import grading

    step = db.get(GoalStep, run.goal_step_id) if run.goal_step_id else None
    if not step:
        return
    finished = run.status == LearningRunStatus.COMPLETED
    waiting = grading._has_pending_required_manual_grades(db, run) or (
        (run.data or {}).get("completion_result", {}).get("reason") == "pending_manual_grades"
    )
    if finished and not waiting:
        _auto(db, step, StepStatus.COMPLETED)
    elif waiting:
        _auto(db, step, StepStatus.SUBMITTED)
    else:
        _auto(db, step, StepStatus.IN_PROGRESS)


def on_badge_awarded(db: Session, user_id: int, badge_id: int) -> None:
    """Badge steps for this badge, on the learner's goals, are done."""
    steps = db.exec(
        select(GoalStep).join(Goal, Goal.id == GoalStep.goal_id)
        .where(GoalStep.badge_id == badge_id, GoalStep.type == "badge", Goal.subject_user_id == user_id, Goal.status == GoalStatus.ACTIVE)
    ).all()
    for step in steps:
        _auto(db, step, StepStatus.COMPLETED)


def on_portfolio_changed(db: Session, user_id: int) -> None:
    """Portfolio steps whose check the learner's portfolio now passes are done."""
    from src.services.goals.portfolio import done_checks

    steps = db.exec(
        select(GoalStep).join(Goal, Goal.id == GoalStep.goal_id)
        .where(GoalStep.type == "portfolio", Goal.subject_user_id == user_id, Goal.status == GoalStatus.ACTIVE)
    ).all()
    if not steps:
        return
    done = done_checks(db, user_id)
    for step in steps:
        if (step.config or {}).get("check") in done:
            _auto(db, step, StepStatus.COMPLETED)
