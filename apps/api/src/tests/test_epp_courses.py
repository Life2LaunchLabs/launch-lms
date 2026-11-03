"""EPP course plans: the tally matches the sample report, only staff confirm, and the plan needs a support link."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.epp_courses import EppCourse, EppCourseWrite
from src.db.portfolio import Portfolio
from src.db.portfolio_records import PortfolioImport
from src.services import portfolio as portfolio_service
from src.services.epp import courses
from src.services.school import support
from src.tests.test_goals import LEARNER, _user
from src.tests.test_learner_support import TEACHER, _card, _session as _support_session

# Maya's courses in the sample report: (grade, subject, title, credits, status).
SAMPLE = [
    (9, "language_arts", "English 9", 1, "completed"), (10, "language_arts", "English 10", 1, "completed"),
    (11, "language_arts", "American Literature", 1, "in_progress"), (12, "language_arts", "Senior English", 1, "planned"),
    (9, "mathematics", "Algebra 1", 1, "completed"), (10, "mathematics", "Geometry", 1, "completed"), (11, "mathematics", "Algebra 2", 1, "in_progress"),
    (9, "science", "Biology", 1, "completed"), (10, "science", "Physical Science", 1, "completed"), (11, "science", "Chemistry", 1, "in_progress"),
    (9, "social_sciences", "Global Studies", 1, "completed"), (10, "social_sciences", "US History", 1, "completed"),
    (11, "social_sciences", "Civics and Economics", 1, "in_progress"),
    (9, "wl_arts_cte", "Art I", 1, "completed"), (10, "wl_arts_cte", "Art II", 1, "completed"), (11, "wl_arts_cte", "Intro to CAD", 1, "in_progress"),
    (9, "health", "Health", 1, "completed"), (9, "physical_education", "PE", 1, "completed"),
    (10, "personal_finance", "Personal Finance", 0.5, "completed"), (11, "career_path_skills", "Career Seminar", 0.5, "in_progress"),
    (10, "electives", "Study Skills", 0.5, "completed"), (10, "electives", "Yearbook", 0.5, "completed"),
    (11, "electives", "Digital Media", 0.5, "in_progress"), (11, "electives", "Yearbook", 0.5, "in_progress"), (12, "electives", "Work Experience", 0.5, "planned"),
]
# The sample's graduation progress table: completed, planned, left.
EXPECTED = {
    "language_arts": (2, 2, 0), "mathematics": (2, 1, 0), "science": (2, 1, 0), "social_sciences": (2, 1, 0), "wl_arts_cte": (2, 1, 0),
    "health": (1, 0, 0), "physical_education": (1, 0, 0), "personal_finance": (0.5, 0, 0), "career_path_skills": (0, 0.5, 0), "electives": (1, 1.5, 2.5),
}


def _session():
    db = _support_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[EppCourse.__table__])  # type: ignore[attr-defined]
    return db


def _supported(db):
    support.request(db, _user(TEACHER), 1, LEARNER)
    card = _card(db)
    support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])


def _add(db, grade, subject, title, credits, status, user=TEACHER):
    payload = EppCourseWrite(grade=grade, subject=subject, title=title, credits=credits, status=status)
    if user == LEARNER:
        return courses.my_add(db, _user(LEARNER), 1, payload)
    return courses.staff_add(db, _user(TEACHER), 1, LEARNER, payload)


def test_the_tally_matches_the_sample_report():
    with _session() as db:
        _supported(db)
        for course in SAMPLE:
            plan = _add(db, *course)
        tally = plan["tally"]
        assert {area["subject"]: (area["completed"], area["planned"], area["left"]) for area in tally["areas"]} == EXPECTED
        assert (tally["required"], tally["completed"], tally["planned"], tally["left"]) == (24, 13.5, 8, 2.5)
        # Staff entered these, but nothing is school confirmed until staff say so.
        assert tally["school_confirmed"] == 0 and plan["courses"][0]["source"] == "staff"


def test_extra_credits_count_as_electives():
    with _session() as db:
        _supported(db)
        for grade in (9, 10, 11, 12):
            _add(db, grade, "language_arts", f"English {grade}", 1, "completed")
        _add(db, 12, "language_arts", "Creative Writing", 1, "completed")
        plan = _add(db, 12, "language_arts", "Journalism", 0.5, "planned")
        areas = {area["subject"]: area for area in plan["tally"]["areas"]}
        assert (areas["language_arts"]["completed"], areas["language_arts"]["planned"]) == (4, 0)
        assert (areas["electives"]["completed"], areas["electives"]["planned"], areas["electives"]["left"]) == (1, 0.5, 3.5)


def test_only_staff_confirm_and_a_change_clears_it():
    with _session() as db:
        _supported(db)
        planned = _add(db, 11, "science", "Chemistry", 1, "planned", user=LEARNER)["courses"][0]
        assert planned["source"] == "student"
        with pytest.raises(HTTPException) as early:
            courses.confirm(db, _user(TEACHER), 1, LEARNER, planned["course_uuid"])
        assert early.value.status_code == 409
        courses.my_update(db, _user(LEARNER), 1, planned["course_uuid"], EppCourseWrite(status="completed"))
        # A learner has no way to confirm: there's no learner route, and the staff one refuses them.
        with pytest.raises(HTTPException):
            courses.confirm(db, _user(LEARNER), 1, LEARNER, planned["course_uuid"])
        confirmed = courses.confirm(db, _user(TEACHER), 1, LEARNER, planned["course_uuid"])
        course = confirmed["courses"][0]
        assert course["school_confirmed"] and course["confirmed_by"]["username"] == "teach" and confirmed["tally"]["school_confirmed"] == 1
        # The learner can't change or remove a confirmed course.
        for attempt in (lambda: courses.my_update(db, _user(LEARNER), 1, course["course_uuid"], EppCourseWrite(credits=2)),
                        lambda: courses.my_delete(db, _user(LEARNER), 1, course["course_uuid"])):
            with pytest.raises(HTTPException) as locked:
                attempt()
            assert locked.value.status_code == 409
        # Staff can, and the confirmation goes with the change.
        changed = courses.staff_update(db, _user(TEACHER), 1, LEARNER, course["course_uuid"], EppCourseWrite(credits=0.5))
        assert not changed["courses"][0]["school_confirmed"] and changed["tally"]["completed"] == 0.5
        with pytest.raises(HTTPException):
            courses.staff_add(db, _user(TEACHER), 1, LEARNER, EppCourseWrite(grade=9, subject="cooking", title="Foods"))


def test_the_plan_needs_an_active_support_link():
    with _session() as db:
        with pytest.raises(HTTPException):
            courses.staff_plan(db, _user(TEACHER), 1, LEARNER)
        with pytest.raises(HTTPException):
            courses.my_plan(db, _user(LEARNER), 1)
        _supported(db)
        _add(db, 9, "health", "Health", 1, "completed")
        support.end(db, _user(LEARNER), db.exec(select(support.LearnerSupport)).one().support_uuid)
        for attempt in (lambda: courses.staff_plan(db, _user(TEACHER), 1, LEARNER), lambda: courses.my_plan(db, _user(LEARNER), 1),
                        lambda: _add(db, 9, "health", "PE", 1, "completed")):
            with pytest.raises(HTTPException) as refused:
                attempt()
            assert refused.value.status_code == 404


def test_courses_come_in_from_an_oregon_cis_export_once():
    with _session() as db:
        _supported(db)
        portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
        portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == LEARNER)).one()
        sheet = [
            {"Grade level": "9th Grade", "School year": "2025-2026", "Subject": "Arts", "Course title": "Art I", "Term": "1st", "Units / Credits": ".5", "Grade": "A"},
            {"Grade level": "9th Grade", "School year": "2025-2026", "Subject": "Mathematics", "Course title": "Geometry", "Term": "Year", "Units / Credits": "1", "Grade": "B"},
            {"Grade level": "11th Grade", "Subject": "Career and Technical Education", "Course title": "Intro to CAD", "Units / Credits": "1",
             "Dual credit": "Yes", "Dual credit school": "Sample Community College", "Dual credit course code": "DRF 101", "Dual credit credits": "3"},
            {"Grade level": "12th Grade", "Subject": "Underwater basket weaving", "Course title": "Study Hall", "Units / Credits": "abc"},
            {"Grade level": "College", "Subject": "Science", "Course title": "Physics 201", "Units / Credits": "4"},
        ]
        db.add(PortfolioImport(import_uuid="imp_1", portfolio_id=portfolio.id, source="cis", kept={"Course Plan": sheet, "Favorites": [{"Course title": "x"}]}))
        db.commit()
        assert courses.staff_plan(db, _user(TEACHER), 1, LEARNER)["cis_courses"] == 5
        imported = courses.import_cis(db, _user(TEACHER), 1, LEARNER)
        assert imported["added"] == 4
        by_title = {course["title"]: course for course in imported["courses"]}
        assert (by_title["Art I"]["subject"], by_title["Art I"]["credits"], by_title["Art I"]["status"], by_title["Art I"]["grade"]) == ("wl_arts_cte", 0.5, "completed", 9)
        cad = by_title["Intro to CAD"]
        assert (cad["status"], cad["dual_credit"], cad["dual_credit_school"], cad["dual_credit_credits"], cad["course_code"]) == ("planned", True, "Sample Community College", 3, "DRF 101")
        assert (by_title["Study Hall"]["subject"], by_title["Study Hall"]["credits"]) == ("electives", 0)
        assert all(course["source"] == "cis" and not course["school_confirmed"] for course in imported["courses"])
        # Bringing them in again adds nothing.
        assert courses.import_cis(db, _user(TEACHER), 1, LEARNER)["added"] == 0
