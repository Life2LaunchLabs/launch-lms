"""Requirement measures, the framework dashboard and the evidence attachment on the Riverside fixture with steps
(``test_insights_steps``).

Graduation has two categories: A Career (A.1 Introduce yourself, A.2 Résumé) and B Service (B.1 Volunteer).
Learners 10 to 13 are tracked. Each finished Career Launch intro credits A.1 and each finished résumé A.2.
Learner 10's résumé is also credited by a Résumé Ready step, and staff credited their B.1 directly, so 10
met every requirement on Oct 15.
"""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import GoalStep, StepProgress
from src.db.requirements import (
    RequirementAssignmentBatch,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementFramework,
    RequirementFrameworkVersion,
    RequirementNode,
)
from src.services.insights import context, engine
from src.services.insights.captures import ATTACHMENTS
from src.services.insights.evidence import evidence
from src.services.insights.spec import CardSpec, check
from src.tests.test_insights import ADMIN, ANA, TODAY, _user
from src.tests.test_insights_steps import db as with_steps  # noqa: F401
from src.tests.test_insights_steps import riverside  # noqa: F401

FW = "fw_grad"
NODES = [
    {"node_uuid": "cat_a", "parent_node_uuid": None, "code": "A", "title": "Career", "position": 0},
    {"node_uuid": "a1", "parent_node_uuid": "cat_a", "code": "A.1", "title": "Introduce yourself", "position": 0},
    {"node_uuid": "a2", "parent_node_uuid": "cat_a", "code": "A.2", "title": "Résumé", "position": 1},
    {"node_uuid": "cat_b", "parent_node_uuid": None, "code": "B", "title": "Service", "position": 1},
    {"node_uuid": "b1", "parent_node_uuid": "cat_b", "code": "B.1", "title": "Volunteer", "position": 0},
]


@pytest.fixture
def db(with_steps: Session) -> Session:  # noqa: F811
    session = with_steps
    session.add(RequirementFramework(id=1, framework_uuid=FW, org_id=1, name="Graduation"))
    session.add(RequirementFrameworkVersion(id=1, version_uuid="fwv_1", framework_id=1, version_number=1, status="published"))
    session.add_all([RequirementNode(node_version_uuid=f"nv_{node['node_uuid']}", version_id=1, node_uuid=node["node_uuid"], parent_node_uuid=node["parent_node_uuid"], code=node["code"], title=node["title"],
                                     position=node["position"]) for node in NODES])
    session.add(RequirementAssignmentBatch(id=1, batch_uuid="batch_1", org_id=1, framework_id=1, version_id=1))
    snapshot = {"framework_uuid": FW, "name": "Graduation", "version": 1, "nodes": NODES, "leaf_node_uuids": ["a1", "a2", "b1"]}
    for user_id in (10, 11, 12, 13):
        session.add(RequirementEnrollment(id=user_id, enrollment_uuid=f"enr_{user_id}", batch_id=1, org_id=1, framework_id=1, version_id=1, user_id=user_id,
                                          status="completed" if user_id == 10 else "active", framework_snapshot=snapshot,
                                          completed_at=datetime(2026, 10, 15) if user_id == 10 else None))
    session.add(GoalStep(id=200, step_uuid="step_31_resume", goal_id=31, position=0, type="task", title="Polish your résumé"))
    session.add(StepProgress(progress_uuid="progress_200", step_id=200, status="completed"))
    session.commit()
    progress = {row.step_id: int(row.id) for row in session.exec(select(StepProgress)).all()}

    def credit(user_id: int, node: str, step_id: int | None, day: str, title: str) -> None:
        session.add(RequirementAttainmentSource(source_uuid=f"src_{user_id}_{node}_{step_id}", enrollment_id=user_id, node_uuid=node,
                                                step_progress_id=progress[step_id] if step_id else None, objective_title=title,
                                                verified_by_user_id=ADMIN, verified_at=datetime.fromisoformat(day)))

    for user_id, intro, resume in ((10, 101, 102), (11, 103, 104), (12, 105, 106), (13, 107, None)):
        credit(user_id, "a1", intro, "2026-10-06T10:00:00", "Introduce yourself")
        if resume:
            credit(user_id, "a2", resume, "2026-10-14T10:00:00", "Draft your résumé")
    credit(10, "a2", 200, "2026-10-10T10:00:00", "Polish your résumé")
    credit(10, "b1", None, "2026-10-15T10:00:00", "Volunteer day")
    session.commit()
    return session


def _run(db: Session, spec: dict, scope: str = "framework", key: str | None = FW, viewer: int = ADMIN) -> dict:
    ctx = engine.context(db, _user(viewer), 1, scope, key, today=TODAY)
    return engine.run(ctx, CardSpec.model_validate(spec), "all")


def test_tracked_met_and_completed_count_each_learner_once(db):
    assert _run(db, {"measure": "learners_tracked"})["value"]["v"] == 4
    met = _run(db, {"measure": "requirements_met"})
    assert met["value"]["v"] == 8 and met["headline"] == "8 requirements met"
    assert _run(db, {"measure": "frameworks_completed"})["value"]["v"] == 1


def test_a_requirement_is_met_on_its_earliest_credit_and_counts_for_every_plan_that_credited_it(db):
    by_time = _run(db, {"measure": "requirements_met", "by": "time", "range": "28d"}, scope="org", key=None)
    assert sum(point["v"] or 0 for point in by_time["series"]["points"]) == 8
    by_plan = {row["label"]: row["v"] for row in _run(db, {"measure": "requirements_met", "by": "plan"})["rows"]}
    assert by_plan == {"Career Launch": 7, "Résumé Ready": 1}


def test_progress_by_category_follows_the_framework_order(db):
    result = _run(db, {"measure": "requirement_progress", "by": "category"})
    assert [(row["label"], row["n"], round(row["v"], 3)) for row in result["rows"]] == [("A Career", 8, round(7 / 8, 3)), ("B Service", 4, 0.25)]
    assert round(_run(db, {"measure": "requirement_progress"})["value"]["v"], 3) == round(8 / 12, 3)


def test_categories_break_down_only_on_a_framework_dashboard_and_the_framework_is_pinned():
    assert check(CardSpec(measure="requirement_progress", by="category"), "org", see_reports=True)[0]["field"] == "by"
    assert check(CardSpec(measure="requirement_progress", by="framework"), "framework", see_reports=True)[0]["field"] == "by"
    assert check(CardSpec(measure="requirement_progress", by="framework"), "org", see_reports=True) == []


def test_the_framework_switcher_and_scope_stay_in_the_organization(db):
    pop = context.population(db, _user(ANA), 1)
    assert context.objects(db, pop, "framework") == [{"key": FW, "label": "Graduation", "learners": 4}]
    with pytest.raises(HTTPException) as caught:
        context.scope(db, pop, "framework", "fw_elsewhere")
    assert caught.value.status_code == 404


def test_evidence_lists_every_credit_with_its_plan_and_step(db):
    ctx = engine.context(db, _user(ADMIN), 1, "framework", FW, today=TODAY)
    out = evidence(ctx, None)  # type: ignore[arg-type]
    rows = out["rows"]
    assert len(rows) == 9
    tens = [(row["code"], row["plan"], row["step"], row["credited_on"]) for row in rows if row["learner"] == "Learner 10"]
    assert tens == [("A.1", "Career Launch", "Introduce yourself", "2026-10-06"), ("A.2", "Résumé Ready", "Polish your résumé", "2026-10-10"),
                    ("A.2", "Career Launch", "Draft your résumé", "2026-10-14"), ("B.1", "", "Volunteer day", "2026-10-15")]
    assert rows[0]["category"] == "A Career" and rows[0]["verified_by"] == "Staff 1"
    assert ATTACHMENTS["requirement_evidence"].public is False and "framework" in ATTACHMENTS["requirement_evidence"].scopes


def test_staff_count_only_their_learners(db):
    # Ana staffs Fall (10 to 15), so she sees everyone tracked here; a learner outside her groups would be left out.
    assert _run(db, {"measure": "learners_tracked"}, viewer=ANA)["value"]["v"] == 4


def test_the_framework_starter_runs(db):
    from src.services.insights import library

    cards = library.template("framework.progress")["cards"]  # type: ignore[index]
    results = engine.run_cards(engine.context(db, _user(ADMIN), 1, "framework", FW, today=TODAY), cards, "90d")
    assert all("error" not in result for result in results.values())
