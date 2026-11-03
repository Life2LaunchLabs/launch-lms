"""The Oregon EPP framework and yearly plan: drafts on install, every requirement covered, and work found by code."""

import pytest
from sqlmodel import select

from src.db.goals import Goal, GoalAssignmentCreate, GoalStep, GoalTemplate, StepStatus, StepSubmission
from src.db.requirements import (
    RequirementAssignmentBatch,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementFramework,
    RequirementFrameworkVersion,
    RequirementNode,
)
from src.db.plan_collections import PlanCollection, PlanCollectionItem
from src.services import requirements
from src.services.epp import content
from src.services.goals import assignments, goals, templates
from src.services.goals import requirements as learner_requirements
from src.tests.test_goals import ADMIN, LEARNER, _session, _status, _step, _user


@pytest.fixture
def db():
    session = _session()
    for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode, RequirementAssignmentBatch,
                  RequirementEnrollment, RequirementAttainmentSource, PlanCollection, PlanCollectionItem):
        model.__table__.create(session.get_bind(), checkfirst=True)  # type: ignore[attr-defined]
    yield session
    session.close()


def test_codes_are_unique_and_every_requirement_has_a_step():
    document = content.framework_document()
    codes = content.codes()
    assert len(codes) == len(set(codes)) and all(code.startswith("EPP.") for code in codes)
    parents = {node.get("parent_node_uuid") for node in document["nodes"]}
    leaves = {node["code"] for node in document["nodes"] if node["node_uuid"] not in parents}
    linked = [code for stage in content.plan_document({code: code for code in codes})["stages"] for step in stage["steps"] for code in step["requirement_node_uuids"]]
    assert set(linked) == leaves
    # The report reads these codes, so they mustn't move.
    assert {"EPP.GOALS.PREPARATION", "EPP.CRLE.REFLECTION", "EPP.EXTAPP.EVIDENCE", "EPP.PROGRESS.REVIEW"} <= leaves


def test_install_makes_drafts_and_a_learner_shows_met_planned_and_gap(db):
    admin = _user(ADMIN)
    installed = content.install(db, admin, 1)
    framework = db.exec(select(RequirementFramework).where(RequirementFramework.framework_uuid == installed["framework_uuid"])).one()
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == installed["template_uuid"])).one()
    # Both are drafts: publishing is the organization's call.
    assert framework.published_version is None and template.published_version_id is None

    # Published here only to walk a learner through it.
    requirements.publish_framework(db, admin, 1, installed["framework_uuid"])
    templates.publish(db, admin, 1, installed["template_uuid"])
    assignments.assign(db, admin, 1, installed["template_uuid"], GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
    goal_uuid = goals.list_my_goals(db, _user(LEARNER))[0]["goal_uuid"]
    goals.respond(db, _user(LEARNER), goal_uuid, True)
    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()
    view = goals.get_goal(db, _user(LEARNER), goal_uuid)

    written = _step(view, "What my assessments told me")
    goals.save_submission(db, _user(LEARNER), goal_uuid, written["step_uuid"], StepSubmission(submission={"text": "It said I like helping people."}))
    _status(db, LEARNER, goal, written, StepStatus.COMPLETED)
    # A district dropped the strengths step from this learner's copy.
    dropped = db.exec(select(GoalStep).where(GoalStep.step_uuid == _step(view, "Show your strengths")["step_uuid"])).one()
    db.delete(dropped)
    db.commit()

    states = {node["code"]: node["state"] for node in learner_requirements.learner_requirements(db, admin, 1, LEARNER)["frameworks"][0]["nodes"]}
    assert states["EPP.INTERESTS.ASSESSMENTS"] == "met"
    assert states["EPP.GOALS.PREPARATION"] == "planned"
    assert states["EPP.INTERESTS.STRENGTHS"] == "gap"

    # The report finds work by code, whatever the step is called.
    found = content.steps_for_code(db, LEARNER, 1, "EPP.INTERESTS.ASSESSMENTS")
    assert [step.step_uuid for step in found] == [written["step_uuid"]]
    assert content.steps_for_code(db, LEARNER, 1, "EPP.INTERESTS.STRENGTHS") == []
    assert content.steps_for_code(db, LEARNER, 2, "EPP.INTERESTS.ASSESSMENTS") == []
