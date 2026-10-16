"""Ranked "what should I do next?" suggestions for Coach home, across the learner's goals.

Uses the same steps and lock check as This week (``home_week``), so a step that
waits on order, a prerequisite, a start date or a hold is never suggested. Coach's
newest open note on a goal comes first.
Routes are built here from known destinations; nothing the client or a model
supplies reaches them.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session

from src.db.goals import GoalOwnership, StepStatus
from src.services.goals.coach_notes import open_notes
from src.services.goals.home import route
from src.services.goals.home_week import goal_entries, my_goals

MAX_ACTIONS = 3
MAX_ASSIGNED = 1
DUE_SOON_DAYS = 7
_DISCOVER = {"kind": "discover", "title": "Explore the resource library", "reason": "Find something to try first.", "route": "/resources", "tier": 4}


def _day(value: date) -> str:
    return f"{value:%b} {value.day}"


def _timing_reason(status: str, due: date | None, today: date) -> str | None:
    if status == StepStatus.CHANGES_REQUESTED.value:
        return "Your reviewer left feedback to look at."
    if due and due < today:
        return f"Target date was {_day(due)}. Easy to pick back up."
    if due and due <= today + timedelta(days=DUE_SOON_DAYS):
        return f"Coming up on {_day(due)}."
    return None


def next_actions(db: Session, user_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    # Most recently touched goals first, so ties favour what the learner is working on.
    goals = sorted(my_goals(db, user_id), key=lambda goal: goal.update_date or "", reverse=True)
    entries_by_goal = goal_entries(db, goals, today)

    candidates: list[tuple[int, str, dict]] = []
    for goal in goals:
        assigned = str(getattr(goal.ownership, "value", goal.ownership)) == GoalOwnership.EXTERNAL.value or goal.owner_user_id != user_id
        for entry in entries_by_goal[int(goal.id)]:  # type: ignore[arg-type]
            if not entry.startable:
                continue
            due = entry.due or goal.target_date
            timing = _timing_reason(entry.status, due, today)
            if assigned and timing:
                tier, reason = 1, timing
            elif entry.status == StepStatus.IN_PROGRESS.value:
                tier, reason = 2, timing or "You've already started this."
            elif timing:
                tier, reason = 2, timing
            elif assigned or entry.status == StepStatus.NOT_STARTED.value:
                tier, reason = 3, f"Next step in {goal.title}."
            else:
                continue
            candidates.append((tier, str(due or date.max), {
                "kind": "step", "title": entry.step.title, "reason": reason, "tier": tier,
                "route": route(goal.goal_uuid, entry.uuid), "goal_uuid": goal.goal_uuid, "step_uuid": entry.uuid,
            }))

    # Coach's newest open note leads, when there is one: it is what Coach noticed at a check-in.
    chosen: list[dict] = [{
        "kind": "coach_note", "title": note.title, "reason": note.body, "tier": 2, "route": route(goal.goal_uuid),
        "goal_uuid": goal.goal_uuid, "note_uuid": note.note_uuid,
    } for note, goal in open_notes(db, user_id, goals)[:1]]
    seen_goals: set[str] = set()
    assigned_count = 0
    for tier, _due, item in sorted(candidates, key=lambda candidate: (candidate[0], candidate[1])):
        if len(chosen) >= MAX_ACTIONS:
            break
        if item["goal_uuid"] in seen_goals or (tier == 1 and assigned_count >= MAX_ASSIGNED):
            continue
        seen_goals.add(item["goal_uuid"])
        assigned_count += tier == 1
        chosen.append(item)
    return chosen or [dict(_DISCOVER)]
