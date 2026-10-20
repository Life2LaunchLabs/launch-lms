"""The school side, used from People: the people list (one feed, most relevant first) and profiles, group chats and staff, a student's team, chat and notes, who's waiting, chat reports and the messaging policy."""

from typing import Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.conversations import ChatReportReview
from src.db.organization_config import MessagingPolicy
from src.db.school import GroupStaffSet, StaffNoteCreate
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.school import directory, feed, group_chats, messaging, profile, reports, staff, views

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/orgs/{org_id}/groups/{group_id}/staff")
async def list_group_staff(org_id: int, group_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return staff.list_staff(db_session, current_user, org_id, group_id)


@router.put("/orgs/{org_id}/groups/{group_id}/staff")
async def set_group_staff(org_id: int, group_id: int, payload: GroupStaffSet, current_user: PublicUser = USER, db_session: Session = DB):
    return staff.set_staff(db_session, current_user, org_id, group_id, payload)


@router.delete("/orgs/{org_id}/groups/{group_id}/staff/{user_id}")
async def remove_group_staff(org_id: int, group_id: int, user_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return staff.remove_staff(db_session, current_user, org_id, group_id, user_id)


@router.get("/orgs/{org_id}/students/{user_id}")
async def student(org_id: int, user_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return views.student(db_session, current_user, org_id, user_id)


@router.get("/orgs/{org_id}/students/{user_id}/chat")
async def student_chat(org_id: int, user_id: int, before: str | None = None, goal_uuid: str | None = None, step_uuid: str | None = None,
                       current_user: PublicUser = USER, db_session: Session = DB):
    return views.student_chat(db_session, current_user, org_id, user_id, before, goal_uuid, step_uuid)


@router.post("/orgs/{org_id}/students/{user_id}/notes")
async def add_note(org_id: int, user_id: int, payload: StaffNoteCreate, current_user: PublicUser = USER, db_session: Session = DB):
    return views.add_note(db_session, current_user, org_id, user_id, payload.body)


@router.delete("/orgs/{org_id}/students/{user_id}/notes/{note_uuid}")
async def delete_note(org_id: int, user_id: int, note_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return views.delete_note(db_session, current_user, org_id, user_id, note_uuid)


@router.get("/orgs/{org_id}/waiting")
async def waiting(org_id: int, mine: bool = True, current_user: PublicUser = USER, db_session: Session = DB):
    return views.waiting(db_session, current_user, org_id, mine)


@router.get("/orgs/{org_id}/reports")
async def list_reports(org_id: int, status: str = "open", current_user: PublicUser = USER, db_session: Session = DB):
    return reports.list_reports(db_session, current_user, org_id, status)


@router.put("/orgs/{org_id}/reports/{report_uuid}")
async def review_report(org_id: int, report_uuid: str, payload: ChatReportReview, current_user: PublicUser = USER, db_session: Session = DB):
    return reports.review(db_session, current_user, org_id, report_uuid, payload.status)


@router.get("/orgs/{org_id}/people")
async def people_directory(org_id: int, q: str = "", offset: int = 0, limit: int = directory.PAGE, status: Literal["active", "alumni", "all"] = "active",
                           current_user: PublicUser = USER, db_session: Session = DB):
    return directory.directory(db_session, current_user, org_id, q, offset, limit, status)


@router.get("/orgs/{org_id}/people/feed")
async def people_feed(org_id: int, q: str = "", offset: int = 0, limit: int = feed.PAGE, current_user: PublicUser = USER, db_session: Session = DB):
    return feed.people_feed(db_session, current_user, org_id, q, offset, limit)


@router.get("/orgs/{org_id}/people/{username}/activity")
async def person_activity(org_id: int, username: str, current_user: PublicUser = USER, db_session: Session = DB):
    return feed.person_activity(db_session, current_user, org_id, username)


@router.get("/orgs/{org_id}/groups/{group_id}")
async def group_detail(org_id: int, group_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return feed.group_detail(db_session, current_user, org_id, group_id)


@router.get("/orgs/{org_id}/people/{username}")
async def person_profile(org_id: int, username: str, current_user: PublicUser = USER, db_session: Session = DB):
    return profile.profile(db_session, current_user, org_id, username)


@router.get("/orgs/{org_id}/chats")
async def people_chats(org_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return directory.chat_list(db_session, current_user, org_id)


@router.post("/orgs/{org_id}/groups/{group_id}/chat")
async def open_group_chat(org_id: int, group_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return group_chats.open_group_chat(db_session, current_user, org_id, group_id)


@router.get("/orgs/{org_id}/messaging")
async def get_messaging_policy(org_id: int, current_user: PublicUser = USER, db_session: Session = DB):
    return messaging.get_policy(db_session, current_user, org_id)


@router.put("/orgs/{org_id}/messaging")
async def update_messaging_policy(org_id: int, payload: MessagingPolicy, current_user: PublicUser = USER, db_session: Session = DB):
    return messaging.update_policy(db_session, current_user, org_id, payload)
