"""When a learner can start each step of a live plan.

A step is ``done`` once completed or excused, otherwise ``open`` or
``not_ready``. Not-ready steps carry the reason the learner sees:

- ``{"kind": "opens", "date": ...}``: the step or its chapter starts later.
- ``{"kind": "after", "objective_uuid": ..., "title": ...}``: another step must
  be finished first (an explicit prerequisite, the previous step of an
  "in_order" plan, or the previous chapter of a "by_chapter" plan).
- ``{"kind": "held"}``: staff put the step on hold.

A step waiting on review counts as finished for unlocking what follows, so a
slow review never stalls the learner.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.planning import (
    Plan,
    PlanObjective,
    PlanObjectiveProgress,
    PlanObjectiveStatus,
    PlanPhase,
    StepOrder,
)

DONE_STATUSES = {PlanObjectiveStatus.COMPLETED.value, PlanObjectiveStatus.CANCELED.value}
UNLOCKING_STATUSES = DONE_STATUSES | {PlanObjectiveStatus.SUBMITTED.value}


def _status_value(progress: PlanObjectiveProgress | None) -> str:
    if not progress:
        return PlanObjectiveStatus.NOT_STARTED.value
    return progress.status.value if hasattr(progress.status, "value") else str(progress.status)


def ordered_steps(phases: list[PlanPhase], objectives: list[PlanObjective]) -> list[PlanObjective]:
    """Plan order: chapters by position, steps by position; steps without a chapter last."""
    phase_rank = {phase.id: index for index, phase in enumerate(sorted(phases, key=lambda item: (item.position, item.id or 0)))}
    return sorted(
        objectives,
        key=lambda item: (phase_rank.get(item.phase_id, len(phase_rank)), item.position, item.id or 0),
    )


def compute_availability(
    plan: Plan,
    phases: list[PlanPhase],
    objectives: list[PlanObjective],
    statuses: dict[int, str],
    today: date | None = None,
) -> dict[int, dict]:
    """Return ``{objective_id: availability}`` for every objective in the plan."""
    today = today or date.today()
    order = str(getattr(plan.step_order, "value", plan.step_order) or StepOrder.ANY.value)
    steps = ordered_steps(phases, objectives)
    by_uuid = {item.objective_uuid: item for item in steps}
    phase_by_id = {phase.id: phase for phase in phases}
    chapters: list[int | None] = []
    for item in steps:
        if item.phase_id not in chapters:
            chapters.append(item.phase_id)

    def unlocked(item: PlanObjective) -> bool:
        return statuses.get(int(item.id), PlanObjectiveStatus.NOT_STARTED.value) in UNLOCKING_STATUSES

    def after(item: PlanObjective) -> dict:
        return {"kind": "after", "objective_uuid": item.objective_uuid, "title": item.title}

    result: dict[int, dict] = {}
    for index, item in enumerate(steps):
        status = statuses.get(int(item.id), PlanObjectiveStatus.NOT_STARTED.value)
        if status in DONE_STATUSES:
            result[int(item.id)] = {"state": "done", "reason": None}
            continue
        if status == PlanObjectiveStatus.SUBMITTED.value or status == PlanObjectiveStatus.CHANGES_REQUESTED.value or status == PlanObjectiveStatus.IN_PROGRESS.value:
            # Work already under way is never taken away from the learner.
            result[int(item.id)] = {"state": "open", "reason": None}
            continue
        reason: dict | None = None
        if item.blocked:
            reason = {"kind": "held"}
        phase = phase_by_id.get(item.phase_id)
        opens = max(
            [value for value in (item.start_date, phase.start_date if phase else None) if value and value > today],
            default=None,
        )
        if not reason and opens:
            reason = {"kind": "opens", "date": opens.isoformat()}
        if not reason:
            for uuid in item.after_objective_uuids or []:
                prerequisite = by_uuid.get(uuid)
                if prerequisite and prerequisite.id != item.id and not unlocked(prerequisite):
                    reason = after(prerequisite)
                    break
        if not reason and order == StepOrder.IN_ORDER.value and index > 0:
            previous = next((other for other in reversed(steps[:index]) if not unlocked(other)), None)
            if previous:
                reason = after(previous)
        if not reason and order == StepOrder.BY_CHAPTER.value:
            chapter_index = chapters.index(item.phase_id)
            if chapter_index > 0:
                earlier = [other for other in steps[:index] if other.phase_id in chapters[:chapter_index]]
                waiting = next((other for other in earlier if not unlocked(other)), None)
                if waiting:
                    reason = after(waiting)
        result[int(item.id)] = {"state": "not_ready" if reason else "open", "reason": reason}
    return result


def plan_availability(db: Session, plan: Plan, today: date | None = None) -> dict[int, dict]:
    phases = list(db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id)).all())
    objectives = list(db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all())
    ids = [int(item.id) for item in objectives]
    progress_rows = db.exec(
        select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id.in_(ids))
    ).all() if ids else []
    statuses = {int(row.plan_objective_id): _status_value(row) for row in progress_rows}
    return compute_availability(plan, phases, objectives, statuses, today)


def validated_prerequisites(db: Session, plan: Plan, uuids: list[str] | None, objective_uuid: str) -> list[str]:
    """Prerequisites must be other steps in the same plan."""
    cleaned = list(dict.fromkeys(str(item) for item in (uuids or []) if item and str(item) != objective_uuid))
    if not cleaned:
        return []
    known = set(db.exec(select(PlanObjective.objective_uuid).where(
        PlanObjective.plan_id == plan.id, PlanObjective.objective_uuid.in_(cleaned),
    )).all())
    missing = [item for item in cleaned if item not in known]
    if missing:
        raise HTTPException(status_code=422, detail="A step can only wait on other steps in this plan")
    return cleaned


def apply_template_order(plan: Plan, program, created: list[tuple[dict, PlanObjective]]) -> None:
    """Copy the template's step order and prerequisites onto a newly materialized plan."""
    plan.step_order = getattr(program, "step_order", None) or "any"
    live_uuid = {str(snapshot.get("objective_uuid")): objective.objective_uuid for snapshot, objective in created if snapshot.get("objective_uuid")}
    for snapshot, objective in created:
        objective.after_objective_uuids = [live_uuid[item] for item in snapshot.get("after_objective_uuids") or [] if item in live_uuid]


def validated_template_prerequisites(db: Session, program, uuids: list[str], objective_uuid: str) -> list[str]:
    """Template prerequisites must be other steps of the same template."""
    cleaned = list(dict.fromkeys(str(item) for item in uuids if item and str(item) != objective_uuid))
    if not cleaned:
        return []
    from src.db.programs import Objective, ProgramObjective

    known = set(db.exec(
        select(Objective.objective_uuid)
        .join(ProgramObjective, ProgramObjective.objective_id == Objective.id)
        .where(ProgramObjective.program_id == program.id, Objective.objective_uuid.in_(cleaned))
    ).all())
    if any(item not in known for item in cleaned):
        raise HTTPException(status_code=422, detail="A step can only wait on other steps in this template")
    return cleaned
