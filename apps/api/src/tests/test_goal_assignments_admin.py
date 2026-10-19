"""Running an assignment from the staff side: status, edits, what's left per step, reminders, settling,
the grader's note on the learner's progress card, group sync, and the review fixes."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ConversationMessage
from src.db.goal_templates import (
    AssignmentCollaborator,
    AssignmentSchedule,
    GoalAssignmentRequest,
    GoalAssignmentUpdate,
    StageSchedule,
    StepRemind,
    StepSchedule,
    StepSettle,
)
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, StepEntry, StepProgress, StepStatus, StepSubmission
from src.db.learning import LearningPage, LearningPageType, LearningResponseAttempt, LearningRun
from src.db.planning import PlanCollaborator
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.users import User
from src.services.connect import workspace
from src.services.goals import access, assignment_steps, assignments, completion, goals, review, staff_views, templates
from src.services.school import chats as school_chats
from src.services.users import usergroups
from src.tests.test_goal_sharing import _session as _sharing_session
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _status, _step, _user

COACH, NEWCOMER = 5, 6
ESSAY = {"key": "essay", "type": "write", "title": "Essay", "review_required": True}
FAIR = {"key": "fair", "type": "task", "title": "Career Fair", "completed_by": "staff"}
VISIT = {"key": "visit", "type": "task", "title": "Visit a campus", "due_week": 1}


def _session():
    db = _sharing_session()
    db.add_all([
        User(id=COACH, user_uuid="user_5", username="coach", email="coach@example.com", first_name="Cody", last_name="Coach", creation_date=NOW, update_date=NOW),
        User(id=NEWCOMER, user_uuid="user_6", username="nia", email="nia@example.com", first_name="Nia", last_name="New", creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=COACH, org_id=1, role_id=2, creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=NEWCOMER, org_id=1, role_id=4, creation_date=NOW, update_date=NOW),
    ])
    db.commit()
    return db


def _assign(db, *steps, staff=(ADMIN,), accept=True, **extra) -> dict:
    template = _published(db, *steps)
    payload = GoalAssignmentRequest(usergroup_id=1, collaborators=[AssignmentCollaborator(user_id=user_id) for user_id in staff], **extra)
    result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, payload)
    if accept:
        for learner in (LEARNER, OTHER):
            goals.respond(db, _user(learner), _goal(db, learner, result["assignment_uuid"]).goal_uuid, True)
    return result


def _goal(db, user_id: int, assignment_uuid: str) -> Goal:
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid)).one()
    return db.exec(select(Goal).where(Goal.assignment_id == assignment.id, Goal.subject_user_id == user_id)).one()


def _goal_step(db, goal: Goal, key: str) -> GoalStep:
    return db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == key)).one()


def _column(matrix: dict, key: str) -> dict:
    return next(step for stage in matrix["stages"] for step in stage["steps"] if step["template_key"] == key)["aggregate"]


# Status ---------------------------------------------------------------------------------

def test_pause_holds_new_members_resume_catches_up_and_end_leaves_plans_with_learners():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        with pytest.raises(HTTPException) as not_admin:
            assignments.pause(db, _user(LEARNER), 1, uuid)
        assert not_admin.value.status_code == 403

        paused = assignments.pause(db, _user(ADMIN), 1, uuid)
        assert paused["status"] == "paused" and paused["paused_at"]
        # Still current for staff, but nobody new gets a plan.
        assert [item["status"] for item in staff_views.list_assignments(db, _user(ADMIN), 1)] == ["paused"]
        db.add(UserGroupUser(usergroup_id=1, user_id=NEWCOMER, org_id=1, creation_date=NOW, update_date=NOW))
        db.commit()
        assignment = db.exec(select(GoalAssignment)).one()
        assert assignments.sync_assignment(db, assignment) == []
        with pytest.raises(HTTPException) as twice:
            assignments.pause(db, _user(ADMIN), 1, uuid)
        assert twice.value.status_code == 409

        resumed = assignments.resume(db, _user(ADMIN), 1, uuid)
        assert resumed["status"] == "active" and resumed["paused_at"] is None and len(resumed["goal_uuids"]) == 1
        assert _goal(db, NEWCOMER, uuid).goal_uuid == resumed["goal_uuids"][0]

        ended = assignments.end(db, _user(ADMIN), 1, uuid)
        assert ended["status"] == "ended" and ended["ended_at"]
        assignment = db.exec(select(GoalAssignment)).one()
        assert assignment.ended_by_user_id == ADMIN
        # Learners keep their plans as they were.
        assert {goal.status for goal in db.exec(select(Goal)).all()} == {"active", "pending"}
        assert staff_views.list_assignments(db, _user(ADMIN), 1) == []
        cohort = staff_views.cohort(db, _user(ADMIN), 1, 1)
        assert cohort["assignments"] == [] and [item["status"] for item in cohort["completed_assignments"]] == ["ended"]
        for action in (assignments.resume, assignments.end):
            with pytest.raises(HTTPException) as over:
                action(db, _user(ADMIN), 1, uuid)
            assert over.value.status_code == 409
        with pytest.raises(HTTPException) as frozen:
            assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(welcome_message="Hi"))
        assert frozen.value.status_code == 409


# Edits ----------------------------------------------------------------------------------

def test_editing_dates_moves_learners_plans_but_not_dates_staff_changed_for_one_learner():
    with _session() as db:
        start = date.today() + timedelta(days=14)
        uuid = _assign(db, VISIT, ESSAY, start_date=start, due_date=start + timedelta(days=60))["assignment_uuid"]
        mine, theirs = _goal(db, LEARNER, uuid), _goal(db, OTHER, uuid)
        assert _goal_step(db, mine, "visit").due_date == start + timedelta(days=6)
        # Staff gave Sam an extra week on the visit.
        special = _goal_step(db, theirs, "visit")
        special.due_date = start + timedelta(days=13)
        db.add(special)
        db.commit()

        later = start + timedelta(days=7)
        updated = assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(welcome_message="Welcome!", start_date=later))
        assert updated["welcome_message"] == "Welcome!" and updated["start_date"] == later and updated["due_date"] == start + timedelta(days=60)
        db.refresh(mine)
        assert mine.start_date == later and _goal_step(db, mine, "visit").due_date == later + timedelta(days=6)
        assert db.exec(select(GoalStage).where(GoalStage.goal_id == mine.id)).one().start_date == later
        assert _goal_step(db, theirs, "visit").due_date == start + timedelta(days=13)

        # A whole new schedule: a close date of its own for the essay.
        essay_due = later + timedelta(days=20)
        assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(schedule=AssignmentSchedule(steps=[StepSchedule(step_key="essay", due_date=essay_due)])))
        assert _goal_step(db, mine, "essay").due_date == essay_due
        with pytest.raises(HTTPException) as backwards:
            assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(due_date=later - timedelta(days=1)))
        assert backwards.value.status_code == 422


def test_editing_staff_adds_and_removes_them_on_every_plan():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        goal = _goal(db, LEARNER, uuid)
        assert "view_plan" not in access.capabilities(db, goal, COACH)
        updated = assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[AssignmentCollaborator(user_id=COACH)]))
        # The owner always stays on.
        assert updated["staff_user_ids"] == [ADMIN, COACH]
        assert "complete_restricted_objectives" in access.capabilities(db, goal, COACH)
        # Two staff now: the learner's chat with the organization starts.
        assert school_chats.find(db, 1, LEARNER) is not None
        assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[]))
        assert access.capabilities(db, goal, COACH) == set()
        assert not db.exec(select(PlanCollaborator).where(PlanCollaborator.user_id == COACH, PlanCollaborator.active == True)).all()  # noqa: E712
        with pytest.raises(HTTPException) as learner:
            assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[AssignmentCollaborator(user_id=OTHER)]))
        assert learner.value.status_code == 422


# What's left per step ---------------------------------------------------------------------

def test_matrix_says_whats_left_for_staff_on_each_step_and_who():
    with _session() as db:
        uuid = _assign(db, ESSAY, FAIR, {"key": "quiz", "type": "activity", "title": "Interest quiz"})["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)
        # Lee's quiz answer waits on a grade.
        quiz = _goal_step(db, mine, "quiz")
        goals.start_activity(db, _user(LEARNER), mine.goal_uuid, quiz.step_uuid)
        run = db.exec(select(LearningRun)).one()
        db.add(LearningPage(id=1, activity_id=quiz.activity_id, org_id=1, page_uuid="page_1", page_type=LearningPageType.STANDARD, title="Why?", content={}, creation_date=NOW, update_date=NOW))
        db.add(LearningResponseAttempt(attempt_uuid="attempt_1", run_id=run.id, page_id=1, user_id=LEARNER, answer={"text": "Because"},
                                       result={"grading_status": "pending", "max_score": 5, "questions": {"q": {"grading_status": "pending", "max_score": 5}}}))
        db.commit()

        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, uuid)
        essay_column = _column(matrix, "essay")
        assert essay_column["handed_in_count"] == 1 and essay_column["not_handed_in_count"] == 1
        assert essay_column["buckets"]["handed_in"] == ["user_2"] and essay_column["buckets"]["not_handed_in"] == ["user_3"]
        assert _column(matrix, "quiz")["buckets"]["to_grade"] == ["user_2"] and _column(matrix, "quiz")["buckets"]["not_handed_in"] == ["user_3"]
        fair = _column(matrix, "fair")
        assert fair["needs_settle_count"] == 2 and fair["buckets"]["needs_settle"] == ["user_2", "user_3"] and fair["done_count"] == 0
        rows = {row["id"]: row for row in matrix["learners"]}
        assert rows[LEARNER]["user_uuid"] == "user_2" and rows[LEARNER]["cells"]["essay"]["bucket"] == "handed_in"
        assert matrix["assignment"]["status"] == "active"


def test_settling_a_staff_step_marks_everyone_done_except_who_missed_it():
    with _session() as db:
        uuid = _assign(db, ESSAY, FAIR)["assignment_uuid"]
        with pytest.raises(HTTPException) as learner_step:
            assignment_steps.settle(db, _user(ADMIN), 1, uuid, "essay", StepSettle())
        assert learner_step.value.status_code == 422
        with pytest.raises(HTTPException) as not_staff:
            assignment_steps.settle(db, _user(LEARNER), 1, uuid, "fair", StepSettle())
        assert not_staff.value.status_code == 403

        settled = assignment_steps.settle(db, _user(ADMIN), 1, uuid, "fair", StepSettle(except_user_uuids=["user_3"], message="Great turnout"))
        assert [item["user"]["id"] for item in settled["settled"]] == [LEARNER] and [item["user"]["id"] for item in settled["left"]] == [OTHER]
        fair = _column(staff_views.assignment_matrix(db, _user(ADMIN), 1, uuid), "fair")
        assert fair["buckets"]["done"] == ["user_2"] and fair["buckets"]["needs_settle"] == ["user_3"]
        again = assignment_steps.settle(db, _user(ADMIN), 1, uuid, "fair", StepSettle())
        assert [item["user"]["id"] for item in again["settled"]] == [OTHER] and again["skipped"][0]["reason"] == "already_done"


# Reminders -------------------------------------------------------------------------------

def test_reminders_reach_who_hasnt_handed_in_in_their_plan_feed_once_per_cooldown():
    with _session() as db:
        uuid = _assign(db, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)

        sent = assignment_steps.remind(db, _user(ADMIN), 1, uuid, "essay", StepRemind(message="Due Friday!"))
        assert [item["user"]["id"] for item in sent["reminded"]] == [OTHER]
        assert [(item["user"]["id"], item["reason"]) for item in sent["skipped"]] == [(LEARNER, "not_waiting")]
        theirs = _goal(db, OTHER, uuid)
        feed = school_chats.find(db, 1, OTHER)
        assert sent["reminded"][0]["conversation_uuid"] == feed.conversation_uuid
        card = db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == feed.id, ConversationMessage.kind == "card")).all()[-1]
        assert card.body == "Due Friday!" and card.sender_user_id == ADMIN
        assert (card.card["type"], card.card["step_title"], card.card["goal_uuid"]) == (assignment_steps.REMINDER, "Essay", theirs.goal_uuid)
        # Filtered to the step, the feed shows the reminder.
        topic = next(item for item in workspace.topics(db, feed) if item["goal_uuid"] == theirs.goal_uuid)
        assert next(step for step in topic["steps"] if step["title"] == "Essay")["count"] == 1
        progress = db.exec(select(StepProgress).where(StepProgress.step_id == _goal_step(db, theirs, "essay").id)).one()
        assert progress.last_reminded_at
        assert staff_views.assignment_matrix(db, _user(ADMIN), 1, uuid)["learners"][1]["cells"]["essay"]["last_reminded_at"] == progress.last_reminded_at

        again = assignment_steps.remind(db, _user(ADMIN), 1, uuid, "essay", StepRemind(user_uuids=["user_3"]))
        assert again["reminded"] == [] and again["skipped"][0]["reason"] == "recently_reminded"
        with pytest.raises(HTTPException) as unknown:
            assignment_steps.remind(db, _user(ADMIN), 1, uuid, "nope", StepRemind())
        assert unknown.value.status_code == 404
        assignments.pause(db, _user(ADMIN), 1, uuid)
        with pytest.raises(HTTPException) as paused:
            assignment_steps.remind(db, _user(ADMIN), 1, uuid, "essay", StepRemind())
        assert paused.value.status_code == 409


def test_with_one_staff_member_a_reminder_goes_to_their_direct_chat():
    with _session() as db:
        uuid = _assign(db, ESSAY)["assignment_uuid"]
        sent = assignment_steps.remind(db, _user(ADMIN), 1, uuid, "essay", StepRemind(user_uuids=["user_2"]))
        assert [item["user"]["id"] for item in sent["reminded"]] == [LEARNER] and sent["skipped"] == []
        assert school_chats.find(db, 1, LEARNER) is None
        message = db.exec(select(ConversationMessage).where(ConversationMessage.kind == "card")).all()[-1]
        assert message.body == "Reminder: Essay"


# Grading ---------------------------------------------------------------------------------

def test_the_graders_note_reaches_the_learners_progress_card():
    with _session() as db:
        uuid = _assign(db, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)
        review.decide(db, _user(ADMIN), 1, essay.step_uuid, "flag", "Add a conclusion.")
        feed = school_chats.find(db, 1, LEARNER)
        last = db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == feed.id)).all()[-1]
        assert last.body == "Asked for changes on Essay" and last.card["events"][-1]["note"] == "Add a conclusion."
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.SUBMITTED)
        review.decide(db, _user(ADMIN), 1, essay.step_uuid, "confirm", "Much better")
        last = db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == feed.id)).all()[-1]
        assert last.card["events"][-1]["event"] == "approved" and last.card["events"][-1]["note"] == "Much better"


# Group sync ------------------------------------------------------------------------------

async def test_adding_someone_to_a_group_issues_its_active_assignments_and_their_chat(monkeypatch):
    async def allowed(*args, **kwargs):
        return True

    monkeypatch.setattr(usergroups, "rbac_check", allowed)
    with _session() as db:
        active = _assign(db, VISIT, staff=(ADMIN, COACH))["assignment_uuid"]
        ended = _assign(db, ESSAY)["assignment_uuid"]
        assignments.end(db, _user(ADMIN), 1, ended)
        await usergroups.add_users_to_usergroup(None, db, _user(ADMIN), 1, str(NEWCOMER))  # type: ignore[arg-type]
        assert _goal(db, NEWCOMER, active).status == "pending"
        assert not db.exec(select(Goal).where(Goal.subject_user_id == NEWCOMER, Goal.assignment_id != _goal(db, NEWCOMER, active).assignment_id)).all()
        assert school_chats.find(db, 1, NEWCOMER) is not None


# Review fixes ----------------------------------------------------------------------------

def test_review_keeps_every_kind_of_evidence():
    with _session() as db:
        uuid = _assign(db, ESSAY)["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        step = _goal_step(db, mine, "essay")
        # Explore and routine steps collect notes, resources and logs; reviewers see them all.
        for position, kind in enumerate(("note", "resource", "log", "link")):
            db.add(StepEntry(entry_uuid=f"entry_{kind}", step_id=step.id, kind=kind, position=position, note=f"A {kind}", creation_date=NOW, update_date=NOW))
        db.commit()
        item = review.review_item(db, mine, step, completion.progress_view(db, step))
        assert [entry["kind"] for entry in item["entries"]] == ["note", "resource", "log", "link"]


def test_staff_steps_in_a_stage_still_to_come_dont_wait_on_staff():
    with _session() as db:
        document = {"template": {"title": "Senior year"}, "stages": [
            {"key": "now", "title": "Now", "steps": [dict(FAIR, key="kickoff", title="Kickoff")]},
            {"key": "later", "title": "Later", "steps": [FAIR]},
        ]}
        created = templates.create_template(db, _user(ADMIN), 1, document)
        templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
        schedule = AssignmentSchedule(stages=[StageSchedule(stage_key="now", start_date=date.today() - timedelta(days=7)),
                                              StageSchedule(stage_key="later", start_date=date.today() + timedelta(days=30))])
        result = assignments.assign(db, _user(ADMIN), 1, created["template_uuid"], GoalAssignmentRequest(usergroup_id=1, staff_user_ids=[ADMIN], schedule=schedule))
        for learner in (LEARNER, OTHER):
            goals.respond(db, _user(learner), _goal(db, learner, result["assignment_uuid"]).goal_uuid, True)
        confirm = [group for group in review.inbox(db, _user(ADMIN), 1)["groups"] if group["kind"] == "confirm"]
        assert [(group["step"]["title"], group["count"]) for group in confirm] == [("Kickoff", 2)]
        assert review.review_queue(db, _user(ADMIN), 1, result["assignment_uuid"], "fair")["items"] == []
        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, result["assignment_uuid"])
        assert _column(matrix, "fair")["needs_settle_count"] == 0 and _column(matrix, "kickoff")["needs_settle_count"] == 2
        # Staff can still confirm it early by hand.
        fair = _goal_step(db, _goal(db, LEARNER, result["assignment_uuid"]), "fair")
        assert review.decide(db, _user(ADMIN), 1, fair.step_uuid, "confirm")["status"] == "completed"
        assert _step(goals.get_goal(db, _user(LEARNER), _goal(db, LEARNER, result["assignment_uuid"]).goal_uuid), "Career Fair")["status"] == "completed"
