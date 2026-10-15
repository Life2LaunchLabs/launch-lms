"""When each step of a goal can be started, and the state its node shows.

Locked is never stored: it follows from the goal's step order, a step's
prerequisites, start dates and holds. A step waiting on review counts as
finished for unlocking what follows, so a slow review never stalls the learner,
and work already under way is never taken away.
"""

from __future__ import annotations

from datetime import date

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStage, GoalStep, StepOrder, StepStatus

UNLOCKING = DONE_STEP_STATUSES | {StepStatus.SUBMITTED.value}
UNDER_WAY = {StepStatus.IN_PROGRESS.value, StepStatus.SUBMITTED.value, StepStatus.CHANGES_REQUESTED.value}


def ordered_steps(stages: list[GoalStage], steps: list[GoalStep]) -> list[GoalStep]:
    """Goal order: stages by position, steps by position; steps without a stage last."""
    rank = {stage.id: index for index, stage in enumerate(sorted(stages, key=lambda item: (item.position, item.id or 0)))}
    return sorted(steps, key=lambda item: (rank.get(item.stage_id, len(rank)), item.position, item.id or 0))


def availability(goal: Goal, stages: list[GoalStage], steps: list[GoalStep], statuses: dict[int, str], today: date | None = None) -> dict[int, dict]:
    """``{step_id: {"locked": bool, "reason": ...}}``. Reasons: opens (a date), after (a step), held."""
    today = today or date.today()
    order = str(getattr(goal.step_order, "value", goal.step_order) or StepOrder.ANY.value)
    ordered = ordered_steps(stages, steps)
    by_uuid = {item.step_uuid: item for item in ordered}
    stage_by_id = {stage.id: stage for stage in stages}
    stage_sequence: list[int | None] = []
    for item in ordered:
        if item.stage_id not in stage_sequence:
            stage_sequence.append(item.stage_id)

    def status(item: GoalStep) -> str:
        return statuses.get(int(item.id), StepStatus.NOT_STARTED.value)  # type: ignore[arg-type]

    def after(item: GoalStep) -> dict:
        return {"kind": "after", "step_uuid": item.step_uuid, "title": item.title}

    result: dict[int, dict] = {}
    for index, item in enumerate(ordered):
        if status(item) in DONE_STEP_STATUSES or status(item) in UNDER_WAY:
            result[int(item.id)] = {"locked": False, "reason": None}  # type: ignore[arg-type]
            continue
        reason: dict | None = {"kind": "held"} if item.held else None
        stage = stage_by_id.get(item.stage_id)
        opens = max((value for value in (item.start_date, stage.start_date if stage else None) if value and value > today), default=None)
        if not reason and opens:
            reason = {"kind": "opens", "date": opens.isoformat()}
        if not reason:
            for uuid in item.after_step_uuids or []:
                waiting = by_uuid.get(uuid)
                if waiting and waiting.id != item.id and status(waiting) not in UNLOCKING:
                    reason = after(waiting)
                    break
        if not reason and order == StepOrder.IN_ORDER.value:
            previous = next((other for other in reversed(ordered[:index]) if status(other) not in UNLOCKING), None)
            reason = after(previous) if previous else None
        if not reason and order == StepOrder.BY_STAGE.value:
            earlier_stages = stage_sequence[:stage_sequence.index(item.stage_id)]
            waiting = next((other for other in ordered[:index] if other.stage_id in earlier_stages and status(other) not in UNLOCKING), None)
            reason = after(waiting) if waiting else None
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
