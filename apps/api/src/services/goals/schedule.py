"""When each stage and step of a goal runs, and the dates in it that don't fit together.

The same rules hold for personal and organization goals:

- A stage has an optional start date and no end: it runs until the next stage starts, and the
  last one until the goal's target date.
- The goal is on the last stage whose start date has arrived; with none, on its first stage.
- Moving to a stage by hand starts it today. Going back clears the start of each later stage
  that had begun, so it starts again when the goal gets there; stages skipped over lose a
  start date still to come.
- A step opens with its stage, or on a date of its own, or after the steps it waits on; it
  closes when its stage ends, or on a date of its own. Closing never locks a step: it is late.

Dates are never refused for disagreeing with each other; each disagreement comes back as a
warning on the stage or step it belongs to, so the plan can be fixed when it suits.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalStage, GoalStep
from src.db.users import PublicUser
from src.services.goals import access


def ordered(stages: list[GoalStage]) -> list[GoalStage]:
    return sorted(stages, key=lambda stage: (stage.position, stage.id or 0))


def current_index(stages: list[GoalStage], today: date | None = None) -> int | None:
    """Where the goal is in its ordered stages, or None when it has none."""
    today = today or date.today()
    if not stages:
        return None
    return max((index for index, stage in enumerate(stages) if stage.start_date and stage.start_date <= today), default=0)


def current_stage(stages: list[GoalStage], today: date | None = None) -> str | None:
    """The uuid of the stage the goal is on now, or None when it has no stages."""
    order = ordered(stages)
    index = current_index(order, today)
    return order[index].stage_uuid if index is not None else None


def stage_ends(goal: Goal, stages: list[GoalStage]) -> dict[int, date | None]:
    """The last day of each stage: the day before a later stage starts, else the goal's target date."""
    order = ordered(stages)
    ends: dict[int, date | None] = {}
    for index, stage in enumerate(order):
        following = next((later.start_date for later in order[index + 1:] if later.start_date), None)
        ends[int(stage.id)] = following - timedelta(days=1) if following else goal.target_date  # type: ignore[arg-type]
    return ends


def set_current_stage(db: Session, current_user: PublicUser, goal_uuid: str, stage_uuid: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.capabilities(db, goal, current_user.id)
    if not granted & {"update_progress", "edit_schedule"}:
        access.require(db, goal, current_user.id, "update_progress")
    order = ordered(list(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()))
    target = next((index for index, stage in enumerate(order) if stage.stage_uuid == stage_uuid), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Stage not found")
    today = date.today()
    was = current_index(order, today) or 0
    for index, stage in enumerate(order):
        if index > target and stage.start_date and stage.start_date <= today:
            stage.start_date = None
        elif was < index < target and stage.start_date and stage.start_date > today:
            stage.start_date = None
        elif index == target and target > 0 and (not stage.start_date or stage.start_date > today):
            stage.start_date = today
        db.add(stage)
    access.log(db, goal, current_user.id, "goal.stage_moved", {"stage_uuid": stage_uuid})
    db.commit()
    return goal


def _warn(kind: str, message: str, stage: GoalStage | None = None, step: GoalStep | None = None) -> dict:
    return {"kind": kind, "message": message, "stage_uuid": stage.stage_uuid if stage else None, "step_uuid": step.step_uuid if step else None}


def conflicts(goal: Goal, stages: list[GoalStage], steps: list[GoalStep]) -> list[dict]:
    """Every date or wait in the plan that can't all come true, as warnings."""
    order = ordered(stages)
    position = {stage.id: index for index, stage in enumerate(order)}
    stage_by_id = {stage.id: stage for stage in order}
    ends = stage_ends(goal, order)
    by_uuid = {step.step_uuid: step for step in steps}
    found: list[dict] = []
    previous: GoalStage | None = None
    for stage in order:
        if stage.start_date and previous and previous.start_date and stage.start_date < previous.start_date:
            found.append(_warn("stage_order", f"Starts before “{previous.title}” does, which comes first.", stage=stage))
        if stage.start_date:
            previous = stage
    for step in steps:
        stage = stage_by_id.get(step.stage_id)
        end = ends.get(int(stage.id)) if stage else None  # type: ignore[arg-type]
        if step.start_date and step.due_date and step.due_date < step.start_date:
            found.append(_warn("step_dates", "Closes before it opens.", step=step))
        if stage and stage.start_date and step.start_date and step.start_date < stage.start_date:
            found.append(_warn("step_before_stage", "Opens before its stage starts.", step=step))
        if end and step.due_date and step.due_date > end:
            found.append(_warn("step_after_stage", "Closes after its stage ends.", step=step))
        for uuid in step.after_step_uuids or []:
            waits_on = by_uuid.get(uuid)
            if not waits_on or waits_on.id == step.id:
                continue
            if position.get(waits_on.stage_id, -1) > position.get(step.stage_id, -1) and step.stage_id in position:
                found.append(_warn("waits_on_later", f"Waits on “{waits_on.title}”, which comes in a later stage.", step=step))
            elif waits_on.start_date and step.due_date and step.due_date < waits_on.start_date:
                found.append(_warn("closes_before_wait", f"Closes before “{waits_on.title}” opens, which it waits on.", step=step))
    return found


def waits_on(steps: list[GoalStep], step_uuid: str) -> set[str]:
    """Every step the given one waits on, directly or through others."""
    by_uuid = {step.step_uuid: step for step in steps}
    seen: set[str] = set()
    pending = list((by_uuid[step_uuid].after_step_uuids or []) if step_uuid in by_uuid else [])
    while pending:
        uuid = pending.pop()
        if uuid in seen or uuid not in by_uuid:
            continue
        seen.add(uuid)
        pending.extend(by_uuid[uuid].after_step_uuids or [])
    return seen
