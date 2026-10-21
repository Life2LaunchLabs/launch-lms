from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalCreate, GoalStatus, StepCreate, StepUpdate, StepProgress, StepStatus, StepStatusChange
from src.db.planning import PlanWeeklyFocus
from src.services.goals import goals, home, lifecycle, structure
from src.tests.test_goals import LEARNER, _issue, _published, _session, _user


def _home_session():
    db = _session()
    PlanWeeklyFocus.__table__.create(db.get_bind())
    return db


def _goal(db, title: str, steps: list[str], **step_kwargs) -> dict:
    view = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title=title))
    for step in steps:
        view = structure.add_step(db, _user(LEARNER), view["goal_uuid"], StepCreate(type="task", title=step, **step_kwargs))
    return view


def _add(db, goal: dict, title: str, **kwargs) -> dict:
    return structure.add_step(db, _user(LEARNER), goal["goal_uuid"], StepCreate(type="task", title=title, **kwargs))


def _complete(db, item: dict, status=StepStatus.COMPLETED):
    goals.change_status(db, _user(LEARNER), item["goal"]["goal_uuid"], item["step_uuid"], StepStatusChange(status=status))


def _home(db, today=None):
    return home.home(db, _user(LEARNER), today or date.today())


def test_week_fills_to_the_target_across_goals_and_stays_stable():
    with _home_session() as db:
        _goal(db, "Adaptability", [f"Activity {n}" for n in range(1, 5)])
        _goal(db, "Summer job", [f"Job step {n}" for n in range(1, 5)])
        first = _home(db)
        titles = [item["title"] for item in first["week"]["items"]]
        assert first["week"]["target"] == 5 and len(titles) == 5
        # Round-robin keeps both goals moving.
        assert {"Activity 1", "Job step 1", "Activity 2", "Job step 2"} <= set(titles)
        assert [item["title"] for item in _home(db)["week"]["items"]] == titles
        assert len(first["next_week"]["items"]) == 3 and first["later"] == []
        assert [goal["title"] for goal in first["goals"]] == ["Adaptability", "Summer job"]


def test_items_are_steps_with_their_type_state_and_route():
    with _home_session() as db:
        goal = _goal(db, "Summer job", ["Resume"])
        item = _home(db)["week"]["items"][0]
        step_uuid = goal["stages"][0]["steps"][0]["step_uuid"] if goal["stages"][0]["steps"] else goal["unstaged_steps"][0]["step_uuid"]
        assert item["step_uuid"] == step_uuid and item["type"] == "task" and item["state"] == "open" and item["status"] == "not_started"
        assert item["goal"] == {"goal_uuid": goal["goal_uuid"], "title": "Summer job"}
        assert item["route"] == f"/plans/{goal['goal_uuid']}?step={step_uuid}"
        assert item["locked"] is False and item["fraction"] == 0 and item["placement"] == "week"


def test_higher_priority_goals_come_first():
    with _home_session() as db:
        _goal(db, "First made", ["A1", "A2"])
        urgent = _goal(db, "Urgent", ["U1", "U2"])
        row = db.exec(select(Goal).where(Goal.goal_uuid == urgent["goal_uuid"])).one()
        row.priority = 5
        db.add(row)
        db.commit()
        assert [goal["title"] for goal in _home(db)["goals"]] == ["Urgent", "First made"]
        assert _home(db)["week"]["items"][0]["title"] == "U1"


def test_ready_for_more_and_pace():
    with _home_session() as db:
        today = date.today()
        _goal(db, "Summer job", [f"Step {n}" for n in range(1, 11)])
        week = _home(db, today)["week"]
        assert week["complete"] is False
        for item in week["items"]:
            _complete(db, item)
        week = _home(db, today)["week"]
        assert week["complete"] is True and week["done_count"] == 5 and week["can_boost"] is True

        boosted = home.ready_for_more(db, _user(LEARNER), today)["week"]
        assert boosted["boosts"] == 1
        assert len([item for item in boosted["items"] if item["status"] != "completed"]) == 3

        # A new target starts next week; this week keeps the steps and target it was planned with.
        paced = home.set_pace(db, _user(LEARNER), 3, today)
        assert paced["week"]["target"] == 5 and paced["week"]["next_target"] == 3
        assert len(paced["week"]["items"]) == len(boosted["items"])
        following = _home(db, today + timedelta(days=7))["week"]
        assert following["target"] == 3 and following["next_target"] == 3
        with pytest.raises(HTTPException):
            home.set_pace(db, _user(LEARNER), 0, today)


def test_a_week_with_nothing_planned_takes_a_new_target_now():
    with _home_session() as db:
        assert _home(db)["week"]["items"] == []
        paced = home.set_pace(db, _user(LEARNER), 2, date.today())["week"]
        assert paced["target"] == 2 and paced["next_target"] == 2
        _goal(db, "Summer job", [f"Step {n}" for n in range(1, 6)])
        assert len(_home(db)["week"]["items"]) == 2


def test_unfinished_steps_carry_into_next_week_and_dates_group_by_month():
    with _home_session() as db:
        today = date.today()
        goal = _goal(db, "Summer job", [f"Step {n}" for n in range(1, 12)])
        due = today + timedelta(days=60)
        _add(db, goal, "Apply by the deadline", due_date=due)
        week = _home(db, today)
        picked = [item["title"] for item in week["week"]["items"]]
        _complete(db, week["week"]["items"][0])

        month = next(group for group in week["months"] if group["key"] == due.strftime("%Y-%m"))
        assert [item["title"] for item in month["items"]] == ["Apply by the deadline"]

        carried = [item["title"] for item in _home(db, today + timedelta(days=7))["week"]["items"]]
        assert carried[:4] == picked[1:5] and len(carried) == 5


def test_goal_started_mid_week_waits_instead_of_growing_the_week():
    with _home_session() as db:
        today = date.today()
        _goal(db, "Summer job", [f"Step {n}" for n in range(1, 6)])
        week = _home(db, today)["week"]
        planned = [item["title"] for item in week["items"]]
        for item in week["items"][:4]:
            _complete(db, item)

        new = _goal(db, "Interview prep", ["Research", "Practice"])
        _add(db, new, "Mock interview", due_date=today)

        result = _home(db, today)
        assert sorted(item["title"] for item in result["week"]["items"]) == sorted(planned)
        assert result["week"]["new_goals"] == [{"goal": {"goal_uuid": new["goal_uuid"], "title": "Interview prep"}, "steps": 1}]
        # Its step due now is not lost: it leads Next week until pulled in.
        assert result["next_week"]["items"][0]["title"] == "Mock interview"

        pulled = home.pull_in_goal(db, _user(LEARNER), new["goal_uuid"], today)
        titles = [item["title"] for item in pulled["week"]["items"]]
        assert "Mock interview" in titles and "Research" in titles
        assert pulled["week"]["new_goals"] == []
        with pytest.raises(HTTPException) as missing:
            home.pull_in_goal(db, _user(LEARNER), "goal_nope", today)
        assert missing.value.status_code == 404


def test_open_steps_come_before_finished_ones_this_week():
    with _home_session() as db:
        _goal(db, "Summer job", [f"Step {n}" for n in range(1, 6)])
        _complete(db, _home(db)["week"]["items"][0])
        statuses = [item["status"] for item in _home(db)["week"]["items"]]
        assert statuses[-1] == "completed" and "completed" not in statuses[:-1]


def test_open_steps_due_later_can_start_this_week_and_locked_ones_wait():
    with _home_session() as db:
        today = date.today()
        later = today + timedelta(days=90)
        goal = _goal(db, "College apps", ["Essay draft", "Recommendation letters", "Submit"], due_date=later)
        uuids = [step["step_uuid"] for stage in goal["stages"] for step in stage["steps"]] + [step["step_uuid"] for step in goal["unstaged_steps"]]
        for before, step_uuid in zip(uuids, uuids[1:]):
            structure.update_step(db, _user(LEARNER), goal["goal_uuid"], step_uuid, StepUpdate(after_step_uuids=[before]))
        result = _home(db, today)
        # Nothing is more pressing, so the open step starts now; locked ones wait.
        assert [item["title"] for item in result["week"]["items"]] == ["Essay draft"]
        month = next(group for group in result["months"] if group["key"] == later.strftime("%Y-%m"))
        assert [item["title"] for item in month["items"]] == ["Recommendation letters", "Submit"]
        assert month["items"][0]["state"] == "locked" and month["items"][0]["locked_reason"]["title"] == "Essay draft"


def test_steps_that_open_later_are_not_picked():
    with _home_session() as db:
        today = date.today()
        _goal(db, "Summer job", ["Later"], start_date=today + timedelta(days=20))
        result = _home(db, today)
        # Next week may preview it, but this week never picks a step that isn't open.
        assert result["week"]["items"] == [] and result["next_week"]["items"][0]["locked_reason"]["kind"] == "opens"


def test_finishing_a_goal_does_not_refill_a_finished_week():
    with _home_session() as db:
        today = date.today()
        issued = _issue(db, _published(db, {"type": "task", "title": "Step 1"}, {"type": "task", "title": "Step 2"}, {"type": "task", "title": "Step 3"}))
        week = _home(db, today)["week"]
        assert len(week["items"]) == 3
        # A goal started mid-week waits for the learner instead of joining the week.
        later = _goal(db, "Interview prep", ["Research", "Practice"])
        for item in week["items"]:
            _complete(db, item)
        db.refresh(issued)
        assert issued.status == GoalStatus.FINISHED.value

        week = _home(db, today)["week"]
        assert week["complete"] is True and week["done_count"] == 3
        assert [item["goal"]["title"] for item in week["items"]] == ["College ready"] * 3
        assert not any(item["goal"]["goal_uuid"] == later["goal_uuid"] for item in week["items"])
        more = home.ready_for_more(db, _user(LEARNER), today)["week"]
        assert sorted(item["title"] for item in more["items"] if item["status"] != "completed") == ["Practice", "Research"]


def test_finished_goal_greets_its_learner_once():
    with _home_session() as db:
        goal = _goal(db, "Summer job", ["Step 1"])
        assert _home(db)["celebrations"] == []
        row = db.exec(select(Goal).where(Goal.goal_uuid == goal["goal_uuid"])).one()
        row.status, row.finished_at = GoalStatus.FINISHED, datetime.now()
        db.add(row)
        db.commit()
        assert _home(db)["celebrations"] == [goal["goal_uuid"]]
        assert lifecycle.mark_celebrated(db, _user(LEARNER), goal["goal_uuid"])["celebration_pending"] is False
        assert _home(db)["celebrations"] == []


def test_reading_home_writes_no_progress():
    with _home_session() as db:
        _goal(db, "Summer job", ["Step 1", "Step 2"])
        _home(db)
        assert not db.new and db.exec(select(StepProgress)).all() == []
