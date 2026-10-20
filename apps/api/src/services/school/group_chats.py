"""A group's chat: its members and its staff, in one conversation named after the group.

Learner cohorts talk with their staff here, and a group of staff talks among itself. Group chats
come with the groups package (advanced user management): without it an organization's chats are
one to one. A group chat isn't about one plan; plan feeds stay with each learner's plans.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser
from src.security.access.access import org_access
from src.services.goals.sharing_roles import _stamp

GROUP = "group"
FEATURE = "groups"
DISABLED = "Group chats need the Full tier."


def _key(group_id: int) -> str:
    # Shares the direct-chat key column so each group has exactly one chat.
    return f"group:{group_id}"


def enabled(db: Session, org_id: int) -> bool:
    return org_access(org_id, db).has(FEATURE)


def require_enabled(db: Session, org_id: int) -> None:
    if not enabled(db, org_id):
        raise HTTPException(status_code=403, detail=DISABLED)


def find(db: Session, group_id: int) -> Conversation | None:
    return db.exec(select(Conversation).where(Conversation.direct_key == _key(group_id))).first()


def people_of(db: Session, group_id: int) -> set[int]:
    members = db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group_id)).all()
    staff = db.exec(select(UserGroupStaff.user_id).where(UserGroupStaff.usergroup_id == group_id)).all()
    return {int(user_id) for user_id in [*members, *staff]}


def group_chat(db: Session, group: UserGroup) -> Conversation:
    """The group's chat, created if needed, with its members brought up to date (flushed)."""
    conversation = find(db, int(group.id))  # type: ignore[arg-type]
    now = _stamp()
    if not conversation:
        conversation = Conversation(conversation_uuid=f"chat_{uuid4()}", kind=GROUP, direct_key=_key(int(group.id)), title=group.name,  # type: ignore[arg-type]
                                    org_id=group.org_id, creation_date=now, update_date=now)
        db.add(conversation)
        db.flush()
    elif conversation.title != group.name:
        conversation.title, conversation.update_date = group.name, now
        db.add(conversation)
    wanted = people_of(db, int(group.id))  # type: ignore[arg-type]
    current = {member.user_id: member for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
    for user_id in wanted - set(current):
        db.add(ConversationMember(conversation_id=int(conversation.id), user_id=user_id, status="active", creation_date=now, update_date=now))  # type: ignore[arg-type]
    for user_id, member in current.items():
        if user_id not in wanted:
            db.delete(member)
    db.flush()
    return conversation


def sync(db: Session, group: UserGroup) -> None:
    """After a group's members or staff change: its chat, if it has one, and its learners' chats with the organization."""
    from src.services.school import chats as school_chats

    if find(db, int(group.id)):  # type: ignore[arg-type]
        group_chat(db, group)
    school_chats.sync_group(db, int(group.org_id), int(group.id))  # type: ignore[arg-type]


def drop(db: Session, group_id: int) -> None:
    """A deleted group's chat goes with it."""
    conversation = find(db, group_id)
    if conversation:
        db.delete(conversation)
        db.flush()


def groups_of(db: Session, org_id: int, user_id: int) -> list[UserGroup]:
    """Groups in this organization someone is a member or staff of."""
    ids = {*db.exec(select(UserGroupUser.usergroup_id).where(UserGroupUser.user_id == user_id, UserGroupUser.org_id == org_id)).all(),
           *db.exec(select(UserGroupStaff.usergroup_id).where(UserGroupStaff.user_id == user_id, UserGroupStaff.org_id == org_id)).all()}
    return list(db.exec(select(UserGroup).where(col(UserGroup.id).in_(list(ids))).order_by(col(UserGroup.name))).all()) if ids else []


def open_group_chat(db: Session, current_user: PublicUser, org_id: int, group_id: int) -> dict:
    """Open a group's chat from People, for its members and staff."""
    from src.services.connect import chats

    require_enabled(db, org_id)
    group = db.get(UserGroup, group_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.id not in people_of(db, group_id):
        raise HTTPException(status_code=403, detail="Only the group's members and staff are in its chat. Add yourself as staff to join it.")
    conversation = group_chat(db, group)
    db.commit()
    return chats.get_chat(db, current_user, conversation.conversation_uuid)


def members_left(db: Session, group: UserGroup, user_ids: list[str]) -> None:
    """People just taken out of a group: the group's chat, and their chats with the organization, which lose its staff."""
    from src.services.school import chats as school_chats

    sync(db, group)
    for user_id in {int(item) for item in user_ids if str(item).strip().isdigit()}:
        if school_chats.find(db, int(group.org_id), user_id):  # type: ignore[arg-type]
            school_chats.school_chat(db, int(group.org_id), user_id)  # type: ignore[arg-type]
