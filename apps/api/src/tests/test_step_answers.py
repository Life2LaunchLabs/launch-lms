"""Answers on the step (FEED-147) and more files after hand-in (FEED-217)."""

import pytest
from fastapi import HTTPException

from src.db.goals import StepEntryCreate, StepStatus, StepSubmission
from src.services.goals import entries, goals
from src.tests.test_goals import LEARNER, _issue, _published, _session, _status, _step, _user
from src.tests.test_task_photo import _photo


def test_a_task_that_asks_for_an_answer_takes_it_on_the_step():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Which one sounds cooler?", "config": {"ask": True}}, {"type": "task", "title": "Tidy up"})
        goal = _issue(db, template)
        ask = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Which one sounds cooler?")
        with pytest.raises(HTTPException, match="Answer the question first"):
            _status(db, LEARNER, goal, ask, StepStatus.COMPLETED)
        view = goals.save_submission(db, _user(LEARNER), goal.goal_uuid, ask["step_uuid"], StepSubmission(answer=" The pilot one "))
        ask = _step(view, "Which one sounds cooler?")
        assert ask["answer"] == "The pilot one" and ask["result"] == {"kind": "text", "text": "The pilot one"}
        assert _step(_status(db, LEARNER, goal, ask, StepStatus.COMPLETED), "Which one sounds cooler?")["state"] == "done"


def test_a_handed_in_upload_still_takes_another_file():
    with _session() as db:
        slot = {"key": "poster", "label": "Your poster", "kinds": ["image", "document"]}
        template = _published(db, {"type": "upload", "title": "Poster", "review_required": True, "config": {"slots": [slot]}}, {"type": "task", "title": "Tidy up"})
        goal = _issue(db, template)
        poster = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Poster")
        _photo(db, "asset_photo")
        entries.add_entry(db, _user(LEARNER), goal.goal_uuid, poster["step_uuid"], StepEntryCreate(kind="file", slot="poster", asset_uuid="asset_photo", title="poster.jpg"))
        poster = _step(_status(db, LEARNER, goal, _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Poster"), StepStatus.SUBMITTED), "Poster")
        assert poster["status"] == "submitted"
        _photo(db, "asset_pdf")
        view = entries.add_entry(db, _user(LEARNER), goal.goal_uuid, poster["step_uuid"], StepEntryCreate(kind="file", slot="poster", asset_uuid="asset_pdf", title="poster.pdf"))
        poster = _step(view, "Poster")
        # Still waiting on review, now with both files for the reviewer.
        assert poster["status"] == "submitted" and [entry["title"] for entry in poster["entries"]] == ["poster.jpg", "poster.pdf"]
