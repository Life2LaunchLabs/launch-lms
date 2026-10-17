"""This week: a learner's steps across their goals, then next week, months and later.

The week itself is planned in ``home_week``; this module groups the steps and
renders them. Each step renders as one or more lines (``LINES``), so a type can
contribute its own lines (a routine shows one line for its action) without touching the
grouping.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalStatus, StepProgress, StepStatus
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.services.goals.availability import node_state
from src.services.goals.home_week import (
    BOOST_SIZE,
    Entry,
    fill_week,
    my_goals,
    now_string,
    open_candidates,
    round_robin,
    upcoming_target,
    week_start_of,
    with_finished,
)
from src.services.goals.types import StepState, step_type
from src.services.goals.types.routine import met, trigger_on


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _month_label(day: date, today: date) -> str:
    return day.strftime("%B") if day.year == today.year else day.strftime("%B %Y")


def _goal_ref(goal: Goal) -> dict:
    return {"goal_uuid": goal.goal_uuid, "title": goal.title}


def route(goal_uuid: str, step_uuid: str | None = None) -> str:
    """The web path a home item opens."""
    return f"/plans/{goal_uuid}" + (f"?step={step_uuid}" if step_uuid else "")


def step_item(entry: Entry, placement: str) -> dict:
    """A step as a This week item: enough for the node, the row and where it opens."""
    kind = step_type(entry.step.type)
    progress = entry.progress or StepProgress(progress_uuid="", step_id=int(entry.step.id))  # type: ignore[arg-type]
    state = StepState(entry.step, progress, entry.entries)
    fraction = 1.0 if entry.done else kind.fraction(state)
    return {
        "step_uuid": entry.uuid, "goal": _goal_ref(entry.goal),
        "stage": {"stage_uuid": entry.stage.stage_uuid, "title": entry.stage.title} if entry.stage else None,
        "type": entry.step.type, "title": entry.step.title, "description": entry.step.description,
        "status": entry.status, "state": node_state(entry.status, entry.lock["locked"], fraction), "fraction": round(fraction, 3),
        "result": kind.result(state), "due_date": entry.due, "completed_at": progress.completed_at,
        "locked": entry.lock["locked"], "locked_reason": entry.lock["reason"],
        "route": route(entry.goal.goal_uuid, entry.uuid), "placement": placement,
    }


def _routine_lines(entry: Entry, placement: str) -> list[dict]:
    """A running routine: one line for its action, done once the current trigger is met."""
    item = step_item(entry, placement)
    item["week_done"] = week_done(entry)
    return [item]


# Step type -> the lines it shows. Types without an entry show one line per step.
LINES: dict[str, Callable[[Entry, str], list[dict]]] = {"routine": _routine_lines}


def week_done(entry: Entry, today: date | None = None) -> bool:
    """Done for now: a running routine counts once its current trigger's action is done."""
    if entry.done or not entry.routine:
        return entry.done
    config = entry.step.config or {}
    return met(config, entry.entries, trigger_on(config, today or date.today()))


def lines(entry: Entry, placement: str) -> list[dict]:
    builder = LINES.get(entry.step.type)
    return builder(entry, placement) if builder else [step_item(entry, placement)]


def _cards(entries: list[Entry], placement: str) -> list[dict]:
    return [line for entry in entries for line in lines(entry, placement)]


def _goal_summary(db: Session, goal: Goal, entries: list[Entry]) -> dict:
    total = len(entries)
    done = sum(entry.done for entry in entries)
    org = db.get(Organization, goal.org_id) if goal.org_id else None
    return {
        "goal_uuid": goal.goal_uuid, "title": goal.title, "description": goal.description, "priority": goal.priority,
        "ownership": _value(goal.ownership), "source": _value(goal.source),
        "organization": {"id": org.id, "name": org.name, "slug": org.slug} if org else None,
        "step_count": total, "completed_step_count": done, "progress_percent": round(done * 100 / total) if total else 0,
        "route": route(goal.goal_uuid), "creation_date": goal.creation_date,
    }


def pending_celebrations(db: Session, user_id: int) -> list[str]:
    """The learner's finished goals that haven't greeted them yet."""
    return list(db.exec(select(Goal.goal_uuid).where(
        Goal.subject_user_id == user_id, Goal.status == GoalStatus.FINISHED.value, Goal.celebrated_at.is_(None),  # type: ignore[union-attr]
    ).order_by(Goal.id)).all())  # type: ignore[arg-type]


def home(db: Session, current_user: PublicUser, today: date | None = None) -> dict:
    today = today or date.today()
    user_id = int(current_user.id)
    goals = my_goals(db, user_id)
    finished, entries_by_goal = with_finished(db, user_id, goals, today)
    focus = fill_week(db, user_id, goals, entries_by_goal, today)
    by_uuid = {entry.uuid: entry for entries in entries_by_goal.values() for entry in entries}
    # Finished goals contribute only steps done this week, so they never reach later groups.
    all_entries = [entry for goal in goals + finished for entry in entries_by_goal[int(goal.id)]]  # type: ignore[arg-type]

    week_start = week_start_of(today)
    week_end = week_start + timedelta(days=6)
    next_start, next_end = week_start + timedelta(days=7), week_start + timedelta(days=13)
    picks = [by_uuid[uuid] for uuid in focus.objective_uuids or [] if uuid in by_uuid]
    pick_rank = {entry.uuid: index for index, entry in enumerate(picks)}

    known = set(focus.plan_uuids or []) | {goal.goal_uuid for goal in finished}
    week: list[Entry] = []
    waiting: list[Entry] = []
    for entry in all_entries:
        if entry.status == StepStatus.EXCUSED.value:
            continue
        done_this_week = entry.done and entry.completed_on is not None and entry.completed_on >= week_start
        if entry.routine:
            # A running routine is always in the week; one that ended this week stays as done.
            if entry.goal.goal_uuid in known and (done_this_week or (not entry.done and not entry.lock["locked"])):
                week.append(entry)
            continue
        dated_now = entry.due is not None and entry.due <= week_end and not entry.done
        if entry.uuid in pick_rank and (not entry.done or done_this_week):
            week.append(entry)
        elif entry.goal.goal_uuid in known and (dated_now or done_this_week):
            week.append(entry)
        elif dated_now:
            # Due now in a goal started after the week was planned: offered, never slipped in.
            waiting.append(entry)
    # What is left comes first; finished steps follow in the order they were done.
    week.sort(key=lambda entry: (
        1 if week_done(entry, today) else 0, entry.completed_on or date.min, 0 if entry.due and entry.due < today else 1,
        entry.due or date.max, pick_rank.get(entry.uuid, len(pick_rank)),
    ))
    in_week = {entry.uuid for entry in week}
    remaining = [entry for entry in week if not week_done(entry, today)]

    offers = []
    for goal in (goal for goal in goals if goal.goal_uuid not in known):
        dated = [entry for entry in waiting if entry.goal.id == goal.id]
        first = next(iter(open_candidates(entries_by_goal, [goal], in_week, week_end)[0]), None)
        steps = len(dated) + (1 if first and not dated else 0)
        if steps:
            offers.append({"goal": _goal_ref(goal), "steps": steps})

    dated_next = sorted(waiting, key=lambda entry: entry.due) + [  # type: ignore[arg-type, return-value]
        entry for entry in all_entries if entry.due and next_start <= entry.due <= next_end and not entry.done and not entry.routine and entry.uuid not in in_week
    ]
    projected = round_robin(
        [
            # The preview may guess at undated steps; a dated step only moves up once it is open.
            [entry for entry in group if entry.due is None or entry.startable]
            for group in open_candidates(entries_by_goal, goals, in_week | set(pick_rank), next_end, startable_only=False)
        ],
        max(0, upcoming_target(focus) - len(dated_next)),
    )
    next_week = dated_next[:len(waiting)] + sorted(dated_next[len(waiting):], key=lambda entry: entry.due) + projected  # type: ignore[arg-type, return-value]
    placed = in_week | {entry.uuid for entry in next_week}

    months: dict[str, dict] = {}
    for entry in sorted((entry for entry in all_entries if entry.due and entry.due > next_end and not entry.done and not entry.routine and entry.uuid not in placed), key=lambda entry: entry.due):  # type: ignore[arg-type, return-value]
        key = entry.due.strftime("%Y-%m")  # type: ignore[union-attr]
        months.setdefault(key, {"key": key, "label": _month_label(entry.due, today), "items": []})["items"].append(entry)  # type: ignore[arg-type]
        placed.add(entry.uuid)

    later = []
    for goal in goals:
        items = [entry for entry in entries_by_goal[int(goal.id)] if entry.due is None and not entry.done and not entry.routine and entry.uuid not in placed]  # type: ignore[arg-type]
        if items:
            later.append({"goal": _goal_ref(goal), "items": items})

    return {
        "today": today,
        "week": {
            "start": week_start, "end": week_end, "target": focus.target, "boosts": focus.boosts,
            # The target next week is planned with; changing it never reshapes this week.
            "next_target": upcoming_target(focus),
            # Whether this week has been planned; until it has, a new target applies right away.
            "planned": bool(focus.objective_uuids),
            "done_count": sum(week_done(entry, today) for entry in week), "total": len(week),
            "complete": bool(week) and not remaining,
            "can_boost": any(open_candidates(entries_by_goal, goals, in_week, week_end)),
            "items": _cards(week, "week"),
            # Goals started after this week was planned, with how many steps pulling them in adds.
            "new_goals": offers,
        },
        "next_week": {"start": next_start, "end": next_end, "items": _cards(next_week, "next_week")},
        "months": [{"key": group["key"], "label": group["label"], "items": _cards(group["items"], "month")} for group in months.values()],
        "later": [{"goal": group["goal"], "items": _cards(group["items"], "later")} for group in later],
        "goals": [_goal_summary(db, goal, entries_by_goal[int(goal.id)]) for goal in goals],  # type: ignore[arg-type]
        "celebrations": pending_celebrations(db, user_id),
    }


def ready_for_more(db: Session, current_user: PublicUser, today: date | None = None) -> dict:
    today = today or date.today()
    user_id = int(current_user.id)
    goals = my_goals(db, user_id)
    focus = fill_week(db, user_id, goals, with_finished(db, user_id, goals, today)[1], today, extra=BOOST_SIZE)
    focus.boosts = (focus.boosts or 0) + 1
    focus.update_date = now_string()
    db.add(focus)
    db.commit()
    return home(db, current_user, today)


def set_pace(db: Session, current_user: PublicUser, target: int, today: date | None = None) -> dict:
    """Change the weekly target from next week on; this week keeps what it was planned with.

    A week with nothing planned in it yet has nothing to keep, so it takes the target now.
    """
    if target < 1 or target > 20:
        raise HTTPException(status_code=422, detail="Pick between 1 and 20 steps a week")
    today = today or date.today()
    user_id = int(current_user.id)
    goals = my_goals(db, user_id)
    focus = fill_week(db, user_id, goals, with_finished(db, user_id, goals, today)[1], today)
    if focus.objective_uuids:
        focus.next_target = None if target == focus.target else target
    else:
        focus.target, focus.next_target = target, None
    focus.update_date = now_string()
    db.add(focus)
    db.commit()
    if not focus.objective_uuids:
        fill_week(db, user_id, goals, with_finished(db, user_id, goals, today)[1], today, refill=True)
    return home(db, current_user, today)


def pull_in_goal(db: Session, current_user: PublicUser, goal_uuid: str, today: date | None = None) -> dict:
    """Add a goal started mid-week to this week: its dated steps and its next open step."""
    today = today or date.today()
    user_id = int(current_user.id)
    goals = my_goals(db, user_id)
    if goal_uuid not in {goal.goal_uuid for goal in goals}:
        raise HTTPException(status_code=404, detail="Goal not found")
    fill_week(db, user_id, goals, with_finished(db, user_id, goals, today)[1], today, adopt={goal_uuid})
    return home(db, current_user, today)

