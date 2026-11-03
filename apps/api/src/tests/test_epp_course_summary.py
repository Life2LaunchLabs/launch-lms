"""SB 3 course evidence summary: per-standard evidence and review, the class grid, and credit only from the school."""

import io

import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from src.db.epp_courses import EppCourse
from src.db.goals import StepStatus
from src.db.learner_support import LearnerSupport
from src.db.requirement_exports import RequirementEvidenceExport
from src.services.epp import course_summary
from src.tests.test_goal_requirements import TEACHER, _submit_resume, world  # noqa: F401
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _user

COURSE = {"course_name": "Career Seminar", "course_code": "22900", "term": "Fall 2026"}


def _request(assignment, **values):
    return RequirementEvidenceExport(user_ids=[LEARNER, OTHER], assignment_uuid=assignment["assignment_uuid"], **{**COURSE, **values})


def _standards(summary, user_id):
    learner = next(item for item in summary["learners"] if item["user_id"] == user_id)
    return {item["title"]: item for framework in learner["frameworks"].values() for item in framework["standards"]}, learner


def test_each_standard_shows_its_evidence_and_who_reviewed_it(world):  # noqa: F811 (the shared fixture)
    db, assignment, _, _, _ = world
    goal, step = _submit_resume(db, LEARNER, "https://example.org/resume")
    waiting, _ = _standards(course_summary.summarize(db, _user(TEACHER), 1, _request(assignment)), LEARNER)
    assert waiting["Resume"]["state"] == "waiting" and waiting["Resume"]["evidence"] == ["Your first resume"]
    assert waiting["Workplace experience"]["state"] == "none" and waiting["Workplace experience"]["evidence"] == []

    _status(db, TEACHER, goal, step, StepStatus.COMPLETED, "Meets the resume criteria")
    summary = course_summary.summarize(db, _user(TEACHER), 1, _request(assignment))
    reviewed, learner = _standards(summary, LEARNER)
    assert (reviewed["Resume"]["state"], reviewed["Resume"]["reviewer"]) == ("reviewed", "T. Teach") and reviewed["Resume"]["date"]
    # Without a school record the summary never claims credit.
    assert learner["credit"] == "Not on a school record here"
    others, _ = _standards(summary, OTHER)
    assert {item["state"] for item in others.values()} == {"none"}

    name, body = course_summary.course_summary_pdf(db, _user(TEACHER), 1, _request(assignment))
    text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(body)).pages)
    assert name == "Career_Seminar_SB3_summary.pdf" and len(PdfReader(io.BytesIO(body)).pages) == 3
    for expected in ("Class grid", "Career Seminar · Course code 22900 · Fall 2026", "1 of 2", "T. Teach", "None yet",
                     "Standards with reviewed evidence", "Credit recorded by school", "isn't a grade or credit decision"):
        assert expected in text
    # The same scope rules as the evidence CSV.
    with pytest.raises(HTTPException):
        course_summary.summarize(db, _user(LEARNER), 1, _request(assignment))


def test_credit_comes_only_from_a_school_confirmed_course(world):  # noqa: F811
    db, assignment, _, _, _ = world
    for model in (LearnerSupport, EppCourse):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(LearnerSupport(support_uuid="support_1", org_id=1, user_id=LEARNER, status="active", request_uuid="ask_1", requested_by_user_id=ADMIN,
                          requested_at="2026-09-01", creation_date="2026-09-01", update_date="2026-09-01"))
    course = EppCourse(course_uuid="course_1", org_id=1, user_id=LEARNER, grade=11, school_year="2026-27", subject="career_path_skills", title="Career Seminar",
                       credits=0.5, status="completed", course_code="22900", source="staff", creation_date="2026-09-01", update_date="2026-09-01")
    db.add(course)
    db.commit()
    request = RequirementEvidenceExport(user_ids=[LEARNER], **COURSE)
    assert _standards(course_summary.summarize(db, _user(ADMIN), 1, request), LEARNER)[1]["credit"] == "Not yet"
    course.confirmed_at, course.confirmed_by_user_id = "2026-12-15T10:00:00+00:00", ADMIN
    db.add(course)
    db.commit()
    credit = _standards(course_summary.summarize(db, _user(ADMIN), 1, request), LEARNER)[1]["credit"]
    assert credit.startswith("Yes, 0.5 credit, confirmed Dec 15, 2026")
    # A different course on the plan doesn't count.
    other = RequirementEvidenceExport(user_ids=[LEARNER], course_name="Health", course_code="")
    assert _standards(course_summary.summarize(db, _user(ADMIN), 1, other), LEARNER)[1]["credit"] == "Not yet"
