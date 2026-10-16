"""Which stage a goal is on, and the dates in it that don't fit together.

The same rules hold for personal and organization goals:

- One stage is current at a time; a goal starts on its first stage.
- A goal moves on in one of two ways: someone who can work or schedule it moves it by hand
  (the app asks first), or a later stage's start date arrives.
- Finishing a stage's steps does not move the goal on by itself; the app offers the next stage.
- A choice made by hand holds until a later stage's start date arrives after the day it was made.

Dates are never refused for disagreeing with each other; each disagreement comes back as a
warning on the stage or step it belongs to, so the plan can be fixed when it suits.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalStage, GoalStep
from src.db.users import PublicUser
from src.services.goals import access

# goal.details key: {"stage_uuid": str, "set_on": "YYYY-MM-DD"}, the stage picked by hand.
CURRENT_STAGE_KEY = "current_stage"


def _picked(goal: Goal) -> tuple[str | None, date | None]:
    value = (goal.details or {}).get(CURRENT_STAGE_KEY) or {}
    try:
        set_on = date.fromisoformat(value.get("set_on")) if value.get("set_on") else None
    except (TypeError, ValueError):
        set_on = None
    return value.get("stage_uuid"), set_on


def current_stage(goal: Goal, stages: list[GoalStage], today: date | None = None) -> str | None:
    """The uuid of the stage the goal is on now, or None when it has no stages."""
    today = today or date.today()
    ordered = sorted(stages, key=lambda stage: stage.position)
    if not ordered:
        return None
    picked_uuid, set_on = _picked(goal)
    index = next((i for i, stage in enumerate(ordered) if stage.stage_uuid == picked_uuid), None)
    if index is None:
        index, set_on = 0, None
    # A start date that has arrived moves the goal on, unless the stage was picked by hand after it.
    for later in range(len(ordered) - 1, index, -1):
        start = ordered[later].start_date
        if start and start <= today and (set_on is None or start > set_on):
            index = later
            break
    return ordered[index].stage_uuid


def set_current_stage(db: Session, current_user: PublicUser, goal_uuid: str, stage_uuid: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.capabilities(db, goal, current_user.id)
    if not granted & {"update_progress", "edit_schedule"}:
        access.require(db, goal, current_user.id, "update_progress")
    stage = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id, GoalStage.stage_uuid == stage_uuid)).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    goal.details = {**(goal.details or {}), CURRENT_STAGE_KEY: {"stage_uuid": stage_uuid, "set_on": date.today().isoformat()}}
    db.add(goal)
    access.log(db, goal, current_user.id, "goal.stage_moved", {"stage_uuid": stage_uuid})
    db.commit()
    return goal


def _warn(kind: str, message: str, stage: GoalStage | None = None, step: GoalStep | None = None) -> dict:
    return {"kind": kind, "message": message, "stage_uuid": stage.stage_uuid if stage else None, "step_uuid": step.step_uuid if step else None}


def conflicts(stages: list[GoalStage], steps: list[GoalStep]) -> list[dict]:
    """Every date or ordering in the plan that can't all come true, as warnings."""
    ordered = sorted(stages, key=lambda stage: stage.position)
    position = {stage.id: index for index, stage in enumerate(ordered)}
    stage_by_id = {stage.id: stage for stage in ordered}
    by_uuid = {step.step_uuid: step for step in steps}
    found: list[dict] = []
    previous: GoalStage | None = None
    for stage in ordered:
        if stage.start_date and stage.due_date and stage.due_date < stage.start_date:
            found.append(_warn("stage_dates", "Ends before it starts.", stage=stage))
        if stage.start_date and previous and previous.start_date and stage.start_date < previous.start_date:
            found.append(_warn("stage_order", f"Starts before “{previous.title}” does, which comes first.", stage=stage))
        if stage.start_date:
            previous = stage
    for step in steps:
        stage = stage_by_id.get(step.stage_id)
        if step.start_date and step.due_date and step.due_date < step.start_date:
            found.append(_warn("step_dates", "Due before it starts.", step=step))
        if stage and stage.start_date and step.start_date and step.start_date < stage.start_date:
            found.append(_warn("step_before_stage", "Starts before its stage does.", step=step))
        if stage and stage.due_date and step.due_date and step.due_date > stage.due_date and not step.allow_late:
            found.append(_warn("step_after_stage", "Due after its stage ends.", step=step))
        for uuid in step.after_step_uuids or []:
            waits_on = by_uuid.get(uuid)
            if not waits_on or waits_on.id == step.id:
                continue
            if position.get(waits_on.stage_id, -1) > position.get(step.stage_id, -1) and step.stage_id in position:
                found.append(_warn("waits_on_later", f"Waits on “{waits_on.title}”, which comes in a later stage.", step=step))
            elif waits_on.due_date and step.due_date and step.due_date < waits_on.due_date:
                found.append(_warn("due_before_wait", f"Due before “{waits_on.title}”, which it waits on.", step=step))
    return found
