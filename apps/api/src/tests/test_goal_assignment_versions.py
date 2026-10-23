"""Moving an assignment to another template version changes only steps nobody started. A version published
without going live reaches an assignment only when an admin applies it; going live moves active assignments."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goal_templates import AssignmentCollaborator, GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, StepStatus
from src.services.goals import assignment_versions, assignments, goals, templates
from src.tests.test_goal_assignments_admin import _session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _user

V1 = {
    "template": {"title": "Launch"},
    "stages": [
        {"key": "prep", "title": "Prepare", "steps": [
            {"key": "draft", "type": "task", "title": "Draft"},
            {"key": "read", "type": "task", "title": "Read"},
            {"key": "old", "type": "task", "title": "Old step"},
        ]},
        {"key": "do", "title": "Do", "steps": [{"key": "act", "type": "task", "title": "Act"}]},
    ],
}


def _v2() -> dict:
    document = deepcopy(V1)
    prep = document["stages"][0]["steps"]
    prep[0]["title"], prep[1]["title"] = "Draft v2", "Read v2"
    document["stages"][0]["steps"] = [prep[0], prep[1], {"key": "new", "type": "task", "title": "New step"}]
    document["stages"].append({"key": "wrap", "title": "Wrap up", "steps": [{"key": "reflect", "type": "task", "title": "Reflect", "after": ["act"]}]})
    return document


def _world(db):
    created = templates.create_template(db, _user(ADMIN), 1, V1)
    uuid = created["template_uuid"]
    templates.publish(db, _user(ADMIN), 1, uuid, "First")
    result = assignments.assign(db, _user(ADMIN), 1, uuid, GoalAssignmentRequest(usergroup_id=1, collaborators=[AssignmentCollaborator(user_id=ADMIN)]))
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
    plans = {}
    for learner in (LEARNER, OTHER):
        goal = db.exec(select(Goal).where(Goal.assignment_id == assignment.id, Goal.subject_user_id == learner)).one()
        goals.respond(db, _user(learner), goal.goal_uuid, True)
        plans[learner] = goal
    return uuid, result["assignment_uuid"], plans


def _steps(db, goal: Goal) -> dict[str, tuple[str, str]]:
    """Template key -> (title, stage key) on a learner's plan."""
    stages = {stage.id: stage.template_key for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}
    return {step.template_key: (step.title, stages.get(step.stage_id)) for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}


def _view_step(db, goal: Goal, key: str) -> dict:
    step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == key)).one()
    return {"step_uuid": step.step_uuid}


def test_a_version_that_isnt_live_changes_nothing_until_an_admin_reviews_and_applies_it():
    with _session() as db:
        uuid, assignment_uuid, plans = _world(db)
        draft_uuid = _view_step(db, plans[LEARNER], "draft")
        _status(db, LEARNER, plans[LEARNER], draft_uuid, StepStatus.IN_PROGRESS)
        _status(db, LEARNER, plans[LEARNER], _view_step(db, plans[LEARNER], "old"), StepStatus.COMPLETED)

        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        published = templates.publish(db, _user(ADMIN), 1, uuid, "Second", make_live=False)
        assert published["moved"] is None and published["live_version"]["number"] == 1
        assert _steps(db, plans[OTHER])["draft"] == ("Draft", "prep") and "new" not in _steps(db, plans[OTHER])

        review = assignment_versions.version_changes(db, _user(ADMIN), 1, assignment_uuid, published["versions"][0]["version_uuid"])
        assert (review["current"]["number"], review["target"]["number"], review["open_plans"], review["has_changes"]) == (1, 2, 2, True)
        stages = {stage["stage_key"]: stage for stage in review["stages"]}
        assert stages["do"]["change"] == "same" and stages["wrap"]["change"] == "added"
        prep = {step["step_key"]: step for step in stages["prep"]["steps"]}
        assert {key: step["change"] for key, step in prep.items()} == {"draft": "changed", "read": "changed", "new": "added", "old": "removed"}
        assert prep["draft"]["fields"] == ["title"] and prep["draft"]["started_count"] == 1 and prep["old"]["started_count"] == 1 and prep["read"]["started_count"] == 0

        with pytest.raises(HTTPException) as not_admin:
            assignment_versions.apply_version(db, _user(LEARNER), 1, assignment_uuid, review["target"]["version_uuid"])
        assert not_admin.value.status_code == 403
        applied = assignment_versions.apply_version(db, _user(ADMIN), 1, assignment_uuid, review["target"]["version_uuid"])
        assert applied["applied"] == {"plans": 2, "rewritten": 3, "added": 4, "removed": 1, "kept_started": 2}
        assert (applied["version"], applied["update_available"]) == (2, False)

        # The learner who started keeps their started and finished steps as they were; everything else moved.
        mine, theirs = _steps(db, plans[LEARNER]), _steps(db, plans[OTHER])
        assert mine["draft"] == ("Draft", "prep") and mine["old"] == ("Old step", "prep")
        assert mine["read"] == ("Read v2", "prep") and mine["new"] == ("New step", "prep") and mine["reflect"] == ("Reflect", "wrap")
        assert theirs["draft"] == ("Draft v2", "prep") and "old" not in theirs and theirs["reflect"] == ("Reflect", "wrap")
        kept = db.exec(select(GoalStep).where(GoalStep.goal_id == plans[LEARNER].id, GoalStep.template_key == "draft")).one()
        assert kept.step_uuid == draft_uuid["step_uuid"]
        view = goals.get_goal(db, _user(LEARNER), plans[LEARNER].goal_uuid)
        statuses = {step["title"]: step["status"] for stage in view["stages"] for step in stage["steps"]}
        assert statuses["Draft"] == "in_progress" and statuses["Old step"] == "completed" and statuses["New step"] == "not_started"
        reflect = db.exec(select(GoalStep).where(GoalStep.goal_id == plans[OTHER].id, GoalStep.template_key == "reflect")).one()
        act = db.exec(select(GoalStep).where(GoalStep.goal_id == plans[OTHER].id, GoalStep.template_key == "act")).one()
        assert reflect.after_step_uuids == [act.step_uuid]
        assert {db.get(Goal, goal.id).version_id for goal in plans.values()} == {db.exec(select(GoalAssignment)).one().version_id}

        with pytest.raises(HTTPException) as same:
            assignment_versions.apply_version(db, _user(ADMIN), 1, assignment_uuid, review["target"]["version_uuid"])
        assert same.value.status_code == 409


def test_ended_assignments_keep_their_version():
    with _session() as db:
        uuid, assignment_uuid, _ = _world(db)
        assignments.end(db, _user(ADMIN), 1, assignment_uuid)
        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        published = templates.publish(db, _user(ADMIN), 1, uuid, "Second")
        assert published["moved"]["assignments"] == 0
        assert assignments.list_assignments(db, _user(ADMIN), 1, uuid)[0]["version"] == 1
        with pytest.raises(HTTPException) as ended:
            assignment_versions.apply_version(db, _user(ADMIN), 1, assignment_uuid, assignment_versions.version_changes(db, _user(ADMIN), 1, assignment_uuid)["target"]["version_uuid"])
        assert ended.value.status_code == 409
