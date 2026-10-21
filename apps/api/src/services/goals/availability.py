"""When each step of a goal can be started, and the state its node shows.

Locked is never stored: it follows from the stage the goal is on, a step's open date, the
steps it waits on and holds (see schedule.py for how stages run). A step waiting on review
counts as finished for unlocking what follows, so a slow review never stalls the learner,
and work already under way is never taken away.
"""

from __future__ import annotations

from datetime import date

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStage, GoalStep, StepStatus
from src.services.goals import schedule

UNLOCKING = DONE_STEP_STATUSES | {StepStatus.SUBMITTED.value}
UNDER_WAY = {StepStatus.IN_PROGRESS.value, StepStatus.SUBMITTED.value, StepStatus.CHANGES_REQUESTED.value}


def ordered_steps(stages: list[GoalStage], steps: list[GoalStep]) -> list[GoalStep]:
    """Goal order: stages by position, steps by position; steps without a stage last."""
    rank = {stage.id: index for index, stage in enumerate(schedule.ordered(stages))}
    return sorted(steps, key=lambda item: (rank.get(item.stage_id, len(rank)), item.position, item.id or 0))


def availability(goal: Goal, stages: list[GoalStage], steps: list[GoalStep], statuses: dict[int, str], today: date | None = None) -> dict[int, dict]:
    """``{step_id: {"locked": bool, "reason": ...}}``. Reasons: held, stage (not started), opens (a date), after (a step)."""
    today = today or date.today()
    order = schedule.ordered(stages)
    rank = {stage.id: index for index, stage in enumerate(order)}
    current = schedule.current_index(order, today)
    by_uuid = {item.step_uuid: item for item in steps}

    def status(item: GoalStep) -> str:
        return statuses.get(int(item.id), StepStatus.NOT_STARTED.value)  # type: ignore[arg-type]

    result: dict[int, dict] = {}
    for item in ordered_steps(stages, steps):
        if status(item) in DONE_STEP_STATUSES or status(item) in UNDER_WAY:
            result[int(item.id)] = {"locked": False, "reason": None}  # type: ignore[arg-type]
            continue
        reason: dict | None = {"kind": "held"} if item.held else None
        stage_rank = rank.get(item.stage_id)
        if not reason and stage_rank is not None and current is not None and stage_rank > current:
            stage = order[stage_rank]
            reason = {"kind": "stage", "title": stage.title, "date": stage.start_date.isoformat() if stage.start_date else None}
        if not reason and item.start_date and item.start_date > today:
            reason = {"kind": "opens", "date": item.start_date.isoformat()}
        if not reason:
            for uuid in item.after_step_uuids or []:
                waiting = by_uuid.get(uuid)
                if waiting and waiting.id != item.id and status(waiting) not in UNLOCKING:
                    reason = {"kind": "after", "step_uuid": waiting.step_uuid, "title": waiting.title}
                    break
        result[int(item.id)] = {"locked": reason is not None, "reason": reason}  # type: ignore[arg-type]
    return result


def node_state(status: str, locked: bool, fraction: float) -> str:
    """What the step's node shows: locked, open, started, waiting, retry or done."""
    if status in DONE_STEP_STATUSES:
        return "done"
    if status == StepStatus.SUBMITTED.value:
        return "waiting"
    if status == StepStatus.CHANGES_REQUESTED.value:
        return "retry"
    if locked:
        return "locked"
    if status == StepStatus.IN_PROGRESS.value or fraction > 0:
        return "started"
    return "open"
