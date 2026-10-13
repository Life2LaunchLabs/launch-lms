import csv
import io
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress
from src.db.learning import LearningActivity, LearningPage, LearningResponseAttempt, LearningRun
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.requirements import RequirementAttainmentSource, RequirementFrameworkUpdate, RequirementNodeInput
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import plan_admin, plan_learners, requirement_evidence, requirements
from src.tests.test_plan_admin import _learner, _objective, _submit, world as world
from src.tests.test_programs import NOW


def _rows(session, admin, **filters):
    return requirement_evidence.evidence_rows(session, admin, 1, RequirementEvidenceExport(user_ids=[2], **filters))


def test_export_preserves_pending_approved_revision_and_gap_states(world):
    session, admin, assignment, _, _, _ = world
    objective_uuid = _submit(session, 2, "Your first resume", file=[{"url": "/content/resume.pdf", "filename": "Resume.pdf"}])
    rows = _rows(session, admin, assignment_uuid=assignment["assignment_uuid"])
    pending = next(row for row in rows if row.get("Evidence URL"))
    assert pending["Evidence field"] == "Upload it"
    assert pending["Evidence text"] == "Resume.pdf"
    assert pending["Evidence assessment"] == "Awaiting staff review"
    assert pending["Completion recorded by"] == ""
    assert pending["Framework version"] == 1
    assert pending["Template"] == "Career Ready, senior year"
    assert pending["Plan UUID"] and pending["Assignment UUID"] == assignment["assignment_uuid"]
    assert any(row["Requirement record"] == "No mapped work in export scope" for row in rows)

    plan_admin.decide(session, admin, 1, objective_uuid, "flag", "Add your phone number")
    revised = next(row for row in _rows(session, admin) if row.get("Evidence URL"))
    assert revised["Evidence assessment"] == "Changes requested"
    assert revised["Review feedback"] == "Add your phone number"
    _submit(session, 2, "Your first resume", file=[{"url": "/content/revised.pdf"}])
    plan_admin.decide(session, admin, 1, objective_uuid, "confirm", "Meets the resume criteria")
    approved = next(row for row in _rows(session, admin) if row.get("Evidence URL"))
    assert approved["Evidence assessment"] == "Staff-approved objective"
    assert approved["Completion recorded by"] == "T Eacher"
    assert approved["Completion recorded at (UTC)"] and approved["Evidence source UUID"]
    assert approved["Reviewer guidance"] == "One page\nContact details filled in"
    assert approved["Evidence URL"] == "/content/revised.pdf"


def test_export_keeps_shared_multiple_evidence_labels_false_values_and_attestations(world):
    session, admin, _, _, framework, nodes = world
    plan, objective = _objective(session, 2, "Your first resume")
    objective.requirement_mappings = [*objective.requirement_mappings, {"framework_id": objective.requirement_mappings[0]["framework_id"], "node_uuid": nodes["Workplace experience"]}]
    session.add(objective)
    session.commit()
    uuid = _submit(session, 2, "Your first resume", file=[{"url": "/content/a.pdf"}, {"url": "/content/b.pdf"}])
    plan_admin.decide(session, admin, 1, uuid, "confirm")
    rows = _rows(session, admin)
    assert [row["Evidence URL"] for row in rows].count("/content/a.pdf") == 2
    assert [row["Evidence URL"] for row in rows].count("/content/b.pdf") == 2
    assert {row["Requirement title"] for row in rows} == {"Resume", "Workplace experience"}
    plan_learners.credit_requirement(session, admin, 1, 2, plan_learners.learner_requirements(session, admin, 1, 2)["frameworks"][0]["enrollment_uuid"], nodes["Workplace experience"], "Observed during class on 2026-10-13")
    rows = _rows(session, admin, framework_uuid=framework["framework_uuid"])
    attested = next(row for row in rows if row["Requirement record"] == "Staff attestation")
    assert attested["Evidence text"] == "Observed during class on 2026-10-13"
    assert attested["Completion recorded by"] == "T Eacher"
    assert "Staff-approved objective" != attested["Evidence assessment"]
    assert requirement_evidence._evidence([{"field_uuid": "done", "title": "Observed", "type": "checkbox"}], {"done": False})[0]["Evidence text"] == "False"


def test_csv_is_readable_escaped_filtered_and_does_not_export_staff_notes(world):
    session, admin, _, _, _, _ = world
    _, objective = _objective(session, 2, "Your first resume")
    uuid = _submit(session, 2, "Your first resume", file=[{"url": "https://example.org/resume?a=1&b=2", "filename": '=HYPERLINK("bad")'}])
    plan_admin.add_staff_note(session, admin, 1, uuid, "CONFIDENTIAL staff conversation")
    plan_admin.decide(session, admin, 1, uuid, "confirm", "Line one\nLine two, reviewed")
    objective.title = "=unsafe title"
    session.add(objective)
    session.commit()
    raw = requirement_evidence.evidence_csv(session, admin, 1, RequirementEvidenceExport(user_ids=[2, 2]))
    rows = list(csv.DictReader(io.StringIO(raw.lstrip("\ufeff"))))
    evidence = next(row for row in rows if row["Evidence URL"])
    assert evidence["Objective"] == "'=unsafe title"
    assert evidence["Evidence text"].startswith("'=HYPERLINK")
    assert evidence["Review feedback"] == "Line one\nLine two, reviewed"
    assert {row["Learner ID"] for row in rows} == {"2"}
    assert "CONFIDENTIAL" not in raw
    assert "school determines academic credit" in raw


def test_export_denies_learners_cross_tenant_and_unknown_scope(world):
    session, admin, _, _, _, _ = world
    with pytest.raises(HTTPException) as denied:
        _rows(session, _learner(2))
    assert denied.value.status_code == 403
    for filters, code in [({"assignment_uuid": "missing"}, 404), ({"usergroup_id": 99}, 404)]:
        with pytest.raises(HTTPException) as error:
            _rows(session, admin, **filters)
        assert error.value.status_code == code
    with pytest.raises(HTTPException) as wrong_org:
        requirement_evidence.evidence_rows(session, admin, 2, RequirementEvidenceExport(user_ids=[2]))
    assert wrong_org.value.status_code == 403


def test_teacher_cannot_export_other_plans_for_same_learner(world):
    session, admin, assignment, _, _, _ = world
    teacher = User(id=4, user_uuid="user_4", username="teacher4", email="teacher4@example.com", first_name="Teacher", last_name="Four", creation_date=NOW, update_date=NOW)
    session.add(teacher)
    session.add(UserOrganization(user_id=4, org_id=1, role_id=4, creation_date=NOW, update_date=NOW))
    plan, objective = _objective(session, 2, "Your first resume")
    plan.owner_user_id = 4
    session.add(plan)
    other = Plan(plan_uuid="other-plan", slug="other-plan", name="Private elsewhere", source_org_id=1, subject_user_id=2, owner_user_id=1, creation_date=NOW, update_date=NOW)
    session.add(other)
    session.flush()
    other_objective = PlanObjective(objective_uuid="private-objective", plan_id=other.id, title="PRIVATE OBJECTIVE", requirement_mappings=objective.requirement_mappings, creation_date=NOW, update_date=NOW)
    session.add(other_objective)
    session.commit()
    reviewer = PublicUser(id=4, user_uuid="user_4", username="teacher4", email="teacher4@example.com", first_name="Teacher", last_name="Four")
    rows = _rows(session, reviewer, assignment_uuid=assignment["assignment_uuid"])
    assert any(row.get("Objective") == "Your first resume" for row in rows)
    assert "PRIVATE" not in str(_rows(session, reviewer))
    with pytest.raises(HTTPException) as denied:
        requirement_evidence.evidence_rows(session, reviewer, 1, RequirementEvidenceExport(user_ids=[2, 3]))
    assert denied.value.status_code == 403


def test_no_enrollment_and_revoked_sources_remain_visible_as_gaps(world):
    session, admin, _, _, _, _ = world
    uuid = _submit(session, 2, "Your first resume", file=[{"url": "/content/a.pdf"}])
    plan_admin.decide(session, admin, 1, uuid, "confirm")
    progress = session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == _objective(session, 2, "Your first resume")[1].id)).one()
    source = session.exec(select(RequirementAttainmentSource).where(RequirementAttainmentSource.plan_objective_progress_id == progress.id)).one()
    source.revoked_at = source.verified_at
    session.add(source)
    session.commit()
    row = next(row for row in _rows(session, admin) if row.get("Objective"))
    assert row["Evidence assessment"] != "Staff-approved objective"
    assert row["Completion recorded by"] == ""
    missing = _rows(session, admin, framework_uuid="not-enrolled-framework")
    assert missing[0]["Requirement record"] == "No framework enrollment"


def test_completion_without_staff_approval_is_not_reported_as_approved(world):
    session, admin, _, _, _, _ = world
    uuid = _submit(session, 2, "Your first resume", file=[{"url": "/content/a.pdf"}])
    plan_admin.decide(session, admin, 1, uuid, "confirm")
    source = session.exec(select(RequirementAttainmentSource)).one()
    source.verified_by_user_id = 2
    session.add(source)
    session.commit()
    row = next(row for row in _rows(session, admin) if row.get("Objective"))
    assert row["Evidence assessment"] == "Completed; staff approval not established"
    assert row["Completion recorded by"] == "Lee Arner"


def test_activity_responses_include_history_grading_and_only_selected_learner(world):
    session, admin, _, _, _, _ = world
    for model in (LearningActivity, LearningResponseAttempt):
        model.__table__.create(session.get_bind(), checkfirst=True)
    plan, objective = _objective(session, 2, "Your first resume")
    activity = LearningActivity(activity_uuid="activity_evidence", objective_id=objective.source_objective_id, org_id=1, title="Resume practice")
    session.add(activity)
    session.flush()
    objective.activity_id = activity.id
    session.add(objective)
    page = LearningPage(activity_id=activity.id, org_id=1, page_uuid="activity_page", page_type="standard", title="Interview reflection", content={"blocks": [{"id": "q1", "type": "question", "kind": "text_input", "content": {"prompt": "What did you learn?"}}]})
    session.add(page)
    session.flush()
    run = LearningRun(run_uuid="selected_run", activity_id=activity.id, org_id=1, plan_id=plan.id, plan_objective_id=objective.id, user_id=2)
    other = LearningRun(run_uuid="other_run", activity_id=activity.id, org_id=1, plan_id=plan.id, plan_objective_id=objective.id, user_id=3)
    session.add_all([run, other])
    session.flush()
    session.add_all([
        LearningResponseAttempt(attempt_uuid="attempt_1", run_id=run.id, page_id=page.id, user_id=2, answer={"questions": {"q1": {"text": "First draft"}}}, submitted_at=datetime(2026, 10, 12), result={"grading_status": "pending"}),
        LearningResponseAttempt(attempt_uuid="attempt_2", run_id=run.id, page_id=page.id, user_id=2, answer={"questions": {"q1": {"text": "Revised reflection", "image": {"url": "https://example.org/work.png"}}}}, submitted_at=datetime(2026, 10, 13), graded_at=datetime(2026, 10, 13), score=3, result={"grading_status": "graded", "max_score": 4, "graded_by_user_id": 1, "graded_by": {"staff_name": "Teacher"}, "feedback": "Good explanation"}),
        LearningResponseAttempt(attempt_uuid="other_attempt", run_id=other.id, page_id=page.id, user_id=3, answer={"text": "PRIVATE other learner answer"}),
    ])
    session.commit()
    rows = [row for row in _rows(session, admin) if row.get("Activity attempt UUID")]
    assert len(rows) == 2
    assert rows[0]["Current activity attempt"] == "No"
    assert rows[0]["Activity grading status"] == "pending"
    assert rows[1]["Current activity attempt"] == "Yes"
    assert rows[1]["Evidence field"] == "Interview reflection · What did you learn?"
    assert rows[1]["Evidence URL"] == "https://example.org/work.png"
    assert rows[1]["Activity graded by"] == "Teacher"
    assert rows[1]["Activity score"] == 3 and rows[1]["Activity maximum score"] == 4
    assert "PRIVATE" not in str(rows)


def test_export_uses_assigned_framework_snapshot_after_a_new_version_is_published(world):
    session, admin, _, _, framework, _ = world
    revised_nodes = [RequirementNodeInput(
        node_uuid=node["node_uuid"], parent_node_uuid=node.get("parent_node_uuid"),
        code=node.get("code", ""), title=node["title"] + " revised", position=node["position"],
    ) for node in framework["nodes"]]
    requirements.update_framework(session, admin, 1, framework["framework_uuid"], RequirementFrameworkUpdate(nodes=revised_nodes))
    requirements.publish_framework(session, admin, 1, framework["framework_uuid"])
    rows = _rows(session, admin)
    assert {row["Framework version"] for row in rows} == {1}
    assert {row["Requirement title"] for row in rows} == {"Resume", "Workplace experience"}
