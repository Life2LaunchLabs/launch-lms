import pytest
from fastapi import HTTPException

from src.db.goals import StepStatus
from src.db.resources import Resource
from src.services.goals import entries, goals
from src.services.goals.types import step_type
from src.services.goals.types.resources import StepResourceVisit
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _issue, _published, _session, _status, _step, _user


def _resource_session():
    db = _session()
    Resource.__table__.create(db.get_bind())
    db.add_all([
        Resource(id=1, org_id=1, resource_uuid="resource_1", title="Trade school guide", resource_type="article", description="What trade school costs",
                 external_url="https://example.com/guide", creation_date="1", update_date="1"),
        Resource(id=2, org_id=1, resource_uuid="resource_2", title="Paying for college", resource_type="video",
                 external_url="https://example.com/video", creation_date="1", update_date="1"),
    ])
    db.commit()
    return db


PICKS = [{"resource_uuid": "resource_1", "title": "Trade school guide"}, {"resource_uuid": "resource_2", "title": "Paying for college"}]


def _goal(db, **step):
    return _issue(db, _published(db, {"type": "resources", "title": "Check these out", "config": {"resources": PICKS}, **step}))


def _visit(db, user, goal, resource_uuid, **payload):
    view = goals.get_goal(db, _user(user), goal.goal_uuid)
    view = entries.visit_resource(db, _user(user), goal.goal_uuid, _step(view, "Check these out")["step_uuid"], resource_uuid, StepResourceVisit(**payload))
    return _step(view, "Check these out")


def test_config_needs_resources_that_exist_once_each():
    with _resource_session() as db:
        kind = step_type("resources")
        assert kind.validate_config({"resources": PICKS}) == {"resources": PICKS, "required": 0}
        for bad in ({}, {"resources": []}, {"resources": [PICKS[0], PICKS[0]]}, {"resources": PICKS, "required": 3}):
            with pytest.raises(HTTPException):
                kind.validate_config(bad)
        with pytest.raises(HTTPException):
            _published(db, {"type": "resources", "title": "Check these out", "config": {"resources": [{"resource_uuid": "missing"}]}})


def test_opening_every_resource_finishes_a_learner_step_and_staff_see_opens_and_notes():
    with _resource_session() as db:
        goal = _goal(db)
        step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Check these out")
        # The card gets each resource's link and type, not just the title the template saved.
        assert [item["url"] for item in step["reference"]["resources"]] == ["https://example.com/guide", "https://example.com/video"]
        with pytest.raises(HTTPException) as error:
            _status(db, LEARNER, goal, step, StepStatus.COMPLETED)
        assert error.value.detail == "Open 2 more first"

        step = _visit(db, LEARNER, goal, "resource_1", opened=True)
        assert step["status"] == "in_progress" and step["result"]["opened"] == 1
        step = _visit(db, LEARNER, goal, "resource_1", opened=True)
        entry = step["entries"][0]
        assert entry["data"]["opens"] == 2 and entry["data"]["first_opened_at"] and entry["title"] == "Trade school guide"
        step = _visit(db, LEARNER, goal, "resource_2", note="Grants cover most of it")
        # A note alone isn't an open.
        assert step["status"] == "in_progress" and step["result"] == {"kind": "resources", "opened": 1, "total": 2, "needed": 2, "notes": 1}
        step = _visit(db, LEARNER, goal, "resource_2", opened=True)
        assert step["status"] == "completed" and step["completion_method"] == "auto"

        staff_view = _step(goals.get_goal(db, _user(ADMIN), goal.goal_uuid), "Check these out")
        notes = {entry["resource_uuid"]: entry["note"] for entry in staff_view["entries"]}
        assert notes == {"resource_1": "", "resource_2": "Grants cover most of it"}
        # Notes stay theirs after it's done.
        assert _visit(db, LEARNER, goal, "resource_1", note="Ask about welding")["entries"][0]["note"] == "Ask about welding"


def test_required_count_and_staff_steps():
    with _resource_session() as db:
        goal = _goal(db, config={"resources": PICKS, "required": 1})
        assert _visit(db, LEARNER, goal, "resource_2", opened=True)["status"] == "completed"

    with _resource_session() as db:
        goal = _goal(db, completed_by="staff")
        step = _visit(db, LEARNER, goal, "resource_1", opened=True)
        step = _visit(db, LEARNER, goal, "resource_2", opened=True, note="Watched it twice")
        # Staff finish this one, however much was opened.
        assert step["status"] == "in_progress" and step["result"]["opened"] == 2
        with pytest.raises(HTTPException):
            _status(db, LEARNER, goal, step, StepStatus.COMPLETED)
        assert _step(_status(db, ADMIN, goal, step, StepStatus.COMPLETED), "Check these out")["status"] == "completed"


def test_only_the_learner_records_opens_and_only_for_the_steps_resources():
    with _resource_session() as db:
        goal = _goal(db)
        with pytest.raises(HTTPException) as error:
            _visit(db, ADMIN, goal, "resource_1", opened=True)
        assert error.value.status_code == 403
        with pytest.raises(HTTPException) as error:
            _visit(db, OTHER, goal, "resource_1", opened=True)
        assert error.value.status_code == 404
        with pytest.raises(HTTPException) as error:
            _visit(db, LEARNER, goal, "resource_9", opened=True)
        assert error.value.status_code == 404
        assert _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Check these out")["entries"] == []
