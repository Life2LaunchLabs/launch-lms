from datetime import date, timedelta

from src.db.goals import Goal, GoalStep, StepProgress
from src.services.goals.next_actions import next_actions
from src.tests.test_goals import _session

TODAY = date(2026, 10, 7)
NOW = "2026-10-07T12:00:00"
ME = 2


def _goal(db, goal_id, title="Goal", owner=ME, subject=ME, ownership="personal", status="active", **extra):
    db.add(Goal(id=goal_id, goal_uuid=f"goal_{goal_id}", title=title, owner_user_id=owner, subject_user_id=subject, ownership=ownership,
                status=status, creation_date=NOW, update_date=NOW, **extra))


def _step(db, step_id, goal_id, title, position=0, status=None, due=None, **extra):
    db.add(GoalStep(id=step_id, step_uuid=f"step_{step_id}", goal_id=goal_id, type="task", title=title, position=position, due_date=due,
                    creation_date=NOW, update_date=NOW, **extra))
    if status:
        db.add(StepProgress(progress_uuid=f"p_{step_id}", step_id=step_id, status=status, creation_date=NOW, update_date=NOW))


def test_undated_unstarted_step_is_suggested():
    with _session() as db:
        _goal(db, 1, "My start")
        _step(db, 1, 1, "Take the interest quiz")
        db.commit()
        result = next_actions(db, ME, TODAY)
        assert [item["title"] for item in result] == ["Take the interest quiz"]
        assert result[0]["route"] == "/plans/goal_1?step=step_1" and result[0]["tier"] == 3 and result[0]["reason"]
        assert result[0]["goal_uuid"] == "goal_1" and result[0]["step_uuid"] == "step_1" and result[0]["kind"] == "step"


def test_ranking_caps_and_one_assigned_item():
    with _session() as db:
        _goal(db, 1, "Assigned A", owner=1, ownership="external")
        _goal(db, 2, "Assigned B", owner=1, ownership="external")
        _goal(db, 3, "Mine in progress")
        _goal(db, 4, "Mine fresh")
        _goal(db, 5, "Mine extra")
        _step(db, 1, 1, "Due soon A", status="not_started", due=TODAY + timedelta(days=2))
        _step(db, 2, 2, "Due soon B", status="not_started", due=TODAY + timedelta(days=1))
        _step(db, 3, 3, "Keep going", status="in_progress")
        _step(db, 4, 4, "Try something")
        _step(db, 5, 5, "Another")
        db.commit()
        result = next_actions(db, ME, TODAY)
        assert [item["title"] for item in result] == ["Due soon B", "Keep going", "Try something"]
        assert [item["tier"] for item in result] == [1, 2, 3]


def test_excludes_done_held_submitted_and_other_people_or_inactive_goals():
    with _session() as db:
        _goal(db, 1, "Mine")
        _goal(db, 2, "Archived", status="archived")
        _goal(db, 3, "Someone else's", owner=3, subject=3)
        _step(db, 1, 1, "Done", status="completed", position=0)
        _step(db, 2, 1, "Excused", status="excused", position=1)
        _step(db, 3, 1, "Held", held=True, position=2)
        _step(db, 4, 1, "Waiting on review", status="submitted", position=3)
        _step(db, 5, 2, "Archived step")
        _step(db, 6, 3, "Not mine")
        db.commit()
        assert [item["kind"] for item in next_actions(db, ME, TODAY)] == ["discover"]


def test_uses_the_same_lock_check_as_this_week():
    with _session() as db:
        _goal(db, 1, "Waiting")
        _step(db, 1, 1, "Held first", held=True, position=0)
        _step(db, 2, 1, "Waits on the first", position=1, after_step_uuids=["step_1"])
        _goal(db, 2, "Opens later")
        _step(db, 3, 2, "Not yet", start_date=TODAY + timedelta(days=10))
        _goal(db, 3, "Prerequisite")
        _step(db, 4, 3, "Second", position=0, after_step_uuids=["step_5"])
        _step(db, 5, 3, "First", position=1)
        db.commit()
        assert [item["title"] for item in next_actions(db, ME, TODAY)] == ["First"]


def test_overdue_own_step_reads_gently_and_feedback_is_surfaced():
    with _session() as db:
        _goal(db, 1, "Mine")
        _goal(db, 2, "Other")
        _step(db, 1, 1, "Late one", due=TODAY - timedelta(days=3))
        _step(db, 2, 2, "Revise this", status="changes_requested")
        db.commit()
        result = {item["title"]: item["reason"] for item in next_actions(db, ME, TODAY)}
        assert "Easy to pick back up" in result["Late one"]
        assert "feedback" in result["Revise this"]


def test_never_empty():
    with _session() as db:
        result = next_actions(db, ME, TODAY)
        assert len(result) == 1 and result[0]["route"] == "/resources"
