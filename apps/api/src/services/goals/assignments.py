"""Handing a template out: to one person or a group, with dates and staff.

Each learner gets their own goal, issued from the template's published version
and pending until they accept it. Group members who join later get theirs when
the assignment is synced.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalAssignment, GoalAssignmentCreate, GoalSource, GoalStatus, GoalTemplate
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.issue import issue_goal


def _now() -> str:
    return datetime.now().isoformat()


def _learners(db: Session, assignment: GoalAssignment) -> list[int]:
    if assignment.user_id:
        return [int(assignment.user_id)]
    if assignment.usergroup_id:
        return [int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == assignment.usergroup_id)).all()]
    return []


def sync_assignment(db: Session, assignment: GoalAssignment, actor_user_id: int | None = None) -> list[Goal]:
    """Issue a goal to every learner of an active assignment who doesn't have one yet (flushed, not committed)."""
    if not assignment.active:
        return []
    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(templates.GoalTemplateVersion, assignment.version_id)
    if not template or not version:
        return []
    have = set(db.exec(select(Goal.subject_user_id).where(Goal.assignment_id == assignment.id)).all())
    issued = []
    for user_id in _learners(db, assignment):
        if user_id in have:
            continue
        issued.append(issue_goal(
            db, template, version, subject_user_id=user_id, owner_user_id=assignment.owner_user_id or assignment.created_by_user_id,
            org_id=assignment.org_id, source=GoalSource.ASSIGNMENT, assignment_id=assignment.id,
            staff_user_ids=list(assignment.staff_user_ids or []), start_date=assignment.start_date, due_date=assignment.due_date,
            stage_dates=assignment.stage_dates, status=GoalStatus.PENDING, actor_user_id=actor_user_id,
        ))
    return issued


def assign(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: GoalAssignmentCreate) -> dict:
    require_org_admin(current_user.id, org_id, db)
    if bool(payload.user_id) == bool(payload.usergroup_id):
        raise HTTPException(status_code=422, detail="Hand it to one person or one group")
    template = templates.template_or_404(db, org_id, template_uuid)
    version = templates.issuable_version(db, template)
    if payload.usergroup_id and not db.exec(select(UserGroup.id).where(UserGroup.id == payload.usergroup_id, UserGroup.org_id == org_id)).first():
        raise HTTPException(status_code=404, detail="Group not found")
    people = [payload.user_id] if payload.user_id else []
    people += payload.staff_user_ids
    members = set(db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, UserOrganization.user_id.in_(people))).all()) if people else set()  # type: ignore[attr-defined]
    if any(user_id not in members for user_id in people):
        raise HTTPException(status_code=422, detail="Everyone named must be a member of the organization")
    now = _now()
    assignment = GoalAssignment(
        assignment_uuid=f"goal_assignment_{uuid4()}", org_id=org_id, template_id=int(template.id), version_id=int(version.id),  # type: ignore[arg-type]
        usergroup_id=payload.usergroup_id, user_id=payload.user_id, welcome_message=payload.welcome_message,
        staff_user_ids=list(dict.fromkeys(payload.staff_user_ids)), start_date=payload.start_date, due_date=payload.due_date,
        stage_dates=payload.stage_dates, owner_user_id=current_user.id, created_by_user_id=current_user.id,
        creation_date=now, update_date=now,
    )
    db.add(assignment)
    db.flush()
    goals = sync_assignment(db, assignment, current_user.id)
    db.commit()
    return {**assignment_dict(db, assignment), "goal_uuids": [goal.goal_uuid for goal in goals]}


def assignment_dict(db: Session, assignment: GoalAssignment) -> dict:
    goals = db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).all()
    return {
        "assignment_uuid": assignment.assignment_uuid, "user_id": assignment.user_id, "usergroup_id": assignment.usergroup_id,
        "staff_user_ids": assignment.staff_user_ids, "start_date": assignment.start_date, "due_date": assignment.due_date,
        "active": assignment.active, "goals": len(goals),
        "by_status": {status: sum(1 for goal in goals if getattr(goal.status, "value", goal.status) == status) for status in {getattr(goal.status, "value", goal.status) for goal in goals}},
    }


def list_assignments(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.template_id == template.id).order_by(GoalAssignment.id.desc())).all()  # type: ignore[union-attr]
    return [assignment_dict(db, row) for row in rows]
