"""Someone's profile in People: who they are to the organization, their plans with it, and what staff can do about them.

A learner's plans each open their feed in Assignments. A helper's profile lists only the plans
they help on. Whether the viewer can message them follows the organization's messaging policy.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalAssignment, GoalOwnership, GoalStatus
from src.db.planning import PlanCollaborator, PlanRole
from src.db.roles import Role
from src.db.school import UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.security.superadmin import is_user_superadmin
from src.services.connect import chats, people
from src.services.goals import access
from src.services.school import chats as school_chats, directory, group_chats, messaging, roles

SHOWN = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)


def _user(db: Session, username: str) -> User:
    user = db.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Person not found")
    return user


def _progress(db: Session, goal: Goal) -> dict:
    from src.services.connect.workspace import topic

    return topic(db, goal)["progress"]


def _plans(db: Session, viewer_id: int, admin: bool, org_id: int, user_id: int) -> list[dict]:
    """Plans the organization gave them that the viewer may see: all of them for admins, else the ones they're on or whose group they staff."""
    goals = db.exec(select(Goal).where(
        Goal.org_id == org_id, Goal.subject_user_id == user_id, Goal.ownership == GoalOwnership.EXTERNAL.value, col(Goal.status).in_(SHOWN),
    ).order_by(col(Goal.id).desc())).all()
    group_staff = user_id in school_chats.students_of(db, org_id, viewer_id)
    plans = []
    for goal in goals:
        if not (admin or group_staff or "view_plan" in access.capabilities(db, goal, viewer_id)):
            continue
        assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
        plans.append({
            "goal_uuid": goal.goal_uuid, "title": goal.title, "status": getattr(goal.status, "value", goal.status), "source": getattr(goal.source, "value", goal.source),
            "progress": _progress(db, goal), "assignment_uuid": assignment.assignment_uuid if assignment else None,
            "assignment_status": getattr(assignment.status, "value", assignment.status) if assignment else None,
        })
    return plans


def _helpers(db: Session, org_id: int, plan_uuids: list[str]) -> list[dict]:
    """Helpers on these plans: who, on which plan, as what."""
    if not plan_uuids:
        return []
    staff = roles.staff_ids(db, org_id)
    rows = db.exec(select(PlanCollaborator, PlanRole, Goal).join(PlanRole, PlanRole.id == PlanCollaborator.role_id).join(Goal, Goal.id == PlanCollaborator.goal_id).where(
        col(Goal.goal_uuid).in_(plan_uuids), PlanCollaborator.active == True,  # noqa: E712
    )).all()
    return [{"user": people.person(db, row.user_id), "collaborator_uuid": row.collaborator_uuid, "role": role.name, "goal_uuid": goal.goal_uuid, "goal_title": goal.title}
            for row, role, goal in rows if row.user_id not in staff and row.user_id not in {goal.subject_user_id, goal.owner_user_id}]


def _groups(db: Session, org_id: int, user_id: int) -> list[dict]:
    member = db.exec(select(UserGroup).join(UserGroupUser, UserGroupUser.usergroup_id == UserGroup.id).where(UserGroupUser.user_id == user_id, UserGroupUser.org_id == org_id)).all()
    staffing = db.exec(select(UserGroup).join(UserGroupStaff, UserGroupStaff.usergroup_id == UserGroup.id).where(UserGroupStaff.user_id == user_id, UserGroupStaff.org_id == org_id)).all()
    return [*({"id": group.id, "name": group.name, "as": "member"} for group in member), *({"id": group.id, "name": group.name, "as": "staff"} for group in staffing)]


def _message(db: Session, viewer_id: int, user_id: int, role: str | None) -> dict:
    """Whether the viewer can message them from People, and if not, why."""
    if viewer_id == user_id:
        return {"can_message": False, "note": None, "chat_uuid": None}
    reason = messaging.direct_block(db, viewer_id, user_id)
    if not reason and role == "helper":
        reason = messaging.HELPER_DM
    direct = chats._direct(db, viewer_id, user_id)
    return {"can_message": not reason, "note": reason, "chat_uuid": direct.conversation_uuid if direct and not reason else None}


def profile(db: Session, current_user: PublicUser, org_id: int, username: str) -> dict:
    roles.require_staff(db, current_user.id, org_id)
    user = _user(db, username)
    user_id = int(user.id)  # type: ignore[arg-type]
    role = roles.org_role(db, org_id, user_id)
    if not role:
        raise HTTPException(status_code=404, detail="Person not found")
    admin = is_org_admin(current_user.id, org_id, db) or is_user_superadmin(current_user.id, db)
    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    org_role = db.get(Role, membership.role_id) if membership else None
    summary = people.person(db, user_id) or {}
    plans = _plans(db, current_user.id, admin, org_id, user_id) if role == "learner" else []
    helping = directory._helping_on(db, org_id, [user_id]).get(user_id, []) if role == "helper" else []
    return {
        "user": {**summary, **({"email": user.email} if admin else {}), "last_login_at": getattr(user, "last_login_at", None)},
        "role": role, "role_name": org_role.name if org_role else "Helper",
        "org_role": {"id": org_role.id, "role_uuid": org_role.role_uuid, "name": org_role.name} if org_role else None,
        "joined_at": membership.creation_date if membership else None,
        "groups": _groups(db, org_id, user_id), "plans": plans, "helpers": _helpers(db, org_id, [plan["goal_uuid"] for plan in plans]),
        "helping_on": helping,
        **_message(db, current_user.id, user_id, role),
        "manage": {
            "change_role": admin and membership is not None and user_id != current_user.id,
            "remove": admin and membership is not None and user_id != current_user.id,
            "groups": admin and membership is not None and group_chats.enabled(db, org_id),
            "remove_helper": admin and role == "helper",
        },
    }
