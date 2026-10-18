"""The school side of collaborators, used from Users: group staff, a student's team, chat and notes, and who's waiting."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.school import GroupStaffSet, StaffNoteCreate
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.school import staff, views

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
