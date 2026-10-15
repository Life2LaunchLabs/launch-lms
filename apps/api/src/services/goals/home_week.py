"""Planning a learner's week across their goals; ``home`` renders it.

Dated steps land in the week they are due (or earlier). The rest are paced:
each learner has a weekly target, and the first load of a week picks open,
unlocked steps (round-robin across goals, in goal order), undated or due
later, until the week holds that many. Picks are stored per week (in
PlanWeeklyFocus, by step uuid) so the week stays stable; unfinished picks carry
into the next week. "Ready for more" adds a few extra steps on demand.

A week is a commitment: it is planned once, from the goals the learner has when
it starts, and only the learner grows it. A goal started mid-week does not; its
steps wait in Next week until the learner asks for more. A goal that finishes
mid-week keeps its done steps in the week, so finishing never looks like an
empty week to refill. Changing the weekly target takes effect from next week,
once this week has been planned.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStage, GoalStatus, GoalStep, PlanWeeklyFocus, StepEntry, StepProgress, StepStatus
from src.services.goals.availability import availability, ordered_steps

DEFAULT_TARGET = 5
BOOST_SIZE = 3


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _as_date(value) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def now_string() -> str:
    return datetime.now().isoformat()


def week_start_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


class Entry:
    """One step of a goal as the week sees it."""

    __slots__ = ("goal", "stage", "step", "progress", "entries", "status", "lock", "due", "completed_on")

    def __init__(self, goal: Goal, stage: GoalStage | None, step: GoalStep, progress: StepProgress | None, entries: list[StepEntry], lock: dict):
        self.goal, self.stage, self.step, self.progress, self.entries, self.lock = goal, stage, step, progress, entries, lock
        self.status = _value(progress.status) if progress else StepStatus.NOT_STARTED.value
        self.due = _as_date(step.due_date or (stage.due_date if stage else None))
        self.completed_on = _as_date(progress.completed_at) if progress and progress.completed_at else None

    @property
    def uuid(self) -> str:
        return self.step.step_uuid

    @property
    def done(self) -> bool:
        return self.status in DONE_STEP_STATUSES

    @property
    def waiting(self) -> bool:
        return self.status == StepStatus.SUBMITTED.value

    @property
    def startable(self) -> bool:
        return not self.done and not self.waiting and not self.lock["locked"]


def goal_order(goal: Goal):
    return (-(goal.priority or 0), goal.creation_date or "", goal.id or 0)


def my_goals(db: Session, user_id: int) -> list[Goal]:
    goals = db.exec(select(Goal).where(Goal.subject_user_id == user_id, Goal.status == GoalStatus.ACTIVE.value)).all()
    return sorted(goals, key=goal_order)


def goal_entries(db: Session, goals: list[Goal], today: date) -> dict[int, list[Entry]]:
    """Every step of every goal, in goal order, with status, lock and due date."""
    from src.services.goals.goals import _structure

    result: dict[int, list[Entry]] = {}
    for goal in goals:
        stages, steps, progress, entries = _structure(db, goal)
        locks = availability(goal, stages, steps, {key: _value(row.status) for key, row in progress.items()}, today)
        stage_by_id = {stage.id: stage for stage in stages}
        result[int(goal.id)] = [  # type: ignore[arg-type]
            Entry(goal, stage_by_id.get(step.stage_id), step, progress.get(int(step.id)), entries.get(int(step.id), []), locks[int(step.id)])  # type: ignore[arg-type]
            for step in ordered_steps(stages, steps)
        ]
    return result


def with_finished(db: Session, user_id: int, goals: list[Goal], today: date) -> tuple[list[Goal], dict[int, list[Entry]]]:
    """Active goals' steps, plus the steps done this week in goals that have since finished.

    Finished goals never offer steps; they only keep this week's record whole.
    """
    week_start = week_start_of(today)
    since = datetime.combine(week_start, datetime.min.time())
    finished = sorted(db.exec(select(Goal).where(
        Goal.subject_user_id == user_id, Goal.status == GoalStatus.FINISHED.value, Goal.finished_at >= since,  # type: ignore[operator]
    )).all(), key=goal_order)
    entries_by_goal = goal_entries(db, goals + finished, today)
    for goal in finished:
        entries_by_goal[int(goal.id)] = [  # type: ignore[arg-type]
            entry for entry in entries_by_goal[int(goal.id)]  # type: ignore[arg-type]
            if entry.done and entry.completed_on is not None and entry.completed_on >= week_start
        ]
    return finished, entries_by_goal


def round_robin(groups: list[list[Entry]], limit: int) -> list[Entry]:
    picked: list[Entry] = []
    queues = [list(group) for group in groups if group]
    while queues and len(picked) < limit:
        for queue in list(queues):
            if len(picked) >= limit:
                break
            picked.append(queue.pop(0))
            if not queue:
                queues.remove(queue)
    return picked


def upcoming_target(focus: PlanWeeklyFocus) -> int:
    """The target the week after ``focus`` starts with."""
    return focus.next_target or focus.target


def _focus(db: Session, user_id: int, week_start: date) -> tuple[PlanWeeklyFocus, PlanWeeklyFocus | None]:
    focus = db.exec(select(PlanWeeklyFocus).where(PlanWeeklyFocus.user_id == user_id, PlanWeeklyFocus.week_start == week_start)).first()
    if focus:
        return focus, None
    previous = db.exec(
        select(PlanWeeklyFocus).where(PlanWeeklyFocus.user_id == user_id, PlanWeeklyFocus.week_start < week_start)
        .order_by(PlanWeeklyFocus.week_start.desc())  # type: ignore[attr-defined]
    ).first()
    now = now_string()
    focus = PlanWeeklyFocus(
        user_id=user_id, week_start=week_start, objective_uuids=[],
        target=upcoming_target(previous) if previous else DEFAULT_TARGET, boosts=0, creation_date=now, update_date=now,
    )
    return focus, previous


def open_candidates(entries_by_goal: dict[int, list[Entry]], goals: list[Goal], exclude: set[str], after: date, startable_only: bool = True) -> list[list[Entry]]:
    """Steps that can be started early, in goal order: undated ones and ones due after ``after``.

    A due date says when a step must be done, not when it may start; anything open
    and unlocked can be picked up once nothing more pressing is waiting.
    """
    return [
        [
            entry for entry in entries_by_goal[int(goal.id)]  # type: ignore[arg-type]
            if (entry.due is None or entry.due > after) and entry.uuid not in exclude and not entry.done
            and (entry.startable if startable_only else not entry.waiting)
        ]
        for goal in goals
    ]


def _week_goals(focus: PlanWeeklyFocus, goals: list[Goal]) -> set[str]:
    """The goals this week was planned from (stored in ``plan_uuids``); older weeks adopt today's goals."""
    if focus.id is None or focus.plan_uuids is None:
        return {goal.goal_uuid for goal in goals}
    return set(focus.plan_uuids)


def _first_open(entries_by_goal: dict[int, list[Entry]], goal: Goal, exclude: set[str], after: date) -> Entry | None:
    return next(iter(open_candidates(entries_by_goal, [goal], exclude, after)[0]), None)


def fill_week(
    db: Session, user_id: int, goals: list[Goal], entries_by_goal: dict[int, list[Entry]], today: date,
    extra: int = 0, refill: bool = False, adopt: set[str] | None = None,
) -> PlanWeeklyFocus:
    """This week's stored picks (step uuids in ``objective_uuids``), planning the week on its first load."""
    adopt = adopt or set()
    week_start = week_start_of(today)
    week_end = week_start + timedelta(days=6)
    focus, previous = _focus(db, user_id, week_start)
    new_week = focus.id is None
    known = _week_goals(focus, goals) | adopt
    by_uuid = {entry.uuid: entry for entries in entries_by_goal.values() for entry in entries}
    picks = [uuid for uuid in focus.objective_uuids or [] if uuid in by_uuid]
    if previous is not None:
        # A new week starts with whatever was picked last week and is still unfinished.
        picks = [
            uuid for uuid in previous.objective_uuids or []
            if uuid in by_uuid and not by_uuid[uuid].done and (by_uuid[uuid].due is None or by_uuid[uuid].due > week_end)  # type: ignore[operator]
        ]
    dated_this_week = [
        entry for entries in entries_by_goal.values() for entry in entries
        if entry.goal.goal_uuid in known and entry.due is not None and entry.due <= week_end
        and (not entry.done or (entry.completed_on and entry.completed_on >= week_start))
    ]
    if not picks and not dated_this_week and not extra and not focus.objective_uuids:
        # A week that never had anything in it has nothing to protect: plan it from every goal
        # the learner has now. A week whose steps were all done stays until the learner asks for more.
        known |= {goal.goal_uuid for goal in goals}
        new_week = True
    if extra:
        # Asking for more draws on every goal, including ones started mid-week.
        known |= {goal.goal_uuid for goal in goals}
    week_goals = [goal for goal in goals if goal.goal_uuid in known]
    # Only planning a week, or the learner asking, adds steps; loading never grows it.
    if new_week or refill or extra:
        room = max(0, focus.target - len(dated_this_week) - len(picks)) + extra
        if room:
            picks += [entry.uuid for entry in round_robin(open_candidates(entries_by_goal, week_goals, set(picks), week_end), room)]
    if new_week:
        # A goal started this week always gets its first step into the week.
        present = {by_uuid[uuid].goal.id for uuid in picks} | {entry.goal.id for entry in dated_this_week}
        for goal in week_goals:
            created = str(goal.creation_date or "")[:10]
            if goal.id in present or not created or created < week_start.isoformat():
                continue
            first = _first_open(entries_by_goal, goal, set(picks), week_end)
            if first:
                picks.append(first.uuid)
    for goal in goals:
        if goal.goal_uuid in adopt and not any(by_uuid[uuid].goal.id == goal.id for uuid in picks):
            # Pulling a goal in brings its next open step along with anything dated this week.
            first = _first_open(entries_by_goal, goal, set(picks), week_end)
            if first:
                picks.append(first.uuid)
    known_list = sorted(known)
    if picks != (focus.objective_uuids or []) or focus.plan_uuids != known_list or focus.id is None:
        focus.objective_uuids = picks
        focus.plan_uuids = known_list
        focus.update_date = now_string()
        db.add(focus)
        db.commit()
        db.refresh(focus)
    return focus
