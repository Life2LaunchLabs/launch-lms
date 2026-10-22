"""Who can do what on a goal.

The goal's owner can do everything. Everyone else gets the capabilities of
their role on the goal (the plan role and collaborator tables, keyed by
``goal_id``). A goal issued by an organization, a badge or the starter flow
keeps its definition: its learner can't restructure it unless they assigned it
to themselves or administer the organization.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalAssignment, GoalOwnership, GoalSource
from src.db.goal_sharing import ALL_CAPABILITIES, OrganizationPlanRole, PlanActivity, PlanCollaborator, PlanRole
from src.security.org_auth import is_org_admin

OWNER_ONLY = {"transfer_ownership", "delete_plan"}
# Signing off steps: never the learner's own call on a goal someone else issued.
STAFF_CAPABILITIES = {"complete_restricted_objectives", "contribute_restricted_fields", "review_badge_submissions"}
DEFINITION_CAPABILITIES = {
    "edit_plan_details", "edit_structure", "edit_schedule", "manage_roles",
    "complete_plan", "delete_plan", "transfer_ownership",
}
LEGACY_ALIASES = {
    "contribute_reviewer_fields": "contribute_restricted_fields",
    "review_objectives": "complete_restricted_objectives",
}


def _now() -> str:
    return datetime.now().isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def normalized(capabilities) -> set[str]:
    return {LEGACY_ALIASES.get(item, item) for item in capabilities or []}


def membership(db: Session, goal: Goal, user_id: int) -> tuple[PlanCollaborator, PlanRole] | None:
    row = db.exec(
        select(PlanCollaborator, PlanRole).join(PlanRole, PlanRole.id == PlanCollaborator.role_id)
        .where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == user_id, PlanCollaborator.active == True)  # noqa: E712
    ).first()
    return (row[0], row[1]) if row else None


def _definition_locked(db: Session, goal: Goal, user_id: int) -> bool:
    if _value(goal.ownership) == GoalOwnership.PERSONAL.value:
        return False
    source = _value(goal.source)
    if source in {GoalSource.BADGE.value, GoalSource.STARTER.value}:
        return True
    if goal.org_id and is_org_admin(user_id, goal.org_id, db):
        return False
    assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
    return not (assignment and assignment.created_by_user_id == goal.subject_user_id)


def capabilities(db: Session, goal: Goal, user_id: int) -> set[str]:
    if goal.owner_user_id == user_id:
        granted = set(ALL_CAPABILITIES) | OWNER_ONLY
    else:
        row = membership(db, goal, user_id)
        if not row:
            return set()
        granted = set(ALL_CAPABILITIES) if row[1].key == "plan_admin" else normalized(row[1].capabilities)
    if _definition_locked(db, goal, user_id):
        granted -= DEFINITION_CAPABILITIES
    if user_id == goal.subject_user_id and _value(goal.ownership) == GoalOwnership.EXTERNAL.value and not (goal.org_id and is_org_admin(user_id, goal.org_id, db)):
        granted -= STAFF_CAPABILITIES
    return granted


def require(db: Session, goal: Goal, user_id: int, capability: str) -> set[str]:
    granted = capabilities(db, goal, user_id)
    if capability not in granted:
        # Don't reveal private goals to people who can't see them.
        raise HTTPException(status_code=404 if not granted else 403, detail="Goal not found" if not granted else f"Missing goal permission: {capability}")
    return granted


def goal_or_404(db: Session, goal_uuid: str) -> Goal:
    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


def seed_roles(db: Session, goal: Goal, roles: dict | None) -> dict[str, PlanRole]:
    """The goal's roles: the template's, plus the organization's own role definitions."""
    from src.services.goals.document import default_roles

    roles = roles or default_roles()
    definitions = [dict(item) for item in roles["definitions"]]
    if goal.org_id:
        known = {item["key"] for item in definitions}
        definitions.extend(
            {"key": item.key, "name": item.name, "capabilities": item.capabilities}
            for item in db.exec(select(OrganizationPlanRole).where(OrganizationPlanRole.org_id == goal.org_id)).all()
            if item.key not in known
        )
    keys = [item["key"] for item in definitions]
    now = _now()
    seeded: dict[str, PlanRole] = {}
    for item in definitions:
        admin = item["key"] == "plan_admin"
        role = PlanRole(
            role_uuid=f"plan_role_{uuid4()}", goal_id=goal.id, key=item["key"],
            name="Learner" if item["key"] == "subject" else (item.get("name") or item["key"]),
            capabilities=sorted(ALL_CAPABILITIES) if admin else sorted(normalized(item.get("capabilities"))),
            grantable_role_keys=list(keys if admin else item.get("grantable_role_keys") or []),
            creation_date=now, update_date=now,
        )
        db.add(role)
        seeded[item["key"]] = role
    db.flush()
    return seeded


def add_member(db: Session, goal: Goal, user_id: int, role: PlanRole) -> PlanCollaborator:
    existing = db.exec(select(PlanCollaborator).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == user_id)).first()
    now = _now()
    if existing:
        existing.role_id, existing.active, existing.update_date = int(role.id), True, now  # type: ignore[arg-type]
        db.add(existing)
        return existing
    member = PlanCollaborator(
        collaborator_uuid=f"plan_collaborator_{uuid4()}", goal_id=goal.id, user_id=user_id, role_id=int(role.id),  # type: ignore[arg-type]
        active=True, creation_date=now, update_date=now,
    )
    db.add(member)
    return member


def log(db: Session, goal: Goal, actor_user_id: int | None, action: str, payload: dict | None = None) -> None:
    """Record what happened on a goal, and keep its chat in step (progress cards, who's in it)."""
    from src.services.connect import progress

    db.add(PlanActivity(
        activity_uuid=f"plan_activity_{uuid4()}", goal_id=goal.id, actor_user_id=actor_user_id,
        action=action, payload=payload or {}, creation_date=_now(),
    ))
    progress.on_goal_event(db, goal, actor_user_id, action, payload or {})
