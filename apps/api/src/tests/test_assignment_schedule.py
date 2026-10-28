"""An assignment's schedule: self-paced or on a schedule, steps' own dates, open early and allow late."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goal_templates import AssignmentCollaborator, AssignmentScheduleSave, GoalAssignmentUpdate, StepSchedule
from src.db.goals import GoalAssignment
from src.db.user_organizations import UserOrganization
from src.services.goals import assignments, goals
from src.services.goals.availability import availability
from src.tests.test_goal_assignments_admin import COACH, ESSAY, VISIT, _assign, _goal, _goal_step, _session
from src.tests.test_goals import ADMIN, LEARNER, _user

TODAY = date.today()


def _lock(db, goal, key: str) -> dict:
    stages, steps, progress, _ = goals._structure(db, goal)
    step = next(item for item in steps if item.template_key == key)
    return availability(goal, stages, steps, {k: getattr(v.status, "value", v.status) for k, v in progress.items()})[int(step.id)]


def test_self_paced_needs_no_end_but_a_schedule_does():
    with _session() as db:
        uuid = _assign(db, ESSAY, VISIT)["assignment_uuid"]
        # Self-paced: no dates at all, or just an end.
        assert assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(start_date=TODAY))["due_date"] is None
        with pytest.raises(HTTPException, match="needs an end date"):
            assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
                start_date=TODAY, steps=[StepSchedule(step_key="essay", due_date=TODAY + timedelta(days=7))]))
        with pytest.raises(HTTPException, match="due before it starts"):
            assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
                start_date=TODAY, due_date=TODAY + timedelta(days=30),
                steps=[StepSchedule(step_key="essay", start_date=TODAY + timedelta(days=7), due_date=TODAY + timedelta(days=6))]))


def test_saving_the_schedule_moves_every_learners_step():
    with _session() as db:
        uuid = _assign(db, ESSAY, VISIT)["assignment_uuid"]
        start, due = TODAY + timedelta(days=3), TODAY + timedelta(days=10)
        saved = assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
            start_date=TODAY, due_date=TODAY + timedelta(days=30),
            steps=[StepSchedule(step_key="essay", start_date=start, due_date=due, allow_late=False)]))
        assert saved["schedule"]["steps"] == [{"step_key": "essay", "start_date": start.isoformat(), "due_date": due.isoformat(),
                                               "open_early": True, "allow_late": False}]
        step = _goal_step(db, _goal(db, LEARNER, uuid), "essay")
        assert (step.start_date, step.due_date, step.open_early, step.allow_late) == (start, due, True, False)
        # Open early (the default): open now even though it starts in three days.
        assert _lock(db, _goal(db, LEARNER, uuid), "essay") == {"locked": False, "reason": None}
        # Locked until the start date when it may not open early.
        assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
            start_date=TODAY, due_date=TODAY + timedelta(days=30), steps=[StepSchedule(step_key="essay", start_date=start, due_date=due, open_early=False)]))
        assert _lock(db, _goal(db, LEARNER, uuid), "essay")["reason"] == {"kind": "opens", "date": start.isoformat()}
        # Back to self-paced: the step follows its stage again.
        assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(start_date=TODAY))
        step = _goal_step(db, _goal(db, LEARNER, uuid), "essay")
        assert (step.start_date, step.due_date, step.open_early) == (None, None, True)


def test_a_step_taking_no_late_work_closes_at_its_due_date():
    with _session() as db:
        uuid = _assign(db, ESSAY, VISIT)["assignment_uuid"]
        past = TODAY - timedelta(days=1)
        assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
            start_date=TODAY - timedelta(days=20), due_date=TODAY + timedelta(days=20),
            steps=[StepSchedule(step_key="essay", due_date=past, allow_late=False), StepSchedule(step_key="visit", due_date=past)]))
        goal = _goal(db, LEARNER, uuid)
        assert _lock(db, goal, "essay") == {"locked": True, "reason": {"kind": "closed", "date": past.isoformat()}}
        assert not _lock(db, goal, "visit")["locked"]  # late work allowed
        with pytest.raises(HTTPException) as closed:
            goals._require_open(db, goal, _goal_step(db, goal, "essay"))
        assert closed.value.detail["message"] == "This step has closed"


def test_a_lead_saves_the_schedule_and_the_old_step_due_route_still_works():
    with _session() as db:
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == COACH)).one()
        membership.permissions = ["review_work"]
        db.add(membership)
        db.commit()
        uuid = _assign(db, ESSAY, VISIT)["assignment_uuid"]
        with pytest.raises(HTTPException) as outsider:
            assignments.save_schedule(db, _user(COACH), 1, uuid, AssignmentScheduleSave(start_date=TODAY))
        assert outsider.value.status_code == 403
        assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[AssignmentCollaborator(user_id=COACH, role_key="lead")]))
        assignments.save_schedule(db, _user(COACH), 1, uuid, AssignmentScheduleSave(start_date=TODAY, due_date=TODAY + timedelta(days=30)))
        result = assignments.set_step_due(db, _user(COACH), 1, uuid, "visit", TODAY + timedelta(days=5))
        assert result["schedule"]["steps"][0]["due_date"] == (TODAY + timedelta(days=5)).isoformat()
        assert _goal_step(db, _goal(db, LEARNER, uuid), "visit").due_date == TODAY + timedelta(days=5)


def test_the_group_chat_topic_shows_each_steps_due_date():
    from src.services.connect import cohort

    with _session() as db:
        uuid = _assign(db, ESSAY, VISIT)["assignment_uuid"]
        assignments.save_schedule(db, _user(ADMIN), 1, uuid, AssignmentScheduleSave(
            start_date=TODAY, due_date=TODAY + timedelta(days=30), steps=[StepSchedule(step_key="essay", due_date=TODAY + timedelta(days=7))]))
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == uuid)).one()
        steps = {step["step_uuid"]: step for step in cohort.topic(db, cohort.chat(db, assignment, cohort.GROUP))["steps"]}
        assert steps["essay"]["due_date"] == TODAY + timedelta(days=7)
