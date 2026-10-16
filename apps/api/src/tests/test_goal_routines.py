from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalCreate, GoalStage, StageCreate, StepCreate, StepEntry, StepEntryCreate, StepEntryUpdate, StepStatus, StepStatusChange
from src.services.goals import goals, home, structure
from src.services.goals.types import step_type
from src.services.goals.types.routine import week_start_of
from src.tests.test_goal_home import _home_session
from src.tests.test_goals import LEARNER, _user


def _steps(view: dict) -> list[dict]:
    return [step for stage in view["stages"] for step in stage["steps"]] + view["unstaged_steps"]


def _routine(db, config: dict | None = None, title: str = "Send applications") -> tuple[dict, dict]:
    view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Summer job"))
    view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="routine", title=title, config=config or {"target": 3}))
    return view, next(step for step in _steps(view) if step["type"] == "routine")


def _log(db, view: dict, step: dict, title: str = "Cafe on Main") -> dict:
    view = goals.add_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepEntryCreate(kind="log", title=title))
    return next(item for item in _steps(view) if item["step_uuid"] == step["step_uuid"])


def test_config_is_checked_by_the_registry():
    routine = step_type("routine")
    assert routine.validate_config({}) == {"cadence": "weekly", "target": 3, "entry_kind": "named", "item_label": ""}
    config = routine.validate_config({"target": 5, "end_date": "2026-12-01", "follow_up": {"after_days": 5, "statuses": ["Replied", " ", "Replied", "No"]}})
    assert config["end_date"] == "2026-12-01" and config["follow_up"] == {"after_days": 5, "statuses": ["Replied", "No"]}
    with pytest.raises(HTTPException):
        routine.validate_config({"target": 0})
    with pytest.raises(HTTPException):
        routine.validate_config({"follow_up": {"statuses": [" "]}})


def test_logs_count_toward_this_week_and_never_finish_the_routine():
    with _home_session() as db:
        view, step = _routine(db)
        assert step["result"]["this_week"] == 0 and step["state"] == "open"
        for name in ("Cafe", "Library", "Bookshop"):
            step = _log(db, view, step, name)
        this_week = week_start_of(date.today()).isoformat()
        assert step["status"] == "in_progress" and step["state"] == "started" and step["fraction"] < 1
        assert step["result"]["this_week"] == 3 and step["result"]["total"] == 3
        assert step["result"]["weeks"] == [{"start": this_week, "count": 3}]
        assert all(entry["period_start"] == date.fromisoformat(this_week) for entry in step["entries"])


def test_named_routines_need_a_title_and_count_routines_do_not():
    with _home_session() as db:
        view, step = _routine(db)
        with pytest.raises(HTTPException) as error:
            goals.add_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepEntryCreate(kind="log"))
        assert error.value.status_code == 422
        view, step = _routine(db, {"target": 3, "entry_kind": "count"}, title="Run")
        view = goals.add_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepEntryCreate(kind="log"))
        assert next(item for item in _steps(view) if item["type"] == "routine")["result"]["this_week"] == 1


def test_the_week_history_reaches_back_to_the_first_log():
    with _home_session() as db:
        view, step = _routine(db)
        _log(db, view, step)
        entry = db.exec(select(StepEntry)).one()
        entry.period_start = week_start_of(date.today()) - timedelta(weeks=2)
        db.add(entry)
        db.commit()
        result = _log(db, view, step, "Again")["result"]
        assert [week["count"] for week in result["weeks"]] == [1, 0, 1] and result["this_week"] == 1


def test_follow_ups_come_due_and_a_status_clears_them():
    with _home_session() as db:
        view, step = _routine(db, {"target": 2, "follow_up": {"after_days": 3, "statuses": ["No reply", "Replied"]}})
        step = _log(db, view, step)
        entry = step["entries"][0]
        assert entry["follow_up_due"] == date.today() + timedelta(days=3) and step["result"]["follow_ups_due"] == 0
        row = db.exec(select(StepEntry)).one()
        row.follow_up_due = date.today()
        db.add(row)
        db.commit()
        assert next(item for item in _steps(goals.get_goal(db, _user(LEARNER), view["goal_uuid"])) if item["type"] == "routine")["result"]["follow_ups_due"] == 1
        lines = [item for item in home.home(db, _user(LEARNER))["week"]["items"] if item["type"] == "routine"]
        assert [item.get("line") for item in lines] == [None, "follow_up"] and lines[1]["title"] == "Follow up on 1"
        with pytest.raises(HTTPException):
            goals.update_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], entry["entry_uuid"], StepEntryUpdate(follow_up_status="Maybe"))
        view = goals.update_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], entry["entry_uuid"], StepEntryUpdate(follow_up_status="Replied"))
        assert next(item for item in _steps(view) if item["type"] == "routine")["result"]["follow_ups_due"] == 0


def test_a_routine_ends_at_its_total_its_end_date_or_when_the_learner_ends_it():
    with _home_session() as db:
        view, step = _routine(db, {"target": 2, "end_after": 2})
        _log(db, view, step)
        assert _log(db, view, step, "Second")["status"] == "completed"
        with pytest.raises(HTTPException) as error:
            _log(db, view, step, "Third")
        assert error.value.status_code == 409

        view, step = _routine(db, {"target": 2, "end_date": (date.today() - timedelta(days=1)).isoformat()})
        assert next(item for item in _steps(goals.get_goal(db, _user(LEARNER), view["goal_uuid"])) if item["type"] == "routine")["status"] == "completed"

        view, step = _routine(db, {"target": 2})
        view = goals.change_status(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        assert next(item for item in _steps(view) if item["type"] == "routine")["status"] == "completed"


def test_a_routine_ends_with_its_stage():
    with _home_session() as db:
        view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Summer job"))
        view = structure.add_stage(db, _user(LEARNER), view["goal_uuid"], StageCreate(title="Apply"))
        stage_uuid = view["stages"][0]["stage_uuid"]
        stage = db.exec(select(GoalStage).where(GoalStage.stage_uuid == stage_uuid)).one()
        stage.due_date = date.today() - timedelta(days=1)
        db.add(stage)
        db.commit()
        view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="routine", title="Apply", stage_uuid=stage_uuid, config={"target": 2}))
        assert _steps(goals.get_goal(db, _user(LEARNER), view["goal_uuid"]))[0]["status"] == "completed"


def test_this_week_always_holds_a_running_routine_and_counts_it_done_at_its_target():
    with _home_session() as db:
        view, step = _routine(db, {"target": 2})
        for title in ("Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6"):
            structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="task", title=title))
        week = home.home(db, _user(LEARNER))["week"]
        routines = [item for item in week["items"] if item["type"] == "routine"]
        # The routine sits beside the paced picks rather than taking one of their places.
        assert len(routines) == 1 and routines[0]["week_done"] is False and len(week["items"]) == 6
        _log(db, view, step)
        _log(db, view, step, "Second")
        week = home.home(db, _user(LEARNER))["week"]
        assert week["done_count"] == 1 and next(item for item in week["items"] if item["type"] == "routine")["week_done"] is True
        later = home.home(db, _user(LEARNER))
        assert all(item["type"] != "routine" for group in later["later"] for item in group["items"])
        assert all(item["type"] != "routine" for item in later["next_week"]["items"])


def test_coach_settings_become_a_routine_config():
    from src.services.goals.coach_tools import step_config

    assert step_config("routine", "Apply", {"per_week": 5, "follow_up_days": 7}) == {
        "cadence": "weekly", "target": 5, "entry_kind": "named", "item_label": "",
        "follow_up": {"after_days": 7, "statuses": ["No reply", "Replied", "Interview", "No"]},
    }
    assert step_config("routine", "Run", {"per_week": 0, "follow_up_days": 0})["target"] == 3
