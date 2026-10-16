import pytest
from fastapi import HTTPException

from src.db.goals import GoalCreate, StepCreate, StepEntryCreate, StepStatus, StepStatusChange, StepSubmission
from src.db.resources import Resource
from src.services.goals import goals, structure
from src.services.goals.coach_tools import attach_catalog_resources, step_config
from src.services.goals.types import step_type
from src.tests.test_goals import LEARNER, _session, _user


def _explore_session():
    db = _session()
    Resource.__table__.create(db.get_bind())
    db.add(Resource(id=1, org_id=1, resource_uuid="resource_1", title="Trade school guide", resource_type="article",
                    external_url="https://example.com/guide", cover_image_url="https://example.com/guide.png", creation_date="1", update_date="1"))
    db.commit()
    return db


def _steps(view: dict) -> list[dict]:
    return [step for stage in view["stages"] for step in stage["steps"]] + view["unstaged_steps"]


def _explore(db, config: dict | None = None) -> tuple[dict, dict]:
    view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="After school"))
    view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="explore", title="What do trade schools cost?", config=config or {"question": "What do they cost?"}))
    return view, _steps(view)[0]


def _add(db, view: dict, step: dict, **entry) -> dict:
    view = goals.add_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepEntryCreate(**entry))
    return next(item for item in _steps(view) if item["step_uuid"] == step["step_uuid"])


def test_config_is_checked_and_suggestions_must_exist():
    with _explore_session() as db:
        explore = step_type("explore")
        assert explore.validate_config({}) == {"question": "", "suggestions": []}
        with pytest.raises(HTTPException):
            explore.validate_config({"suggestions": [{"resource_uuid": "a"}, {"resource_uuid": "a"}]})
        with pytest.raises(HTTPException):
            _explore(db, {"suggestions": [{"resource_uuid": "missing"}]})
        _, step = _explore(db, {"suggestions": [{"resource_uuid": "resource_1", "title": "Trade school guide"}]})
        assert step["config"]["suggestions"][0]["resource_uuid"] == "resource_1"


def test_evidence_of_any_kind_with_takeaways_then_an_answer_finishes_it():
    with _explore_session() as db:
        view, step = _explore(db)
        assert step["result"] is None and step["state"] == "open"
        step = _add(db, view, step, kind="resource", resource_uuid="resource_1", note="Most programs are under two years")
        entry = step["entries"][0]
        # The resource's title, link and cover are copied from the library, not taken from the client.
        assert entry["title"] == "Trade school guide" and entry["url"] == "https://example.com/guide" and entry["data"]["image"] == "https://example.com/guide.png"
        step = _add(db, view, step, kind="link", url="https://college.example/costs", title="Costs page")
        step = _add(db, view, step, kind="note", note="Ask the counselor about grants")
        assert step["state"] == "started" and step["result"]["count"] == 3 and step["result"]["answer"] == ""
        with pytest.raises(HTTPException) as error:
            goals.change_status(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        assert error.value.detail == "Write your answer first"
        goals.save_submission(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepSubmission(answer="About $5k a year, less with grants."))
        view = goals.change_status(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        step = _steps(view)[0]
        assert step["status"] == "completed" and step["result"]["answer"] == "About $5k a year, less with grants."
        with pytest.raises(HTTPException) as error:
            _add(db, view, step, kind="note", note="Late thought")
        assert error.value.status_code == 409


def test_empty_evidence_is_refused():
    with _explore_session() as db:
        view, step = _explore(db)
        for entry in ({"kind": "note"}, {"kind": "link"}, {"kind": "resource"}, {"kind": "resource", "resource_uuid": "missing"}, {"kind": "log", "title": "x"}):
            with pytest.raises(HTTPException) as error:
                _add(db, view, step, **entry)
            assert error.value.status_code == 422


def test_coach_writes_the_question_and_its_resource_becomes_a_suggestion():
    assert step_config("explore", "Trade schools", {"prompt": "What do they cost?"}) == {"question": "What do they cost?", "suggestions": []}
    operation = {"type": "add_goal_steps", "steps": [{"type": "explore", "title": "Costs", "config": {"question": "What do they cost?"}, "resource_uuid": "resource_1"}]}
    shown = [{"resource_uuid": "resource_1", "title": "Trade school guide", "external_url": "https://example.com/guide"}]
    step = attach_catalog_resources([operation], shown)[0]["steps"][0]
    assert step["config"]["suggestions"] == [{"resource_uuid": "resource_1", "title": "Trade school guide"}] and step["materials"] == []
