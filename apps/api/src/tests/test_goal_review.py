import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalAssignmentCreate, GoalStep, StepEntryCreate, StepStatus
from src.db.learning import LearningPage, LearningPageType, LearningResponseAttempt, LearningRun
from src.db.media import MediaAsset
from src.services.goals import assignments, entries, goals, review
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _session, _status, _step, _user

RESUME = {"key": "resume", "type": "upload", "title": "Your first resume", "review_required": True, "reviewer_guidance": "One page",
          "config": {"slots": [{"key": "file", "label": "Resume"}]}}
FAIR = {"key": "fair", "type": "task", "title": "Career Fair", "completed_by": "staff"}


def _assigned(db, *steps) -> dict:
    template = _published(db, *steps)
    result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
    for learner in (LEARNER, OTHER):
        mine = goals.list_my_goals(db, _user(learner))
        goals.respond(db, _user(learner), mine[0]["goal_uuid"], True)
    return result


def _goal(db, user_id: int) -> Goal:
    return db.exec(select(Goal).where(Goal.subject_user_id == user_id)).one()


def _submit_resume(db, user_id: int) -> str:
    goal = _goal(db, user_id)
    asset_uuid = f"asset_{user_id}_{len(db.exec(select(MediaAsset)).all())}"
    db.add(MediaAsset(asset_uuid=asset_uuid, owner_user_id=user_id, owner_type="user", media_type="document", source_type="upload",
                      filename=f"resume{user_id}.pdf", url=f"https://files.example.com/{user_id}.pdf", creation_date=NOW, update_date=NOW))
    db.commit()
    step = _step(goals.get_goal(db, _user(user_id), goal.goal_uuid), "Your first resume")
    entries.add_entry(db, _user(user_id), goal.goal_uuid, step["step_uuid"], StepEntryCreate(kind="file", slot="file", asset_uuid=asset_uuid))
    _status(db, user_id, goal, step, StepStatus.COMPLETED)
    return step["step_uuid"]


def test_inbox_groups_waiting_steps_and_staff_review_them_one_after_another():
    with _session() as db:
        assignment = _assigned(db, RESUME, FAIR)
        resume = {user: _submit_resume(db, user) for user in (LEARNER, OTHER)}
        fair = [step.step_uuid for step in db.exec(select(GoalStep).where(GoalStep.title == "Career Fair").order_by(GoalStep.id)).all()]

        inbox = review.inbox(db, _user(ADMIN), 1)
        by_kind = {group["kind"]: group for group in inbox["groups"]}
        assert inbox["counts"] == {"review": 2, "grade": 0, "confirm": 2, "nudge": 0}
        assert by_kind["review"]["step"]["title"] == "Your first resume" and by_kind["review"]["step_key"] == "resume"
        assert by_kind["review"]["group"]["name"] == "Fall" and by_kind["confirm"]["step"]["title"] == "Career Fair"
        # The learners see none of it.
        assert review.inbox(db, _user(LEARNER), 1)["total"] == 0

        queue = review.review_queue(db, _user(ADMIN), 1, assignment["assignment_uuid"], "resume")
        assert queue["step"]["reviewer_guidance"] == "One page" and not queue["step"]["confirm_only"]
        assert [item["user"]["id"] for item in queue["items"]] == [LEARNER, OTHER]
        first = queue["items"][0]
        assert first["entries"][0]["url"] == f"https://files.example.com/{LEARNER}.pdf" and first["entries"][0]["filename"] == f"resume{LEARNER}.pdf"
        assert first["attempt"] == 1 and first["activity_reviews"] == []
        assert review.review_queue(db, _user(ADMIN), 1, assignment["assignment_uuid"], "fair")["step"]["confirm_only"]
        with pytest.raises(HTTPException) as unknown:
            review.review_queue(db, _user(ADMIN), 1, assignment["assignment_uuid"], "nope")
        assert unknown.value.status_code == 404

        with pytest.raises(HTTPException) as missing_message:
            review.decide(db, _user(ADMIN), 1, resume[LEARNER], "flag")
        assert missing_message.value.status_code == 422
        assert review.decide(db, _user(ADMIN), 1, resume[LEARNER], "flag", "Add your phone number.")["status"] == "changes_requested"
        assert review.decide(db, _user(ADMIN), 1, resume[OTHER], "confirm", "Nice")["status"] == "completed"
        with pytest.raises(HTTPException) as stale:
            review.decide(db, _user(ADMIN), 1, resume[OTHER], "confirm")
        assert stale.value.status_code == 409

        # Resubmitting counts a second attempt; staff notes stay with staff.
        goal = _goal(db, LEARNER)
        _status(db, LEARNER, goal, {"step_uuid": resume[LEARNER]}, StepStatus.SUBMITTED)
        review.add_staff_note(db, _user(ADMIN), 1, resume[LEARNER], "Applying to the parks crew; nudge her to lead with it.")
        item = review.review_queue(db, _user(ADMIN), 1, assignment["assignment_uuid"], "resume")["items"][0]
        assert item["attempt"] == 2 and item["feedback_history"][0]["message"] == "Add your phone number."
        assert item["staff_notes"][0]["author"]["id"] == ADMIN
        learner_view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert "staff_notes" not in str(learner_view) and "parks crew" not in str(learner_view)
        with pytest.raises(HTTPException):
            review.add_staff_note(db, _user(LEARNER), 1, resume[LEARNER], "sneaky")
        with pytest.raises(HTTPException):
            review.decide(db, _user(LEARNER), 1, resume[LEARNER], "confirm")

        assert review.confirm_many(db, _user(ADMIN), 1, [*fair, "goal_step_missing"], "Attended") == {"confirmed": fair, "skipped": ["goal_step_missing"]}
        assert review.inbox(db, _user(ADMIN), 1)["counts"] == {"review": 1, "grade": 0, "confirm": 0, "nudge": 0}
        fair_view = _step(goals.get_goal(db, _user(ADMIN), _goal(db, LEARNER).goal_uuid), "Career Fair")
        assert fair_view["status"] == "completed" and fair_view["completion_method"] == "staff" and fair_view["reviewer_note"] == "Attended"


def test_stalled_learners_are_nudged_and_ungraded_activity_answers_wait_for_a_grade():
    with _session() as db:
        _assigned(db, {"key": "quiz", "type": "activity", "title": "Interest quiz"}, {"key": "visit", "type": "task", "title": "Visit"})
        stalled = _goal(db, OTHER)
        stalled.creation_date = "2026-01-01T00:00:00"
        db.add(stalled)
        db.commit()

        goal = _goal(db, LEARNER)
        quiz = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Interest quiz")
        goals.start_activity(db, _user(LEARNER), goal.goal_uuid, quiz["step_uuid"])
        run = db.exec(select(LearningRun)).one()
        step = db.exec(select(GoalStep).where(GoalStep.step_uuid == quiz["step_uuid"])).one()
        db.add(LearningPage(id=1, activity_id=step.activity_id, org_id=1, page_uuid="page_1", page_type=LearningPageType.STANDARD, title="Why?", content={}, creation_date=NOW, update_date=NOW))
        db.add(LearningResponseAttempt(attempt_uuid="attempt_1", run_id=run.id, page_id=1, user_id=LEARNER, answer={"text": "Because"},
                                       result={"grading_status": "pending", "max_score": 5, "questions": {"q": {"grading_status": "pending", "max_score": 5}}}))
        db.commit()

        inbox = review.inbox(db, _user(ADMIN), 1)
        assert inbox["counts"] == {"review": 0, "grade": 1, "confirm": 0, "nudge": 1}
        grade = next(group for group in inbox["groups"] if group["kind"] == "grade")
        assert grade["items"][0]["goal_uuid"] == goal.goal_uuid and grade["items"][0]["step_uuid"] == quiz["step_uuid"]
        nudge = inbox["groups"][-1]
        assert nudge["kind"] == "nudge" and nudge["items"][0]["goal_uuid"] == stalled.goal_uuid and nudge["items"][0]["open_count"] == 2
