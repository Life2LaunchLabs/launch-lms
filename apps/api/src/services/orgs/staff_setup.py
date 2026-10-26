"""What a staff invitation sets up: the permissions the admin chose and the assignments they're added to.

The admin picks both when inviting (``services/orgs/users.invite_batch_users``); they're checked again and applied
when the invitation is accepted, on every path that accepts one (a new account, joining while signed in, open
signup). An assignment that ended or went away in between is skipped.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import AssignmentStatus, GoalAssignment, GoalTemplate
from src.db.organization_invitations import InviteAssignment, OrganizationInvitation
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.org_auth import STAFF_PERMISSIONS
from src.security.rbac.constants import ADMIN_ROLE_ID

STAFF_ROLE_ID = 2
ROLE_LABELS = {"lead": "Lead", "review": "Review", "comment": "Comment"}


def _value(item) -> str:
    return getattr(item, "value", item)


def clean(db: Session, org_id: int, role_id: int, permissions: list[str] | None, assignments: list[InviteAssignment]) -> tuple[list[str] | None, list[dict]]:
    """The invitation's permissions (in their usual order) and assignments, or a 4xx saying what's wrong."""
    if role_id != STAFF_ROLE_ID:
        if permissions is not None or assignments:
            detail = "Admins can do everything, so they don't take permissions or assignments" if role_id == ADMIN_ROLE_ID else "Only staff invitations take permissions or assignments"
            raise HTTPException(status_code=400, detail=detail)
        return None, []
    if permissions is not None:
        unknown = sorted(set(permissions) - set(STAFF_PERMISSIONS))
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown permissions: {', '.join(unknown)}")
        permissions = [key for key in STAFF_PERMISSIONS if key in permissions]
    picked: dict[str, str] = {}
    for item in assignments:
        if item.role_key not in ROLE_LABELS:
            raise HTTPException(status_code=422, detail="Assignment roles are Lead, Review or Comment")
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == item.assignment_uuid, GoalAssignment.org_id == org_id)).first()
        if not assignment or _value(assignment.status) == AssignmentStatus.ENDED.value:
            raise HTTPException(status_code=400, detail="That assignment isn't running in this organization")
        picked.setdefault(item.assignment_uuid, item.role_key)
    return permissions, [{"assignment_uuid": uuid, "role_key": role} for uuid, role in picked.items()]


def apply(db: Session, invitation: OrganizationInvitation, user_id: int) -> None:
    """Give the new member the invitation's permissions and put them on its assignments. Commits."""
    from src.services.goals.assignments import add_staff

    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == invitation.org_id, UserOrganization.user_id == user_id)).first()
    if not membership or membership.role_id != STAFF_ROLE_ID:
        return
    if invitation.permissions is not None:
        membership.permissions = [key for key in STAFF_PERMISSIONS if key in invitation.permissions]
        db.add(membership)
    for item in invitation.assignments or []:
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == item.get("assignment_uuid"), GoalAssignment.org_id == invitation.org_id)).first()
        if assignment and item.get("role_key") in ROLE_LABELS:
            add_staff(db, assignment, user_id, item["role_key"])
    db.commit()


def describe(db: Session, invitation: OrganizationInvitation) -> dict:
    """The invitation's setup as people read it: permission labels, each assignment (group or person, plan, role) and the note."""
    from src.security.org_auth import DEFAULT_STAFF_PERMISSIONS

    keys = (invitation.permissions if invitation.permissions is not None else list(DEFAULT_STAFF_PERMISSIONS)) if invitation.role_id == STAFF_ROLE_ID else []
    rows = []
    for item in invitation.assignments or []:
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == item.get("assignment_uuid"), GoalAssignment.org_id == invitation.org_id)).first()
        if not assignment or _value(assignment.status) == AssignmentStatus.ENDED.value:
            continue
        template = db.get(GoalTemplate, assignment.template_id)
        group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
        person = db.get(User, assignment.user_id) if assignment.user_id else None
        who = group.name if group else " ".join(part for part in (person.first_name, person.last_name) if part) if person else assignment.subject_email or ""
        rows.append({"assignment_uuid": assignment.assignment_uuid, "plan": template.title if template else "", "assigned_to": who,
                     "role": item.get("role_key"), "role_label": ROLE_LABELS.get(item.get("role_key"), "")})
    return {"permissions": [{"key": key, "label": STAFF_PERMISSIONS[key]} for key in keys if key in STAFF_PERMISSIONS],
            "assignments": rows, "note": invitation.note or ""}
