"""Step, review, retention and reach measures on the Riverside fixture (``test_insights``), plus two steps.

Career Launch has steps "intro" then "resume". Learners 10 to 13 finished intro; 10 to 12 finished resume.
Learner 10's intro was handed in Oct 1, sent back Oct 2, handed in again Oct 3 and approved that evening;
11's was handed in Oct 5 and approved a day later. 13's resume is waiting for review. Hillside (org 2) has
one learner on Career Launch too.
"""

from datetime import date

import pytest
from sqlmodel import Session

from src.db.goal_sharing import PlanActivity
from src.db.goals import Goal, GoalStage, GoalStep, StepProgress
from src.db.organizations import Organization
from src.services.insights import engine, sentences
from src.services.insights.measures import MEASURES
from src.services.insights.spec import CardSpec, check
from src.tests.test_insights import ADMIN, ANA, CL, FALL, TODAY, _user
from src.tests.test_insights import db as riverside  # noqa: F401


@pytest.fixture
def db(riverside: Session) -> Session:  # noqa: F811
    riverside.add(Organization(id=2, org_uuid="org_2", name="Hillside", slug="hillside", email="h@example.com"))
    riverside.add(Goal(id=40, goal_uuid="goal_40", org_id=2, owner_user_id=40, subject_user_id=40, title="Plan", template_id=1, version_id=1, status="active",
                       start_date=date(2026, 9, 1), creation_date="2026-09-01"))
    step_id = 100
    for goal_id in FALL:
        riverside.add(GoalStage(id=goal_id, stage_uuid=f"stage_{goal_id}", goal_id=goal_id, position=0, title="Start"))
        for position, key in enumerate(("intro", "resume")):
            step_id += 1
            riverside.add(GoalStep(id=step_id, step_uuid=f"step_{goal_id}_{key}", goal_id=goal_id, stage_id=goal_id, position=position, type="task",
                                   title={"intro": "Introduce yourself", "resume": "Draft your résumé"}[key], template_key=key))
            done = goal_id <= 13 if key == "intro" else goal_id <= 12
            status = "completed" if done else "submitted" if (goal_id, key) == (13, "resume") else "not_started"
            riverside.add(StepProgress(progress_uuid=f"progress_{step_id}", step_id=step_id, status=status))

    def changed(goal_id: int, key: str, when: str, to: str, actor: int) -> None:
        riverside.add(PlanActivity(activity_uuid=f"chg_{goal_id}_{key}_{when}", goal_id=goal_id, actor_user_id=actor, action="step.status",
                                   payload={"step_uuid": f"step_{goal_id}_{key}", "to": to}, creation_date=when))

    changed(10, "intro", "2026-10-01T10:00:00", "submitted", 10)
    changed(10, "intro", "2026-10-02T10:00:00", "changes_requested", ADMIN)
    changed(10, "intro", "2026-10-03T10:00:00", "submitted", 10)
    changed(10, "intro", "2026-10-03T22:00:00", "completed", ADMIN)
    changed(11, "intro", "2026-10-05T10:00:00", "submitted", 11)
    changed(11, "intro", "2026-10-06T10:00:00", "completed", ADMIN)
    riverside.commit()
    return riverside


def _run(db: Session, spec: dict, viewer: int = ADMIN, scope: str = "plan", key: str | None = CL) -> dict:
    ctx = engine.context(db, _user(viewer), 1, scope, key, today=TODAY)
    return engine.run(ctx, CardSpec.model_validate(spec), "all")


def test_step_reach_lists_steps_in_plan_order_with_their_titles(db):
    result = _run(db, {"measure": "step_reach", "by": "step"})
    assert [(row["label"], row["n"], round(row["v"], 3)) for row in result["rows"]] == [("Introduce yourself", 6, round(4 / 6, 3)), ("Draft your résumé", 6, 0.5)]
    assert result["headline"].startswith("Too few to say yet")


def test_the_funnel_headline_names_the_biggest_real_drop():
    measure = MEASURES["step_reach"]
    rows = [{"label": "Intro", "v": 0.9, "n": 40}, {"label": "Résumé", "v": 0.85, "n": 40}, {"label": "Interview", "v": 0.4, "n": 40}]
    assert sentences.funnel(measure, rows) == "The biggest drop is at Interview: 85% finish Résumé, 40% finish Interview"
    flat = [{"label": "Intro", "v": 0.9, "n": 40}, {"label": "Résumé", "v": 0.89, "n": 40}]
    assert sentences.funnel(measure, flat) == "Learners keep going: 89% reach the last step, Résumé"


def test_steps_break_down_only_on_a_plan_dashboard():
    assert check(CardSpec(measure="sent_back_rate", by="step"), "org", see_reports=True)[0]["field"] == "by"
    assert check(CardSpec(measure="sent_back_rate", by="step"), "plan", see_reports=True) == []


def test_sent_back_counts_each_hand_in_once_and_turnaround_is_the_median_wait(db):
    sent = _run(db, {"measure": "sent_back_rate"}, scope="org", key=None)
    assert sent["value"]["n"] == 2 and sent["value"]["v"] == 0.5
    turnaround = _run(db, {"measure": "review_turnaround"}, scope="org", key=None)
    assert turnaround["value"]["n"] == 3 and turnaround["value"]["v"] == 24.0


def test_waiting_for_review_is_today(db):
    result = _run(db, {"measure": "waiting_for_review", "by": "step"})
    assert result["value"]["v"] == 1 and [row["label"] for row in result["rows"]] == ["Draft your résumé"]
    assert result["compare"] is None


def test_retention_is_who_came_back_in_their_second_month(db):
    result = _run(db, {"measure": "retention"}, scope="org", key=None)
    assert result["value"]["n"] == 6 and round(result["value"]["v"], 3) == round(1 / 6, 3)


def test_reach_counts_every_organization_but_never_lists_them_by_name_in_a_drill(db):
    staff = _run(db, {"measure": "plan_reach", "by": "org"}, viewer=ANA)
    assert staff["value"]["v"] == 8
    assert [(row["label"], row["v"]) for row in staff["rows"]] == [("Riverside", 7), ("Hillside", 1)]
    assert staff["drill"] is None and all(row["drill"] is None for row in staff["rows"])
