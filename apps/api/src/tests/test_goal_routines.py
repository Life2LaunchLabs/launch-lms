from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalCreate, StageCreate, StageUpdate, StepCreate, StepEntry, StepEntryCreate, StepEntryUpdate, StepStatus, StepStatusChange, StepUpdate
from src.services.goals import entries, goals, home, structure
from src.services.goals.document import upgrade_document
from src.services.goals.types import step_type
from src.services.goals.types.routine import trigger_on, triggers_back, upgrade_config
from src.tests.test_goal_home import _home_session
from src.tests.test_goals import LEARNER, _user

DAILY = {"cadence": "daily", "action": {"kind": "list", "target": 3, "label": "job opening"}}


def _steps(view: dict) -> list[dict]:
    return [step for stage in view["stages"] for step in stage["steps"]] + view["unstaged_steps"]


def _routine(db, config: dict | None = None, title: str = "Add job openings") -> tuple[dict, dict]:
    view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Summer job"))
    view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="routine", title=title, config=config or DAILY))
    return view, next(step for step in _steps(view) if step["type"] == "routine")


def _log(db, view: dict, step: dict, title: str = "Cafe on Main", **fields) -> dict:
    view = entries.add_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepEntryCreate(kind="log", title=title, **fields))
    return next(item for item in _steps(view) if item["step_uuid"] == step["step_uuid"])


def test_config_is_checked_by_the_registry():
    routine = step_type("routine")
    assert routine.validate_config({}) == {
        "cadence": "weekly", "days": [0], "action": {"kind": "list", "target": 1, "label": "", "unit": "", "series": []},
    }
    config = routine.validate_config({"cadence": "weekly", "days": [5, 1, 1, 3, 9], "action": {"kind": "number", "target": 4, "series": ["Me", " ", "Rex", "Me"]}})
    assert config["days"] == [1, 3, 5] and config["action"]["target"] == 1 and config["action"]["series"] == ["Me", "Rex"]
    assert routine.validate_config({"cadence": "daily", "days": [3]})["days"] == []
    assert routine.validate_config({"cadence": "monthly", "days": [15, 1]})["days"] == [1, 15]
    for bad in ({"days": []}, {"cadence": "monthly", "days": [0]}, {"action": {"target": 0}}, {"target": 3}):
        with pytest.raises(HTTPException):
            routine.validate_config(bad)


def test_triggers_follow_the_cadence():
    friday = date(2026, 10, 16)
    weekly = {"cadence": "weekly", "days": [1, 3, 5]}
    assert trigger_on(weekly, friday) == friday
    assert trigger_on(weekly, friday + timedelta(days=2)) == friday
    assert triggers_back(weekly, friday, 4) == [date(2026, 10, 9), date(2026, 10, 12), date(2026, 10, 14), friday]
    monthly = {"cadence": "monthly", "days": [1, 31]}
    assert trigger_on(monthly, date(2026, 10, 16)) == date(2026, 10, 1)
    # A day past the month's end falls on its last day.
    assert trigger_on(monthly, date(2026, 11, 30)) == date(2026, 11, 30)
    assert trigger_on({"cadence": "daily"}, friday) == friday


def test_older_routines_become_weekly_on_mondays():
    assert upgrade_config({"cadence": "weekly", "target": 5, "entry_kind": "named", "item_label": "application", "follow_up": {"after_days": 7}}) == {
        "cadence": "weekly", "days": [1], "action": {"kind": "list", "target": 5, "label": "application"},
    }
    assert upgrade_config({"target": 1, "entry_kind": "count"})["action"] == {"kind": "check", "target": 1, "label": "time"}
    document = {"template": {}, "stages": [{"title": "Apply", "steps": [{"type": "routine", "title": "Apply", "config": {"target": 3, "end_after": 9}}]}]}
    upgraded = upgrade_document(document)["stages"][0]["steps"][0]["config"]
    assert step_type("routine").validate_config(upgraded)["action"]["target"] == 3


def test_a_list_action_counts_toward_the_current_trigger_and_never_finishes_the_routine():
    with _home_session() as db:
        view, step = _routine(db)
        assert step["result"]["done"] == 0 and step["result"]["wanted"] == 3 and step["state"] == "open"
        for name in ("Cafe", "Library", "Bookshop"):
            step = _log(db, view, step, name)
        today = date.today()
        assert step["status"] == "in_progress" and step["fraction"] < 1
        assert step["result"]["current"] == today.isoformat() and step["result"]["done"] == 3 and step["result"]["total"] == 3
        assert step["result"]["periods"] == [{"start": today.isoformat(), "count": 3, "done": 3, "wanted": 3, "values": {}}]
        assert all(entry["period_start"] == today for entry in step["entries"])
        with pytest.raises(HTTPException) as error:
            _log(db, view, step, " ")
        assert error.value.status_code == 422


def test_an_earlier_trigger_can_be_filled_in_but_not_a_day_that_isnt_one():
    with _home_session() as db:
        view, step = _routine(db)
        yesterday = date.today() - timedelta(days=1)
        step = _log(db, view, step, "Late one", period=yesterday)
        assert step["entries"][0]["period_start"] == yesterday
        with pytest.raises(HTTPException) as error:
            _log(db, view, step, period=date.today() + timedelta(days=1))
        assert error.value.status_code == 422
        view, step = _routine(db, {"cadence": "monthly", "days": [1], "action": {"kind": "check"}}, title="Review budget")
        not_a_trigger = trigger_on({"cadence": "monthly", "days": [1]}, date.today()) + timedelta(days=1)
        if not_a_trigger <= date.today():
            with pytest.raises(HTTPException):
                _log(db, view, step, period=not_a_trigger)


def test_number_actions_log_one_value_per_line_and_can_be_corrected():
    with _home_session() as db:
        view, step = _routine(db, {"cadence": "daily", "action": {"kind": "number", "label": "Weight", "unit": "lb", "series": ["Me", "Rex"]}}, title="Weigh in")
        step = _log(db, view, step, "", data={"value": 180.5, "series": "Me"})
        assert step["result"]["done"] == 1 and step["result"]["wanted"] == 2
        for bad, code in (({"value": "heavy", "series": "Rex"}, 422), ({"value": 40, "series": "Cat"}, 422), ({"value": 181, "series": "Me"}, 409)):
            with pytest.raises(HTTPException) as error:
                _log(db, view, step, "", data=bad)
            assert error.value.status_code == code
        step = _log(db, view, step, "", data={"value": 42, "series": "Rex"})
        assert step["result"]["done"] == 2 and step["result"]["periods"][-1]["values"] == {"Me": 180.5, "Rex": 42}
        mine = next(entry for entry in step["entries"] if entry["data"]["series"] == "Me")
        view = entries.update_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], mine["entry_uuid"], StepEntryUpdate(data={"value": 179}))
        assert next(item for item in _steps(view) if item["type"] == "routine")["result"]["periods"][-1]["values"]["Me"] == 179
        with pytest.raises(HTTPException):
            entries.update_entry(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], mine["entry_uuid"], StepEntryUpdate(data={"value": "x"}))


def test_a_check_action_is_done_once_per_trigger():
    with _home_session() as db:
        view, step = _routine(db, {"cadence": "daily", "action": {"kind": "check"}}, title="Stretch")
        step = _log(db, view, step, "")
        assert step["result"]["done"] == 1 and step["result"]["wanted"] == 1
        with pytest.raises(HTTPException) as error:
            _log(db, view, step, "")
        assert error.value.status_code == 409


def test_the_chart_reaches_back_to_the_first_log_and_the_streak_counts_met_triggers():
    with _home_session() as db:
        view, step = _routine(db, {"cadence": "daily", "action": {"kind": "check"}}, title="Stretch")
        today = date.today()
        for back in (3, 2):
            _log(db, view, step, "", period=today - timedelta(days=back))
        result = _log(db, view, step, "")["result"]
        assert [period["count"] for period in result["periods"]] == [1, 1, 0, 1]
        assert result["periods"][0]["start"] == (today - timedelta(days=3)).isoformat() and result["streak"] == 1
        assert len(db.exec(select(StepEntry)).all()) == 3


def test_a_changed_cadence_folds_earlier_logs_into_its_own_times():
    with _home_session() as db:
        view, step = _routine(db, {"cadence": "daily", "action": {"kind": "check"}}, title="Stretch")
        today = date.today()
        for back in (2, 1, 0):
            _log(db, view, step, "", period=today - timedelta(days=back))
        weekly = {"cadence": "weekly", "days": [(today.weekday() + 1) % 7], "action": {"kind": "list", "target": 3}}
        view = structure.update_step(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepUpdate(config=weekly))
        result = next(item for item in _steps(view) if item["type"] == "routine")["result"]
        assert result["current"] == today.isoformat() and result["done"] == 1
        assert sum(period["count"] for period in result["periods"]) == 3


def test_a_routine_ends_at_its_close_date_or_when_the_learner_ends_it():
    with _home_session() as db:
        # The close date is the step's own due date.
        view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Gym"))
        view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="routine", title="Lift", config=DAILY, due_date=date.today() - timedelta(days=1)))
        assert next(item for item in _steps(goals.get_goal(db, _user(LEARNER), view["goal_uuid"])) if item["type"] == "routine")["status"] == "completed"

        view, step = _routine(db)
        view = goals.change_status(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        assert next(item for item in _steps(view) if item["type"] == "routine")["status"] == "completed"
        with pytest.raises(HTTPException) as error:
            _log(db, view, step, "After")
        assert error.value.status_code == 409


def test_a_routine_ends_with_its_stage():
    with _home_session() as db:
        view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Summer job"))
        view = structure.add_stage(db, _user(LEARNER), view["goal_uuid"], StageCreate(title="Apply"))
        stage_uuid = view["stages"][0]["stage_uuid"]
        # The next stage started today, so this one ended yesterday.
        view = structure.add_stage(db, _user(LEARNER), view["goal_uuid"], StageCreate(title="Interview"))
        structure.update_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][-1]["stage_uuid"], StageUpdate(start_date=date.today()))
        view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="routine", title="Apply", stage_uuid=stage_uuid, config=DAILY))
        assert _steps(goals.get_goal(db, _user(LEARNER), view["goal_uuid"]))[0]["status"] == "completed"


def test_this_week_always_holds_a_running_routine_and_counts_it_done_once_the_current_trigger_is_met():
    with _home_session() as db:
        view, step = _routine(db, {"cadence": "daily", "action": {"kind": "list", "target": 2}})
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

    assert step_config("routine", "Apply", {"cadence": "weekly", "days": [1, 3], "action_kind": "list", "action_target": 5, "action_label": "application"}) == {
        "cadence": "weekly", "days": [1, 3], "action": {"kind": "list", "target": 5, "label": "application", "unit": "", "series": []},
    }
    assert step_config("routine", "Run", {"cadence": "", "days": [], "action_kind": "", "action_target": 0, "action_label": ""}) == {
        "cadence": "weekly", "days": [0], "action": {"kind": "check", "target": 1, "label": "", "unit": "", "series": []},
    }
