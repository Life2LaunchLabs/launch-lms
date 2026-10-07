"""Ranked "what should I do next?" suggestions for the Hub home.

Reads the learner's own active plans directly (a fixed handful of queries) rather than
the planning feed, which only returns dated objectives. Routes are built here from known
destinations; nothing the client or a model supplies reaches them.
"""

from datetime import date, datetime, timedelta
from urllib.parse import quote

from sqlmodel import Session, select

from src.db.planning import Plan, PlanCollaborator, PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus, PlanStatus

MAX_ACTIONS = 3
MAX_ASSIGNED = 1
DUE_SOON_DAYS = 7
_DONE = {PlanObjectiveStatus.COMPLETED.value, PlanObjectiveStatus.CANCELED.value}
_DISCOVER = {"kind": "discover", "title": "Explore the resource library", "reason": "Find something to try first.", "route": "/resources", "tier": 4}


def _as_date(value: date | datetime | None) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def _day(value: date) -> str:
    return f"{value:%b} {value.day}"


def _timing_reason(status: str, due: date | None, today: date) -> str | None:
    if status == PlanObjectiveStatus.CHANGES_REQUESTED.value:
        return "Your reviewer left feedback to look at."
    if due and due < today:
        return f"Target date was {_day(due)}. Easy to pick back up."
    if due and due <= today + timedelta(days=DUE_SOON_DAYS):
        return f"Coming up on {_day(due)}."
    return None


def next_actions(db: Session, user_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    plans = db.exec(
        select(Plan).join(PlanCollaborator, PlanCollaborator.plan_id == Plan.id).where(
            PlanCollaborator.user_id == user_id, PlanCollaborator.active == True,  # noqa: E712
            Plan.subject_user_id == user_id, Plan.status == PlanStatus.ACTIVE.value,
        ).order_by(Plan.update_date.desc())
    ).all()
    by_id = {plan.id: plan for plan in plans}
    rows = db.exec(
        select(PlanObjective, PlanObjectiveProgress)
        .outerjoin(PlanObjectiveProgress, PlanObjectiveProgress.plan_objective_id == PlanObjective.id)
        .where(PlanObjective.plan_id.in_(list(by_id)))
        .order_by(PlanObjective.plan_id, PlanObjective.position)
    ).all() if by_id else []

    candidates: list[tuple[int, str, dict]] = []
    for objective, progress in rows:
        status = str(getattr(progress.status, "value", progress.status)) if progress else PlanObjectiveStatus.NOT_STARTED.value
        if status in _DONE or objective.blocked or status == PlanObjectiveStatus.SUBMITTED.value:
            continue
        plan = by_id[objective.plan_id]
        due = _as_date(objective.due_date) or _as_date(plan.due_date)
        timing = _timing_reason(status, due, today)
        assigned = plan.source_assignment_id is not None or plan.owner_user_id != user_id
        if assigned and timing:
            tier, reason = 1, timing
        elif status == PlanObjectiveStatus.IN_PROGRESS.value:
            tier, reason = 2, timing or "You've already started this."
        elif timing:
            tier, reason = 2, timing
        elif assigned:
            tier, reason = 3, f"Next step in {plan.name}."
        elif status == PlanObjectiveStatus.NOT_STARTED.value:
            tier, reason = 3, f"Next step in {plan.name}."
        else:
            continue
        candidates.append((tier, str(due or date.max), {
            "kind": "objective", "title": objective.title, "reason": reason, "tier": tier,
            "route": f"/plans/{quote(plan.slug, safe='')}", "plan_uuid": plan.plan_uuid, "objective_uuid": objective.objective_uuid,
        }))

    chosen: list[dict] = []
    seen_plans: set[str] = set()
    assigned_count = 0
    for tier, _due, item in sorted(candidates, key=lambda entry: (entry[0], entry[1])):
        if len(chosen) >= MAX_ACTIONS:
            break
        if item["plan_uuid"] in seen_plans or (tier == 1 and assigned_count >= MAX_ASSIGNED):
            continue
        seen_plans.add(item["plan_uuid"])
        assigned_count += tier == 1
        chosen.append(item)
    return chosen or [dict(_DISCOVER)]
