"""Where an assignment's learners are (done, review, behind, open, locked) and what needs staff."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from src.db.goal_templates import StepSchedule
from src.db.goals import StepStatus, StepSubmission
from src.services.connect import chats
from src.services.goals import assignment_views, assignments, goals
from src.services.school import chats as school_chats
from src.tests.test_goal_assignments_admin import COACH, ESSAY, VISIT, _assign, _goal, _goal_step, _session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _user

TODAY = date.today()
LATER = {"key": "later", "type": "task", "title": "Later"}


def _two_stages(db):
    from src.services.goals import templates

    created = templates.create_template(db, _user(ADMIN), 1, {"template": {"title": "Senior year"}, "stages": [
        {"key": "now", "title": "Now", "steps": [dict(ESSAY), dict(VISIT, due_week=None)]},
        {"key": "next", "title": "Next", "steps": [LATER]},
    ]})
    templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
    return created["template_uuid"]


def _steps(detail: dict) -> dict:
    return {step["key"]: step for stage in detail["stages"] for step in stage["steps"]}


def test_learners_steps_are_done_review_behind_open_or_locked():
    with _session() as db:
        from src.db.goal_templates import AssignmentSchedule, GoalAssignmentRequest, StageSchedule

        uuid = assignments.assign(db, _user(ADMIN), 1, _two_stages(db), GoalAssignmentRequest(
            usergroup_id=1, due_date=TODAY + timedelta(days=60),
            schedule=AssignmentSchedule(stages=[StageSchedule(stage_key="now", start_date=TODAY - timedelta(days=10)),
                                                StageSchedule(stage_key="next", start_date=TODAY + timedelta(days=30))],
                                        steps=[StepSchedule(step_key="visit", due_date=TODAY - timedelta(days=1))]),
        ))["assignment_uuid"]
        for learner in (LEARNER, OTHER):
            goals.respond(db, _user(learner), _goal(db, learner, uuid).goal_uuid, True)
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.SUBMITTED)
        _status(db, LEARNER, mine, {"step_uuid": _goal_step(db, mine, "visit").step_uuid}, StepStatus.COMPLETED)

        detail = assignment_views.assignment_detail(db, _user(ADMIN), 1, uuid)
        steps = _steps(detail)
        assert steps["essay"]["counts"] == {"done": 0, "review": 1, "behind": 0, "open": 1, "locked": 0}
        assert steps["essay"]["who"]["review"] == [LEARNER]
        assert steps["visit"]["counts"] == {"done": 1, "review": 0, "behind": 1, "open": 0, "locked": 0}
        assert steps["visit"]["who"]["behind"] == [OTHER] and steps["visit"]["own"] is True
        assert steps["later"]["counts"]["locked"] == 2
        assert [stage["counts"] for stage in detail["stages"]] == [
            {"done": 1, "review": 1, "behind": 1, "open": 1, "locked": 0}, {"done": 0, "review": 0, "behind": 0, "open": 0, "locked": 2}]
        assert detail["counts"] == {"done": 1, "review": 1, "behind": 1, "open": 1, "locked": 2}
        assert detail["needs"] == {"questions": 0, "review": 1, "behind": 1}
        assert detail["scheduled"] is True and detail["target"]["type"] == "group" and detail["can_manage"] is True
        assert detail["stages"][0]["end_date"] == TODAY + timedelta(days=29)

        people = {row["person"]["id"]: row for row in assignment_views.assignment_people(db, _user(ADMIN), 1, uuid)["learners"]}
        assert people[LEARNER]["needs"] == {"questions": 0, "review": 1, "behind": 0} and people[LEARNER]["progress_percent"] == 33
        assert people[OTHER]["needs"] == {"questions": 0, "review": 0, "behind": 1}

        listed = assignment_views.list_assignments(db, _user(ADMIN), 1)
        assert [row["assignment_uuid"] for row in listed] == [uuid] and listed[0]["needs"] == detail["needs"]


def test_ended_assignments_leave_unfinished_work_behind_and_self_paced_never_falls_behind():
    with _session() as db:
        uuid = _assign(db, ESSAY, dict(VISIT, due_week=None))["assignment_uuid"]
        assert assignment_views.assignment_detail(db, _user(ADMIN), 1, uuid)["counts"] == {"done": 0, "review": 0, "behind": 0, "open": 4, "locked": 0}
        assignments.end(db, _user(ADMIN), 1, uuid)
        assert assignment_views.assignment_detail(db, _user(ADMIN), 1, uuid)["counts"]["behind"] == 4


def test_unread_learner_questions_need_staff_until_they_read_them():
    with _session() as db:
        uuid = _assign(db, ESSAY)["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        feed = school_chats.find(db, 1, LEARNER)
        assert feed is not None
        chats.mark_read(db, _user(ADMIN), feed.conversation_uuid)
        chats.send(db, _user(LEARNER), feed.conversation_uuid, "How long should it be?",
                   scope={"goal_uuid": mine.goal_uuid, "step_uuid": _goal_step(db, mine, "essay").step_uuid})
        detail = assignment_views.assignment_detail(db, _user(ADMIN), 1, uuid)
        assert detail["needs"]["questions"] == 1 and _steps(detail)["essay"]["questions"] == 1
        people = {row["person"]["id"]: row for row in assignment_views.assignment_people(db, _user(ADMIN), 1, uuid)["learners"]}
        assert people[LEARNER]["needs"]["questions"] == 1
        chats.mark_read(db, _user(ADMIN), feed.conversation_uuid)
        assert assignment_views.assignment_detail(db, _user(ADMIN), 1, uuid)["needs"]["questions"] == 0


def test_staff_see_only_assignments_they_are_on():
    with _session() as db:
        uuid = _assign(db, ESSAY)["assignment_uuid"]
        from sqlmodel import select

        from src.db.user_organizations import UserOrganization

        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == COACH)).one()
        membership.role_id = 4  # a learner, not staff
        db.add(membership)
        db.commit()
        assert assignment_views.list_assignments(db, _user(COACH), 1) == []
        with pytest.raises(HTTPException) as hidden:
            assignment_views.assignment_detail(db, _user(COACH), 1, uuid)
        assert hidden.value.status_code == 404
