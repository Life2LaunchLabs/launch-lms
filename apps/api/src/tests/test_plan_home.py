from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from src.db.planning import (
    PlanObjectiveCreate,
    PlanObjectiveProgressUpdate,
    PlanObjectiveStatus,
    PlanObjectiveUpdate,
    PlanPhaseCreate,
    PlanPhaseUpdate,
    PlanUpdate,
    PlanWeeklyFocus,
    StepOrder,
)
from src.services import plan_home, planning
from src.tests.test_planning import _plan_create, _session, _user


def _home_session():
    db = _session()
    PlanWeeklyFocus.__table__.create(db.get_bind())
    return db


def _plan_with_steps(db, name: str, titles: list[str], **objective_kwargs) -> dict:
    plan = planning.create_plan(db, _user(1), _plan_create(name))
    for title in titles:
        plan = planning.create_objective(db, _user(1), plan["slug"], PlanObjectiveCreate(title=title, **objective_kwargs))
    return plan


def _steps(detail: dict) -> dict[str, dict]:
    return {item["title"]: item for item in detail["objectives"]}


def _complete(db, plan: dict, objective_uuid: str, status=PlanObjectiveStatus.COMPLETED):
    planning.update_objective_progress(db, _user(1), plan["slug"], objective_uuid, PlanObjectiveProgressUpdate(status=status))


def test_in_order_plan_opens_one_step_at_a_time():
    with _home_session() as db:
        plan = _plan_with_steps(db, "Adaptability", ["Notice", "Respond", "Show"])
        plan = planning.update_plan(db, _user(1), plan["slug"], PlanUpdate(step_order=StepOrder.IN_ORDER))
        steps = _steps(plan)
        assert plan["step_order"] == "in_order"
        assert steps["Notice"]["availability"] == {"state": "open", "reason": None}
        assert steps["Respond"]["availability"]["state"] == "not_ready"
        assert steps["Respond"]["availability"]["reason"] == {"kind": "after", "objective_uuid": steps["Notice"]["objective_uuid"], "title": "Notice"}
        assert steps["Show"]["availability"]["reason"]["title"] == "Respond"

        # Waiting on review is enough to unlock what comes next.
        _complete(db, plan, steps["Notice"]["objective_uuid"], PlanObjectiveStatus.SUBMITTED)
        steps = _steps(planning.get_plan(db, _user(1), plan["slug"]))
        assert steps["Respond"]["availability"]["state"] == "open"
        assert steps["Show"]["availability"]["reason"]["title"] == "Respond"


def test_chapters_open_on_schedule_or_when_the_previous_chapter_is_done():
    with _home_session() as db:
        plan = planning.create_plan(db, _user(1), _plan_create("Senior year"))
        plan = planning.create_phase(db, _user(1), plan["slug"], PlanPhaseCreate(name="Fall"))
        plan = planning.create_phase(db, _user(1), plan["slug"], PlanPhaseCreate(name="Winter"))
        fall, winter = plan["phases"][0]["phase_uuid"], plan["phases"][1]["phase_uuid"]
        plan = planning.create_objective(db, _user(1), plan["slug"], PlanObjectiveCreate(title="FAFSA night", phase_uuid=fall))
        plan = planning.create_objective(db, _user(1), plan["slug"], PlanObjectiveCreate(title="Personal statement", phase_uuid=winter))
        plan = planning.update_plan(db, _user(1), plan["slug"], PlanUpdate(step_order=StepOrder.BY_CHAPTER))
        steps = _steps(plan)
        assert steps["Personal statement"]["availability"]["reason"]["title"] == "FAFSA night"

        _complete(db, plan, steps["FAFSA night"]["objective_uuid"])
        opens = date.today() + timedelta(days=30)
        plan = planning.update_phase(db, _user(1), plan["slug"], winter, PlanPhaseUpdate(start_date=opens))
        assert _steps(plan)["Personal statement"]["availability"] == {
            "state": "not_ready", "reason": {"kind": "opens", "date": opens.isoformat()},
        }


def test_explicit_prerequisites_stay_inside_the_plan():
    with _home_session() as db:
        plan = _plan_with_steps(db, "Summer job", ["Practice an interview", "Mock interview"])
        other = _plan_with_steps(db, "Other", ["Elsewhere"])
        steps = _steps(plan)
        practice, mock = steps["Practice an interview"]["objective_uuid"], steps["Mock interview"]["objective_uuid"]
        plan = planning.update_objective(db, _user(1), plan["slug"], mock, PlanObjectiveUpdate(after_objective_uuids=[practice]))
        assert _steps(plan)["Mock interview"]["availability"]["reason"]["title"] == "Practice an interview"
        assert _steps(plan)["Practice an interview"]["availability"]["state"] == "open"
        with pytest.raises(HTTPException) as foreign:
            planning.update_objective(db, _user(1), plan["slug"], mock, PlanObjectiveUpdate(
                after_objective_uuids=[other["objectives"][0]["objective_uuid"]],
            ))
        assert foreign.value.status_code == 422


def test_week_fills_to_the_target_across_plans_and_stays_stable():
    with _home_session() as db:
        today = date.today()
        _plan_with_steps(db, "Adaptability", [f"Activity {n}" for n in range(1, 5)])
        _plan_with_steps(db, "Summer job", [f"Job step {n}" for n in range(1, 5)])
        first = plan_home.home(db, _user(1), today)
        titles = [item["title"] for item in first["week"]["items"]]
        assert first["week"]["target"] == 5
        assert len(titles) == 5
        # Round-robin keeps both plans moving.
        assert {"Activity 1", "Job step 1", "Activity 2", "Job step 2"} <= set(titles)
        assert [item["title"] for item in plan_home.home(db, _user(1), today)["week"]["items"]] == titles
        # Next week previews the next batch; nothing is left for later yet.
        assert len(first["next_week"]["items"]) == 3
        assert first["later"] == []


def test_ready_for_more_and_pace():
    with _home_session() as db:
        today = date.today()
        plan = _plan_with_steps(db, "Summer job", [f"Step {n}" for n in range(1, 11)])
        week = plan_home.home(db, _user(1), today)["week"]
        assert week["complete"] is False
        for item in week["items"]:
            _complete(db, plan, item["objective_uuid"])
        week = plan_home.home(db, _user(1), today)["week"]
        assert week["complete"] is True and week["done_count"] == 5 and week["can_boost"] is True

        boosted = plan_home.ready_for_more(db, _user(1), today)["week"]
        assert boosted["boosts"] == 1
        assert len([item for item in boosted["items"] if item["progress"]["status"] != "completed"]) == 3

        paced = plan_home.set_pace(db, _user(1), 3, today)
        assert paced["week"]["target"] == 3
        with pytest.raises(HTTPException):
            plan_home.set_pace(db, _user(1), 0, today)


def test_unfinished_steps_carry_into_next_week_and_dates_group_by_month():
    with _home_session() as db:
        today = date.today()
        plan = _plan_with_steps(db, "Summer job", [f"Step {n}" for n in range(1, 8)])
        due = today + timedelta(days=60)
        plan = planning.create_objective(db, _user(1), plan["slug"], PlanObjectiveCreate(title="Apply by the deadline", due_date=due))
        week = plan_home.home(db, _user(1), today)
        picked = [item["title"] for item in week["week"]["items"]]
        _complete(db, plan, week["week"]["items"][0]["objective_uuid"])

        month = next(group for group in week["months"] if group["key"] == due.strftime("%Y-%m"))
        assert [item["title"] for item in month["items"]] == ["Apply by the deadline"]

        following = plan_home.home(db, _user(1), today + timedelta(days=7))
        carried = [item["title"] for item in following["week"]["items"]]
        assert carried[:4] == picked[1:5]
        assert len(carried) == 5


def test_people_without_edit_rights_cannot_start_a_step_that_is_not_ready():
    from src.db.planning import PlanInvitationCreate, PlanInvitationKind

    with _home_session() as db:
        plan = _plan_with_steps(db, "Adaptability", ["Notice", "Respond"])
        plan = planning.update_plan(db, _user(1), plan["slug"], PlanUpdate(step_order=StepOrder.IN_ORDER))
        invitation = planning.create_invitation(db, _user(1), plan["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="reviewer", kind=PlanInvitationKind.COLLABORATOR,
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        steps = _steps(plan)
        with pytest.raises(HTTPException) as early:
            planning.update_objective_progress(db, _user(2), plan["slug"], steps["Respond"]["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.IN_PROGRESS))
        assert early.value.status_code == 409
        assert early.value.detail["availability"]["reason"]["title"] == "Notice"
        planning.update_objective_progress(db, _user(2), plan["slug"], steps["Notice"]["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.IN_PROGRESS))


def test_plan_started_mid_week_waits_instead_of_growing_the_week():
    with _home_session() as db:
        today = date.today()
        plan = _plan_with_steps(db, "Summer job", [f"Step {n}" for n in range(1, 6)])
        week = plan_home.home(db, _user(1), today)["week"]
        planned = [item["title"] for item in week["items"]]
        for item in week["items"][:4]:
            _complete(db, plan, item["objective_uuid"])

        new = planning.create_plan(db, _user(1), _plan_create("Interview prep"))
        for title in ["Research", "Practice"]:
            new = planning.create_objective(db, _user(1), new["slug"], PlanObjectiveCreate(title=title))
        planning.create_objective(db, _user(1), new["slug"], PlanObjectiveCreate(title="Mock interview", due_date=today))

        home = plan_home.home(db, _user(1), today)
        assert sorted(item["title"] for item in home["week"]["items"]) == sorted(planned)
        assert home["week"]["new_plans"] == [{"plan": {"plan_uuid": new["plan_uuid"], "slug": new["slug"], "name": "Interview prep"}, "steps": 1}]
        # Its step due now is not lost: it leads Next week until pulled in.
        assert home["next_week"]["items"][0]["title"] == "Mock interview"

        pulled = plan_home.pull_in_plan(db, _user(1), new["plan_uuid"], today)
        titles = [item["title"] for item in pulled["week"]["items"]]
        assert "Mock interview" in titles and "Research" in titles
        assert pulled["week"]["new_plans"] == []


def test_open_steps_come_before_finished_ones_this_week():
    with _home_session() as db:
        today = date.today()
        plan = _plan_with_steps(db, "Summer job", [f"Step {n}" for n in range(1, 6)])
        week = plan_home.home(db, _user(1), today)["week"]
        _complete(db, plan, week["items"][0]["objective_uuid"])
        statuses = [item["progress"]["status"] for item in plan_home.home(db, _user(1), today)["week"]["items"]]
        assert statuses[-1] == "completed" and "completed" not in statuses[:-1]


def test_resaving_a_finished_step_keeps_when_it_was_finished():
    from src.db.planning import PlanObjectiveProgress
    from sqlmodel import select

    with _home_session() as db:
        plan = _plan_with_steps(db, "Summer job", ["Step 1"])
        step = plan["objectives"][0]["objective_uuid"]
        _complete(db, plan, step)
        row = db.exec(select(PlanObjectiveProgress)).first()
        finished = row.completed_at - timedelta(days=30)
        row.completed_at = finished
        db.add(row)
        db.commit()
        planning.update_objective_progress(db, _user(1), plan["slug"], step, PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED, note="Added a note"))
        db.refresh(row)
        assert row.completed_at == finished


def test_finished_plan_greets_its_learner_once():
    with _home_session() as db:
        plan = _plan_with_steps(db, "Summer job", ["Step 1"])
        assert plan["celebration_pending"] is False
        planning.change_plan_status(db, _user(1), plan["slug"], planning.PlanStatus.COMPLETED)
        assert planning.get_plan(db, _user(1), plan["slug"])["celebration_pending"] is True
        planning.mark_plan_celebrated(db, _user(1), plan["slug"])
        assert planning.get_plan(db, _user(1), plan["slug"])["celebration_pending"] is False
