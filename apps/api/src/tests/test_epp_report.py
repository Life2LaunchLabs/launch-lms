"""The live EPP report: work found by code, the sample's credit table, picks, and nothing private in the JSON."""

import json
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.epp_courses import EppCourse, EppCourseWrite
from src.db.goals import Goal, GoalAssignmentCreate, GoalOwnership, GoalStep, StepProgress, StepStatus, StepSubmission
from src.db.learner_support import ReportPicks
from src.db.plan_collections import PlanCollection, PlanCollectionItem
from src.db.portfolio import Portfolio
from src.db.portfolio_records import Credential
from src.db.resources import Resource, ResourceNoteBlock, UserSavedResource
from src.db.requirements import (
    RequirementAssignmentBatch, RequirementAttainmentSource, RequirementEnrollment, RequirementFramework, RequirementFrameworkVersion, RequirementNode,
)
from src.services import portfolio as portfolio_service, requirements
from src.services.epp import content, courses, report
from src.services.goals import assignments, goals, templates
from src.services.school import support
from src.tests.test_epp_courses import SAMPLE
from src.tests.test_goals import ADMIN, LEARNER, _status, _step, _user
from src.tests.test_learner_support import TEACHER, _card, _session as _support_session

TODAY = datetime(2026, 10, 28)


def _session():
    db = _support_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[model.__table__ for model in (  # type: ignore[attr-defined]
        EppCourse, RequirementFramework, RequirementFrameworkVersion, RequirementNode, RequirementAssignmentBatch,
        RequirementEnrollment, RequirementAttainmentSource, PlanCollection, PlanCollectionItem, Resource, UserSavedResource, ResourceNoteBlock)])
    return db


def _heavy(db) -> str:
    """A learner well into the year: plan work, a reviewed CRLE, a personal goal, courses, portfolio items."""
    portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
    support.request(db, _user(TEACHER), 1, LEARNER)
    card = _card(db)
    support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
    from src.db.learner_support import LearnerSupportUpdate
    support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(student_id="400123", diploma_track="standard", graduation_year=2028, counselor_user_id=TEACHER))

    installed = content.install(db, _user(ADMIN), 1)
    requirements.publish_framework(db, _user(ADMIN), 1, installed["framework_uuid"])
    templates.publish(db, _user(ADMIN), 1, installed["template_uuid"])
    assignments.assign(db, _user(ADMIN), 1, installed["template_uuid"], GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
    goal_uuid = goals.list_my_goals(db, _user(LEARNER))[0]["goal_uuid"]
    goals.respond(db, _user(LEARNER), goal_uuid, True)
    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()
    view = goals.get_goal(db, _user(LEARNER), goal_uuid)
    written = _step(view, "What my assessments told me")
    goals.save_submission(db, _user(LEARNER), goal_uuid, written["step_uuid"], StepSubmission(submission={"text": "<p>I like <b>drawing</b> and planning.</p>"}))
    _status(db, LEARNER, goal, written, StepStatus.COMPLETED)

    # A job shadow, reviewed by staff; the staff's private note stays out.
    crle = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == "Take part in a career-related learning experience")).one()
    db.add(StepProgress(progress_uuid="progress_crle", step_id=crle.id, status=StepStatus.COMPLETED, submission={"text": "Job shadow with a CAD drafter", "file_uuid": "asset_1"},
                        completed_at=datetime(2026, 10, 20), completed_by_user_id=ADMIN, staff_notes=[{"text": "STAFF-ONLY note"}], reviewer_note="REVIEWER-ONLY"))
    # A personal goal filed under the organization, linked to the same requirement: never in the report.
    personal = Goal(goal_uuid="goal_personal", org_id=1, owner_user_id=LEARNER, subject_user_id=LEARNER, ownership=GoalOwnership.PERSONAL, title="Private")
    db.add(personal)
    db.flush()
    node = db.exec(select(RequirementNode).where(RequirementNode.code == "EPP.INTERESTS.ASSESSMENTS")).first()
    secret = GoalStep(step_uuid="step_personal", goal_id=personal.id, type="write", title="Secret", requirement_links=[{"node_uuid": node.node_uuid}])
    db.add(secret)
    db.flush()
    db.add(StepProgress(progress_uuid="progress_secret", step_id=secret.id, status=StepStatus.COMPLETED, submission={"text": "SECRET PERSONAL TEXT"}))

    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == LEARNER)).one()
    db.add(Credential(credential_uuid="cred_public", portfolio_id=portfolio.id, kind="card", name="Oregon food handler card", issued_on="2026-08"))
    db.add(Credential(credential_uuid="cred_private", portfolio_id=portfolio.id, kind="card", name="PRIVATE CARD", visibility="private"))
    db.commit()
    for grade, subject, title, credit, status in SAMPLE:
        courses.staff_add(db, _user(TEACHER), 1, LEARNER, EppCourseWrite(grade=grade, subject=subject, title=title, credits=credit, status=status))
    finance = next(row for row in courses.rows(db, 1, LEARNER) if row.title == "Personal Finance")
    courses.confirm(db, _user(TEACHER), 1, LEARNER, finance.course_uuid)
    return goal_uuid


def test_a_heavy_learner_reports_cleanly_and_privately():
    with _session() as db:
        _heavy(db)
        built = report.build(db, 1, LEARNER, TODAY)
        text = json.dumps(built)
        assert built["schema_version"] == report.SCHEMA_VERSION and built["school_year"] == "2026-27"
        learner = built["learner"]
        assert (learner["student_id"], learner["grade"], learner["diploma"], learner["counselor"]) == ("400123", 11, "Oregon Diploma", "Tess Teacher")
        # The sample report's credit summary.
        tally = built["graduation"]["tally"]
        assert (tally["completed"], tally["planned"], tally["left"]) == (13.5, 8, 2.5)
        components = {item["key"]: item for item in built["components"]}
        assert components["courses"]["status"] == "needs_attention" and components["courses"]["detail"] == "2.5 credits have no planned course"
        assert components["interests"]["status"] == "complete"
        beyond = {item["key"]: item["detail"] for item in built["graduation"]["beyond_credits"]}
        assert beyond["personal_finance"] == "Credit recorded by school"
        assert beyond["career_path_skills"] == "Planned: Career Seminar"
        assert beyond["crle"] == "1 documented, 1 reviewed" and beyond["extended_application"] == "Not chosen yet"
        assert "Pick an Extended Application." in built["to_talk_about"]
        # Work found by code, as plain text, with who reviewed it.
        sections = {req["code"]: req["work"] for section in built["sections"] for req in section["requirements"]}
        assert sections["EPP.INTERESTS.ASSESSMENTS"][0]["text"] == ["I like drawing and planning."]
        crle = sections["EPP.CRLE.EXPERIENCE"][0]
        assert crle["source"] == "teacher_reviewed" and crle["text"] == ["Job shadow with a CAD drafter"]
        grid = {row["subject"]: row["grades"] for row in built["courses"]["grid"]}
        assert [course["title"] for course in grid["electives"]["11"]] == ["Digital Media", "Yearbook"]
        # Nothing private: personal goals, private items, staff notes, file ids, email.
        for leaked in ("SECRET PERSONAL TEXT", "PRIVATE CARD", "STAFF-ONLY", "REVIEWER-ONLY", "asset_1", "@example.com", "budget"):
            assert leaked not in text
        assert built["evidence"] == []


def test_the_learner_picks_evidence_from_public_items_only():
    with _session() as db:
        _heavy(db)
        mine = report.my_report(db, _user(LEARNER), 1)
        assert [item["title"] for item in mine["choices"]] == ["Oregon food handler card"] and mine["picks"] == []
        with pytest.raises(HTTPException):
            report.set_picks(db, _user(LEARNER), 1, ReportPicks(picks=[{"kind": "credential", "uuid": "cred_private"}]))
        chosen = report.set_picks(db, _user(LEARNER), 1, ReportPicks(picks=[{"kind": "credential", "uuid": "cred_public"}] * 2))
        assert chosen["picks"] == [{"kind": "credential", "uuid": "cred_public"}]
        staff_view = report.staff_report(db, _user(TEACHER), 1, LEARNER)
        assert [item["title"] for item in staff_view["evidence"]] == ["Oregon food handler card"]
        assert {item["key"]: item["status"] for item in staff_view["components"]}["accomplishments"] == "complete"
        # Made private later, it drops out of the report without the learner unpicking it.
        card = db.exec(select(Credential).where(Credential.credential_uuid == "cred_public")).one()
        card.visibility = "private"
        db.add(card)
        db.commit()
        assert report.staff_report(db, _user(TEACHER), 1, LEARNER)["evidence"] == []


def test_only_supported_staff_and_the_learner_see_the_report():
    with _session() as db:
        _heavy(db)
        with pytest.raises(HTTPException):
            report.staff_report(db, _user(LEARNER), 1, LEARNER)
        support.staff_end(db, _user(TEACHER), 1, LEARNER)
        for attempt in (lambda: report.staff_report(db, _user(TEACHER), 1, LEARNER), lambda: report.my_report(db, _user(LEARNER), 1)):
            with pytest.raises(HTTPException) as refused:
                attempt()
            assert refused.value.status_code == 404


def test_school_year_and_grade():
    assert report.school_year(datetime(2027, 3, 1)) == "2026-27" and report.school_year(datetime(2026, 8, 1)) == "2026-27"
    assert report.grade_for(2028, "2026-27") == 11 and report.grade_for(2035, "2026-27") is None and report.grade_for(None, "2026-27") is None
