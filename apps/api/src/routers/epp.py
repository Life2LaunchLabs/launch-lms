"""Oregon Education Plan and Profile: a learner's course plan with a school, for staff and for the learner.

Staff routes need an active support link (services/school/support.require_support).
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.epp_courses import EppCourseConfirm, EppCourseWrite
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.epp import courses

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/orgs/{org_id}/students/{user_id}/courses")
async def student_courses(org_id: int, user_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """A supported learner's course plan and its tally against the 24 diploma credits."""
    return courses.staff_plan(db_session, current_user, org_id, user_id)


@router.post("/orgs/{org_id}/students/{user_id}/courses")
async def add_student_course(org_id: int, user_id: int, payload: EppCourseWrite, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.staff_add(db_session, current_user, org_id, user_id, payload)


@router.post("/orgs/{org_id}/students/{user_id}/courses/import_cis")
async def import_student_cis_courses(org_id: int, user_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """Bring in the course planner from the learner's Oregon CIS import."""
    return courses.import_cis(db_session, current_user, org_id, user_id)


@router.put("/orgs/{org_id}/students/{user_id}/courses/{course_uuid}")
async def update_student_course(org_id: int, user_id: int, course_uuid: str, payload: EppCourseWrite, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.staff_update(db_session, current_user, org_id, user_id, course_uuid, payload)


@router.delete("/orgs/{org_id}/students/{user_id}/courses/{course_uuid}")
async def delete_student_course(org_id: int, user_id: int, course_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.staff_delete(db_session, current_user, org_id, user_id, course_uuid)


@router.post("/orgs/{org_id}/students/{user_id}/courses/{course_uuid}/confirm")
async def confirm_student_course(org_id: int, user_id: int, course_uuid: str, payload: EppCourseConfirm, current_user: PublicUser = USER, db_session: Session = DB):
    """Staff only: the course and its credits match the school's records."""
    return courses.confirm(db_session, current_user, org_id, user_id, course_uuid, payload.confirmed)


@router.get("/orgs/{org_id}/courses")
async def my_courses(org_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """Your course plan with a school that supports you."""
    return courses.my_plan(db_session, current_user, org_id)


@router.post("/orgs/{org_id}/courses")
async def add_my_course(org_id: int, payload: EppCourseWrite, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.my_add(db_session, current_user, org_id, payload)


@router.put("/orgs/{org_id}/courses/{course_uuid}")
async def update_my_course(org_id: int, course_uuid: str, payload: EppCourseWrite, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.my_update(db_session, current_user, org_id, course_uuid, payload)


@router.delete("/orgs/{org_id}/courses/{course_uuid}")
async def delete_my_course(org_id: int, course_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return courses.my_delete(db_session, current_user, org_id, course_uuid)
