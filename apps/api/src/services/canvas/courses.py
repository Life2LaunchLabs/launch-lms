"""Each Canvas course becomes a group in the school's organization (OP-2, DEV-179).

The group is named after the course and keyed by Canvas's course id, renamed when the course's title
changes. People join it the first time they open Life2Launch from that course: students as members (they
get the group's plans and chats like anyone added to a group), teachers as staff on the group. We never
pull the class list (that needs Canvas's roster service).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from src.db.canvas import CanvasCourseGroup
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.canvas.launch import Launch

# Teachers can comment on and @mention in their course group's goals, like staff an admin adds to a group.
TEACHER_GROUP_ROLE = "commenter"


def _now() -> str:
    return str(datetime.now())


def _name(launch: Launch) -> str:
    return (launch.course_title or "").strip()[:200] or "Canvas course"


def course_group(db: Session, launch: Launch) -> UserGroup | None:
    """The course's group, made (or renamed) as needed; None when the launch didn't come from a course."""
    if not launch.course_id:
        return None
    course_id = str(launch.course_id)[:255]
    org_id = launch.connection.org_id
    link = db.exec(select(CanvasCourseGroup).where(
        CanvasCourseGroup.connection_id == launch.connection.id, CanvasCourseGroup.canvas_course_id == course_id,
    )).first()
    group = db.get(UserGroup, link.usergroup_id) if link else None
    name = _name(launch)
    if group is None:
        group = UserGroup(org_id=org_id, name=name, description="From Canvas", usergroup_uuid=f"usergroup_{uuid4()}",
                          creation_date=_now(), update_date=_now())
        db.add(group)
        db.flush()
        db.add(CanvasCourseGroup(connection_id=launch.connection.id, canvas_course_id=course_id,
                                 usergroup_id=int(group.id), creation_date=_now(), update_date=_now()))
    elif launch.course_title and group.name != name:
        group.name = name
        group.update_date = _now()
        db.add(group)
    db.flush()
    return group


def join_course_group(db: Session, launch: Launch, user: User, staff: bool) -> UserGroup | None:
    """Put this person in the course's group: a student as a member, a teacher as staff. Flushed, not committed."""
    from src.services.connect import cohort
    from src.services.school import group_chats

    group = course_group(db, launch)
    if group is None:
        return None
    group_id, user_id = int(group.id), int(user.id)
    if staff:
        row = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == group_id, UserGroupStaff.user_id == user_id)).first()
        if row is None:
            from src.services.school.staff import _sync_goals

            row = UserGroupStaff(org_id=group.org_id, usergroup_id=group_id, user_id=user_id, role_key=TEACHER_GROUP_ROLE,
                                 assignment_uuids=[], creation_date=_now(), update_date=_now())
            db.add(row)
            db.flush()
            _sync_goals(db, row, group_id, user_id)
            group_chats.sync(db, group)
            cohort.sync_group(db, group_id)
    elif not db.exec(select(UserGroupUser).where(UserGroupUser.usergroup_id == group_id, UserGroupUser.user_id == user_id)).first():
        from src.services.goals.assignments import sync_group_members

        db.add(UserGroupUser(usergroup_id=group_id, user_id=user_id, org_id=group.org_id, creation_date=_now(), update_date=_now()))
        db.flush()
        sync_group_members(db, group, [user_id])
        group_chats.sync(db, group)
    db.flush()
    return group
