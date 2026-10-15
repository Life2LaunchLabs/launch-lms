"""Applying Coach proposals to a live goal, and binding an editing run to the goal it created.

Re-applying a proposal never duplicates it. Each proposed stage or step carries
a ``request_key`` (the proposal item's ``local_id``, which the web uses as its
edit object key). The new row's uuid is derived from the goal and that key
(uuid5), so a second apply finds the row it made, and two racing applies
collide on the uuid's unique constraint instead of making two rows. The key is
also written to the goal's activity log, so a stage or step the learner deleted
after applying stays deleted when the proposal is applied again. No schema
change is needed: GoalStep.config stays the type's own settings.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import NAMESPACE_URL, uuid4, uuid5

from fastapi import HTTPException
from pydantic import Field
from sqlmodel import Session, select

from src.db.goals import Goal, GoalOwnership, GoalStage, GoalStep, StageCreate, StepCreate
from src.db.hub import HubEditObjectState, HubEditRun, HubEditRunEvent
from src.db.planning import PlanActivity
from src.db.users import PublicUser
from src.security.org_auth import require_org_membership
from src.services.goals import access
from src.services.goals.goals import _now, _value, goal_dict
from src.services.goals.structure import _check_completer, _prerequisites, _renumber, _siblings, _stage

GOAL_ROUTE = "/plans/{goal_uuid}"


class CoachStageCreate(StageCreate):
    request_key: str | None = Field(default=None, min_length=1, max_length=160)
    due_date: date | None = None


class CoachStepCreate(StepCreate):
    request_key: str | None = Field(default=None, min_length=1, max_length=160)


def _keyed_uuid(prefix: str, goal: Goal, kind: str, request_key: str) -> str:
    return f"{prefix}_{uuid5(NAMESPACE_URL, f'launchlms:{goal.goal_uuid}:{kind}:{request_key}')}"


def _applied_before(db: Session, goal: Goal, action: str, request_key: str) -> bool:
    rows = db.exec(select(PlanActivity.payload).where(PlanActivity.goal_id == goal.id, PlanActivity.action == action)).all()
    return any((payload or {}).get("request_key") == request_key for payload in rows)


def _result(db: Session, goal: Goal, user_id: int, key: str, uuid: str | None, outcome: str) -> dict:
    return {**goal_dict(db, goal, user_id), key: uuid, "applied": outcome}


def add_stage_once(db: Session, current_user: PublicUser, goal_uuid: str, payload: CoachStageCreate) -> dict:
    """Add a stage; with a request_key, applying again returns the stage made the first time.

    ``applied`` is "created", "existing", or "removed" (applied before, then deleted, so left out).
    """
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    stage_uuid = _keyed_uuid("goal_stage", goal, "stage", payload.request_key) if payload.request_key else None
    if stage_uuid:
        existing = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id, GoalStage.stage_uuid == stage_uuid)).first()
        if existing:
            return _result(db, goal, current_user.id, "created_stage_uuid", existing.stage_uuid, "existing")
        if _applied_before(db, goal, "stage.added", payload.request_key):  # type: ignore[arg-type]
            return _result(db, goal, current_user.id, "created_stage_uuid", None, "removed")
    if payload.due_date is not None:
        access.require(db, goal, current_user.id, "edit_schedule")
    stages = sorted(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all(), key=lambda item: item.position)
    now = _now()
    stage = GoalStage(
        stage_uuid=stage_uuid or f"goal_stage_{uuid4()}", goal_id=int(goal.id),  # type: ignore[arg-type]
        title=payload.title.strip(), description=payload.description, timing=payload.timing, due_date=payload.due_date, creation_date=now, update_date=now,
    )
    position = len(stages) if payload.position is None else min(payload.position, len(stages))
    stages.insert(position, stage)
    db.add(stage)
    _renumber(db, stages)
    access.log(db, goal, current_user.id, "stage.added", {"title": stage.title, "stage_uuid": stage.stage_uuid, "request_key": payload.request_key})
    db.commit()
    return _result(db, goal, current_user.id, "created_stage_uuid", stage.stage_uuid, "created")


def add_step_once(db: Session, current_user: PublicUser, goal_uuid: str, payload: CoachStepCreate) -> dict:
    """Add a typed step (validated by the step registry); with a request_key, applying again doesn't duplicate it."""
    from src.services.goals.issue import build_step

    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    step_uuid = _keyed_uuid("goal_step", goal, "step", payload.request_key) if payload.request_key else None
    if step_uuid:
        existing = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid == step_uuid)).first()
        if existing:
            return _result(db, goal, current_user.id, "created_step_uuid", existing.step_uuid, "existing")
        if _applied_before(db, goal, "step.added", payload.request_key):  # type: ignore[arg-type]
            return _result(db, goal, current_user.id, "created_step_uuid", None, "removed")
    if payload.start_date is not None or payload.due_date is not None:
        access.require(db, goal, current_user.id, "edit_schedule")
    stage = _stage(db, goal, payload.stage_uuid) if payload.stage_uuid else None
    _check_completer(goal, _value(payload.completed_by), payload.review_required)
    siblings = _siblings(db, goal, stage.id if stage else None)
    position = len(siblings) if payload.position is None else min(payload.position, len(siblings))
    spec = payload.model_dump(exclude={"stage_uuid", "position", "after_step_uuids", "start_date", "due_date", "request_key"})
    spec["completed_by"] = _value(payload.completed_by)
    step = build_step(db, goal, stage, spec, position, due_date=payload.due_date)
    if step_uuid:
        step.step_uuid = step_uuid
    step.start_date = payload.start_date
    step.after_step_uuids = _prerequisites(db, goal, payload.after_step_uuids, None)
    siblings.insert(position, step)
    _renumber(db, siblings)
    db.flush()
    access.log(db, goal, current_user.id, "step.added", {"step_uuid": step.step_uuid, "type": step.type, "request_key": payload.request_key})
    db.commit()
    return _result(db, goal, current_user.id, "created_step_uuid", step.step_uuid, "created")


def bind_created_goal(db: Session, run_uuid: str, org_id: int, user_id: int, goal_identifier: str) -> dict:
    """Point a new-goal editing run at the personal goal the learner just saved."""
    from src.services.hub_edit_runs import _run_dict
    from src.services.goals.coach_tools import scope

    require_org_membership(user_id, org_id, db)
    run = db.exec(select(HubEditRun).where(HubEditRun.run_uuid == run_uuid, HubEditRun.org_id == org_id, HubEditRun.user_id == user_id)).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Editing run not found")
    if run.status != "active" or scope(run.scope_kind) != "new_goal":
        raise HTTPException(status_code=409, detail="This run is not waiting for a new goal")
    goal = db.exec(select(Goal).where(
        Goal.goal_uuid == goal_identifier, Goal.owner_user_id == user_id,
        Goal.ownership == GoalOwnership.PERSONAL,
    )).first()
    if goal is None:
        raise HTTPException(status_code=404, detail="New personal goal not found")
    now = datetime.utcnow()
    run.scope_kind = "goal"
    run.target_uuid = goal.goal_uuid
    run.target_label = goal.title[:240]
    run.route = GOAL_ROUTE.format(goal_uuid=goal.goal_uuid)
    run.updated_at = now
    db.add(run)
    recovered = db.exec(select(HubEditObjectState).where(
        HubEditObjectState.run_id == run.id, HubEditObjectState.object_key.in_(["new-goal", "new-plan"]),  # type: ignore[attr-defined]
    )).first()
    if recovered:
        recovered.status, recovered.object_uuid, recovered.updated_at = "saved", goal.goal_uuid, now
        recovered.revision += 1
        db.add(recovered)
    last = db.exec(select(HubEditRunEvent.sequence).where(HubEditRunEvent.run_id == run.id).order_by(HubEditRunEvent.sequence.desc())).first() or 0  # type: ignore[union-attr]
    db.add(HubEditRunEvent(
        event_uuid=f"hub_edit_event_{uuid5(NAMESPACE_URL, f'{run.run_uuid}:bound:{goal.goal_uuid}').hex}", run_id=int(run.id),  # type: ignore[arg-type]
        sequence=int(last) + 1, kind="goal.created", summary=f"Created goal {goal.title}", object_type="goal",
        object_uuid=goal.goal_uuid, object_label=goal.title[:240], created_at=now,
    ))
    db.commit()
    return _run_dict(db, run)
