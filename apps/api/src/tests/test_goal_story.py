"""A finished goal's story: written from the goal, served as an activity, rewritten only when the goal changes."""

from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalCreate, GoalStage, GoalStatus, GoalStep, GoalStory, StepProgress, StepStatus
from src.services.goals import goals, launch, story
from src.services.learning_documents.document import prepare_document
from src.tests.test_goals import LEARNER, OTHER, _session, _user


class _Writer:
    def __init__(self, text: str):
        self.text, self.calls = text, 0

    async def respond(self, messages, safety_identifier):
        self.calls += 1
        return SimpleNamespace(text=self.text, model="test-model")


def _finished_goal(db) -> Goal:
    goal = goals.new_personal_goal(db, _user(LEARNER), GoalCreate(title="Run a 10k", description="I want to feel strong again", org_id=1))
    goal.start_date = date.today() - timedelta(weeks=3)
    stage = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).one()
    stage.title, stage.milestone = "Base", "Ran 5k without stopping"
    db.add(stage)
    finished = datetime.utcnow()
    for position, (kind, title, config, submission) in enumerate([
        ("task", "Buy shoes", {}, {}),
        ("task", "Run three times", {}, {}),
        ("decision", "Pick a race", {"question": "Which race?", "options": [{"key": "city", "label": "City 10k"}]}, {"choices": ["city"]}),
    ]):
        step = GoalStep(step_uuid=f"step_{position}", goal_id=int(goal.id), stage_id=stage.id, position=position, type=kind, title=title, config=config)
        db.add(step)
        db.flush()
        db.add(StepProgress(progress_uuid=f"progress_{position}", step_id=int(step.id), status=StepStatus.COMPLETED, submission=submission,
                            completed_at=finished - timedelta(weeks=2 - min(position, 2))))
    goal.status, goal.finished_at = GoalStatus.FINISHED, finished
    goal.finish = {"reached": "yes", "what_happened": "I ran the whole thing and smiled at the end."}
    db.add(goal)
    db.commit()
    return goal


def test_a_finished_goal_gets_its_story_as_an_activity():
    with _session() as db:
        goal = _finished_goal(db)
        stats = story.goal_stats(db, goal)
        assert (stats["steps_done"], stats["weeks"], stats["decisions"], stats["stages_done"]) == (3, 4, 1, 1)
        assert sum(stats["weekly"]) == 3 and len(stats["weekly"]) == len(stats["weekly_labels"]) == 4

        writer = _Writer('{"open": "Three weeks back, a pair of shoes.", "close": "You turned three runs into a race."}')
        written = story.ensure_story(db, goal, writer)
        assert written.status == "ready" and written.version == 1 and writer.calls == 1
        kinds = [slide["kind"] for slide in written.slides]
        assert kinds == ["open", "stats", "chart", "milestones", "decisions", "quote", "medal"]
        assert written.slides[0]["line"] == "Three weeks back, a pair of shoes."
        assert written.slides[4]["items"] == [{"question": "Which race?", "choice": "City 10k"}]
        assert written.slides[5]["text"].startswith("I ran the whole thing")

        # The served activity is a valid Activity Document with the story blocks, timed except the last page.
        document = story.story_document(goal, written)
        prepared = prepare_document(document, existing_page_uuids={page["page_uuid"] for page in document["pages"]}, allow_system_blocks=False)
        assert prepared.ok, prepared.errors
        types = {block["type"] for page in document["pages"] for block in page["content"]["blocks"]}
        assert {"stat", "chart", "quote", "medal"} <= types
        assert all(page["design"].get("auto_advance_ms") for page in document["pages"][:-1]) and document["pages"][-1]["required"]

        # Asking again reuses the story; a change to the goal writes a new version.
        assert story.ensure_story(db, goal, writer).story_uuid == written.story_uuid and writer.calls == 1
        goal.title = "Run my first 10k"
        db.add(goal)
        db.commit()
        rewritten = story.ensure_story(db, goal)
        assert rewritten.version == 2 and rewritten.status == "fallback" and rewritten.slides[0]["title"] == "Run my first 10k"
        assert len(db.exec(select(GoalStory).where(GoalStory.goal_id == goal.id)).all()) == 2


def test_only_a_finished_goal_its_learner_can_see_has_a_story():
    with _session() as db:
        goal = _finished_goal(db)
        served = story.view(db, _user(LEARNER), goal.goal_uuid)
        assert served["activity"]["pages"][-1]["content"]["action_label"] == "Done" and served["story"]["status"] == "fallback"
        with pytest.raises(HTTPException):
            story.view(db, _user(OTHER), goal.goal_uuid)
        goal.status = GoalStatus.ACTIVE
        db.add(goal)
        db.commit()
        with pytest.raises(HTTPException) as error:
            story.view(db, _user(LEARNER), goal.goal_uuid)
        assert error.value.status_code == 409


def test_activities_in_a_goal_can_show_its_numbers():
    with _session() as db:
        started = launch.start(db, _user(LEARNER), org_id=1)
        variables = started["run"]["render_context"]["variables"]
        assert variables["goal.title"] == "New goal" and variables["goal.stats.steps_done"] == 0 and variables["goal.stats.weeks"] == 1
