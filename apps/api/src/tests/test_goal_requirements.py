import csv
import io
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalAssignmentCreate, GoalStage, GoalStep, StepEntryCreate, StepEntryKind, StepProgress, StepStatus
from src.db.learning import LearningActivity, LearningPage, LearningResponseAttempt, LearningRun
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.requirements import (
    RequirementAssignmentBatch,
    RequirementAssignmentCreate,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
)
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services import requirements
from src.services.goals import assignments, goals, templates
from src.services.goals import requirement_evidence as evidence
from src.services.goals import requirements as service
from src.services.goals.requirements import MakeupStep
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _document, _session, _status, _step, _user

TEACHER = 4


@pytest.fixture
def world():
    db = _session()
    for model in (RequirementFramework, RequirementFrameworkVersion,
                  RequirementNode, RequirementAssignmentBatch, RequirementEnrollment, RequirementAttainmentSource):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(User(id=TEACHER, user_uuid="user_4", username="teach", email="te@example.com", first_name="Terry", last_name="Teach", creation_date=NOW, update_date=NOW))
    # A teacher: can run goals for the organization, but isn't an admin.
    db.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.add(UserOrganization(user_id=TEACHER, org_id=1, role_id=5, creation_date=NOW, update_date=NOW))
    db.commit()
    admin = _user(ADMIN)
    framework = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=1, name="Career Ready", nodes=[
        RequirementNodeInput(node_uuid="new-a", title="Experiences"),
        RequirementNodeInput(node_uuid="new-a1", parent_node_uuid="new-a", title="Resume"),
        RequirementNodeInput(node_uuid="new-a2", parent_node_uuid="new-a", title="Workplace experience"),
    ]))
    requirements.publish_framework(db, admin, 1, framework["framework_uuid"])
    nodes = {node["title"]: node["node_uuid"] for node in requirements.get_framework(db, admin, 1, framework["framework_uuid"])["nodes"]}
    created = templates.create_template(db, admin, 1, _document(
        {"key": "resume", "type": "upload", "title": "Your first resume", "review_required": True, "reviewer_guidance": "One page",
         "config": {"slots": [{"key": "resume", "label": "Resume link", "kinds": ["link"]}]}, "requirement_node_uuids": [nodes["Resume"]]},
        {"key": "fair", "type": "task", "title": "Career Fair"},
    ))
    templates.publish(db, admin, 1, created["template_uuid"])
    requirements.assign_framework(db, admin, 1, framework["framework_uuid"], RequirementAssignmentCreate(usergroup_id=1))
    assignment = assignments.assign(db, admin, 1, created["template_uuid"], GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[TEACHER]))
    for user_id in (LEARNER, OTHER):
        mine = goals.list_my_goals(db, _user(user_id))
        goals.respond(db, _user(user_id), mine[0]["goal_uuid"], True)
    yield db, assignment, created["template_uuid"], framework, nodes
    db.close()


def _goal(db, user_id: int) -> Goal:
    return db.exec(select(Goal).where(Goal.subject_user_id == user_id)).one()


def _submit_resume(db, user_id: int, url: str) -> tuple[Goal, dict]:
    goal = _goal(db, user_id)
    step = _step(goals.get_goal(db, _user(user_id), goal.goal_uuid), "Your first resume")
    goals.add_entry(db, _user(user_id), goal.goal_uuid, step["step_uuid"], StepEntryCreate(kind=StepEntryKind.LINK, slot="resume", title="My resume", url=url))
    _status(db, user_id, goal, step, StepStatus.COMPLETED)
    return goal, step


def test_learner_requirements_show_gaps_and_staff_plan_a_makeup_or_credit_it(world):
    db, _, template_uuid, framework, nodes = world
    admin = _user(ADMIN)
    status = service.learner_requirements(db, admin, 1, LEARNER)
    career = status["frameworks"][0]
    assert {node["title"]: node["state"] for node in career["nodes"]} == {"Experiences": None, "Resume": "planned", "Workplace experience": "gap"}
    assert (career["met"], career["total"], career["gaps"]) == (0, 2, 1)
    planned = next(node for node in career["nodes"] if node["title"] == "Resume")["steps"][0]
    assert planned["title"] == "Your first resume" and planned["goal_uuid"] == status["goals"][0]["goal_uuid"] and not planned["overdue"]

    report = service.coverage(db, admin, 1, framework["framework_uuid"])
    covered = {node["title"]: [(item["title"], item["step_key"], item["step_types"]) for item in node["covered_by"]] for node in report["nodes"]}
    assert covered == {"Experiences": [], "Resume": [("Your first resume", "resume", ["upload"])], "Workplace experience": []}
    assert report["templates"] == [{"template_uuid": template_uuid, "title": "College ready", "mapped": True}]

    options = service.makeup_options(db, admin, 1, LEARNER, nodes["Resume"])
    assert [(item["step_key"], item["template"]["title"]) for item in options] == [("resume", "College ready")]
    goal_uuid = status["goals"][0]["goal_uuid"]
    with pytest.raises(HTTPException) as unnamed:
        service.add_makeup_step(db, admin, 1, LEARNER, MakeupStep(goal_uuid=goal_uuid, node_uuid=nodes["Workplace experience"]))
    assert unnamed.value.status_code == 422
    added = service.add_makeup_step(db, admin, 1, LEARNER, MakeupStep(goal_uuid=goal_uuid, node_uuid=nodes["Workplace experience"], title="Job shadow"))
    step = db.exec(select(GoalStep).where(GoalStep.step_uuid == added["step_uuid"])).one()
    assert step.requirement_links[0]["node_uuid"] == nodes["Workplace experience"] and step.completed_by == "staff" and step.type == "task"
    assert step.position == 2
    states = {node["title"]: node["state"] for node in service.learner_requirements(db, admin, 1, LEARNER)["frameworks"][0]["nodes"]}
    assert states["Workplace experience"] == "planned"
    assert db.exec(select(GoalStep).where(GoalStep.title == "Job shadow")).all() == [step]

    with pytest.raises(HTTPException) as no_reason:
        service.credit_requirement(db, admin, 1, LEARNER, career["enrollment_uuid"], nodes["Workplace experience"], " ")
    assert no_reason.value.status_code == 422
    with pytest.raises(HTTPException) as parent:
        service.credit_requirement(db, admin, 1, LEARNER, career["enrollment_uuid"], nodes["Experiences"], "Whole category")
    assert parent.value.status_code == 422
    service.credit_requirement(db, admin, 1, LEARNER, career["enrollment_uuid"], nodes["Workplace experience"], "Worked at the family restaurant all summer.")
    credited = next(node for node in service.learner_requirements(db, admin, 1, LEARNER)["frameworks"][0]["nodes"] if node["title"] == "Workplace experience")
    assert credited["state"] == "met" and credited["sources"][0]["kind"] == "staff_credit" and credited["sources"][0]["verified_by"]["id"] == ADMIN

    with pytest.raises(HTTPException) as outsider:
        service.learner_requirements(db, _user(OTHER), 1, LEARNER)
    assert outsider.value.status_code == 403
    # The teacher on the assignment supports both learners.
    assert service.learner_requirements(db, _user(TEACHER), 1, OTHER)["goals"]

    grid = service.group_requirements(db, admin, 1, 1)
    assert grid["framework_uuid"] == framework["framework_uuid"] and len(grid["leaf_node_uuids"]) == 2
    cells = {row["user_uuid"]: {title: row["cells"][uuid] for title, uuid in nodes.items() if uuid in row["cells"]} for row in grid["learners"]}
    assert cells == {"user_2": {"Resume": "planned", "Workplace experience": "met"}, "user_3": {"Resume": "planned", "Workplace experience": "gap"}}
    with pytest.raises(HTTPException) as not_staff:
        service.group_requirements(db, _user(OTHER), 1, 1)
    assert not_staff.value.status_code == 403


def test_makeup_from_a_template_step_goes_into_the_stage_with_open_work(world):
    db, _, template_uuid, _, nodes = world
    goal = _goal(db, LEARNER)
    added = service.add_makeup_step(db, _user(TEACHER), 1, LEARNER, MakeupStep(goal_uuid=goal.goal_uuid, node_uuid=nodes["Resume"], step_key="resume", template_uuid=template_uuid))
    step = db.exec(select(GoalStep).where(GoalStep.step_uuid == added["step_uuid"])).one()
    stage = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).one()
    assert step.stage_id == stage.id and step.type == "upload" and step.review_required and step.title == "Your first resume"
    assert [link["node_uuid"] for link in step.requirement_links] == [nodes["Resume"]]
    with pytest.raises(HTTPException) as unknown:
        service.add_makeup_step(db, _user(ADMIN), 1, LEARNER, MakeupStep(goal_uuid=goal.goal_uuid, node_uuid=nodes["Workplace experience"], step_key="resume"))
    assert unknown.value.status_code == 404
    with pytest.raises(HTTPException) as elsewhere:
        service.add_makeup_step(db, _user(ADMIN), 1, LEARNER, MakeupStep(goal_uuid=_goal(db, OTHER).goal_uuid, node_uuid=nodes["Resume"], title="x"))
    assert elsewhere.value.status_code == 404


def _rows(db, actor, **filters):
    return evidence.evidence_rows(db, _user(actor), 1, RequirementEvidenceExport(user_ids=[LEARNER], **filters))


def test_export_reads_step_evidence_through_review_and_attestation(world):
    db, assignment, _, framework, nodes = world
    goal, step = _submit_resume(db, LEARNER, "https://example.org/resume")
    rows = _rows(db, ADMIN, assignment_uuid=assignment["assignment_uuid"])
    pending = next(row for row in rows if row.get("Evidence URL"))
    assert (pending["Evidence field"], pending["Evidence text"], pending["Evidence assessment"]) == ("Resume link", "My resume", "Awaiting staff review")
    assert pending["Template"] == "College ready" and pending["Template version"] == 1 and pending["Goal UUID"] == goal.goal_uuid
    assert pending["Reviewer guidance"] == "One page" and pending["Completion recorded by"] == ""
    assert any(row["Requirement record"] == "No mapped work in export scope" for row in rows)

    _status(db, TEACHER, goal, step, StepStatus.CHANGES_REQUESTED, "Add your phone number")
    revised = next(row for row in _rows(db, ADMIN) if row.get("Evidence URL"))
    assert revised["Evidence assessment"] == "Changes requested" and revised["Review feedback"] == "Add your phone number"
    _status(db, LEARNER, goal, step, StepStatus.COMPLETED)
    _status(db, TEACHER, goal, step, StepStatus.COMPLETED, "Meets the resume criteria")
    approved = next(row for row in _rows(db, ADMIN) if row.get("Evidence URL"))
    assert approved["Evidence assessment"] == "Staff-approved step" and approved["Completion recorded by"] == "Terry Teach"
    assert approved["Requirement record"] == "Mapped step completion" and approved["Evidence source UUID"]

    enrollment = service.learner_requirements(db, _user(ADMIN), 1, LEARNER)["frameworks"][0]["enrollment_uuid"]
    service.credit_requirement(db, _user(ADMIN), 1, LEARNER, enrollment, nodes["Workplace experience"], "Observed during class")
    attested = next(row for row in _rows(db, ADMIN, framework_uuid=framework["framework_uuid"]) if row["Requirement record"] == "Staff attestation")
    assert attested["Evidence text"] == "Observed during class" and attested["Completion recorded by"] == "Tea Cher"
    # A teacher sees the assignment's work but not the admin's attestation.
    teacher_rows = _rows(db, TEACHER)
    assert any(row.get("Step") == "Your first resume" for row in teacher_rows)
    assert not any(row["Requirement record"] == "Staff attestation" for row in teacher_rows)

    # Reopening revokes the source: the work stays visible, unapproved.
    _status(db, ADMIN, goal, step, StepStatus.NOT_STARTED)
    reopened = next(row for row in _rows(db, ADMIN) if row.get("Step") == "Your first resume")
    assert reopened["Evidence assessment"] == "Not yet completed" and reopened["Completion recorded by"] == ""
    assert _rows(db, ADMIN, framework_uuid="other")[0]["Requirement record"] == "No framework enrollment"


def test_learner_finished_steps_are_not_reported_as_staff_approved(world):
    db, _, _, _, _ = world
    goal = _goal(db, LEARNER)
    fair = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == "Career Fair")).one()
    fair.requirement_links = [db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == "Your first resume")).one().requirement_links[0]]
    db.add(fair)
    db.commit()
    _status(db, LEARNER, goal, {"step_uuid": fair.step_uuid}, StepStatus.COMPLETED)
    row = next(row for row in _rows(db, ADMIN) if row.get("Step") == "Career Fair")
    assert row["Evidence assessment"] == "Completed; staff approval not established" and row["Completion recorded by"] == "Lee Arner"
    assert db.exec(select(StepProgress).where(StepProgress.step_id == fair.id)).one().status == "completed"


def test_export_csv_escapes_and_scope_is_enforced(world):
    db, _, _, _, _ = world
    goal, _ = _submit_resume(db, LEARNER, "https://example.org/r?a=1&b=2")
    resume = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == "Your first resume")).one()
    resume.title = "=unsafe title"
    db.add(resume)
    db.commit()
    raw = evidence.evidence_csv(db, _user(ADMIN), 1, RequirementEvidenceExport(user_ids=[LEARNER, LEARNER]))
    rows = list(csv.DictReader(io.StringIO(raw.lstrip("﻿"))))
    assert next(row for row in rows if row["Evidence URL"])["Step"] == "'=unsafe title"
    assert {row["Learner ID"] for row in rows} == {"2"} and "school determines academic credit" in raw

    with pytest.raises(HTTPException) as learner:
        _rows(db, LEARNER)
    assert learner.value.status_code == 403
    for filters, code in [({"assignment_uuid": "missing"}, 404), ({"usergroup_id": 99}, 404)]:
        with pytest.raises(HTTPException) as error:
            _rows(db, ADMIN, **filters)
        assert error.value.status_code == code
    with pytest.raises(HTTPException) as wrong_org:
        evidence.evidence_rows(db, _user(ADMIN), 2, RequirementEvidenceExport(user_ids=[LEARNER]))
    assert wrong_org.value.status_code == 403


def test_activity_responses_include_history_grading_and_only_the_selected_learner(world):
    db, _, _, _, _ = world
    goal = _goal(db, LEARNER)
    step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == "Your first resume")).one()
    activity = LearningActivity(activity_uuid="activity_evidence", org_id=1, title="Resume practice")
    db.add(activity)
    db.flush()
    step.activity_id = activity.id
    db.add(step)
    page = LearningPage(activity_id=activity.id, org_id=1, page_uuid="activity_page", page_type="standard", title="Interview reflection",
                        content={"blocks": [{"id": "q1", "type": "question", "kind": "text_input", "content": {"prompt": "What did you learn?"}}]})
    db.add(page)
    db.flush()
    run = LearningRun(run_uuid="selected_run", activity_id=activity.id, org_id=1, goal_id=goal.id, goal_step_id=step.id, user_id=LEARNER)
    other = LearningRun(run_uuid="other_run", activity_id=activity.id, org_id=1, goal_id=goal.id, goal_step_id=step.id, user_id=OTHER)
    db.add_all([run, other])
    db.flush()
    db.add_all([
        LearningResponseAttempt(attempt_uuid="attempt_1", run_id=run.id, page_id=page.id, user_id=LEARNER, answer={"questions": {"q1": {"text": "First draft"}}},
                                submitted_at=datetime(2026, 10, 12), result={"grading_status": "pending"}),
        LearningResponseAttempt(attempt_uuid="attempt_2", run_id=run.id, page_id=page.id, user_id=LEARNER,
                                answer={"questions": {"q1": {"text": "Revised reflection", "image": {"url": "https://example.org/work.png"}}}},
                                submitted_at=datetime(2026, 10, 13), graded_at=datetime(2026, 10, 13), score=3,
                                result={"grading_status": "graded", "max_score": 4, "graded_by_user_id": ADMIN, "graded_by": {"staff_name": "Teacher"}, "feedback": "Good explanation"}),
        LearningResponseAttempt(attempt_uuid="other_attempt", run_id=other.id, page_id=page.id, user_id=OTHER, answer={"text": "PRIVATE other learner answer"}),
    ])
    db.commit()
    rows = [row for row in _rows(db, ADMIN) if row.get("Activity attempt UUID")]
    assert [(row["Current activity attempt"], row["Activity grading status"]) for row in rows] == [("No", "pending"), ("Yes", "graded")]
    assert rows[1]["Evidence field"] == "Interview reflection · What did you learn?" and rows[1]["Evidence URL"] == "https://example.org/work.png"
    assert (rows[1]["Activity graded by"], rows[1]["Activity score"], rows[1]["Activity maximum score"]) == ("Teacher", 3, 4)
    assert "PRIVATE" not in str(rows)


def test_export_uses_the_assigned_framework_snapshot_after_a_new_version_is_published(world):
    db, _, _, framework, _ = world
    admin = _user(ADMIN)
    revised = [RequirementNodeInput(node_uuid=node["node_uuid"], parent_node_uuid=node.get("parent_node_uuid"), code=node.get("code", ""),
                                    title=node["title"] + " revised", position=node["position"]) for node in framework["nodes"]]
    requirements.update_framework(db, admin, 1, framework["framework_uuid"], RequirementFrameworkUpdate(nodes=revised))
    requirements.publish_framework(db, admin, 1, framework["framework_uuid"])
    rows = _rows(db, ADMIN)
    assert {row["Framework version"] for row in rows} == {1}
    assert {row["Requirement title"] for row in rows} == {"Resume", "Workplace experience"}
