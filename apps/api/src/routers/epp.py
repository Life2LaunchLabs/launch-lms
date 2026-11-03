"""Oregon Education Plan and Profile: a learner's course plan with a school, for staff and for the learner.

Staff routes need an active support link (services/school/support.require_support). Records, the
caseload and its export are for any of the organization's staff.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.epp_courses import EppCourseConfirm, EppCourseWrite
from src.db.epp_records import EppRecordCorrection, EppRecordCreate
from src.db.learner_support import ReportPicks
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.epp import caseload, courses, records, report

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


@router.get("/orgs/{org_id}/students/{user_id}/report")
async def student_report(org_id: int, user_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """A supported learner's Education Plan and Profile report, as it stands now."""
    return report.staff_report(db_session, current_user, org_id, user_id)


@router.get("/orgs/{org_id}/report")
async def my_report(org_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """Your report with a school that supports you, the portfolio items you can choose for it, and your picks."""
    return report.my_report(db_session, current_user, org_id)


@router.put("/orgs/{org_id}/report/picks")
async def set_my_report_picks(org_id: int, payload: ReportPicks, current_user: PublicUser = USER, db_session: Session = DB):
    return report.set_picks(db_session, current_user, org_id, payload)


@router.post("/orgs/{org_id}/students/{user_id}/records")
async def review_student(org_id: int, user_id: int, payload: EppRecordCreate, current_user: PublicUser = USER, db_session: Session = DB):
    """Save the live report as reviewed with the learner: a frozen record the school keeps."""
    return records.review(db_session, current_user, org_id, user_id, payload)


@router.get("/orgs/{org_id}/records")
async def org_records(org_id: int, user_id: int | None = None, include_superseded: bool = False, current_user: PublicUser = USER, db_session: Session = DB):
    """The school's frozen records, newest first; one learner's with `user_id`."""
    return records.list_records(db_session, current_user, org_id, user_id, include_superseded)


@router.get("/orgs/{org_id}/records/{record_uuid}")
async def org_record(org_id: int, record_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return records.open_record(db_session, current_user, org_id, record_uuid)


@router.post("/orgs/{org_id}/records/{record_uuid}/corrections")
async def correct_record(org_id: int, record_uuid: str, payload: EppRecordCorrection, current_user: PublicUser = USER, db_session: Session = DB):
    """A new version of a record; the one it corrects is kept."""
    return records.correct(db_session, current_user, org_id, record_uuid, payload)


@router.get("/orgs/{org_id}/my_records")
async def my_records(org_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    """Your reviewed records with a school."""
    return records.my_records(db_session, current_user, org_id)


def _file(name: str, body: bytes, media_type: str) -> Response:
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}",
                                                                  "Cache-Control": "no-store"})


@router.get("/orgs/{org_id}/records/{record_uuid}/pdf")
async def record_pdf(org_id: int, record_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    """One saved record as a PDF named Last_First_StudentID_EPP_2026-27.pdf."""
    name, body = caseload.record_pdf(db_session, current_user, org_id, record_uuid)
    return _file(name, body, "application/pdf")


@router.get("/orgs/{org_id}/caseload")
async def org_caseload(org_id: int, mine: bool = False, current_user: PublicUser = USER, db_session: Session = DB):
    """The learners the school supports and where each plan stands; `mine` keeps the ones you counsel."""
    return caseload.caseload(db_session, current_user, org_id, mine)


@router.get("/orgs/{org_id}/caseload/export")
async def export_caseload(org_id: int, mine: bool = False, current_user: PublicUser = USER, db_session: Session = DB):
    """A zip with a PDF of each learner's reviewed record this school year."""
    name, body = caseload.export_reviewed(db_session, current_user, org_id, mine)
    return _file(name, body, "application/zip")
