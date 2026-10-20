"""A learner's status with an organization, which the organization sets: active or alumni.

Only active learners count toward the tier's learner limit, so marking learners who have moved on
(a class that graduated, a cohort that ended) as alumni frees their places. Alumni keep their
account, their plans and their records, and can be made active again while there is room.
Staff are always active: they count toward staff seats instead.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalAssignment, GoalOwnership
from src.db.roles import Role
from src.db.school import UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser
from src.security.access.access import is_staff_role, require_capacity
from src.security.org_auth import require_org_admin

Status = Literal["active", "alumni"]
ACTIVE: Status = "active"
ALUMNI: Status = "alumni"


class StatusUpdate(BaseModel):
    status: Status


def _now() -> str:
    return datetime.now().isoformat()


def _learner_memberships(db: Session, org_id: int, user_ids: list[int]) -> list[UserOrganization]:
    if not user_ids:
        return []
    rows = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_(user_ids))).all()
    roles = {int(role.id): role for role in db.exec(select(Role).where(col(Role.id).in_({row.role_id for row in rows}))).all()} if rows else {}  # type: ignore[arg-type]
    return [row for row in rows if not is_staff_role(roles.get(row.role_id))]


def _apply(db: Session, org_id: int, memberships: list[UserOrganization], status: Status) -> list[UserOrganization]:
    """Set ``status`` on the memberships that differ, checking room for the ones made active (flushed)."""
    changing = [row for row in memberships if (row.status or ACTIVE) != status]
    if status == ACTIVE and changing:
        require_capacity("learners", org_id, db, adding=len(changing))
    now = _now()
    for row in changing:
        row.status, row.status_since, row.update_date = status, now, now
        db.add(row)
    db.flush()
    return changing


def member_status_dict(row: UserOrganization) -> dict:
    return {"user_id": row.user_id, "status": row.status or ACTIVE, "status_since": row.status_since}


def set_member_status(db: Session, current_user: PublicUser, org_id: int, user_id: int, status: Status) -> dict:
    require_org_admin(current_user.id, org_id, db)
    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    if not _learner_memberships(db, org_id, [user_id]):
        raise HTTPException(status_code=422, detail="Only learners can be alumni; staff count toward staff seats")
    _apply(db, org_id, [membership], status)
    db.commit()
    return member_status_dict(membership)


def set_group_status(db: Session, current_user: PublicUser, org_id: int, group_id: int, status: Status) -> dict:
    """Mark every learner in a group active or alumni, e.g. a class at the end of its year."""
    require_org_admin(current_user.id, org_id, db)
    if not db.exec(select(UserGroup.id).where(UserGroup.id == group_id, UserGroup.org_id == org_id)).first():
        raise HTTPException(status_code=404, detail="Group not found")
    user_ids = [int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group_id)).all()]
    changed = _apply(db, org_id, _learner_memberships(db, org_id, user_ids), status)
    db.commit()
    return {"status": status, "changed": len(changed), "user_ids": [row.user_id for row in changed]}


def alumni_ids(db: Session, org_id: int, user_ids: list[int]) -> list[int]:
    if not user_ids:
        return []
    return [int(user_id) for user_id in db.exec(select(UserOrganization.user_id).where(
        UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_(user_ids), UserOrganization.status == ALUMNI,
    )).all()]


def reactivate(db: Session, org_id: int, user_ids: list[int]) -> None:
    """Make these alumni active again, if there is room (flushed, not committed)."""
    rows = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_(user_ids))).all() if user_ids else []
    _apply(db, org_id, list(rows), ACTIVE)


def relationship(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The viewer's relationship with an organization: their status, the plans it gave them, and its staff they work with."""
    from src.services.connect import people

    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == current_user.id)).first()
    if not membership:
        raise HTTPException(status_code=404, detail="You aren't a member of this organization")
    role = db.get(Role, membership.role_id)
    goals = db.exec(select(Goal, GoalAssignment).outerjoin(GoalAssignment, GoalAssignment.id == Goal.assignment_id).where(
        Goal.org_id == org_id, Goal.subject_user_id == current_user.id, Goal.ownership == GoalOwnership.EXTERNAL.value,
    ).order_by(col(Goal.id).desc())).all()
    staff: dict[int, None] = {}
    for goal, assignment in goals:
        for user_id in [goal.owner_user_id, *((assignment.staff_user_ids or []) if assignment else [])]:
            if user_id and user_id != current_user.id:
                staff[int(user_id)] = None
    groups = list(db.exec(select(UserGroupUser.usergroup_id).join(UserGroup, UserGroup.id == UserGroupUser.usergroup_id).where(
        UserGroupUser.user_id == current_user.id, UserGroup.org_id == org_id,
    )).all())
    if groups:
        for user_id in db.exec(select(UserGroupStaff.user_id).where(col(UserGroupStaff.usergroup_id).in_(groups))).all():
            if user_id != current_user.id:
                staff[int(user_id)] = None
    return {
        "status": membership.status or ACTIVE,
        "status_since": membership.status_since,
        "member_since": membership.creation_date,
        "role": "staff" if is_staff_role(role) else "learner",
        "plans": [{"goal_uuid": goal.goal_uuid, "title": goal.title, "status": getattr(goal.status, "value", goal.status)} for goal, _ in goals],
        "staff": [people.person(db, user_id) for user_id in staff],
    }
