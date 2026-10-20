"""People: one list of the organization's people and the viewer's chats there, for its staff.

Everyone carries a role label (admin, staff, learner, helper). Chats are the viewer's group chats
(with the groups package) and direct chats with the organization's people. Learners' plan feeds
aren't here: they live with each plan in Assignments.
"""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember
from src.db.goals import Goal, GoalOwnership
from src.db.planning import PlanCollaborator
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.connect import chats, people
from src.services.school import group_chats, roles

PAGE = 40
MAX_HELPERS = 20


def _like(query, needle: str):
    pattern = f"%{needle}%"
    return query.where(or_(col(User.first_name).ilike(pattern), col(User.last_name).ilike(pattern), col(User.username).ilike(pattern), col(User.email).ilike(pattern)))


def _groups_by_user(db: Session, org_id: int, user_ids: list[int]) -> dict[int, list[dict]]:
    if not user_ids:
        return {}
    rows = db.exec(select(UserGroupUser.user_id, UserGroup.id, UserGroup.name).join(UserGroup, UserGroup.id == UserGroupUser.usergroup_id).where(
        UserGroupUser.org_id == org_id, col(UserGroupUser.user_id).in_(user_ids),
    ).order_by(col(UserGroup.name))).all()
    grouped: dict[int, list[dict]] = {}
    for user_id, group_id, name in rows:
        grouped.setdefault(int(user_id), []).append({"id": group_id, "name": name})
    return grouped


def _label(role_id: int, staff_roles: set[int]) -> str:
    return "admin" if role_id == ADMIN_ROLE_ID else "staff" if role_id in staff_roles else "learner"


def _helping_on(db: Session, org_id: int, helper_ids: list[int]) -> dict[int, list[dict]]:
    """The plans each helper is on with this organization's learners."""
    if not helper_ids:
        return {}
    rows = db.exec(select(PlanCollaborator.user_id, PlanCollaborator.collaborator_uuid, Goal).join(Goal, Goal.id == PlanCollaborator.goal_id).where(
        Goal.org_id == org_id, Goal.ownership == GoalOwnership.EXTERNAL.value, PlanCollaborator.active == True,  # noqa: E712
        col(PlanCollaborator.user_id).in_(helper_ids),
    ).order_by(col(Goal.id))).all()
    found: dict[int, list[dict]] = {}
    for user_id, collaborator_uuid, goal in rows:
        learner = people.person(db, goal.subject_user_id)
        found.setdefault(int(user_id), []).append({"goal_uuid": goal.goal_uuid, "title": goal.title, "collaborator_uuid": collaborator_uuid, "learner": learner})
    return found


def directory(db: Session, current_user: PublicUser, org_id: int, query: str = "", offset: int = 0, limit: int = PAGE) -> dict:
    """The organization's people, by name, each with their role; helpers too when searching."""
    roles.require_staff(db, current_user.id, org_id)
    needle = (query or "").strip().lstrip("@")
    limit = max(1, min(limit, 100))
    members = select(User, UserOrganization.role_id).join(UserOrganization, UserOrganization.user_id == User.id).where(UserOrganization.org_id == org_id)
    if needle:
        members = _like(members, needle)
    total = int(db.exec(select(func.count()).select_from(members.subquery())).one())
    rows = db.exec(members.order_by(func.lower(func.coalesce(User.first_name, User.username)), col(User.id)).offset(max(offset, 0)).limit(limit)).all()
    found = person_rows(db, org_id, list(rows))  # type: ignore[arg-type]
    helpers = matching_helpers(db, org_id, needle) if needle and offset == 0 else []
    return {"people": [*found, *helpers], "total": total + len(helpers), "offset": offset, "limit": limit}


def person_rows(db: Session, org_id: int, rows: list[tuple[User, int]]) -> list[dict]:
    """Members as People lists them: who, their role label and role name, and their groups."""
    staff_roles = roles.staff_role_ids(db, org_id)
    role_names = {int(role.id): role.name for role in db.exec(select(Role).where(col(Role.id).in_({int(role_id) for _, role_id in rows}))).all()} if rows else {}  # type: ignore[arg-type]
    groups = _groups_by_user(db, org_id, [int(user.id) for user, _ in rows])  # type: ignore[arg-type]
    return [{"user": people.person(db, user.id), "role": _label(int(role_id), staff_roles), "role_name": role_names.get(int(role_id), ""),
             "groups": groups.get(int(user.id), [])} for user, role_id in rows]  # type: ignore[arg-type]


def matching_helpers(db: Session, org_id: int, needle: str) -> list[dict]:
    """Helpers on the organization's plans whose name matches: they aren't members, so only a search finds them."""
    helper_ids = sorted(roles.helper_ids(db, org_id) - roles.member_ids(db, org_id))
    matched = db.exec(_like(select(User), needle).where(col(User.id).in_(helper_ids)).limit(MAX_HELPERS)).all() if helper_ids else []
    helping = _helping_on(db, org_id, [int(user.id) for user in matched])  # type: ignore[arg-type]
    return [{"user": people.person(db, user.id), "role": "helper", "role_name": "Helper", "groups": [], "helping_on": helping.get(int(user.id), [])}  # type: ignore[arg-type]
            for user in matched]


def _row(db: Session, org_id: int, conversation: Conversation, member: ConversationMember, staff_roles: set[int], members: dict[int, int]) -> dict:
    row = chats._chat_dict(db, conversation, member)
    if conversation.kind == group_chats.GROUP:
        group_id = int((conversation.direct_key or "group:0").split(":")[1])
        return {**row, "group_id": group_id, "member_count": len(row["people"]) + 1, "role": None}
    other = row["people"][0] if row["people"] else None
    role_id = members.get(int(other["id"])) if other else None
    return {**row, "group_id": None, "member_count": 2, "role": _label(role_id, staff_roles) if role_id is not None else None}


def chat_list(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The viewer's chats with this organization's people: its groups' chats they're in, and direct chats with its members."""
    roles.require_staff(db, current_user.id, org_id)
    groups_on = group_chats.enabled(db, org_id)
    if groups_on:
        for group in group_chats.groups_of(db, org_id, current_user.id):
            group_chats.group_chat(db, group)
        db.commit()
    members = {int(user_id): int(role_id) for user_id, role_id in db.exec(select(UserOrganization.user_id, UserOrganization.role_id).where(UserOrganization.org_id == org_id)).all()}
    staff_roles = roles.staff_role_ids(db, org_id)
    kinds = ["direct", *([group_chats.GROUP] if groups_on else [])]
    rows = db.exec(select(Conversation, ConversationMember).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(
        ConversationMember.user_id == current_user.id, col(ConversationMember.status).in_(chats.LISTED), col(Conversation.kind).in_(kinds),
    )).all()
    listed = []
    for conversation, member in rows:
        if conversation.kind == group_chats.GROUP and conversation.org_id != org_id:
            continue
        if conversation.kind == "direct":
            others = [item.user_id for item in chats._members(db, conversation) if item.user_id != current_user.id]
            if not others or others[0] not in members or not conversation.last_message_at:
                continue
        listed.append(_row(db, org_id, conversation, member, staff_roles, members))
    # Newest first; a group chat nobody has written in yet goes last.
    listed.sort(key=lambda item: item["last_message_at"] or "", reverse=True)
    return {"chats": listed, "groups_enabled": groups_on}
