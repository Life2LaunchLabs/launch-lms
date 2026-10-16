"""What Coach notices when it checks in on a goal: a suite of plain rules over the goal's steps.

Each rule looks for one kind of gap (nothing planned yet, a stage coming up empty, a date
slipping, a routine gone quiet, a goal with no why) and returns signals with a stable key,
the facts the note writer words, fixed wording for when there is no model, and the actions
the learner can take. Rules never change the goal. The order of ``signals`` is the order
notes are offered in, most useful first, since a goal holds at most a few open notes.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from src.db.goals import Goal, GoalStage, StepStatus
from src.services.goals.home_week import Entry, goal_entries
from src.services.goals.types.routine import count_in_week, follow_ups_due, week_start_of

STALLED_DAYS = 21
# A goal with open steps and nothing finished for this long has gone quiet.
QUIET_GOAL_DAYS = 21
# A running routine with no logs for this many whole weeks in a row.
ROUTINE_MISSED_WEEKS = 2
STAGE_SOON_DAYS = 14
MILESTONE_RECENT_DAYS = 14
# A goal's own target date this close, with steps still open, is worth a look at the plan.
DEADLINE_SOON_DAYS = 21
# A new goal gets a moment to be filled in before Coach asks about its first steps.
FIRST_CHECK_IN = timedelta(hours=1)
# Gentler asks (a why, a milestone) wait until the goal has settled in.
SETTLED_DAYS = 3


def _created(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value).replace(tzinfo=None) if value else None
    except ValueError:
        return None


def _dismiss(label: str = "Not now") -> dict:
    return {"kind": "dismiss", "label": label}


def _day(value: date) -> str:
    return f"{value:%b} {value.day}"


def signals(db: Session, goal: Goal, now: datetime) -> list[dict]:
    """What a check-in notices on a goal, most useful first. Each signal has a stable key."""
    today = now.date()
    entries = goal_entries(db, [goal], today)[int(goal.id)]  # type: ignore[arg-type]
    if not entries:
        return _first_steps(goal, now)
    stages = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position)).all()  # type: ignore[arg-type]
    by_stage: dict[int, list[Entry]] = {}
    for entry in entries:
        if entry.stage is not None:
            by_stage.setdefault(int(entry.stage.id), []).append(entry)  # type: ignore[arg-type]
    settled = (now - (_created(goal.creation_date) or now)) >= timedelta(days=SETTLED_DAYS)
    return [
        *_milestones(goal, stages, by_stage, today),
        *_plan_stage(goal, stages, by_stage, today),
        *_overdue(goal, entries, today),
        *_deadline(goal, entries, today),
        *_follow_ups(goal, entries, today),
        *_quiet_routines(goal, entries, today),
        *_stalled(goal, entries, now),
        *_quiet_goal(goal, entries, now),
        *(_no_milestone(goal, stages, by_stage) if settled else []),
        *(_no_why(goal) if settled else []),
    ]


def _first_steps(goal: Goal, now: datetime) -> list[dict]:
    created = _created(goal.creation_date)
    if created is not None and now - created < FIRST_CHECK_IN:
        return []
    return [{
        "kind": "first_steps", "key": "first_steps", "facts": "The goal has no steps yet.",
        "title": "Ready for a first step?", "body": f"“{goal.title}” doesn’t have any steps yet. A small first one makes it real.",
        "actions": [{"kind": "session", "label": "Plan it with me", "prompt": f"Help me pick a few small first steps for “{goal.title}”."}, _dismiss()],
    }]


def _milestones(goal: Goal, stages, by_stage: dict, today: date) -> list[dict]:
    """A stage that was just finished: every step done, the last one recently."""
    found = []
    for stage in stages:
        steps = by_stage.get(int(stage.id), [])
        finished_on = [entry.completed_on for entry in steps if entry.completed_on]
        if all(entry.done for entry in steps) and finished_on and (today - max(finished_on)).days <= MILESTONE_RECENT_DAYS:
            reached = stage.milestone or stage.title
            found.append({
                "kind": "milestone", "key": f"milestone:{stage.stage_uuid}", "facts": f"The learner just finished the stage “{stage.title}”" + (f", reaching the milestone “{stage.milestone}”." if stage.milestone else "."),
                "title": f"You reached “{reached}”"[:80], "body": "That stage is done. Worth a moment to notice what got you here.",
                "actions": [{"kind": "ask", "label": "Look back with Coach", "prompt": f"I just finished “{stage.title}” on my goal “{goal.title}”. Ask me a few questions about how it went and what’s next."}, _dismiss("Thanks")],
            })
    return found


def _plan_stage(goal: Goal, stages, by_stage: dict, today: date) -> list[dict]:
    """The next stage with nothing in it, when it is close: its start date is near, or everything before it is done."""
    earlier_done = True
    for stage in stages:
        steps = by_stage.get(int(stage.id), [])
        if steps:
            earlier_done = earlier_done and all(entry.done for entry in steps)
            continue
        soon = stage.start_date is not None and stage.start_date <= today + timedelta(days=STAGE_SOON_DAYS)
        if not (soon or earlier_done):
            return []
        return [{
            "kind": "plan_stage", "key": f"plan_stage:{stage.stage_uuid}", "facts": f"The stage “{stage.title}” has no steps yet, and it is coming up" + (f" (it starts {_day(stage.start_date)})." if stage.start_date else "."),
            "title": f"Plan “{stage.title}”?"[:80], "body": "This stage is coming up and doesn’t have steps yet.",
            "actions": [{"kind": "session", "label": "Plan it with me", "prompt": f"Help me plan the stage “{stage.title}” of my goal “{goal.title}”."}, _dismiss()],
        }]
    return []


def _overdue(goal: Goal, entries: list[Entry], today: date) -> list[dict]:
    """The open step furthest past its due date. Its key carries the date, so moving the date clears it."""
    late = [entry for entry in entries if not entry.done and not entry.routine and entry.due and entry.due < today]
    if not late:
        return []
    entry = min(late, key=lambda item: item.due)  # type: ignore[arg-type, return-value]
    return [{
        "kind": "overdue", "key": f"overdue:{entry.uuid}:{entry.due.isoformat()}", "step_uuid": entry.uuid,  # type: ignore[union-attr]
        "facts": f"The step “{entry.step.title}” was due {_day(entry.due)} and isn’t done yet" + (f" ({len(late) - 1} other steps are past due too)." if len(late) > 1 else "."),  # type: ignore[arg-type]
        "title": f"“{entry.step.title}” slipped past its date"[:80], "body": "Dates move. Worth deciding whether it still fits, or needs a new one.",
        "actions": [
            {"kind": "step", "label": "Open the step", "step_uuid": entry.uuid},
            {"kind": "session", "label": "Rework the dates with me", "prompt": f"Some steps on my goal “{goal.title}” are past their dates. Help me decide what still fits and set new dates."},
            _dismiss(),
        ],
    }]


def _deadline(goal: Goal, entries: list[Entry], today: date) -> list[dict]:
    """The goal's own target date is close and steps are still open."""
    if not goal.target_date or goal.target_date < today or (goal.target_date - today).days > DEADLINE_SOON_DAYS:
        return []
    open_steps = [entry for entry in entries if not entry.done and not entry.routine]
    if not open_steps:
        return []
    days = (goal.target_date - today).days
    count = f"{len(open_steps)} step{'' if len(open_steps) == 1 else 's'}"
    return [{
        "kind": "deadline", "key": f"deadline:{goal.target_date.isoformat()}",
        "facts": f"The goal is aimed at {_day(goal.target_date)}, {days} days away, and {count} still open.",
        "title": f"{days} day{'' if days == 1 else 's'} to go" if days else "Your goal’s date is today", "body": f"{count} still open. A quick look at the plan helps it land.",
        "actions": [{"kind": "session", "label": "Look over the plan with me", "prompt": f"My goal “{goal.title}” is aimed at {_day(goal.target_date)} and {count} still open. Help me see what matters most before then."}, _dismiss()],
    }]


def _follow_ups(goal: Goal, entries: list[Entry], today: date) -> list[dict]:
    """A routine with follow-ups that have come due and have no status yet."""
    found = []
    for entry in entries:
        if not entry.routine or entry.done:
            continue
        due = follow_ups_due(entry.entries, today)
        if not due:
            continue
        earliest = min(item.follow_up_due for item in due)  # type: ignore[type-var]
        found.append({
            "kind": "follow_ups", "key": f"follow_ups:{entry.uuid}:{earliest.isoformat()}", "step_uuid": entry.uuid,  # type: ignore[union-attr]
            "facts": f"{len(due)} logged items on the routine “{entry.step.title}” are due a follow-up.",
            "title": f"Time to follow up on {len(due)}" if len(due) > 1 else "Time to follow up on one", "body": f"Some of your “{entry.step.title}” logs are ready for a follow-up.",
            "actions": [{"kind": "step", "label": "Open the routine", "step_uuid": entry.uuid}, _dismiss()],
        })
    return found


def _quiet_routines(goal: Goal, entries: list[Entry], today: date) -> list[dict]:
    """A running routine with no logs in the last whole weeks. Its key names the first quiet
    week, so one lapse is one note, and a later lapse can get its own."""
    found = []
    for entry in entries:
        if not entry.routine or entry.done:
            continue
        missed = _missed_weeks(entry, today)
        if missed is None:
            continue
        first_quiet, weeks = missed
        found.append({
            "kind": "routine_missed", "key": f"routine_missed:{entry.uuid}:{first_quiet.isoformat()}", "step_uuid": entry.uuid,
            "facts": f"The routine “{entry.step.title}” has had nothing logged for {weeks} weeks in a row.",
            "title": f"How’s “{entry.step.title}” going?"[:80], "body": "Nothing’s been logged for a couple of weeks. It might need a smaller target, or a fresh start.",
            "actions": [
                {"kind": "step", "label": "Open the routine", "step_uuid": entry.uuid},
                {"kind": "ask", "label": "Talk it through", "prompt": f"My routine “{entry.step.title}” on my goal “{goal.title}” has gone quiet for a couple of weeks. Ask me a few questions about what changed and whether to adjust it."},
                _dismiss(),
            ],
        })
    return found


def _missed_weeks(entry: Entry, today: date) -> tuple[date, int] | None:
    """The first of the whole weeks in a row with nothing logged, ending last week, and how many;
    None unless there are at least ROUTINE_MISSED_WEEKS, or something was logged this week.
    The week the routine was added in doesn't count."""
    created = _created(entry.step.creation_date)
    if created is None or count_in_week(entry.entries, week_start_of(today)):
        return None
    first_week = week_start_of(created.date())
    week = week_start_of(today) - timedelta(weeks=1)
    quiet = 0
    while week > first_week and count_in_week(entry.entries, week) == 0:
        quiet += 1
        week -= timedelta(weeks=1)
    return (week + timedelta(weeks=1), quiet) if quiet >= ROUTINE_MISSED_WEEKS else None


def _stalled(goal: Goal, entries: list[Entry], now: datetime) -> list[dict]:
    """The step waiting longest without being started (a routine that never started is a quiet routine)."""
    stalled = [
        entry for entry in entries
        if not entry.routine and entry.startable and entry.status == StepStatus.NOT_STARTED.value
        and (_created(entry.step.creation_date) or now) <= now - timedelta(days=STALLED_DAYS)
    ]
    if not stalled:
        return []
    entry = min(stalled, key=lambda item: item.step.creation_date)
    weeks = (now - (_created(entry.step.creation_date) or now)).days // 7
    return [{
        "kind": "stalled", "key": f"stalled:{entry.uuid}", "step_uuid": entry.uuid,
        "facts": f"The step “{entry.step.title}” has been waiting {weeks} weeks without being started.",
        "title": f"Still up for “{entry.step.title}”?"[:80], "body": "It’s been waiting a while. Sometimes a step just needs to be smaller.",
        "actions": [
            {"kind": "step", "label": "Open the step", "step_uuid": entry.uuid},
            {"kind": "ask", "label": "Talk it through", "prompt": f"I haven’t started “{entry.step.title}” on my goal “{goal.title}”. Ask me a few questions to figure out what’s in the way."},
            _dismiss(),
        ],
    }]


def _quiet_goal(goal: Goal, entries: list[Entry], now: datetime) -> list[dict]:
    """Open steps, but nothing finished in weeks. Its key carries the last finish, so finishing a step clears it."""
    if not any(not entry.done and not entry.routine for entry in entries):
        return []
    finished = [entry.completed_on for entry in entries if entry.completed_on]
    last = max(finished) if finished else (_created(goal.creation_date) or now).date()
    if (now.date() - last).days < QUIET_GOAL_DAYS:
        return []
    weeks = (now.date() - last).days // 7
    return [{
        "kind": "quiet_goal", "key": f"quiet_goal:{last.isoformat()}",
        "facts": f"Nothing on the goal has been finished for {weeks} weeks" + (", and nothing has been finished yet." if not finished else "."),
        "title": f"Still with “{goal.title}”?"[:80], "body": "It’s been a few weeks since anything moved here. Goals change; that’s fine.",
        "actions": [{"kind": "ask", "label": "Talk it through", "prompt": f"My goal “{goal.title}” hasn’t moved in a few weeks. Ask me a few questions to figure out whether it still fits and what would help."}, _dismiss()],
    }]


def _no_milestone(goal: Goal, stages, by_stage: dict) -> list[dict]:
    """The stage in progress doesn't say what reaching its end looks like."""
    for stage in stages:
        steps = by_stage.get(int(stage.id), [])
        if not steps or all(entry.done for entry in steps):
            continue
        if stage.milestone:
            return []
        return [{
            "kind": "no_milestone", "key": f"no_milestone:{stage.stage_uuid}",
            "facts": f"The stage the learner is working on, “{stage.title}”, has no milestone saying what reaching its end looks like.",
            "title": f"What does finishing “{stage.title}” look like?"[:80], "body": "Naming the milestone makes it easier to notice when you get there.",
            "actions": [{"kind": "session", "label": "Name it with me", "prompt": f"Help me name the milestone for the stage “{stage.title}” of my goal “{goal.title}”."}, _dismiss()],
        }]
    return []


def _no_why(goal: Goal) -> list[dict]:
    """The goal doesn't say why it matters."""
    if (goal.description or "").strip():
        return []
    return [{
        "kind": "no_why", "key": "no_why", "facts": "The goal doesn’t say why it matters to the learner.",
        "title": "Why this goal?", "body": "A line about why it matters is good company on the slow weeks.",
        "actions": [{"kind": "ask", "label": "Help me put it into words", "prompt": f"Ask me a couple of questions to help me put into words why “{goal.title}” matters to me."}, _dismiss()],
    }]
