"""Coach's check-ins: signals from plain rules, notes worded by the model, and acting on a note."""

from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import CoachNote, Goal, GoalCreate, GoalStep, StageCreate, StageUpdate, StepCreate, StepStatusChange
from src.services.goals import check_ins, goals, structure
from src.services.goals.coach_notes import NoteAction, act, goal_notes
from src.services.goals.next_actions import next_actions
from src.services.hub_advisor import AdvisorResult
from src.tests.test_goals import LEARNER, OTHER, _session, _user


class Wording:
    """A model that words some of the notes it is asked for."""

    def __init__(self, keys_prefix: str):
        self.keys_prefix, self.prompts = keys_prefix, []

    async def respond(self, messages, safety_identifier):
        import json

        payload = json.loads(messages[-1].content)
        self.prompts.append(payload)
        notes = [{"key": item["key"], "title": "Worded  by Coach", "body": item["facts"]} for item in payload["signals"] if item["key"].startswith(self.keys_prefix)]
        return AdvisorResult(text=json.dumps({"notes": notes + [{"key": "made-up", "title": "Nope"}]}), model="test-model")


def _goal(db, title="Vet school"):
    return goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title=title, org_id=1))["goal_uuid"]


def _row(db, goal_uuid) -> Goal:
    return db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()


def _stage(db, goal_uuid, title, start_date=None):
    view = structure.add_stage(db, _user(LEARNER), goal_uuid, StageCreate(title=title))
    stage_uuid = next(stage["stage_uuid"] for stage in view["stages"] if stage["title"] == title)
    if start_date:
        structure.update_stage(db, _user(LEARNER), goal_uuid, stage_uuid, StageUpdate(start_date=start_date))
    return stage_uuid


def _step(db, goal_uuid, stage_uuid, title, age_days=0):
    view = structure.add_step(db, _user(LEARNER), goal_uuid, StepCreate(stage_uuid=stage_uuid, type="task", title=title))
    step_uuid = next(step["step_uuid"] for stage in view["stages"] for step in stage["steps"] if step["title"] == title)
    row = db.exec(select(GoalStep).where(GoalStep.step_uuid == step_uuid)).one()
    row.creation_date = (datetime.now() - timedelta(days=age_days)).isoformat()
    db.add(row)
    db.commit()
    return step_uuid


def test_a_new_goal_gets_time_before_coach_asks_about_first_steps():
    with _session() as db:
        goal_uuid = _goal(db)
        goal = _row(db, goal_uuid)
        now = datetime.utcnow()
        # Creating the goal schedules its first check-in an hour out.
        assert now < goal.next_check_in_at <= now + check_ins.FIRST_CHECK_IN
        assert check_ins.signals(db, goal, now) == []
        later = now + timedelta(hours=2)
        notes = check_ins.check_in(db, goal, later)
        assert [(note.kind, note.title, note.model) for note in notes] == [("first_steps", "Ready for a first step?", "")]
        assert [action["kind"] for action in notes[0].actions] == ["session", "dismiss"] and notes[0].actions[0]["id"] == "a1"
        assert goal.next_check_in_at == later + timedelta(days=7)
        # One signal raises one note, however often Coach checks in.
        assert check_ins.check_in(db, goal, later + timedelta(days=7)) == []


def test_signals_become_at_most_three_model_worded_notes_that_expire_with_their_signal():
    with _session() as db:
        goal_uuid = _goal(db)
        first = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()
        shortlist = goals.get_goal(db, _user(LEARNER), goal_uuid)["stages"][0]["stage_uuid"]
        structure.update_stage(db, _user(LEARNER), goal_uuid, shortlist, StageUpdate(milestone="Shortlist made"))
        done = _step(db, goal_uuid, shortlist, "List five schools")
        goals.change_status(db, _user(LEARNER), goal_uuid, done, StepStatusChange(status="completed"))
        apply = _stage(db, goal_uuid, "Apply")
        waiting = _step(db, goal_uuid, apply, "Ask for a reference", age_days=30)
        _step(db, goal_uuid, apply, "Draft the essay", age_days=2)
        _stage(db, goal_uuid, "Interviews", start_date=date.today() + timedelta(days=10))
        _stage(db, goal_uuid, "Later", start_date=date.today() + timedelta(days=60))

        model = Wording("milestone")
        notes = check_ins.check_in(db, first, provider=model)
        assert [note.kind for note in notes] == ["milestone", "plan_stage", "stalled"]
        assert [item["key"].split(":")[0] for item in model.prompts[0]["signals"]] == ["milestone", "plan_stage", "stalled"]
        assert model.prompts[0]["goal"]["title"] == "Vet school"
        # The model words what it was asked about; anything else keeps the fixed wording.
        assert (notes[0].title, notes[0].model) == ("Worded by Coach", "test-model")
        assert notes[1].title == "Plan “Interviews”?" and notes[1].model == ""
        assert notes[2].actions[0] == {"id": "a1", "kind": "step", "label": "Open the step", "step_uuid": waiting}

        # Starting the waiting step makes its note go; the milestone note stays.
        goals.change_status(db, _user(LEARNER), goal_uuid, waiting, StepStatusChange(status="in_progress"))
        check_ins.check_in(db, first, provider=model)
        statuses = {note.kind: str(getattr(note.status, "value", note.status)) for note in db.exec(select(CoachNote)).all()}
        assert statuses == {"milestone": "open", "plan_stage": "open", "stalled": "expired"}


def test_the_owner_acts_on_notes_and_they_lead_next_actions_and_mark_the_goal_tab():
    with _session() as db:
        goal_uuid = _goal(db)
        check_ins.check_in(db, _row(db, goal_uuid), datetime.utcnow() + timedelta(hours=2))
        view = goal_notes(db, _user(LEARNER), goal_uuid)
        assert view["cadence"] == "weekly" and len(view["notes"]) == 1
        note = view["notes"][0]
        assert next(item for item in goals.list_my_goals(db, _user(LEARNER)) if item["goal_uuid"] == goal_uuid)["coach_notes"] == 1
        assert next_actions(db, LEARNER)[0] == {
            "kind": "coach_note", "title": note["title"], "reason": note["body"], "tier": 2, "route": f"/plans/{goal_uuid}",
            "goal_uuid": goal_uuid, "note_uuid": note["note_uuid"],
        }
        # Notes are the owner's alone.
        with pytest.raises(HTTPException) as hidden:
            goal_notes(db, _user(OTHER), goal_uuid)
        assert hidden.value.status_code == 404
        with pytest.raises(HTTPException) as unknown:
            act(db, _user(LEARNER), goal_uuid, note["note_uuid"], NoteAction(action_id="a9"))
        assert unknown.value.status_code == 422

        result = act(db, _user(LEARNER), goal_uuid, note["note_uuid"], NoteAction(action_id="a1"))
        assert result["action"]["kind"] == "session" and result["note"]["status"] == "acted"
        with pytest.raises(HTTPException) as again:
            act(db, _user(LEARNER), goal_uuid, note["note_uuid"], NoteAction(action_id="a2"))
        assert again.value.status_code == 409
        assert goal_notes(db, _user(LEARNER), goal_uuid)["notes"] == []
        assert next(item for item in goals.list_my_goals(db, _user(LEARNER)) if item["goal_uuid"] == goal_uuid)["coach_notes"] == 0


def test_the_runner_checks_in_on_due_goals_and_finishing_a_stage_brings_the_next_forward():
    with _session() as db:
        goal_uuid = _goal(db)
        goal = _row(db, goal_uuid)
        stage = goals.get_goal(db, _user(LEARNER), goal_uuid)["stages"][0]["stage_uuid"]
        step = _step(db, goal_uuid, stage, "Visit a clinic")
        goal.next_check_in_at = datetime.utcnow() - timedelta(minutes=1)
        db.add(goal)
        db.commit()
        assert check_ins.run_due(db.get_bind()) == 1
        db.refresh(goal)
        assert goal.next_check_in_at > datetime.utcnow() + timedelta(days=6)
        assert check_ins.due_goals(db, datetime.utcnow()) == []

        goals.change_status(db, _user(LEARNER), goal_uuid, step, StepStatusChange(status="completed"))
        db.refresh(goal)
        assert goal.next_check_in_at <= datetime.utcnow()
        assert [row.goal_uuid for row in check_ins.due_goals(db, datetime.utcnow())] == [goal_uuid]
