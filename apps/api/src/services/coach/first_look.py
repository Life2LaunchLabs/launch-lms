"""Coach's first look at a new goal: a note on the goal's Coach bar and a few suggested steps.

Soon after a learner creates a goal, Coach reads it with who the learner is and what else they're
working on, and leaves one note: what it sees and what it would talk through first. The note's
button opens that first conversation as a planning session on the goal, and the steps it suggests
wait on the goal as quiet lines, each with a short why, until the learner keeps or drops them.
Nothing changes the goal. When the learner edits the goal before opening the note, Coach looks
again; once they open or dismiss it, or start planning with Coach themselves, it never does.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import replace
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlmodel import Session, select

from src.db.coach_notes import CoachNote, CoachNoteStatus
from src.db.goals import Goal, GoalOwnership, GoalStage, GoalStatus, GoalStep
from src.db.hub import HubConversation, HubConversationMessage, HubEditObjectState, HubEditRun, HubEditRunEvent

logger = logging.getLogger(__name__)

KIND = "first_look"
ACTION_PREFIX = "first_look_"
# How long after creation a goal still gets a first look, and how many fresh looks one goal can get.
WINDOW = timedelta(days=14)
MAX_LOOKS = 5
MAX_STEPS = 4
NOTE_DAYS = 14

CONTRACT = """You are taking a first look at a goal the learner just created.
The input is JSON: the goal's outline (title, why, stages, steps), what you know about the learner
("learner": who they are and their other goals, when present) and today's date.
Read it as a coach would: what this goal really asks for, what is clear, what is missing, how it fits
the learner's life. Don't judge the goal or replace it; the goal is theirs. If it is vague or very
ambitious, plan to shape it with them in the conversation, not to refuse it.
Return only JSON:
{"title": "<at most 60 characters: what you noticed, plainly>",
 "body": "<one or two short sentences, at most 220 characters, to the learner as 'you': what you see and what you'd like to talk through first>",
 "prompt": "<what the learner could say to start that conversation, in their voice, at most 200 characters>",
 "steps": [{"type": "task" | "write" | "explore" | "decision", "title": "<a concrete first step>", "description": "<useful detail or empty>",
            "stage_title": "<an exact stage title from the outline, or empty>", "due_date": "<YYYY-MM-DD or empty>",
            "why": "<a few words on why this step helps, at most 100 characters>"}]}
Suggest at most 4 small steps that would get the goal moving, none that repeat a step it already has.
Return an empty steps list when the goal already has a good start."""

FIXTURE = {
    "title": "A clear goal with room to plan", "body": "You know where you're headed. I'd like to talk about what a good first week looks like.",
    "prompt": "Help me plan a good first week for this goal.",
    "steps": [{"type": "write", "title": "Write down why this matters now", "description": "", "stage_title": "", "due_date": "", "why": "Your reason keeps you going later"},
              {"type": "task", "title": "Block an hour this week to start", "description": "", "stage_title": "", "due_date": "", "why": "A fixed time beats waiting for one"}],
}


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _created(goal: Goal) -> datetime | None:
    try:
        return datetime.fromisoformat(goal.creation_date).replace(tzinfo=None) if goal.creation_date else None
    except ValueError:
        return None


def fingerprint(db: Session, goal: Goal) -> str:
    """What the first look read: the goal's title, why, date, stages and steps. Any change means a fresh look."""
    stages = sorted((stage.position, stage.title) for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all())
    steps = sorted((step.position, step.title) for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all())
    text = json.dumps([goal.title, goal.description, str(goal.target_date or ""), stages, steps], ensure_ascii=False)
    return f"{KIND}:{hashlib.sha256(text.encode()).hexdigest()[:16]}"


def _notes(db: Session, goal: Goal) -> list[CoachNote]:
    return list(db.exec(select(CoachNote).where(CoachNote.goal_id == goal.id, CoachNote.kind == KIND).order_by(CoachNote.created_at.desc())).all())  # type: ignore[attr-defined]


def _runs(db: Session, goal: Goal, user_id: int) -> list[HubEditRun]:
    return list(db.exec(select(HubEditRun).where(HubEditRun.user_id == user_id, HubEditRun.target_uuid == goal.goal_uuid)).all())


def _untouched(db: Session, run: HubEditRun) -> bool:
    """A first-look run the learner hasn't opened: no messages in its conversation and no suggestion kept or dropped."""
    talked = db.exec(select(HubConversationMessage.id).where(HubConversationMessage.conversation_id == run.conversation_id)).first()
    decided = db.exec(select(HubEditObjectState.id).where(HubEditObjectState.run_id == run.id)).first()
    return talked is None and decided is None


def due(db: Session, goal: Goal, user_id: int, policy, now: datetime | None = None) -> bool:
    """Whether Coach should (re)take its first look at this goal now."""
    now = now or datetime.utcnow()
    if not (policy.enabled and policy.can("first_look") and policy.can("plan_goals")):
        return False
    if goal.owner_user_id != user_id or _value(goal.ownership) != GoalOwnership.PERSONAL.value or _value(goal.status) != GoalStatus.ACTIVE.value:
        return False
    created = _created(goal)
    if created is None or now - created > WINDOW:
        return False
    notes = _notes(db, goal)
    if len(notes) >= MAX_LOOKS or any(_value(note.status) in {CoachNoteStatus.ACTED.value, CoachNoteStatus.DISMISSED.value} for note in notes):
        return False
    runs = _runs(db, goal, user_id)
    # The learner planned with Coach on their own, or has worked on what the first look suggested.
    if any(not run.started_from_action_id.startswith(ACTION_PREFIX) or not _untouched(db, run) for run in runs):
        return False
    current = next((note for note in notes if _value(note.status) == CoachNoteStatus.OPEN.value), None)
    return current is None or current.signal_key != fingerprint(db, goal)


def _clear(db: Session, goal: Goal, user_id: int, now: datetime) -> None:
    """Retire the last look: its open note, and its untouched session with the suggestions in it."""
    for note in _notes(db, goal):
        if _value(note.status) == CoachNoteStatus.OPEN.value:
            note.status = CoachNoteStatus.EXPIRED
            db.add(note)
    for run in _runs(db, goal, user_id):
        if not run.started_from_action_id.startswith(ACTION_PREFIX) or not _untouched(db, run):
            continue
        for event in db.exec(select(HubEditRunEvent).where(HubEditRunEvent.run_id == run.id)).all():
            db.delete(event)
        conversation = db.get(HubConversation, run.conversation_id)
        db.delete(run)
        db.flush()
        if conversation is not None:
            db.delete(conversation)
    db.flush()


class _Fixture:
    """Fixed wording for browser tests, which run without a model."""

    async def respond(self, messages, safety_identifier):
        from src.services.hub_advisor import AdvisorResult

        return AdvisorResult(text=json.dumps(FIXTURE), model="fixture")


def _provider(policy):
    from src.services.coach.providers import provider_for
    from src.services.hub_advisor import _ui_test_provider

    if _ui_test_provider(memory=True):
        return _Fixture()
    model = policy.model(policy.tier_for("goal_created"))
    return provider_for(
        replace(model, settings={**model.settings, "max_output_tokens": 1200}),
        instructions=policy.instructions("goal_created", query="first look new goal plan", contract=CONTRACT), allow_actions=False,
    )


def _read(text: str) -> dict | None:
    from src.services.hub_advisor import _json_object

    data = _json_object(text)
    title, body, prompt = (" ".join(str(data.get(key) or "").split()) for key in ("title", "body", "prompt"))
    if not title or not prompt:
        return None
    return {"title": title[:80], "body": body[:280], "prompt": prompt[:300], "steps": [item for item in data.get("steps") or [] if isinstance(item, dict)][:MAX_STEPS]}


async def ask(policy, outline: dict, learner: dict, safety_identifier: str, provider=None) -> tuple[dict | None, str]:
    """Coach's first look at a goal outline: the note and suggested steps it returns, and the model that wrote them."""
    from src.services.hub_advisor import AdvisorMessage

    prompt = json.dumps({"goal": outline, **({"learner": learner} if learner else {}), "today": date.today().isoformat()}, ensure_ascii=False, default=str)
    result = await (provider or _provider(policy)).respond([AdvisorMessage(role="user", content=prompt)], safety_identifier)
    return _read(result.text), result.model or ""


async def take(db: Session, org_id: int, goal: Goal, user_id: int, provider=None, now: datetime | None = None) -> CoachNote | None:
    """Take (or retake) the first look when it is due. Returns the new note, or None when nothing was written."""
    from src.services.coach.learner import for_policy
    from src.services.coach.policy import runtime
    from src.services.goals.coach_sessions import goal_outline, start_goal_session
    from src.services.goals.coach_tools import _operation, _parse_steps, _plural, record_goal_proposals
    from src.services.hub_advisor import advisor_safety_identifier

    now = now or datetime.utcnow()
    policy = runtime(db)
    if not due(db, goal, user_id, policy, now):
        return None
    key = fingerprint(db, goal)
    learner = for_policy(db, goal.org_id if goal.org_id is not None else org_id, user_id, policy)
    outline = json.loads(goal_outline(db, goal.goal_uuid, user_id) or "{}")
    try:
        look, model = await ask(policy, outline, learner, advisor_safety_identifier(user_id), provider)
    except Exception:
        logger.warning("Coach first look failed goal=%s", goal.goal_uuid, exc_info=True)
        return None
    # The goal may have changed, or another tab taken the look, while the model ran.
    db.refresh(goal)
    if look is None or fingerprint(db, goal) != key or not due(db, goal, user_id, policy, now):
        return None
    _clear(db, goal, user_id, now)
    steps = _parse_steps({"steps": look["steps"]})
    if steps:
        run = start_goal_session(db, org_id=org_id, user_id=user_id, goal_uuid=goal.goal_uuid, action_id=f"{ACTION_PREFIX}{uuid4().hex}")
        record_goal_proposals(db, run["run_uuid"], [_operation("add_goal_steps", "step", _plural(len(steps), "step"), steps=steps)])
    note = CoachNote(
        note_uuid=f"coach_note_{uuid4()}", goal_id=int(goal.id), user_id=user_id, kind=KIND, signal_key=key,  # type: ignore[arg-type]
        title=look["title"], body=look["body"], source="event", model=model,
        actions=[{"id": "a1", "kind": "session", "label": "Talk it through", "prompt": look["prompt"]}, {"id": "a2", "kind": "dismiss", "label": "Not now"}],
        expires_at=now + timedelta(days=NOTE_DAYS), created_at=now,
    )
    db.add(note)
    db.commit()
    return note


def agenda(db: Session, goal_uuid: str) -> str:
    """For Coach's prompt in a session on the goal: the first look it left, so the conversation starts from it."""
    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).first()
    note = next((item for item in _notes(db, goal) if _value(item.status) != CoachNoteStatus.DISMISSED.value), None) if goal else None
    if note is None or (note.created_at and datetime.utcnow() - note.created_at > WINDOW):
        return ""
    return (
        "\n\n<coach_first_look>\nWhat you noted when the learner created this goal, shown to them on its Coach bar. "
        "Start from it; you don't need to repeat it.\n"
        + json.dumps({"title": note.title, "note": note.body}, ensure_ascii=False) + "\n</coach_first_look>"
    )
