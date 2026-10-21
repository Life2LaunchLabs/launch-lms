from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from src.db.goals import GoalCreate, GoalFinish, StageCreate, StageUpdate, StepCreate, StepStatus, StepStatusChange, StepUpdate
from src.services.goals import goals, lifecycle, schedule, structure
from src.tests.test_goals import LEARNER, _session, _user

TODAY = date.today()


def _plan(db, stages: list[str]) -> dict:
    view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Summer job"))
    for title in stages[len(view["stages"]):]:
        view = structure.add_stage(db, _user(LEARNER), view["goal_uuid"], StageCreate(title=title))
    for stage, title in zip(view["stages"], stages):
        view = structure.update_stage(db, _user(LEARNER), view["goal_uuid"], stage["stage_uuid"], StageUpdate(title=title))
    return view


def _step(db, view: dict, stage: int, title: str, **kwargs) -> dict:
    return structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="task", title=title, stage_uuid=view["stages"][stage]["stage_uuid"], **kwargs))


def _get(db, view: dict) -> dict:
    return goals.get_goal(db, _user(LEARNER), view["goal_uuid"])


def _current(db, view: dict) -> str:
    current = _get(db, view)
    return next(stage["title"] for stage in current["stages"] if stage["stage_uuid"] == current["current_stage_uuid"])


def _done(db, view: dict, title: str):
    step = next(step for stage in _get(db, view)["stages"] for step in stage["steps"] if step["title"] == title)
    goals.change_status(db, _user(LEARNER), view["goal_uuid"], step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))


def test_a_goal_starts_on_its_first_stage_and_moves_on_only_when_asked_or_dated():
    with _session() as db:
        view = _plan(db, ["Research", "Apply"])
        _step(db, view, 0, "List five places")
        assert _current(db, view) == "Research"
        _done(db, view, "List five places")
        assert _current(db, view) == "Research"
        schedule.set_current_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][1]["stage_uuid"])
        assert _current(db, view) == "Apply"


def test_stages_run_from_their_start_until_the_next_one_starts():
    with _session() as db:
        view = _plan(db, ["Research", "Apply", "Decide"])
        _step(db, view, 0, "List five places")
        structure.update_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][1]["stage_uuid"], StageUpdate(start_date=TODAY - timedelta(days=2)))
        structure.update_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][2]["stage_uuid"], StageUpdate(start_date=TODAY + timedelta(days=20)))
        assert _current(db, view) == "Apply"
        assert [stage["end_date"] for stage in _get(db, view)["stages"]] == [TODAY - timedelta(days=3), TODAY + timedelta(days=19), None]
        # Going back clears the start of the stage that had begun, so it starts again when the goal gets there.
        schedule.set_current_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][0]["stage_uuid"])
        assert _current(db, view) == "Research"
        assert [stage["start_date"] for stage in _get(db, view)["stages"]] == [None, None, TODAY + timedelta(days=20)]
        # Skipping ahead starts the stage today and drops the start of the one skipped over.
        schedule.set_current_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][2]["stage_uuid"])
        assert [stage["start_date"] for stage in _get(db, view)["stages"]] == [None, None, TODAY]


def test_steps_in_a_stage_that_has_not_started_wait_for_it():
    with _session() as db:
        view = _plan(db, ["Research", "Apply"])
        view = _step(db, view, 1, "Send applications")
        step = view["stages"][1]["steps"][0]
        assert step["locked_reason"] == {"kind": "stage", "title": "Apply", "date": None}
        schedule.set_current_stage(db, _user(LEARNER), view["goal_uuid"], view["stages"][1]["stage_uuid"])
        assert not _get(db, view)["stages"][1]["steps"][0]["locked"]


def test_dates_that_cannot_all_come_true_come_back_as_warnings_not_errors():
    with _session() as db:
        view = _plan(db, ["Research", "Apply"])
        research, apply = view["stages"][0]["stage_uuid"], view["stages"][1]["stage_uuid"]
        structure.update_stage(db, _user(LEARNER), view["goal_uuid"], research, StageUpdate(start_date=TODAY + timedelta(days=10)))
        structure.update_stage(db, _user(LEARNER), view["goal_uuid"], apply, StageUpdate(start_date=TODAY + timedelta(days=5)))
        later = _step(db, view, 1, "Send applications", start_date=TODAY + timedelta(days=30))
        later_uuid = later["stages"][1]["steps"][0]["step_uuid"]
        _step(db, view, 0, "Pick one", due_date=TODAY + timedelta(days=25), after_step_uuids=[later_uuid])
        warnings = {(item["kind"], item["stage_uuid"] or item["step_uuid"]) for item in _get(db, view)["schedule_warnings"]}
        pick = next(step["step_uuid"] for step in _get(db, view)["stages"][0]["steps"])
        assert ("stage_order", apply) in warnings
        assert ("step_after_stage", pick) in warnings and ("waits_on_later", pick) in warnings


def test_a_step_cannot_wait_on_one_that_waits_on_it():
    with _session() as db:
        view = _plan(db, ["Research"])
        _step(db, view, 0, "First")
        view = _step(db, view, 0, "Second")
        first, second = (step["step_uuid"] for step in view["stages"][0]["steps"])
        structure.update_step(db, _user(LEARNER), view["goal_uuid"], second, StepUpdate(after_step_uuids=[first]))
        with pytest.raises(HTTPException) as refused:
            structure.update_step(db, _user(LEARNER), view["goal_uuid"], first, StepUpdate(after_step_uuids=[second]))
        assert refused.value.status_code == 422


def test_moving_to_a_stage_needs_a_stage_on_this_goal():
    with _session() as db:
        view = _plan(db, ["Research"])
        other = _plan(db, ["Elsewhere"])
        with pytest.raises(HTTPException) as refused:
            schedule.set_current_stage(db, _user(LEARNER), view["goal_uuid"], other["stages"][0]["stage_uuid"])
        assert refused.value.status_code == 404


def test_finishing_records_how_it_went_for_the_story():
    with _session() as db:
        view = _plan(db, ["Research"])
        lifecycle.finish(db, _user(LEARNER), view["goal_uuid"], GoalFinish(reached="partly", what_happened="  Got two offers, took neither.  "))
        assert _get(db, view)["finish"] == {"reached": "partly", "what_happened": "Got two offers, took neither."}
