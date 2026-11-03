"""A learner's course plan with a school and its tally against the 24 Oregon Diploma credits.

Staff reach it only through `support.require_support`, like the rest of the school record. The learner
reaches their own plan while that school supports them. Only staff can mark a course school confirmed,
only a completed course can be confirmed, and changing a confirmed course clears the confirmation, so a
"school confirmed" label always means staff checked what it says now. Learners can't change a confirmed
course at all.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.epp_courses import COURSE_STATUSES, GRADES, SUBJECTS, EppCourse, EppCourseWrite
from src.db.learner_support import LearnerSupport
from src.db.portfolio import Portfolio
from src.db.portfolio_records import PortfolioImport
from src.db.users import PublicUser
from src.services.connect import people
from src.services.school import roles, support

REQUIRED_TOTAL = sum(credits for _, credits in SUBJECTS.values())
CIS_SHEET = "course plan"
# CIS course planner subjects, lower case, to ours. Anything else counts as an elective.
CIS_SUBJECTS = {
    "language arts": "language_arts", "english": "language_arts", "english language arts": "language_arts",
    "mathematics": "mathematics", "math": "mathematics",
    "science": "science",
    "social sciences": "social_sciences", "social science": "social_sciences", "social studies": "social_sciences",
    "world languages": "wl_arts_cte", "world language": "wl_arts_cte", "second language": "wl_arts_cte", "arts": "wl_arts_cte",
    "the arts": "wl_arts_cte", "career and technical education": "wl_arts_cte", "career & technical education": "wl_arts_cte", "cte": "wl_arts_cte",
    "health": "health", "health education": "health",
    "physical education": "physical_education", "pe": "physical_education",
    "personal financial education": "personal_finance", "personal finance": "personal_finance",
    "higher education and career path skills": "career_path_skills", "higher education & career path skills": "career_path_skills",
    "electives": "electives", "elective": "electives",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _round(value: float) -> float:
    return round(value * 4) / 4 if value else 0


# ---------------------------------------------------------------- access

def _staff_access(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> LearnerSupport:
    return support.require_support(db, org_id, current_user.id, user_id)


def _learner_access(db: Session, current_user: PublicUser, org_id: int) -> LearnerSupport:
    row = db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == current_user.id)).first()
    if not row or row.status != "active" or roles.org_role(db, org_id, current_user.id) != "learner":
        raise HTTPException(status_code=404, detail="This organization doesn't support your plan")
    return row


def _course(db: Session, org_id: int, user_id: int, course_uuid: str) -> EppCourse:
    row = db.exec(select(EppCourse).where(EppCourse.course_uuid == course_uuid, EppCourse.org_id == org_id, EppCourse.user_id == user_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")
    return row


# ---------------------------------------------------------------- reading

def course_dto(db: Session, row: EppCourse) -> dict:
    return {
        "course_uuid": row.course_uuid, "grade": row.grade, "school_year": row.school_year, "subject": row.subject,
        "title": row.title, "term": row.term, "credits": row.credits, "status": row.status, "course_code": row.course_code,
        "dual_credit": row.dual_credit, "dual_credit_school": row.dual_credit_school, "dual_credit_credits": row.dual_credit_credits,
        "note": row.note, "source": row.source, "school_confirmed": bool(row.confirmed_at),
        "confirmed_at": row.confirmed_at, "confirmed_by": people.person(db, row.confirmed_by_user_id) if row.confirmed_by_user_id else None,
    }


def rows(db: Session, org_id: int, user_id: int) -> list[EppCourse]:
    found = db.exec(select(EppCourse).where(EppCourse.org_id == org_id, EppCourse.user_id == user_id)).all()
    order = list(SUBJECTS)
    return sorted(found, key=lambda row: (row.grade, order.index(row.subject) if row.subject in order else len(order), row.title.lower()))


def tally(courses: list[EppCourse]) -> dict:
    """Credits completed, planned (including in progress) and left in each diploma area, out of 24.

    Credits past what an area needs count as electives, completed first, the way Oregon schools count them.
    """
    earned = {key: 0.0 for key in SUBJECTS}
    planned = {key: 0.0 for key in SUBJECTS}
    confirmed = 0.0
    for course in courses:
        key = course.subject if course.subject in SUBJECTS else "electives"
        if course.status == "completed":
            earned[key] += course.credits
            confirmed += course.credits if course.confirmed_at else 0
        else:
            planned[key] += course.credits
    for key, (_, required) in SUBJECTS.items():
        if key == "electives":
            continue
        extra_done = max(0.0, earned[key] - required)
        extra_planned = max(0.0, earned[key] - extra_done + planned[key] - required)
        earned[key] -= extra_done
        planned[key] -= extra_planned
        earned["electives"] += extra_done
        planned["electives"] += extra_planned
    areas = []
    for key, (label, required) in SUBJECTS.items():
        left = max(0.0, required - earned[key] - planned[key])
        areas.append({"subject": key, "label": label, "required": required, "completed": _round(earned[key]), "planned": _round(planned[key]), "left": _round(left)})
    return {
        "areas": areas, "required": REQUIRED_TOTAL,
        "completed": _round(sum(area["completed"] for area in areas)), "planned": _round(sum(area["planned"] for area in areas)),
        "left": _round(sum(area["left"] for area in areas)), "school_confirmed": _round(confirmed),
    }


def plan_dto(db: Session, org_id: int, user_id: int) -> dict:
    found = rows(db, org_id, user_id)
    return {
        "courses": [course_dto(db, row) for row in found], "tally": tally(found),
        "subjects": [{"key": key, "label": label, "required": required} for key, (label, required) in SUBJECTS.items()],
        "cis_courses": len(_cis_rows(db, user_id)),
    }


def staff_plan(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    _staff_access(db, current_user, org_id, user_id)
    return plan_dto(db, org_id, user_id)


def my_plan(db: Session, current_user: PublicUser, org_id: int) -> dict:
    _learner_access(db, current_user, org_id)
    return plan_dto(db, org_id, current_user.id)


# ---------------------------------------------------------------- writing

def _apply(row: EppCourse, payload: EppCourseWrite) -> None:
    values = payload.model_dump(exclude_unset=True)
    if "subject" in values and values["subject"] not in SUBJECTS:
        raise HTTPException(status_code=422, detail="Pick one of the diploma subject areas")
    if "status" in values and values["status"] not in COURSE_STATUSES:
        raise HTTPException(status_code=422, detail="A course is planned, in progress or completed")
    for key, value in values.items():
        if key in ("subject", "status", "grade", "credits", "dual_credit") and value is None:
            continue
        if isinstance(value, str):
            value = value.strip() or None
            if key == "title" and not value:
                raise HTTPException(status_code=422, detail="Give the course a title")
        setattr(row, key, value)
    if not row.dual_credit:
        row.dual_credit_school, row.dual_credit_credits = None, None


def _create(db: Session, org_id: int, user_id: int, payload: EppCourseWrite, by: int, source: str) -> dict:
    if payload.grade is None or not (payload.title or "").strip() or not payload.subject:
        raise HTTPException(status_code=422, detail="A course needs a grade, a subject and a title")
    now = _now()
    row = EppCourse(course_uuid=f"eppcourse_{uuid4().hex}", org_id=org_id, user_id=user_id, grade=payload.grade, subject=payload.subject,
                    title=payload.title.strip(), source=source, added_by_user_id=by, creation_date=now, update_date=now)
    _apply(row, payload)
    db.add(row)
    db.commit()
    return plan_dto(db, org_id, user_id)


def _change(db: Session, row: EppCourse, payload: EppCourseWrite) -> dict:
    _apply(row, payload)
    # A confirmation vouches for what the course said then.
    row.confirmed_at, row.confirmed_by_user_id = None, None
    row.update_date = _now()
    db.add(row)
    db.commit()
    return plan_dto(db, row.org_id, row.user_id)


def staff_add(db: Session, current_user: PublicUser, org_id: int, user_id: int, payload: EppCourseWrite) -> dict:
    _staff_access(db, current_user, org_id, user_id)
    return _create(db, org_id, user_id, payload, current_user.id, "staff")


def staff_update(db: Session, current_user: PublicUser, org_id: int, user_id: int, course_uuid: str, payload: EppCourseWrite) -> dict:
    _staff_access(db, current_user, org_id, user_id)
    return _change(db, _course(db, org_id, user_id, course_uuid), payload)


def staff_delete(db: Session, current_user: PublicUser, org_id: int, user_id: int, course_uuid: str) -> dict:
    _staff_access(db, current_user, org_id, user_id)
    db.delete(_course(db, org_id, user_id, course_uuid))
    db.commit()
    return plan_dto(db, org_id, user_id)


def confirm(db: Session, current_user: PublicUser, org_id: int, user_id: int, course_uuid: str, confirmed: bool = True) -> dict:
    """Staff vouch that a completed course and its credits match the school's records."""
    _staff_access(db, current_user, org_id, user_id)
    row = _course(db, org_id, user_id, course_uuid)
    if confirmed and row.status != "completed":
        raise HTTPException(status_code=409, detail="Only a completed course can be school confirmed")
    row.confirmed_at, row.confirmed_by_user_id = (_now(), current_user.id) if confirmed else (None, None)
    row.update_date = _now()
    db.add(row)
    db.commit()
    return plan_dto(db, org_id, user_id)


def _not_confirmed(row: EppCourse) -> EppCourse:
    if row.confirmed_at:
        raise HTTPException(status_code=409, detail="Your school confirmed this course. Ask them to change it.")
    return row


def my_add(db: Session, current_user: PublicUser, org_id: int, payload: EppCourseWrite) -> dict:
    _learner_access(db, current_user, org_id)
    return _create(db, org_id, current_user.id, payload, current_user.id, "student")


def my_update(db: Session, current_user: PublicUser, org_id: int, course_uuid: str, payload: EppCourseWrite) -> dict:
    _learner_access(db, current_user, org_id)
    return _change(db, _not_confirmed(_course(db, org_id, current_user.id, course_uuid)), payload)


def my_delete(db: Session, current_user: PublicUser, org_id: int, course_uuid: str) -> dict:
    _learner_access(db, current_user, org_id)
    db.delete(_not_confirmed(_course(db, org_id, current_user.id, course_uuid)))
    db.commit()
    return plan_dto(db, org_id, current_user.id)


# ---------------------------------------------------------------- Oregon CIS

def _cis_rows(db: Session, user_id: int) -> list[dict]:
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return []
    found: list[dict] = []
    for entry in db.exec(select(PortfolioImport).where(PortfolioImport.portfolio_id == portfolio.id, PortfolioImport.source == "cis")).all():
        for sheet, sheet_rows in (entry.kept or {}).items():
            if sheet.strip().lower() == CIS_SHEET:
                found.extend(row for row in sheet_rows if str(row.get("Course title") or "").strip())
    return found


def _number(value) -> float | None:
    try:
        return float(str(value).strip()) if value not in (None, "") else None
    except ValueError:
        return None


def cis_course(row: dict) -> EppCourseWrite | None:
    """One CIS course planner row as a course: "9th Grade" to 9, its subject mapped, done when it has a grade."""
    match = re.search(r"(9|10|11|12)", str(row.get("Grade level") or ""))
    if not match:
        return None
    dual = bool(str(row.get("Dual credit") or "").strip() or str(row.get("Dual credit school") or "").strip())
    note = str(row.get("Note") or "").strip() or None
    return EppCourseWrite(
        grade=int(match.group(1)), school_year=(str(row.get("School year") or "").strip() or None),
        subject=CIS_SUBJECTS.get(str(row.get("Subject") or "").strip().lower(), "electives"),
        title=str(row["Course title"]).strip()[:200], term=(str(row.get("Term") or "").strip()[:40] or None),
        credits=min(4.0, max(0.0, _number(row.get("Units / Credits")) or 0)),
        status="completed" if str(row.get("Grade") or "").strip() else "planned",
        course_code=(str(row.get("Dual credit course code") or "").strip()[:40] or None), dual_credit=dual,
        dual_credit_school=(str(row.get("Dual credit school") or "").strip()[:200] or None) if dual else None,
        dual_credit_credits=_number(row.get("Dual credit credits")) if dual else None, note=note[:500] if note else None,
    )


def import_cis(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """Bring in the course planner from the learner's Oregon CIS import. Courses already here are skipped."""
    _staff_access(db, current_user, org_id, user_id)
    have = {(row.grade, row.title.lower()) for row in rows(db, org_id, user_id)}
    now, added = _now(), 0
    for raw in _cis_rows(db, user_id):
        course = cis_course(raw)
        if not course or (course.grade, (course.title or "").lower()) in have or course.grade not in GRADES:
            continue
        have.add((course.grade, (course.title or "").lower()))
        row = EppCourse(course_uuid=f"eppcourse_{uuid4().hex}", org_id=org_id, user_id=user_id, grade=course.grade or 9, subject=course.subject or "electives",
                        title=course.title or "", source="cis", added_by_user_id=current_user.id, creation_date=now, update_date=now)
        _apply(row, course)
        db.add(row)
        added += 1
    db.commit()
    return {**plan_dto(db, org_id, user_id), "added": added}
