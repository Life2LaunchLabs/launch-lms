"""My plans home: this week's steps across a learner's plans, then what comes later.

Dated steps land in the week or month they are due. Undated steps are paced:
each learner has a weekly target, and the first load of a week picks undated
open steps (round-robin across plans, in plan order) until the week holds that
many. Picks are stored per week so the week stays stable; unfinished picks carry
into the next week. "Ready for more" adds a few extra steps on demand.

A week is a commitment: it is planned once, from the plans the learner has when
it starts. A plan started mid-week does not grow it; its steps wait in Next week
and are offered once the week is done (or added when the learner asks).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.planning import (
    Plan,
    PlanObjective,
    PlanObjectiveProgress,
    PlanObjectiveStatus,
    PlanPhase,
    PlanStatus,
    PlanWeeklyFocus,
)
from src.db.users import PublicUser
from src.services.plan_availability import compute_availability, ordered_steps

DEFAULT_TARGET = 5
BOOST_SIZE = 3
DONE = {PlanObjectiveStatus.COMPLETED.value, PlanObjectiveStatus.CANCELED.value}


def _value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _now_string() -> str:
    return datetime.now().isoformat()


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _month_label(day: date, today: date) -> str:
    return day.strftime("%B") if day.year == today.year else day.strftime("%B %Y")


class _Entry:
    __slots__ = ("plan", "objective", "status", "availability", "due", "completed_on", "item")

    def __init__(self, plan, objective, status, availability, due, completed_on):
        self.plan = plan
        self.objective = objective
        self.status = status
        self.availability = availability
        self.due = due
        self.completed_on = completed_on
        self.item: dict | None = None

    @property
    def uuid(self) -> str:
        return self.objective.objective_uuid

    @property
    def done(self) -> bool:
        return self.status in DONE

    @property
    def startable(self) -> bool:
        return not self.done and self.status != PlanObjectiveStatus.SUBMITTED.value and self.availability["state"] == "open"


def _my_plans(db: Session, user_id: int) -> list[Plan]:
    plans = db.exec(select(Plan).where(Plan.subject_user_id == user_id, Plan.status == PlanStatus.ACTIVE)).all()
    return sorted(plans, key=lambda plan: (-(plan.priority or 0), plan.creation_date or "", plan.id or 0))


def _entries(db: Session, plans: list[Plan], today: date) -> dict[int, list[_Entry]]:
    """Every step of every plan, in plan order, with status, availability and due date."""
    result: dict[int, list[_Entry]] = {}
    for plan in plans:
        phases = list(db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id)).all())
        objectives = list(db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all())
        ids = [int(item.id) for item in objectives]
        progress = {
            int(row.plan_objective_id): row
            for row in (db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id.in_(ids))).all() if ids else [])
        }
        statuses = {key: _value(row.status) for key, row in progress.items()}
        availability = compute_availability(plan, phases, objectives, statuses, today)
        phase_due = {phase.id: phase.due_date for phase in phases}
        entries = []
        for objective in ordered_steps(phases, objectives):
            row = progress.get(int(objective.id))
            entries.append(_Entry(
                plan, objective,
                statuses.get(int(objective.id), PlanObjectiveStatus.NOT_STARTED.value),
                availability[int(objective.id)],
                _as_date(objective.due_date or phase_due.get(objective.phase_id)),
                _as_date(row.completed_at) if row and row.completed_at else None,
            ))
        result[int(plan.id)] = entries
    return result


def _round_robin(groups: list[list[_Entry]], limit: int) -> list[_Entry]:
    picked: list[_Entry] = []
    queues = [list(group) for group in groups if group]
    while queues and len(picked) < limit:
        for queue in list(queues):
            if len(picked) >= limit:
                break
            picked.append(queue.pop(0))
            if not queue:
                queues.remove(queue)
    return picked


def _focus(db: Session, user_id: int, week_start: date) -> tuple[PlanWeeklyFocus, PlanWeeklyFocus | None]:
    focus = db.exec(select(PlanWeeklyFocus).where(PlanWeeklyFocus.user_id == user_id, PlanWeeklyFocus.week_start == week_start)).first()
    previous = db.exec(
        select(PlanWeeklyFocus)
        .where(PlanWeeklyFocus.user_id == user_id, PlanWeeklyFocus.week_start < week_start)
        .order_by(PlanWeeklyFocus.week_start.desc())
    ).first()
    if focus:
        return focus, None
    now = _now_string()
    focus = PlanWeeklyFocus(
        user_id=user_id, week_start=week_start, objective_uuids=[],
        target=previous.target if previous else DEFAULT_TARGET, boosts=0,
        creation_date=now, update_date=now,
    )
    return focus, previous


def _undated_candidates(entries_by_plan: dict[int, list[_Entry]], plans: list[Plan], exclude: set[str], startable_only: bool = True) -> list[list[_Entry]]:
    return [
        [
            entry for entry in entries_by_plan[int(plan.id)]
            if entry.due is None and entry.uuid not in exclude and not entry.done
            and (entry.startable if startable_only else entry.status != PlanObjectiveStatus.SUBMITTED.value)
        ]
        for plan in plans
    ]


def _week_plans(focus: PlanWeeklyFocus, plans: list[Plan]) -> set[str]:
    """The plans this week was planned from; weeks saved before this existed adopt today's plans."""
    if focus.id is None or focus.plan_uuids is None:
        return {plan.plan_uuid for plan in plans}
    return set(focus.plan_uuids)


def _fill_week(
    db: Session, user_id: int, plans: list[Plan], entries_by_plan: dict[int, list[_Entry]], today: date,
    extra: int = 0, refill: bool = False, adopt: set[str] | None = None,
) -> PlanWeeklyFocus:
    week_start = _week_start(today)
    week_end = week_start + timedelta(days=6)
    focus, previous = _focus(db, user_id, week_start)
    new_week = focus.id is None
    known = _week_plans(focus, plans) | (adopt or set())
    by_uuid = {entry.uuid: entry for entries in entries_by_plan.values() for entry in entries}
    picks = [uuid for uuid in focus.objective_uuids or [] if uuid in by_uuid]
    if previous is not None:
        # A new week starts with whatever was picked last week and is still unfinished.
        picks = [uuid for uuid in previous.objective_uuids or [] if uuid in by_uuid and not by_uuid[uuid].done and by_uuid[uuid].due is None]
    dated_this_week = [
        entry for entries in entries_by_plan.values() for entry in entries
        if entry.plan.plan_uuid in known and entry.due is not None and entry.due <= week_end
        and (not entry.done or (entry.completed_on and entry.completed_on >= week_start))
    ]
    if not picks and not dated_this_week and not extra:
        # An empty week has nothing to protect: plan it from every plan the learner has now.
        known |= {plan.plan_uuid for plan in plans}
        new_week = True
    week_plans = [plan for plan in plans if plan.plan_uuid in known]
    # Only planning a week, or the learner asking, adds steps; loading never grows it.
    if new_week or refill or extra:
        room = max(0, focus.target - len(dated_this_week) - len(picks)) + extra
        if room:
            picks += [entry.uuid for entry in _round_robin(_undated_candidates(entries_by_plan, week_plans, set(picks)), room)]
    if new_week:
        # A plan started this week always gets its first step into the week.
        present = {by_uuid[uuid].plan.id for uuid in picks} | {entry.plan.id for entry in dated_this_week}
        for plan in week_plans:
            created = str(plan.creation_date or "")[:10]
            if plan.id in present or not created or created < week_start.isoformat():
                continue
            first = next((entry for entry in _undated_candidates(entries_by_plan, [plan], set(picks))[0]), None)
            if first:
                picks.append(first.uuid)
    for plan in plans:
        if plan.plan_uuid in (adopt or set()) and not any(by_uuid[uuid].plan.id == plan.id for uuid in picks):
            # Pulling a plan in brings its next open step along with anything dated this week.
            first = next((entry for entry in _undated_candidates(entries_by_plan, [plan], set(picks))[0]), None)
            if first:
                picks.append(first.uuid)
    known_list = sorted(known)
    if picks != (focus.objective_uuids or []) or focus.plan_uuids != known_list or focus.id is None:
        focus.objective_uuids = picks
        focus.plan_uuids = known_list
        focus.update_date = _now_string()
        db.add(focus)
        db.commit()
        db.refresh(focus)
    return focus


def _plan_summary(db: Session, plan: Plan, entries: list[_Entry]) -> dict:
    from src.services.planning import _org_summary

    total = len(entries)
    done = sum(entry.done for entry in entries)
    return {
        "plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name, "description": plan.description,
        "priority": plan.priority, "step_order": plan.step_order or "any",
        "source_organization": _org_summary(db, plan.source_org_id),
        "kind": "org" if plan.source_org_id else "mine",
        "objective_count": total, "completed_objective_count": done,
        "progress_percent": round(done * 100 / total) if total else 0,
        "creation_date": plan.creation_date,
    }


def _card(db: Session, entry: _Entry, capabilities_by_plan: dict[int, set[str]], placement: str) -> dict:
    from src.services.planning import _objective_dict

    if entry.item is None:
        entry.item = _objective_dict(db, entry.plan, entry.objective, capabilities_by_plan[int(entry.plan.id)], entry.availability)
    return {
        **entry.item,
        "plan": {"plan_uuid": entry.plan.plan_uuid, "slug": entry.plan.slug, "name": entry.plan.name},
        "display_due_date": entry.due, "placement": placement,
    }


def home(db: Session, current_user: PublicUser, today: date | None = None, extra: int = 0) -> dict:
    from src.services.planning import capabilities_for

    today = today or date.today()
    user_id = int(current_user.id)
    plans = _my_plans(db, user_id)
    entries_by_plan = _entries(db, plans, today)
    focus = _fill_week(db, user_id, plans, entries_by_plan, today, extra)
    capabilities_by_plan = {int(plan.id): capabilities_for(db, plan, user_id) for plan in plans}
    by_uuid = {entry.uuid: entry for entries in entries_by_plan.values() for entry in entries}
    all_entries = [entry for plan in plans for entry in entries_by_plan[int(plan.id)]]

    week_start = _week_start(today)
    week_end = week_start + timedelta(days=6)
    next_start, next_end = week_start + timedelta(days=7), week_start + timedelta(days=13)
    picks = [by_uuid[uuid] for uuid in focus.objective_uuids or [] if uuid in by_uuid]
    pick_rank = {entry.uuid: index for index, entry in enumerate(picks)}

    known = set(focus.plan_uuids or [])
    week: list[_Entry] = []
    waiting: list[_Entry] = []
    for entry in all_entries:
        if entry.status == PlanObjectiveStatus.CANCELED.value:
            continue
        done_this_week = entry.done and entry.completed_on is not None and entry.completed_on >= week_start
        dated_now = entry.due is not None and entry.due <= week_end and not entry.done
        if entry.uuid in pick_rank and (not entry.done or done_this_week):
            week.append(entry)
        elif entry.plan.plan_uuid in known and (dated_now or done_this_week):
            week.append(entry)
        elif dated_now:
            # Due now in a plan started after the week was planned: offered, never slipped in.
            waiting.append(entry)
    # What is left comes first; finished steps follow in the order they were done.
    week.sort(key=lambda entry: (
        1 if entry.done else 0,
        entry.completed_on or date.min,
        0 if entry.due and entry.due < today else 1,
        entry.due or date.max,
        pick_rank.get(entry.uuid, len(pick_rank)),
    ))
    in_week = {entry.uuid for entry in week}
    remaining = [entry for entry in week if not entry.done]

    new_plans = [plan for plan in plans if plan.plan_uuid not in known]
    offers = []
    for plan in new_plans:
        dated = [entry for entry in waiting if entry.plan.id == plan.id]
        first = next(iter(_undated_candidates(entries_by_plan, [plan], in_week)[0]), None)
        steps = len(dated) + (1 if first and not dated else 0)
        if steps:
            offers.append({"plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name}, "steps": steps})

    dated_next = sorted(waiting, key=lambda entry: entry.due) + [
        entry for entry in all_entries if entry.due and next_start <= entry.due <= next_end and not entry.done
    ]
    projected = _round_robin(
        _undated_candidates(entries_by_plan, plans, in_week | {entry.uuid for entry in picks}, startable_only=False),
        max(0, focus.target - len(dated_next)),
    )
    next_week = dated_next[:len(waiting)] + sorted(dated_next[len(waiting):], key=lambda entry: entry.due) + projected
    placed = in_week | {entry.uuid for entry in next_week}

    months: dict[str, dict] = {}
    for entry in sorted((entry for entry in all_entries if entry.due and entry.due > next_end and not entry.done), key=lambda entry: entry.due):
        key = entry.due.strftime("%Y-%m")
        months.setdefault(key, {"key": key, "label": _month_label(entry.due, today), "items": []})["items"].append(entry)
        placed.add(entry.uuid)

    later = []
    for plan in plans:
        items = [entry for entry in entries_by_plan[int(plan.id)] if entry.due is None and not entry.done and entry.uuid not in placed]
        if items:
            later.append({"plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name}, "items": items})

    def cards(items: list[_Entry], placement: str) -> list[dict]:
        return [_card(db, entry, capabilities_by_plan, placement) for entry in items]

    has_more = any(_undated_candidates(entries_by_plan, plans, in_week))
    return {
        "today": today,
        "week": {
            "start": week_start, "end": week_end, "target": focus.target, "boosts": focus.boosts,
            "done_count": sum(entry.done for entry in week), "total": len(week),
            "complete": bool(week) and not remaining, "can_boost": has_more,
            "items": cards(week, "week"),
            # Plans started after this week was planned, with how many steps pulling them in adds.
            "new_plans": offers,
        },
        "next_week": {"start": next_start, "end": next_end, "items": cards(next_week, "next_week")},
        "months": [{"key": group["key"], "label": group["label"], "items": cards(group["items"], "month")} for group in months.values()],
        "later": [{"plan": group["plan"], "items": cards(group["items"], "later")} for group in later],
        "plans": [_plan_summary(db, plan, entries_by_plan[int(plan.id)]) for plan in plans],
    }


def ready_for_more(db: Session, current_user: PublicUser, today: date | None = None) -> dict:
    today = today or date.today()
    plans = _my_plans(db, int(current_user.id))
    entries_by_plan = _entries(db, plans, today)
    focus = _fill_week(db, int(current_user.id), plans, entries_by_plan, today, extra=BOOST_SIZE)
    focus.boosts = (focus.boosts or 0) + 1
    focus.update_date = _now_string()
    db.add(focus)
    db.commit()
    return home(db, current_user, today)


def set_pace(db: Session, current_user: PublicUser, target: int, today: date | None = None) -> dict:
    if target < 1 or target > 20:
        raise HTTPException(status_code=422, detail="Pick between 1 and 20 steps a week")
    today = today or date.today()
    plans = _my_plans(db, int(current_user.id))
    focus = _fill_week(db, int(current_user.id), plans, _entries(db, plans, today), today)
    focus.target = target
    db.add(focus)
    db.commit()
    # A new goal is the learner asking: fill up to it from the week's plans.
    focus = _fill_week(db, int(current_user.id), plans, _entries(db, plans, today), today, refill=True)
    focus.update_date = _now_string()
    db.add(focus)
    db.commit()
    return home(db, current_user, today)


def pull_in_plan(db: Session, current_user: PublicUser, plan_uuid: str, today: date | None = None) -> dict:
    """Add a plan started mid-week to this week: its dated steps and its next open step."""
    today = today or date.today()
    plans = _my_plans(db, int(current_user.id))
    if plan_uuid not in {plan.plan_uuid for plan in plans}:
        raise HTTPException(status_code=404, detail="Plan not found")
    _fill_week(db, int(current_user.id), plans, _entries(db, plans, today), today, adopt={plan_uuid})
    return home(db, current_user, today)


def adaptive_future_groups(items: list[dict], today: date) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    labels: dict[str, str] = {}
    one_year = today + timedelta(days=365)
    for item in items:
        due = item.get("effective_due_date") or item["due_date"]
        if due <= one_year:
            key = due.strftime("%Y-%m")
            labels[key] = due.strftime("%B %Y")
        else:
            key = str(due.year)
            labels[key] = str(due.year)
        buckets.setdefault(key, []).append(item)
    expanded: list[tuple[str, str, list[dict]]] = []
    for key in sorted(buckets):
        values = buckets[key]
        if len(values) <= 10:
            expanded.append((key, labels[key], values))
            continue
        by_segment: dict[str, list[dict]] = {}
        for item in values:
            due = item.get("effective_due_date") or item["due_date"]
            segment = f"{due.year}-W{due.isocalendar().week:02d}" if len(key) == 7 else f"{due.year}-Q{((due.month - 1) // 3) + 1}"
            by_segment.setdefault(segment, []).append(item)
        expanded.extend((segment, segment.split("-", 1)[-1].replace("W", "Week ").replace("Q", "Quarter ") + f" {(values[0].get('effective_due_date') or values[0]['due_date']).year}", group) for segment, group in sorted(by_segment.items()))
    merged: list[dict] = []
    for key, label, values in expanded:
        if merged and len(merged[-1]["items"]) + len(values) <= 6:
            merged[-1]["label"] = f"{merged[-1]['label']} – {label}"
            merged[-1]["items"].extend(values)
        else:
            merged.append({"key": key, "label": label, "items": list(values)})
    return merged
