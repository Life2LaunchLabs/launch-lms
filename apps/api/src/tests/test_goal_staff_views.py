import pytest
from fastapi import HTTPException

from src.db.goal_admin import StepProgressBulk
from src.db.goals import StepCreate, StepStatus, StepSubmission
from src.services.goals import access, goals, staff_views, structure
from src.services.goals.sharing_roles import _role
from src.tests.test_goal_review import _assigned, _goal
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _session, _status, _step, _user

ESSAY = {"key": "essay", "type": "write", "title": "Essay", "review_required": True, "reviewer_guidance": "Look for a thesis", "config": {"prompt": "Why?"}}
FAIR = {"key": "fair", "type": "task", "title": "Career Fair", "completed_by": "staff"}


def _submit_essay(db, user_id: int) -> str:
    goal = _goal(db, user_id)
    essay = _step(goals.get_goal(db, _user(user_id), goal.goal_uuid), "Essay")
    goals.save_submission(db, _user(user_id), goal.goal_uuid, essay["step_uuid"], StepSubmission(submission={"text": "Draft"}))
    _status(db, user_id, goal, essay, StepStatus.COMPLETED)
    return essay["step_uuid"]


def test_assignments_list_and_matrix_show_each_learner_by_template_step():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        _submit_essay(db, LEARNER)
        listed = staff_views.list_assignments(db, _user(ADMIN), 1)
        assert [item["assignment_uuid"] for item in listed] == [assignment["assignment_uuid"]]
        summary = listed[0]
        assert summary["learner_count"] == 2 and summary["step_count"] == 2 and summary["review_count"] == 1
        assert summary["lifecycle_counts"]["active"] == 2 and summary["cohort"]["name"] == "Fall"
        # Learners don't staff it.
        assert staff_views.list_assignments(db, _user(LEARNER), 1) == []

        goal = _goal(db, OTHER)
        structure.add_step(db, _user(ADMIN), goal.goal_uuid, StepCreate(stage_uuid=goals.get_goal(db, _user(ADMIN), goal.goal_uuid)["stages"][0]["stage_uuid"], type="task", title="Extra"))
        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        assert [step["template_key"] for stage in matrix["stages"] for step in stage["steps"]] == ["essay", "fair"]
        essay_column = matrix["stages"][0]["steps"][0]
        assert essay_column["aggregate"]["review_count"] == 1 and essay_column["aggregate"]["learner_count"] == 2
        rows = {row["id"]: row for row in matrix["learners"]}
        assert rows[LEARNER]["cells"]["essay"]["status"] == "submitted" and rows[LEARNER]["cells"]["fair"]["locked"] is False
        assert rows[LEARNER]["goal_uuid"] == _goal(db, LEARNER).goal_uuid and rows[LEARNER]["custom_steps"] == []
        assert [item["title"] for item in rows[OTHER]["custom_steps"]] == ["Extra"]
        # What staff prepare from, and who else is on each learner's plan.
        assert essay_column["reviewer_guidance"] == "Look for a thesis" and essay_column["config"] == {"prompt": "Why?"} and essay_column["materials"] == []
        assert rows[LEARNER]["people"] == []
        access.add_member(db, _goal(db, LEARNER), OTHER, _role(db, _goal(db, LEARNER), "commenter"))
        db.commit()
        rows = {row["id"]: row for row in staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])["learners"]}
        assert [(person["id"], person["role"]) for person in rows[LEARNER]["people"]] == [(OTHER, "Commenter")] and rows[OTHER]["people"] == []
        # Rows follow goal access: a learner sees only their own.
        assert [row["id"] for row in staff_views.assignment_matrix(db, _user(LEARNER), 1, assignment["assignment_uuid"])["learners"]] == [LEARNER]


def test_bulk_progress_sets_a_template_step_for_many_learners_through_completion():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        done = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="fair", user_ids=[LEARNER, OTHER], staff_note="Attended"))
        assert [item["status"] for item in done] == ["completed", "completed"]
        excused = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(
            template_key="essay", assignment_uuid=assignment["assignment_uuid"], goal_uuids=[_goal(db, LEARNER).goal_uuid], status=StepStatus.EXCUSED, staff_note="Out sick",
        ))
        assert excused[0]["status"] == "excused"
        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        cells = {row["id"]: row["cells"] for row in matrix["learners"]}
        assert cells[LEARNER]["essay"]["status"] == "excused" and cells[LEARNER]["fair"]["completion_method"] == "staff"
        # Excused + completed: the learner's goal is finished.
        assert goals.get_goal(db, _user(LEARNER), _goal(db, LEARNER).goal_uuid)["status"] == "finished"

        # Sending back what was never submitted is skipped, not an error.
        skipped = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="essay", user_ids=[OTHER], status=StepStatus.CHANGES_REQUESTED, staff_note="?"))
        assert skipped[0]["status"] == "skipped"
        with pytest.raises(HTTPException) as not_staff:
            staff_views.update_progress(db, _user(LEARNER), 1, StepProgressBulk(template_key="fair", user_ids=[OTHER]))
        assert not_staff.value.status_code == 403
        with pytest.raises(HTTPException) as unknown:
            staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="nope", user_ids=[OTHER]))
        assert unknown.value.status_code == 404


def test_reviews_cohorts_and_managed_learners():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        essay = _submit_essay(db, LEARNER)
        reviews = staff_views.assignment_reviews(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        assert [item["step_uuid"] for item in reviews["step_reviews"]] == [essay] and reviews["activity_reviews"] == []
        assert reviews["step_reviews"][0]["submission"] == {"text": "Draft"} and reviews["step_reviews"][0]["step"]["title"] == "Essay"
        assert staff_views.assignment_reviews(db, _user(OTHER), 1, assignment["assignment_uuid"])["step_reviews"] == []

        goal_uuid = _goal(db, LEARNER).goal_uuid
        assert [item["step_uuid"] for item in staff_views.goal_reviews(db, _user(ADMIN), 1, goal_uuid)["step_reviews"]] == [essay]
        with pytest.raises(HTTPException):
            staff_views.goal_reviews(db, _user(LEARNER), 1, goal_uuid)

        cohort = staff_views.cohort(db, _user(ADMIN), 1, 1)
        assert cohort["learner_count"] == 2 and [item["assignment_uuid"] for item in cohort["assignments"]] == [assignment["assignment_uuid"]]
        assert cohort["completed_assignments"] == []
        with pytest.raises(HTTPException):
            staff_views.cohort(db, _user(LEARNER), 1, 1)

        managed = staff_views.managed_user(db, _user(ADMIN), 1, LEARNER)
        assert managed["user"]["id"] == LEARNER and managed["assignments"][0]["goal"]["goal_uuid"] == goal_uuid
        assert managed["goals"][0]["progress"] == {"done": 0, "total": 2, "percent": 0}
        assert managed["goals"][0]["people"] == []
        outsider = staff_views.managed_user(db, _user(OTHER), 1, LEARNER)
        assert outsider["assignments"] == [] and outsider["goals"] == []

        # Goal cards show who helps, with their role.
        goal = _goal(db, LEARNER)
        access.add_member(db, goal, OTHER, _role(db, goal, "commenter"))
        db.commit()
        helpers = staff_views.managed_user(db, _user(ADMIN), 1, LEARNER)["goals"][0]["people"]
        assert [(item["id"], item["role"]) for item in helpers] == [(OTHER, "Commenter")]
