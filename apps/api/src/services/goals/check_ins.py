"""Coach's check-ins on personal goals: rules decide when, the model words what.

A check-in reads plain signals from the goal (a step not started for weeks, an empty stage
coming up, a stage just finished, a goal with no steps yet), then one model call turns them
into at most three notes in Coach's voice. A check-in never changes the goal; each note only
offers things the learner can choose to do. Without a model, notes use fixed wording.

Check-ins run on the goal's cadence (weekly, or monthly when the learner steers) and right
after events: a goal is created or a stage is finished. A single in-process runner picks up
due goals; a Postgres advisory lock keeps it to one API worker at a time.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_, text
from sqlmodel import Session, select

from src.db.goals import CoachNote, CoachNoteStatus, Goal, GoalOwnership, GoalStage, GoalStatus, StepStatus
from src.services.goals.home_week import goal_entries

logger = logging.getLogger(__name__)

MAX_NOTES = 3
STALLED_DAYS = 21
STAGE_SOON_DAYS = 14
MILESTONE_RECENT_DAYS = 14
NOTE_DAYS = 14
# A new goal gets a moment to be filled in before Coach asks about its first steps.
FIRST_CHECK_IN = timedelta(hours=1)
CADENCE = {"weekly": timedelta(days=7), "monthly": timedelta(days=30)}
BATCH = 20
RUNNER_LOCK = 0x434F4348
RUNNER_SECONDS = 300

NOTE_WRITER_INSTRUCTIONS = """You write Coach's check-in notes for one learner's goal.
The input is JSON: the goal and a list of signals, each with a key and plain facts.
Write one note per signal, in the order given. Each note has a title (at most 60 characters)
and a body (one or two short sentences, at most 200 characters), in a warm, plain voice,
speaking to the learner as "you". Notice; never nag, guilt or pressure. Never say you changed
the goal or will do something for them; the learner decides. Return only JSON:
{"notes": [{"key": "<signal key>", "title": "...", "body": "..."}]}"""


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _created(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value).replace(tzinfo=None) if value else None
    except ValueError:
        return None


def _dismiss(label: str = "Not now") -> dict:
    return {"kind": "dismiss", "label": label}


def signals(db: Session, goal: Goal, now: datetime) -> list[dict]:
    """What a check-in notices on a goal, most useful first. Each signal has a stable key."""
    today = now.date()
    entries = goal_entries(db, [goal], today)[int(goal.id)]  # type: ignore[arg-type]
    title = goal.title
    found: list[dict] = []
    if not entries:
        created = _created(goal.creation_date)
        if created is None or now - created >= FIRST_CHECK_IN:
            found.append({
                "kind": "first_steps", "key": "first_steps", "facts": "The goal has no steps yet.",
                "title": "Ready for a first step?", "body": f"“{title}” doesn’t have any steps yet. A small first one makes it real.",
                "actions": [{"kind": "session", "label": "Plan it with me", "prompt": f"Help me pick a few small first steps for “{title}”."}, _dismiss()],
            })
        return found

    by_stage: dict[int, list] = {}
    for entry in entries:
        if entry.stage is not None:
            by_stage.setdefault(int(entry.stage.id), []).append(entry)  # type: ignore[arg-type]
    stages = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position)).all()  # type: ignore[arg-type]

    # A stage that was just finished: every step done, the last one recently.
    for stage in stages:
        steps = by_stage.get(int(stage.id), [])  # type: ignore[arg-type]
        finished_on = [entry.completed_on for entry in steps if entry.completed_on]
        if all(entry.done for entry in steps) and finished_on and (today - max(finished_on)).days <= MILESTONE_RECENT_DAYS:
            reached = stage.milestone or stage.title
            found.append({
                "kind": "milestone", "key": f"milestone:{stage.stage_uuid}", "facts": f"The learner just finished the stage “{stage.title}”" + (f", reaching the milestone “{stage.milestone}”." if stage.milestone else "."),
                "title": f"You reached “{reached}”"[:80], "body": "That stage is done. Worth a moment to notice what got you here.",
                "actions": [{"kind": "ask", "label": "Look back with Coach", "prompt": f"I just finished “{stage.title}” on my goal “{title}”. Ask me a few questions about how it went and what’s next."}, _dismiss("Thanks")],
            })

    # The next stage with nothing in it, when it is close: its start date is near, or everything before it is done.
    earlier_done = True
    for stage in stages:
        steps = by_stage.get(int(stage.id), [])  # type: ignore[arg-type]
        if steps:
            earlier_done = earlier_done and all(entry.done for entry in steps)
            continue
        soon = stage.start_date is not None and stage.start_date <= today + timedelta(days=STAGE_SOON_DAYS)
        if soon or earlier_done:
            found.append({
                "kind": "plan_stage", "key": f"plan_stage:{stage.stage_uuid}", "facts": f"The stage “{stage.title}” has no steps yet, and it is coming up" + (f" (it starts {stage.start_date:%b} {stage.start_date.day})." if stage.start_date else "."),
                "title": f"Plan “{stage.title}”?"[:80], "body": "This stage is coming up and doesn’t have steps yet.",
                "actions": [{"kind": "session", "label": "Plan it with me", "prompt": f"Help me plan the stage “{stage.title}” of my goal “{title}”."}, _dismiss()],
            })
        break

    # The step waiting longest without being started.
    stalled = [
        entry for entry in entries
        if entry.startable and entry.status == StepStatus.NOT_STARTED.value
        and (_created(entry.step.creation_date) or now) <= now - timedelta(days=STALLED_DAYS)
    ]
    if stalled:
        entry = min(stalled, key=lambda item: item.step.creation_date)
        weeks = (now - (_created(entry.step.creation_date) or now)).days // 7
        found.append({
            "kind": "stalled", "key": f"stalled:{entry.uuid}", "step_uuid": entry.uuid,
            "facts": f"The step “{entry.step.title}” has been waiting {weeks} weeks without being started.",
            "title": f"Still up for “{entry.step.title}”?"[:80], "body": "It’s been waiting a while. Sometimes a step just needs to be smaller.",
            "actions": [
                {"kind": "step", "label": "Open the step", "step_uuid": entry.uuid},
                {"kind": "ask", "label": "Talk it through", "prompt": f"I haven’t started “{entry.step.title}” on my goal “{title}”. Ask me a few questions to figure out what’s in the way."},
                _dismiss(),
            ],
        })
    return found


async def _model_wording(provider, goal: Goal, fresh: list[dict], safety_identifier: str) -> tuple[dict[str, dict], str]:
    from src.services.hub_advisor import AdvisorMessage, _json_object

    prompt = json.dumps({
        "goal": {"title": goal.title, "why": goal.description[:600]},
        "signals": [{"key": item["key"], "facts": item["facts"]} for item in fresh],
    }, ensure_ascii=False)
    result = await provider.respond([AdvisorMessage(role="user", content=prompt)], safety_identifier)
    keys = {item["key"] for item in fresh}
    worded: dict[str, dict] = {}
    for note in _json_object(result.text).get("notes") or []:
        if not isinstance(note, dict) or note.get("key") not in keys:
            continue
        title, body = " ".join(str(note.get("title") or "").split())[:80], " ".join(str(note.get("body") or "").split())[:280]
        if title:
            worded[note["key"]] = {"title": title, "body": body}
    return worded, result.model or ""


def note_provider(db: Session):
    """Coach's model for wording notes, or None (fixed wording) when no model is set up."""
    from src.services.hub_advisor import AnthropicMessagesProvider, OpenAIResponsesProvider, _advisor_credentials, _ui_test_provider

    try:
        if _ui_test_provider(memory=True):
            return None
        provider, api_key, model, _instructions, advanced = _advisor_credentials(db)
    except Exception:
        return None
    options = {**advanced, "max_output_tokens": 600}
    cls = AnthropicMessagesProvider if provider == "anthropic" else OpenAIResponsesProvider
    return cls(api_key, model, instructions=NOTE_WRITER_INSTRUCTIONS, advanced=options, allow_actions=False)


def schedule(goal: Goal, now: datetime) -> datetime:
    return now + CADENCE.get(goal.coach_cadence or "weekly", CADENCE["weekly"])


def check_in(db: Session, goal: Goal, now: datetime | None = None, provider=None, source: str = "check_in") -> list[CoachNote]:
    """One check-in on one goal: expire stale notes, add notes for new signals, schedule the next."""
    from src.services.hub_advisor import advisor_safety_identifier

    now = now or datetime.utcnow()
    found = signals(db, goal, now)
    keys = {item["key"] for item in found}
    existing = db.exec(select(CoachNote).where(CoachNote.goal_id == goal.id)).all()
    seen = {note.signal_key for note in existing}
    for note in existing:
        # An open note goes once its signal is gone (the step was started, the stage planned) or it ran out.
        gone = note.signal_key not in keys and not note.signal_key.startswith("milestone:")
        if _value(note.status) == CoachNoteStatus.OPEN.value and (gone or (note.expires_at and note.expires_at <= now)):
            note.status = CoachNoteStatus.EXPIRED
            db.add(note)
    open_count = sum(1 for note in existing if _value(note.status) == CoachNoteStatus.OPEN.value)
    fresh = [item for item in found if item["key"] not in seen][:max(0, MAX_NOTES - open_count)]
    worded, model = {}, ""
    if fresh and provider is not None:
        try:
            worded, model = asyncio.run(_model_wording(provider, goal, fresh, advisor_safety_identifier(int(goal.owner_user_id))))
        except Exception:
            logger.warning("Coach note wording failed; using fixed wording", exc_info=True)
    created = []
    for item in fresh:
        words = worded.get(item["key"]) or {"title": item["title"], "body": item["body"]}
        note = CoachNote(
            note_uuid=f"coach_note_{uuid4()}", goal_id=int(goal.id), user_id=int(goal.owner_user_id), kind=item["kind"],  # type: ignore[arg-type]
            signal_key=item["key"], title=words["title"], body=words["body"], source=source,
            actions=[{"id": f"a{index + 1}", **action} for index, action in enumerate(item["actions"])],
            model=model if item["key"] in worded else "", expires_at=now + timedelta(days=NOTE_DAYS), created_at=now,
        )
        db.add(note)
        created.append(note)
    goal.next_check_in_at = schedule(goal, now)
    db.add(goal)
    db.commit()
    return created


def due_soon(db: Session, goal: Goal, delay: timedelta = timedelta(0)) -> None:
    """An event (a new goal, a finished stage) brings the goal's next check-in forward. Callers commit."""
    if _value(goal.ownership) != GoalOwnership.PERSONAL.value:
        return
    when = datetime.utcnow() + delay
    if goal.next_check_in_at is None or goal.next_check_in_at > when:
        goal.next_check_in_at = when
        db.add(goal)


def due_goals(db: Session, now: datetime, limit: int = BATCH) -> list[Goal]:
    return list(db.exec(select(Goal).where(
        Goal.ownership == GoalOwnership.PERSONAL.value, Goal.status == GoalStatus.ACTIVE.value,
        or_(Goal.next_check_in_at.is_(None), Goal.next_check_in_at <= now),  # type: ignore[union-attr, operator]
    ).order_by(Goal.next_check_in_at).limit(limit)).all())  # type: ignore[arg-type]


def run_due(engine) -> int:
    """Check in on goals that are due, while holding the runner lock. Returns how many ran."""
    with engine.connect() as lease:
        postgres = engine.dialect.name == "postgresql"
        if postgres:
            acquired = lease.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": RUNNER_LOCK}).scalar()
            lease.commit()
            if not acquired:
                return 0
        try:
            with Session(engine) as db:
                provider = note_provider(db)
                ran = 0
                for goal in due_goals(db, datetime.utcnow()):
                    try:
                        check_in(db, goal, provider=provider)
                        ran += 1
                    except Exception:
                        db.rollback()
                        logger.exception("Coach check-in failed for goal %s", goal.goal_uuid)
                        goal.next_check_in_at = schedule(goal, datetime.utcnow())
                        db.add(goal)
                        db.commit()
                return ran
        finally:
            if postgres:
                lease.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": RUNNER_LOCK})
                lease.commit()


async def run_check_ins(engine):
    while True:
        try:
            ran = await asyncio.to_thread(run_due, engine)
        except Exception:
            logger.exception("Coach check-ins will retry")
            ran = 0
        await asyncio.sleep(5 if ran >= BATCH else RUNNER_SECONDS)
