"""Coach's check-ins on personal goals: rules decide when, the model words what.

A check-in reads plain signals from the goal (check_in_signals: a stage coming up empty, a date
slipping, a routine gone quiet, a goal with no why, and more), then one model call turns them
into at most three notes in Coach's voice. When the rules find nothing new, the model looks the
whole goal over and may add one note on something that seems missing. A check-in never changes the goal; each note only
offers things the learner can choose to do. Without a model, notes use fixed wording.

Check-ins come due on the goal's cadence (weekly, or monthly when the learner steers) and right
after events: a goal is created or a stage is finished. They run when the learner arrives: there
are no reminders outside the app, so the learner sets the rhythm by coming back, and Coach catches
up on whatever came due while they were away.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import replace
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_
from sqlmodel import Session, select

from src.db.coach_notes import CoachNote, CoachNoteStatus
from src.db.goals import Goal, GoalOwnership, GoalStatus
from src.services.goals.check_in_signals import FIRST_CHECK_IN, signals  # noqa: F401 (FIRST_CHECK_IN is used by goal creation and the dev route)
from src.services.goals.home_week import goal_entries

logger = logging.getLogger(__name__)

MAX_NOTES = 3
NOTE_DAYS = 14
CADENCE = {"weekly": timedelta(days=7), "monthly": timedelta(days=30)}
BATCH = 20
# How many goals one arrival catches up on, and how long a goal is held while it is checked in on.
CATCH_UP_GOALS = 5
CLAIM = timedelta(minutes=10)

NOTE_WRITER_INSTRUCTIONS = """You write Coach's check-in notes for one learner's goal.
The input is JSON: the goal and a list of signals, each with a key and plain facts.
Write one note per signal, in the order given. Each note has a title (at most 60 characters)
and a body (one or two short sentences, at most 200 characters), speaking to the learner as
"you". Never say you changed the goal or will do something for them; the learner decides.
Return only JSON:
{"notes": [{"key": "<signal key>", "title": "...", "body": "..."}]}

When the input has "review" instead of signals, read the goal's outline and look for the one
thing most worth a second look: a step it will clearly need that isn't there, a stage that
looks too big to start, a date that doesn't fit, a step that is really several. Skip anything
in "recent_notes". If something stands out, return one note keyed "review" with a title, a
body, and a "prompt": what the learner could say to Coach to work on it, in their voice, at
most 200 characters. If nothing stands out, return {"notes": []}. When "learner" is present it
says who the learner is and what else they're working on: use it to judge fit (a date that
clashes with another goal, a step that ignores what they already do), never quote it back."""


def _value(item) -> str:
    return str(getattr(item, "value", item))


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


def _outline(db: Session, goal: Goal, now: datetime) -> dict:
    """The goal as the reviewer sees it: its why and dates, and each stage's steps."""
    stages: dict[str, dict] = {}
    loose: list[dict] = []
    for entry in goal_entries(db, [goal], now.date())[int(goal.id)]:  # type: ignore[arg-type]
        step = {"title": entry.step.title, "type": entry.step.type, "status": entry.status, **({"due": entry.due.isoformat()} if entry.due else {})}
        if entry.stage is None:
            loose.append(step)
            continue
        stage = stages.setdefault(entry.stage.stage_uuid, {
            "title": entry.stage.title, "milestone": entry.stage.milestone or "",
            **({"starts": entry.stage.start_date.isoformat()} if entry.stage.start_date else {}),
            "steps": [],
        })
        stage["steps"].append(step)
    return {
        "title": goal.title, "why": (goal.description or "")[:600], "today": now.date().isoformat(),
        **({"target_date": goal.target_date.isoformat()} if goal.target_date else {}),
        "stages": list(stages.values()), "unstaged_steps": loose,
    }


async def _model_review(provider, db: Session, goal: Goal, key: str, existing: list[CoachNote], now: datetime, safety_identifier: str) -> tuple[list[dict], str]:
    """At most one note on whatever seems missing from the goal; none when nothing stands out."""
    from src.services.hub_advisor import AdvisorMessage, _json_object

    recent = [note.title for note in existing if note.created_at and note.created_at >= now - timedelta(days=60)]
    from src.services.coach.learner import for_policy
    from src.services.coach.policy import runtime

    learner = for_policy(db, goal.org_id, goal.subject_user_id, runtime(db)) if goal.subject_user_id else {}
    prompt = json.dumps({"review": _outline(db, goal, now), "recent_notes": recent[-10:], **({"learner": learner} if learner else {})}, ensure_ascii=False, default=str)
    result = await provider.respond([AdvisorMessage(role="user", content=prompt)], safety_identifier)
    for note in _json_object(result.text).get("notes") or []:
        if not isinstance(note, dict) or note.get("key") != "review":
            continue
        title, body = " ".join(str(note.get("title") or "").split())[:80], " ".join(str(note.get("body") or "").split())[:280]
        ask = " ".join(str(note.get("prompt") or "").split())[:300]
        if title and ask:
            return [{
                "kind": "review", "key": key, "title": title, "body": body,
                "actions": [{"kind": "ask", "label": "Talk it through", "prompt": ask}, {"kind": "dismiss", "label": "Not now"}],
            }], result.model or ""
    return [], ""


def note_provider(db: Session):
    """Coach's model for wording notes, or None (fixed wording) when Coach isn't set up."""
    from src.services.coach.policy import runtime
    from src.services.coach.providers import provider_for
    from src.services.hub_advisor import _ui_test_provider

    try:
        if _ui_test_provider(memory=True):
            return None
        policy = runtime(db)
        if not policy.enabled:
            return None
        model = policy.model(policy.tier_for("goal_check_in"))
    except Exception:
        return None
    return provider_for(
        replace(model, settings={**model.settings, "max_output_tokens": 600}),
        instructions=policy.instructions("goal_check_in", contract=NOTE_WRITER_INSTRUCTIONS), allow_actions=False,
    )


def schedule(goal: Goal, now: datetime) -> datetime:
    return now + CADENCE.get(goal.coach_cadence or "weekly", CADENCE["weekly"])


def check_in(db: Session, goal: Goal, now: datetime | None = None, provider=None, source: str = "check_in") -> list[CoachNote]:
    """One check-in on one goal: expire stale notes, add notes for new signals, schedule the next."""
    from src.services.hub_advisor import advisor_safety_identifier

    now = now or datetime.utcnow()
    found = signals(db, goal, now)
    existing = db.exec(select(CoachNote).where(CoachNote.goal_id == goal.id)).all()
    seen = {note.signal_key for note in existing}
    _expire(existing, {item["key"] for item in found}, now)
    open_count = sum(1 for note in existing if _value(note.status) == CoachNoteStatus.OPEN.value)
    fresh = [item for item in found if item["key"] not in seen][:max(0, MAX_NOTES - open_count)]
    worded, model = {}, ""
    if fresh and provider is not None:
        try:
            worded, model = asyncio.run(_model_wording(provider, goal, fresh, advisor_safety_identifier(int(goal.owner_user_id))))
        except Exception:
            logger.warning("Coach note wording failed; using fixed wording", exc_info=True)
    if not fresh and open_count < MAX_NOTES and provider is not None:
        # Nothing new from the rules: the model looks the whole goal over, at most once a week.
        key = f"review:{(now.date() - timedelta(days=now.weekday())).isoformat()}"
        if key not in seen:
            try:
                fresh, model = asyncio.run(_model_review(provider, db, goal, key, existing, now, advisor_safety_identifier(int(goal.owner_user_id))))
                worded = {item["key"]: item for item in fresh}
            except Exception:
                logger.warning("Coach goal review failed", exc_info=True)
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


def _expire(notes: list[CoachNote], keys: set[str] | None, now: datetime) -> bool:
    """Expire open notes whose signal is gone (the step was started, the stage planned) or that ran out.
    ``keys`` None means the goal is no longer active, so every open note goes."""
    changed = False
    for note in notes:
        if _value(note.status) != CoachNoteStatus.OPEN.value:
            continue
        gone = keys is None or (note.signal_key not in keys and not note.signal_key.startswith(("milestone:", "review:", "first_look:")))
        if gone or (note.expires_at and note.expires_at <= now):
            note.status = CoachNoteStatus.EXPIRED
            changed = True
    return changed


def sweep(db: Session, goal: Goal, now: datetime | None = None) -> None:
    """Retire open notes the goal has moved past since the last check-in, so Coach never asks for a
    first step on a goal that has steps, or for anything on a finished goal. Commits when it changes a note."""
    now = now or datetime.utcnow()
    notes = list(db.exec(select(CoachNote).where(CoachNote.goal_id == goal.id, CoachNote.status == CoachNoteStatus.OPEN.value)).all())
    if not notes:
        return
    active = _value(goal.status) == GoalStatus.ACTIVE.value
    # Read the rules no earlier than the newest note was raised, so a time-gated rule
    # (a new goal's first-steps wait) can't retire a note it raised itself.
    at = max([now, *(note.created_at for note in notes if note.created_at)])
    if _expire(notes, {item["key"] for item in signals(db, goal, at)} if active else None, now):
        for note in notes:
            db.add(note)
        db.commit()


def due_soon(db: Session, goal: Goal, delay: timedelta = timedelta(0)) -> None:
    """An event (a new goal, a finished stage) brings the goal's next check-in forward. Callers commit."""
    if _value(goal.ownership) != GoalOwnership.PERSONAL.value:
        return
    when = datetime.utcnow() + delay
    if goal.next_check_in_at is None or goal.next_check_in_at > when:
        goal.next_check_in_at = when
        db.add(goal)


def due_goals(db: Session, now: datetime, limit: int = BATCH, user_id: int | None = None) -> list[Goal]:
    statement = select(Goal).where(
        Goal.ownership == GoalOwnership.PERSONAL.value, Goal.status == GoalStatus.ACTIVE.value,
        or_(Goal.next_check_in_at.is_(None), Goal.next_check_in_at <= now),  # type: ignore[union-attr, operator]
    )
    if user_id is not None:
        statement = statement.where(Goal.owner_user_id == user_id)
    return list(db.exec(statement.order_by(Goal.next_check_in_at).limit(limit)).all())  # type: ignore[arg-type]


def catch_up(db: Session, user_id: int, now: datetime | None = None) -> int:
    """The learner arrived: check in on their goals that came due while they were away. Returns how many ran.

    Each goal is claimed first (its next check-in pushed a few minutes out), so a second tab
    arriving at the same moment skips it rather than checking in twice."""
    from src.services.coach.policy import runtime

    now = now or datetime.utcnow()
    if not runtime(db).can("goal_notes"):
        return 0
    goals = due_goals(db, now, CATCH_UP_GOALS, user_id)
    if not goals:
        return 0
    for goal in goals:
        goal.next_check_in_at = now + CLAIM
        db.add(goal)
    db.commit()
    provider = note_provider(db)
    ran = 0
    for goal in goals:
        try:
            check_in(db, goal, now, provider=provider)
            ran += 1
        except Exception:
            db.rollback()
            logger.exception("Coach check-in failed for goal %s", goal.goal_uuid)
            goal.next_check_in_at = schedule(goal, now)
            db.add(goal)
            db.commit()
    return ran
