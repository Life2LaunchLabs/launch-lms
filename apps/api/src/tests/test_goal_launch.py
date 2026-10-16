"""The launch flow: a draft goal set up by playing the launch activity, its answers landing on the goal."""

import asyncio

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalStage, GoalStep
from src.db.learning_requests import LearningPageComplete, LearningResponseSubmit
from src.services.goals import check_ins, goals, launch
from src.services.learning import runtime
from src.tests.test_badge_marketplace import _request
from src.tests.test_goals import LEARNER, OTHER, _published, _session, _user

P = "learning_page_launch_"


def _submit(db, run_uuid, key, answer, button=None):
    payload = LearningResponseSubmit(run_uuid=run_uuid, page_uuid=P + key, answer=answer, **({"button": button} if button else {}))
    return asyncio.run(runtime.submit_response(_request(), payload, _user(LEARNER), db))


def _goal(db, goal_uuid) -> Goal:
    db.expire_all()
    return db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()


def test_answers_land_on_a_draft_goal_and_finishing_applies_the_chosen_template():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Visit three campuses"})
        started = launch.start(db, _user(LEARNER), org_id=1)
        goal_uuid, run_uuid = started["goal"]["goal_uuid"], started["run"]["run_uuid"]
        assert started["goal"]["status"] == "draft" and len(started["activity"]["pages"]) == 7
        assert [row.goal_uuid for row in check_ins.due_goals(db, check_ins.datetime.utcnow())] == []
        # Starting again on the same draft resumes the same run.
        assert launch.start(db, _user(LEARNER), goal_uuid=goal_uuid)["run"]["run_uuid"] == run_uuid

        _submit(db, run_uuid, "title", {"inputs": {"title": {"text": "Get into  college"}}})
        _submit(db, run_uuid, "why", {"inputs": {"why": {"text": "First in my family"}}})
        _submit(db, run_uuid, "size", {"option_ids": ["year"]})
        _submit(db, run_uuid, "start", {"option_ids": ["started"]})
        _submit(db, run_uuid, "help", {"option_ids": ["steer"]})
        goal = _goal(db, goal_uuid)
        assert (goal.title, goal.description, goal.coach_cadence, goal.status) == ("Get into college", "First in my family", "monthly", "draft")
        assert goal.details == {"size": "year", "starting_point": "started"}

        # The template question offers the org's templates, ranked by the goal's wording.
        picks = launch.learner_templates(db, _user(LEARNER), goal_uuid)
        assert [item["title"] for item in picks["templates"]] == ["College ready"] and picks["templates"][0]["step_count"] == 1
        assert launch.learner_templates(db, _user(LEARNER), goal_uuid, q="bakery")["templates"] == []
        with pytest.raises(HTTPException):
            launch.learner_templates(db, _user(OTHER), goal_uuid)
        _submit(db, run_uuid, "template", {"option_ids": [template.template_uuid]})
        assert _goal(db, goal_uuid).details["template_uuid"] == template.template_uuid

        asyncio.run(runtime.complete_page(_request(), LearningPageComplete(run_uuid=run_uuid, page_uuid=P + "ready"), _user(LEARNER), db))
        goal = _goal(db, goal_uuid)
        assert goal.status == "active" and goal.source == "template" and goal.next_check_in_at is not None
        stages = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position)).all()
        assert [stage.title for stage in stages] == ["Apply"]
        assert [step.title for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()] == ["Visit three campuses"]


def test_start_blank_drops_a_picked_template_and_the_exit_still_finishes():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Visit three campuses"})
        started = launch.start(db, _user(LEARNER), org_id=1)
        goal_uuid, run_uuid = started["goal"]["goal_uuid"], started["run"]["run_uuid"]
        _submit(db, run_uuid, "template", {"option_ids": [template.template_uuid]}, button=launch.BLANK_BUTTON)
        assert "template_uuid" not in _goal(db, goal_uuid).details
        # The exit jumps to the last page: finishing it makes the goal active with what it has.
        asyncio.run(runtime.complete_page(_request(), LearningPageComplete(run_uuid=run_uuid, page_uuid=P + "ready"), _user(LEARNER), db))
        goal = _goal(db, goal_uuid)
        assert goal.status == "active" and goal.title == "New goal" and goal.source == "none"
        assert [stage.title for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()] == ["Getting started"]
        with pytest.raises(HTTPException) as done:
            launch.start(db, _user(LEARNER), goal_uuid=goal_uuid)
        assert done.value.status_code == 409


def test_goal_answers_need_the_learners_own_goal_and_known_values():
    with _session() as db:
        started = launch.start(db, _user(LEARNER), org_id=1)
        run = launch._run(db, _goal(db, started["goal"]["goal_uuid"]), launch.launch_activity(db))
        applied, skipped = launch.apply_variables(db, run, [
            {"target": "goal.size", "value": "huge"}, {"target": "goal.template", "value": "goal_template_nope"},
            {"target": "goal.owner_user_id", "value": 3}, {"target": "goal.title", "value": "  "},
        ])
        assert applied == [] and [item["reason"] for item in skipped] == ["Unknown size", "That template isn't available", "Unknown goal field", "A goal needs a title"]
        with pytest.raises(HTTPException):
            launch.view(db, _user(OTHER), started["goal"]["goal_uuid"])
        # Drafts are listed so they can be finished.
        assert next(item for item in goals.list_my_goals(db, _user(LEARNER)) if item["goal_uuid"] == started["goal"]["goal_uuid"])["status"] == "draft"


def test_the_launch_activity_is_a_valid_activity_document():
    from src.services.learning_documents.document import prepare_document

    document = launch.launch_data()["steps"][0]["document"]
    prepared = prepare_document(document, existing_page_uuids={page["page_uuid"] for page in document["pages"]}, allow_system_blocks=True)
    assert prepared.ok, prepared.errors
