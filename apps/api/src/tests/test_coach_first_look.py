"""Coach's first look at a new goal: one note on its Coach bar and suggested steps, retaken while untouched."""

import asyncio
import json
from datetime import datetime, timedelta

import pytest
from sqlmodel import SQLModel, select

from src.db.goals import CoachNote, Goal, GoalCreate, GoalUpdate
from src.db.hub import HubConversation, HubConversationMessage, HubEditObjectState, HubEditRun, HubEditRunEvent
from src.services.coach import first_look
from src.services.coach import policy as coach_policy
from src.services.coach.policy import CoachRuntime
from src.services.goals import check_ins, goals
from src.services.goals.coach_notes import NoteAction, act, goal_notes
from src.services.goals.coach_sessions import goal_suggestions, session_prompt
from src.services.hub_advisor import AdvisorResult
from src.tests.test_goals import LEARNER, _session, _user

LOOK = {
    "title": "A big goal with a clear why", "body": "You know why this matters. I'd like to talk about what the first month looks like.",
    "prompt": "Help me plan my first month.",
    "steps": [{"type": "task", "title": "Shadow a vet for a day", "description": "", "stage_title": "", "due_date": "", "why": "See the work up close"},
              {"type": "nope", "title": "Dropped: unknown type", "why": "x"}],
}


class Model:
    def __init__(self, look=None, fail=False):
        self.look, self.fail, self.prompts = look or LOOK, fail, []

    async def respond(self, messages, safety_identifier):
        if self.fail:
            raise RuntimeError("down")
        self.prompts.append(json.loads(messages[-1].content))
        return AdvisorResult(text=json.dumps(self.look), model="test-model")


@pytest.fixture
def db(monkeypatch):
    abilities = {"read_portfolio": False}
    monkeypatch.setattr(coach_policy, "runtime", lambda *_args: CoachRuntime(True, "Coach well.", abilities, {}))
    with _session() as session:
        SQLModel.metadata.create_all(session.get_bind(), tables=[
            HubConversation.__table__, HubConversationMessage.__table__, HubEditRun.__table__, HubEditRunEvent.__table__, HubEditObjectState.__table__,
        ])
        session.abilities = abilities  # type: ignore[attr-defined]
        yield session


def _goal(db) -> Goal:
    goal_uuid = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Vet school", description="I love animals", org_id=1))["goal_uuid"]
    return db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()


def _take(db, goal, model=None):
    return asyncio.run(first_look.take(db, 1, goal, LEARNER, provider=model or Model()))


def test_a_new_goal_gets_one_note_and_suggested_steps_with_a_why(db):
    goal = _goal(db)
    assert goal_notes(db, _user(LEARNER), goal.goal_uuid)["first_look_due"] is True
    model = Model()
    note = _take(db, goal, model)
    assert note is not None and note.kind == "first_look" and note.title == LOOK["title"]
    assert [action["kind"] for action in note.actions] == ["session", "dismiss"] and note.actions[0]["prompt"] == LOOK["prompt"]
    assert model.prompts[0]["goal"]["title"] == "Vet school" and "learner" in model.prompts[0]
    view = goal_notes(db, _user(LEARNER), goal.goal_uuid)
    assert [item["title"] for item in view["notes"]] == [LOOK["title"]] and view["first_look_due"] is False
    runs = goal_suggestions(db, 1, LEARNER, goal.goal_uuid)
    steps = runs[0]["operations"][0]["steps"]
    assert [(step["title"], step["why"]) for step in steps] == [("Shadow a vet for a day", "See the work up close")]
    # The check-in doesn't ask for first steps again, and doesn't retire the note.
    check_ins.check_in(db, goal, datetime.utcnow() + timedelta(hours=2))
    open_kinds = [item["kind"] for item in goal_notes(db, _user(LEARNER), goal.goal_uuid)["notes"]]
    assert open_kinds == ["first_look"]


def test_changing_the_goal_before_opening_the_note_gets_a_fresh_look(db):
    goal = _goal(db)
    _take(db, goal)
    goals.update_goal(db, _user(LEARNER), goal.goal_uuid, GoalUpdate(title="Vet school by 2030"))
    assert first_look.due(db, goal, LEARNER, coach_policy.runtime(db)) is True
    _take(db, goal, Model({**LOOK, "title": "A sharper goal"}))
    notes = db.exec(select(CoachNote).where(CoachNote.goal_id == goal.id)).all()
    assert sorted((note.title, str(getattr(note.status, "value", note.status))) for note in notes) == [("A big goal with a clear why", "expired"), ("A sharper goal", "open")]
    assert len(db.exec(select(HubEditRun)).all()) == 1 and len(db.exec(select(HubConversation)).all()) == 1


def test_no_more_looks_once_the_learner_responds(db):
    goal = _goal(db)
    note = _take(db, goal)
    act(db, _user(LEARNER), goal.goal_uuid, note.note_uuid, NoteAction(action_id="a2"))
    goals.update_goal(db, _user(LEARNER), goal.goal_uuid, GoalUpdate(title="Changed"))
    assert first_look.due(db, goal, LEARNER, coach_policy.runtime(db)) is False


def test_no_look_when_off_old_or_failing(db):
    goal = _goal(db)
    db.abilities["first_look"] = False
    assert _take(db, goal) is None
    db.abilities["first_look"] = True
    assert _take(db, goal, Model(fail=True)) is None
    assert db.exec(select(CoachNote)).all() == []
    goal.creation_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
    db.add(goal)
    db.commit()
    assert first_look.due(db, goal, LEARNER, coach_policy.runtime(db)) is False


def test_the_session_starts_from_the_first_look(db):
    goal = _goal(db)
    _take(db, goal)
    run = db.exec(select(HubEditRun)).one()
    _waiting, outline = session_prompt(db, {"run_uuid": run.run_uuid, "objects": [], "scope": {"kind": "goal", "target_uuid": goal.goal_uuid}}, LEARNER)
    assert "<coach_first_look>" in outline and LOOK["body"] in outline
