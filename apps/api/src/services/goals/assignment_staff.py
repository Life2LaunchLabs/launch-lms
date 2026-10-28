"""Who runs an assignment: its staff, each Lead, Review or Comment, and what that lets them do.

Lead runs the assignment (edit, reschedule, pause, end) and reviews; Review reviews learners'
work; Comment follows along and comments. On each learner's goal, Lead and Review get the
template's staff role and Comment gets Commenter. Admins and staff who run assignments manage
every assignment; changing an assignment's version stays with them.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goal_templates import GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalTemplateVersion
from src.db.goal_sharing import PlanCollaborator, PlanRole
from src.db.school import UserGroupStaff
from src.db.users import PublicUser
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.services.goals import access, sharing_roles
from src.services.goals.assignment_summary import collaborators_of
from src.services.school import roles as school_roles
from src.services.school import staff as group_staff


def _now() -> str:
    return datetime.now().isoformat()


# Staff on an assignment have one of three roles. Lead runs it (edits, schedule, pause, end) and
# reviews; Review reviews learners' work; Comment follows along and comments. The creator stays the
# goals' owner but is only on the staff if picked.
ASSIGNMENT_ROLES = ("lead", "review", "comment")
LEGACY_ROLES = {"plan_admin": "lead", "reviewer": "review", "editor": "review"}


def assignment_role(role_key: str | None) -> str | None:
    """A staff role as the assignment knows it; template role keys from older assignments map onto the three."""
    if role_key is None or role_key in ASSIGNMENT_ROLES:
        return role_key
    return LEGACY_ROLES.get(role_key, "comment")


def _collaborators(db: Session, org_id: int, payload: GoalAssignmentRequest, default_lead: int | None = None) -> list[dict]:
    """The assignment's staff with their roles: the organization's staff only, at least one of them Lead.

    Someone picked without a role reviews, except that the first of them leads when nobody else does.
    Otherwise ``default_lead`` (the person assigning) leads, unless they were given another role.
    """
    picked = [(item.user_id, assignment_role(item.role_key)) for item in payload.collaborators] or [(user_id, None) for user_id in payload.staff_user_ids]
    if not picked and default_lead is not None:
        picked = [(default_lead, "lead")]
    chosen: dict[int, str | None] = {}
    for user_id, role in picked:
        chosen.setdefault(int(user_id), role)
    if any(role not in (None, *ASSIGNMENT_ROLES) for role in chosen.values()):
        raise HTTPException(status_code=422, detail="Staff roles are Lead, Review or Comment")
    if "lead" not in chosen.values():
        first = next((user_id for user_id, role in chosen.items() if role is None), None)
        if first is not None:
            chosen[first] = "lead"
        elif default_lead is not None and default_lead not in chosen:
            chosen = {default_lead: "lead", **chosen}
        else:
            raise HTTPException(status_code=422, detail="An assignment needs at least one Lead")
    if set(chosen) - school_roles.staff_ids(db, org_id):
        raise HTTPException(status_code=422, detail="Every staff member must be an admin or staff member of this organization")
    return [{"user_id": user_id, "role_key": role or "review"} for user_id, role in chosen.items()]


def leads(assignment: GoalAssignment) -> set[int]:
    return {int(item["user_id"]) for item in collaborators_of(assignment) if assignment_role(item.get("role_key")) == "lead"}


def _plan_role(db: Session, goal: Goal, staff_key: str, role_key: str | None) -> PlanRole | None:
    """The goal role an assignment role gives: Lead and Review get the template's staff role, Comment comments."""
    if assignment_role(role_key) == "comment":
        return sharing_roles._role(db, goal, "commenter")
    return db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == staff_key)).first() or sharing_roles._role(db, goal, "editor")


def _apply_staff(db: Session, assignment: GoalAssignment, goal: Goal) -> None:
    """The assignment's staff, and the group's, on one issued goal in their roles."""
    version = db.get(GoalTemplateVersion, goal.version_id) if goal.version_id else None
    staff_key = (((version.document if version else None) or {}).get("roles") or {}).get("staff_role_key") or "reviewer"
    for item in collaborators_of(assignment):
        role = _plan_role(db, goal, staff_key, item.get("role_key"))
        if role and item["user_id"] not in {goal.owner_user_id, goal.subject_user_id}:
            access.add_member(db, goal, int(item["user_id"]), role)
    group_staff.apply_to_goal(db, assignment, goal)
    db.flush()


def _drop_staff(db: Session, assignment: GoalAssignment, goal: Goal, user_ids: set[int]) -> None:
    """Take people removed from an assignment's staff off a goal, unless they're on it another way."""
    covered = {row.user_id for row in db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == assignment.usergroup_id)).all()
               if group_staff.covers(row, assignment)} if assignment.usergroup_id else set()
    for user_id in user_ids - covered - {goal.owner_user_id, goal.subject_user_id}:
        member = db.exec(select(PlanCollaborator).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == user_id)).first()
        if member and member.active:
            member.active, member.update_date = False, _now()
            db.add(member)


def _assignment(db: Session, org_id: int, assignment_uuid: str) -> GoalAssignment:
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid, GoalAssignment.org_id == org_id)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def can_manage(db: Session, user_id: int, assignment: GoalAssignment) -> bool:
    """Admins and staff who run assignments manage every one; a Lead manages theirs while they're still staff."""
    if is_org_admin(user_id, assignment.org_id, db, "run_assignments"):
        return True
    return user_id in leads(assignment) and school_roles.is_staff(db, assignment.org_id, user_id)


def require_assignment_manager(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> GoalAssignment:
    """An assignment the user may edit, reschedule, pause or end."""
    require_org_membership(current_user.id, org_id, db)
    assignment = _assignment(db, org_id, assignment_uuid)
    if not can_manage(db, current_user.id, assignment):
        raise HTTPException(status_code=403, detail="Only the assignment's Lead or staff who run assignments can change it")
    return assignment


def require_assignment_runner(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> GoalAssignment:
    """An assignment whose version the user may change: admins and staff who run assignments, not Leads alone."""
    require_org_admin(current_user.id, org_id, db, "run_assignments")
    return _assignment(db, org_id, assignment_uuid)
