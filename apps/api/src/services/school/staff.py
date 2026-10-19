"""Staff on a group: who covers which of its goals, with what role."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import CURRENT_ASSIGNMENT_STATUSES, Goal, GoalAssignment
from src.db.planning import PlanCollaborator
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.school import GroupStaffSet, UserGroupStaff
from src.db.usergroups import UserGroup
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.services.connect import people
from src.services.goals import access
from src.services.goals.assignment_summary import collaborators_of
from src.services.goals.sharing_roles import ROLE_HINTS, SHARING_ROLE_KEYS, _role, _stamp, sharing_choices


def _group(db: Session, org_id: int, group_id: int) -> UserGroup:
    group = db.get(UserGroup, group_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _assignments(db: Session, group_id: int) -> list[GoalAssignment]:
    return list(db.exec(select(GoalAssignment).where(GoalAssignment.usergroup_id == group_id, col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES))
                        .order_by(col(GoalAssignment.id))).all())


def covers(row: UserGroupStaff, assignment: GoalAssignment) -> bool:
    return not row.assignment_uuids or assignment.assignment_uuid in row.assignment_uuids


def _staff_dict(db: Session, row: UserGroupStaff, assignments: list[GoalAssignment]) -> dict:
    covered = [item for item in assignments if covers(row, item)]
    return {
        "user": people.person(db, row.user_id), "role_key": row.role_key, "assignment_uuids": list(row.assignment_uuids or []),
        "all_goals": not row.assignment_uuids, "goal_count": len(covered),
    }


def _candidates(db: Session, org_id: int, taken: set[int]) -> list[dict]:
    """The organization's staff who could be added: the same people who can manage goals."""
    in_org = select(Role).where((Role.org_id == None) | (Role.org_id == org_id))  # noqa: E711
    roles = {*ADMIN_OR_MAINTAINER_ROLE_IDS, *(role.id for role in db.exec(in_org).all() if isinstance(role.rights, dict)
                                              and role.rights.get("dashboard", {}).get("action_access") and role.rights.get("learning_activities", {}).get("action_update"))}
    user_ids = db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, col(UserOrganization.role_id).in_(roles))).all()
    found = [people.person(db, int(user_id)) for user_id in user_ids if int(user_id) not in taken]
    return sorted((item for item in found if item), key=lambda item: item["name"].lower())


def list_staff(db: Session, current_user: PublicUser, org_id: int, group_id: int) -> dict:
    require_org_admin(current_user.id, org_id, db)
    _group(db, org_id, group_id)
    assignments = _assignments(db, group_id)
    rows = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == group_id).order_by(col(UserGroupStaff.id))).all()
    titles = {item.assignment_uuid: _title(db, item) for item in assignments}
    return {
        "staff": [_staff_dict(db, row, assignments) for row in rows],
        "choices": sharing_choices(), "hints": ROLE_HINTS,
        "goals": [{"assignment_uuid": key, "title": title} for key, title in titles.items()],
        "candidates": _candidates(db, org_id, {row.user_id for row in rows}),
    }


def _title(db: Session, assignment: GoalAssignment) -> str:
    goal = db.exec(select(Goal.title).where(Goal.assignment_id == assignment.id)).first()
    if goal:
        return goal
    from src.db.goals import GoalTemplateVersion

    version = db.get(GoalTemplateVersion, assignment.version_id)
    return ((version.document or {}).get("template") or {}).get("title") if version else "Goal"  # type: ignore[return-value]


def _sync_goals(db: Session, row: UserGroupStaff | None, group_id: int, user_id: int) -> None:
    """Make someone a collaborator on the group goals they cover, and take them off the rest."""
    for assignment in _assignments(db, group_id):
        explicit = {int(item["user_id"]) for item in collaborators_of(assignment)}
        for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).all():
            if user_id in {goal.owner_user_id, goal.subject_user_id}:
                continue
            if row and covers(row, assignment):
                role = _role(db, goal, row.role_key)
                if role:
                    access.add_member(db, goal, user_id, role)
            elif user_id not in explicit:
                member = db.exec(select(PlanCollaborator).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == user_id)).first()
                if member and member.active:
                    member.active, member.update_date = False, _stamp()
                    db.add(member)
    db.flush()


def set_staff(db: Session, current_user: PublicUser, org_id: int, group_id: int, payload: GroupStaffSet) -> dict:
    from src.services.goals.assignments import _can_manage
    from src.services.school import chats as school_chats

    require_org_admin(current_user.id, org_id, db)
    _group(db, org_id, group_id)
    if payload.role_key not in SHARING_ROLE_KEYS:
        raise HTTPException(status_code=422, detail="Choose Viewer, Commenter or Editor")
    if payload.user_id not in _can_manage(db, org_id, [payload.user_id]):
        raise HTTPException(status_code=422, detail="Only the organization's staff can be added as staff")
    known = {item.assignment_uuid for item in _assignments(db, group_id)}
    picked = [uuid for uuid in dict.fromkeys(payload.assignment_uuids) if uuid in known]
    if payload.assignment_uuids and not picked:
        raise HTTPException(status_code=422, detail="Pick goals assigned to this group")
    row = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == group_id, UserGroupStaff.user_id == payload.user_id)).first()
    now = _stamp()
    if not row:
        row = UserGroupStaff(org_id=org_id, usergroup_id=group_id, user_id=payload.user_id, creation_date=now)
    row.role_key, row.assignment_uuids, row.update_date = payload.role_key, picked, now
    db.add(row)
    db.flush()
    _sync_goals(db, row, group_id, payload.user_id)
    school_chats.sync_group(db, org_id, group_id)
    db.commit()
    return list_staff(db, current_user, org_id, group_id)


def remove_staff(db: Session, current_user: PublicUser, org_id: int, group_id: int, user_id: int) -> dict:
    from src.services.school import chats as school_chats

    require_org_admin(current_user.id, org_id, db)
    row = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == group_id, UserGroupStaff.user_id == user_id, UserGroupStaff.org_id == org_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="They aren't staff on this group")
    db.delete(row)
    db.flush()
    _sync_goals(db, None, group_id, user_id)
    school_chats.sync_group(db, org_id, group_id)
    db.commit()
    return list_staff(db, current_user, org_id, group_id)


def apply_to_goal(db: Session, assignment: GoalAssignment, goal: Goal) -> None:
    """A goal just issued from a group's assignment gets the group's staff who cover it."""
    if not assignment.usergroup_id:
        return
    for row in db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == assignment.usergroup_id)).all():
        if covers(row, assignment) and row.user_id not in {goal.owner_user_id, goal.subject_user_id}:
            role = _role(db, goal, row.role_key)
            if role:
                access.add_member(db, goal, row.user_id, role)
