"""Grading rules: partial credit, feedback, finishing modes and what happens when a learner doesn't pass."""

import asyncio

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalStep
from src.db.learning import LearningActivity, LearningPage, LearningPageType, LearningRun, LearningRunStatus
from src.db.learning_requests import LearningResponseSubmit
from src.services.goals import goals, review
from src.services.learning import run_decisions, runtime
from src.tests.plan_world import _request
from src.tests.test_goal_review import _assigned, _goal
from src.tests.test_goals import ADMIN, LEARNER, NOW, _session, _step, _user


def _choice(block_id: str, options: list[str], right: list[str], **scoring) -> dict:
    return {
        "id": block_id, "type": "question", "kind": "multiple_choice",
        "content": {"options": [{"id": option, "text": option} for option in options]},
        "scoring": {"mode": "points", "points": 2, "correct_option_ids": right, **scoring},
        "completion": {"min_selections": 1, "max_selections": len(options)},
    }


def _world(db, grading: dict, pages: list[dict]):
    _assigned(db, {"key": "quiz", "type": "activity", "title": "Quiz"})
    goal = _goal(db, LEARNER)
    quiz = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Quiz")
    step = db.exec(select(GoalStep).where(GoalStep.step_uuid == quiz["step_uuid"])).one()
    activity = db.get(LearningActivity, step.activity_id)
    for page in db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all():
        db.delete(page)
    activity.settings = {"grading": grading}
    db.add(activity)
    for index, blocks in enumerate(pages):
        db.add(LearningPage(activity_id=activity.id, org_id=1, page_uuid=f"learning_page_{index}", page_type=LearningPageType.STANDARD, title=f"Page {index}",
                            order=index, content={"version": 2, "blocks": blocks}, creation_date=NOW, update_date=NOW))
    db.commit()
    started = goals.start_activity(db, _user(LEARNER), goal.goal_uuid, quiz["step_uuid"])
    return goal, quiz, started["run"]["run_uuid"]


def _answer(db, run_uuid: str, page: int, block: str, option_ids: list[str]):
    payload = LearningResponseSubmit(run_uuid=run_uuid, page_uuid=f"learning_page_{page}", answer={"questions": {block: {"option_ids": option_ids}}})
    return asyncio.run(runtime.submit_response(_request(), payload, _user(LEARNER), db))


def _attempt(run, page: int) -> dict:
    return [attempt for attempt in run.attempts if attempt["page_uuid"] == f"learning_page_{page}"][-1] if isinstance(run.attempts[0], dict) else \
        [attempt for attempt in run.attempts if attempt.page_uuid == f"learning_page_{page}"][-1].model_dump()


def test_all_or_nothing_and_feedback_after_answering():
    with _session() as db:
        feedback = {"correct": "Yes, both.", "incorrect": "Look again."}
        _, _, run_uuid = _world(db, {}, [[_choice("q", ["a", "b", "c"], ["a", "b"], partial_credit=False, feedback=feedback)]])
        run = _answer(db, run_uuid, 0, "q", ["a"])
        attempt = _attempt(run, 0)
        assert attempt["score"] == 0 and attempt["result"]["feedback_message"] == "Look again."
        run = _answer(db, run_uuid, 0, "q", ["a", "b"])
        attempt = _attempt(run, 0)
        assert attempt["score"] == 2 and attempt["result"]["feedback_message"] == "Yes, both."


def test_finish_mode_completes_without_the_pass_mark():
    with _session() as db:
        _, _, run_uuid = _world(db, {"finish": "complete"}, [[_choice("q", ["a", "b"], ["a"])]])
        run = _answer(db, run_uuid, 0, "q", ["b"])
        assert run.status == LearningRunStatus.COMPLETED and run.navigation["result"]["passed"] is True


def test_redo_missed_reopens_only_the_pages_they_missed():
    with _session() as db:
        goal, quiz, run_uuid = _world(db, {"if_not_passed": "redo_missed", "minimum_score_percent": 100},
                                      [[_choice("q1", ["a", "b"], ["a"])], [_choice("q2", ["a", "b"], ["a"])]])
        _answer(db, run_uuid, 0, "q1", ["a"])
        run = _answer(db, run_uuid, 1, "q2", ["b"])
        result = run.navigation["result"]
        assert result["passed"] is False and result["missed_page_uuids"] == ["learning_page_1"]
        restarted = goals.start_activity(db, _user(LEARNER), goal.goal_uuid, quiz["step_uuid"])["run"]
        assert restarted["navigation"]["current_page_uuid"] == "learning_page_1"
        run = _answer(db, run_uuid, 1, "q2", ["a"])
        assert run.status == LearningRunStatus.COMPLETED


def test_try_again_starts_over():
    with _session() as db:
        goal, quiz, run_uuid = _world(db, {}, [[_choice("q1", ["a", "b"], ["a"])], [_choice("q2", ["a", "b"], ["a"])]])
        _answer(db, run_uuid, 0, "q1", ["b"])
        _answer(db, run_uuid, 1, "q2", ["b"])
        restarted = goals.start_activity(db, _user(LEARNER), goal.goal_uuid, quiz["step_uuid"])["run"]
        assert restarted["navigation"]["current_page_uuid"] == "learning_page_0" and restarted["navigation"]["completed"] == 0


def test_staff_decide_waits_in_the_review_queue_until_staff_pass_it():
    with _session() as db:
        goal, quiz, run_uuid = _world(db, {"if_not_passed": "staff_decide"}, [[_choice("q", ["a", "b"], ["a"])]])
        run = _answer(db, run_uuid, 0, "q", ["b"])
        assert run.status != LearningRunStatus.COMPLETED and run.navigation["result"]["awaiting_staff_decision"]
        state = lambda: _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Quiz")["state"]  # noqa: E731
        assert state() == "waiting"

        inbox = review.inbox(db, _user(ADMIN), 1)
        assert inbox["counts"]["grade"] == 1

        with pytest.raises(HTTPException) as denied:
            asyncio.run(run_decisions.decide_run(_request(), run_uuid, True, "", _user(LEARNER), db))
        assert denied.value.status_code == 403
        decided = asyncio.run(run_decisions.decide_run(_request(), run_uuid, True, "Close enough.", _user(ADMIN), db))
        assert decided["status"] == LearningRunStatus.COMPLETED and decided["navigation"]["result"]["passed_by_staff"]
        assert state() == "done"
        assert review.inbox(db, _user(ADMIN), 1)["counts"]["grade"] == 0


def test_staff_can_ask_them_to_try_again():
    with _session() as db:
        goal, quiz, run_uuid = _world(db, {"if_not_passed": "staff_decide"}, [[_choice("q", ["a", "b"], ["a"])]])
        _answer(db, run_uuid, 0, "q", ["b"])
        decided = asyncio.run(run_decisions.decide_run(_request(), run_uuid, False, "Have another go.", _user(ADMIN), db))
        assert decided["navigation"]["current_page_uuid"] == "learning_page_0"
        run = db.exec(select(LearningRun).where(LearningRun.run_uuid == run_uuid)).one()
        assert run.status == LearningRunStatus.IN_PROGRESS
        _answer(db, run_uuid, 0, "q", ["a"])
        db.refresh(run)
        assert run.status == LearningRunStatus.COMPLETED
