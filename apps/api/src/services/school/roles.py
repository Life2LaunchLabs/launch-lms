"""What someone is to an organization, as People labels them: admin, staff, learner or helper.

Staff are members whose role lets them manage goals (admins, maintainers, and custom roles with
dashboard access that can update activities). Learners are the other members. Helpers aren't
members: a learner invited them onto a plan the organization gave them, such as a parent, and
they see only that plan.
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalOwnership
from src.db.planning import PlanCollaborator
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS, ADMIN_ROLE_ID
from src.security.superadmin import is_user_superadmin

OrgRole = Literal["admin", "staff", "learner", "helper"]
STAFF_ROLES: tuple[OrgRole, ...] = ("admin", "staff")


def staff_role_ids(db: Session, org_id: int) -> set[int]:
    """Role ids whose holders are staff in this organization."""
    roles = db.exec(select(Role).where((Role.org_id == None) | (Role.org_id == org_id))).all()  # noqa: E711
    custom = {int(role.id) for role in roles if role.id and isinstance(role.rights, dict)  # type: ignore[arg-type]
              and role.rights.get("dashboard", {}).get("action_access") and role.rights.get("learning_activities", {}).get("action_update")}
    return {*ADMIN_OR_MAINTAINER_ROLE_IDS, *custom}


def staff_ids(db: Session, org_id: int) -> set[int]:
    roles = staff_role_ids(db, org_id)
    return {int(user_id) for user_id in db.exec(select(UserOrganization.user_id).where(
        UserOrganization.org_id == org_id, col(UserOrganization.role_id).in_(roles),
    )).all()}


def member_ids(db: Session, org_id: int) -> set[int]:
    return {int(user_id) for user_id in db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id)).all()}


def helper_ids(db: Session, org_id: int, goal_ids: list[int] | None = None) -> set[int]:
    """People on the organization's plans with its learners who aren't its staff: the helpers learners brought in."""
    query = select(PlanCollaborator.user_id, Goal.subject_user_id, Goal.owner_user_id).join(Goal, Goal.id == PlanCollaborator.goal_id).where(
        Goal.org_id == org_id, Goal.ownership == GoalOwnership.EXTERNAL.value, PlanCollaborator.active == True,  # noqa: E712
    )
    if goal_ids is not None:
        query = query.where(col(Goal.id).in_(goal_ids))
    staff = staff_ids(db, org_id)
    return {int(user_id) for user_id, subject, owner in db.exec(query).all() if user_id not in {subject, owner} and int(user_id) not in staff}


def is_staff(db: Session, org_id: int, user_id: int) -> bool:
    membership = db.exec(select(UserOrganization.role_id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    return membership is not None and int(membership) in staff_role_ids(db, org_id)


def org_role(db: Session, org_id: int, user_id: int) -> OrgRole | None:
    """What this person is to the organization, or None when they have nothing to do with it."""
    role_id = db.exec(select(UserOrganization.role_id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    if role_id is not None:
        if int(role_id) == ADMIN_ROLE_ID:
            return "admin"
        return "staff" if int(role_id) in staff_role_ids(db, org_id) else "learner"
    return "helper" if user_id in helper_ids(db, org_id) else None


def require_staff(db: Session, user_id: int, org_id: int) -> None:
    """People is for the organization's staff."""
    if is_user_superadmin(user_id, db) or is_staff(db, org_id, user_id):
        return
    raise HTTPException(status_code=403, detail="Only the organization's staff can see People")
