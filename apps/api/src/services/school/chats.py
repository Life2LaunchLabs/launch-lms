"""Each student's school chat: the student and the staff of their groups, named after the organization."""

from __future__ import annotations

from uuid import uuid4

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember
from src.db.organizations import Organization
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.services.goals.sharing_roles import _stamp

SCHOOL = "school"


def _key(org_id: int, student_id: int) -> str:
    # Shares the direct-chat key column so each student has exactly one school chat per organization.
    return f"school:{org_id}:{student_id}"


def student_groups(db: Session, org_id: int, student_id: int) -> list[int]:
    return [int(item) for item in db.exec(select(UserGroupUser.usergroup_id).where(UserGroupUser.user_id == student_id, UserGroupUser.org_id == org_id)).all()]


def team(db: Session, org_id: int, student_id: int) -> list[UserGroupStaff]:
    """Staff of the student's groups, one row per person and group."""
    groups = student_groups(db, org_id, student_id)
    if not groups:
        return []
    return [row for row in db.exec(select(UserGroupStaff).where(col(UserGroupStaff.usergroup_id).in_(groups)).order_by(col(UserGroupStaff.id))).all() if row.user_id != student_id]


def students_of(db: Session, org_id: int, staff_id: int) -> set[int]:
    groups = db.exec(select(UserGroupStaff.usergroup_id).where(UserGroupStaff.user_id == staff_id, UserGroupStaff.org_id == org_id)).all()
    if not groups:
        return set()
    return {int(item) for item in db.exec(select(UserGroupUser.user_id).where(col(UserGroupUser.usergroup_id).in_(list(groups)))).all()} - {staff_id}


def relation(db: Session, a: int, b: int) -> tuple[int, int] | None:
    """(org, student) when one of these people is staff on a group the other is a student in."""
    for staff_id, student_id in ((a, b), (b, a)):
        for row in db.exec(select(UserGroupStaff).where(UserGroupStaff.user_id == staff_id)).all():
            if db.exec(select(UserGroupUser.id).where(UserGroupUser.usergroup_id == row.usergroup_id, UserGroupUser.user_id == student_id)).first():
                return int(row.org_id), student_id
    return None


def find(db: Session, org_id: int, student_id: int) -> Conversation | None:
    return db.exec(select(Conversation).where(Conversation.direct_key == _key(org_id, student_id))).first()


def school_chat(db: Session, org_id: int, student_id: int) -> Conversation:
    """The student's school chat, created if needed, with its members brought up to date."""
    conversation = find(db, org_id, student_id)
    now = _stamp()
    if not conversation:
        org = db.get(Organization, org_id)
        conversation = Conversation(
            conversation_uuid=f"chat_{uuid4()}", kind=SCHOOL, direct_key=_key(org_id, student_id), title=org.name if org else "School",
            org_id=org_id, creation_date=now, update_date=now,
        )
        db.add(conversation)
        db.flush()
    wanted = {student_id, *(row.user_id for row in team(db, org_id, student_id))}
    current = {member.user_id: member for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
    for user_id in wanted - set(current):
        db.add(ConversationMember(conversation_id=int(conversation.id), user_id=user_id, status="active", creation_date=now, update_date=now))  # type: ignore[arg-type]
    for user_id, member in current.items():
        if user_id not in wanted:
            db.delete(member)
    db.flush()
    return conversation


def sync_group(db: Session, org_id: int, group_id: int) -> None:
    """Bring every student's school chat in a group up to date, after its staff change."""
    for student_id in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group_id)).all():
        school_chat(db, org_id, int(student_id))


def for_pair(db: Session, a: int, b: int) -> Conversation | None:
    """The school chat to use instead of a direct chat between a student and one of their staff."""
    found = relation(db, a, b)
    return school_chat(db, *found) if found else None
