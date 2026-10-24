"""Goal people and roles: who is on a goal, goal roles and organization roles.

Keyed by ``goal_id`` on the shared collaboration tables (``db/goal_sharing``).
Invitations and members live in ``sharing``.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalAssignment, GoalSource
from src.db.organizations import Organization
from src.db.goal_sharing import (
    ALL_CAPABILITIES,
    DEFAULT_ROLE_DEFINITIONS,
    OrganizationPlanRole,
    OrganizationPlanRoleCreate,
    OrganizationPlanRoleUpdate,
    PlanCollaborator,
    PlanInvitation,
    PlanRole,
    PlanRoleUpdate,
    SHARING_ROLE_KEYS,
)
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_admin
from src.services.goals import access


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp() -> str:
    return _now().isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def _aware(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def user_summary(db: Session, user_id: int | None) -> dict | None:
    user = db.get(User, user_id) if user_id else None
    if not user:
        return None
    return {
        "id": user.id, "user_uuid": user.user_uuid, "username": user.username, "email": user.email, "avatar_image": user.avatar_image,
        "name": " ".join(filter(None, [user.first_name, user.last_name])) or user.username,
    }


def org_summary(db: Session, org_id: int | None) -> dict | None:
    org = db.get(Organization, org_id) if org_id else None
    return {"id": org.id, "org_uuid": org.org_uuid, "name": org.name, "slug": org.slug, "logo_image": org.logo_image} if org else None


def effective(db: Session, goal: Goal, user_id: int, capabilities: set[str]) -> set[str]:
    """A role's capabilities as they apply on this goal: an issued definition stays locked."""
    return capabilities - access.DEFINITION_CAPABILITIES if access._definition_locked(db, goal, user_id) else capabilities


def require_individual(db: Session, goal: Goal) -> None:
    """A plan a learner joined keeps the organization's steps; a group's goals are managed once for the whole group."""
    if _value(goal.source) == GoalSource.JOINED.value:
        raise HTTPException(status_code=409, detail="This plan's steps come from the organization that runs it, so they can't be edited here.")
    assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
    if assignment and assignment.usergroup_id:
        raise HTTPException(status_code=409, detail={
            "message": "Group goals are shared. Change them for the whole group from the group's admin page.",
            "assignment_uuid": assignment.assignment_uuid,
            "group_workspace": f"/admin/plans/assignments/{assignment.assignment_uuid}",
        })


def _role(db: Session, goal: Goal, key: str) -> PlanRole | None:
    role = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == key)).first()
    if not role and goal.org_id:
        org_role = db.exec(select(OrganizationPlanRole).where(OrganizationPlanRole.org_id == goal.org_id, OrganizationPlanRole.key == key)).first()
        role = _materialize(db, goal, org_role) if org_role else None
    if not role and key in SHARING_ROLE_KEYS:
        # Goals from before these roles (or from a template's own roles) get them on first use.
        default = next(item for item in DEFAULT_ROLE_DEFINITIONS if item["key"] == key)
        role = _materialize(db, goal, OrganizationPlanRole(role_uuid="", org_id=0, key=key, name=default["name"], capabilities=list(default["capabilities"])))
    return role


ROLE_HINTS = {
    "viewer": "Sees the goal and how it's going.",
    "commenter": "Can also comment and @mention people.",
    "editor": "Can also help with steps and change the goal.",
}


def sharing_choices() -> list[dict]:
    """The roles people pick from when sharing a goal."""
    names = {item["key"]: item["name"] for item in DEFAULT_ROLE_DEFINITIONS}
    return [{"key": key, "name": names[key], "hint": ROLE_HINTS[key]} for key in SHARING_ROLE_KEYS]


def _require_grantable(db: Session, goal: Goal, user_id: int, role: PlanRole) -> None:
    actor = access.membership(db, goal, user_id)
    if goal.owner_user_id != user_id and actor and actor[1].key != "plan_admin" and role.key not in (actor[1].grantable_role_keys or []):
        raise HTTPException(status_code=403, detail="Your role cannot grant that goal role")


# People ------------------------------------------------------------------------------

def _invitation_label(db: Session, invitation: PlanInvitation) -> str:
    """A sent invitation by handle when it went to someone here, so their email stays theirs."""
    target = db.get(User, invitation.target_user_id) if invitation.target_user_id else None
    return f"@{target.username}" if target else invitation.email


def people(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    roles = list(db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id).order_by(PlanRole.id)).all())  # type: ignore[arg-type]
    role_by_id = {role.id: role for role in roles}
    admin_role = next((role for role in roles if role.key == "plan_admin"), None)
    rows = db.exec(select(PlanCollaborator).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True).order_by(PlanCollaborator.id)).all()  # type: ignore[arg-type]  # noqa: E712

    def role_ref(role: PlanRole | None) -> dict:
        return {"role_uuid": role.role_uuid, "key": role.key, "name": role.name} if role else {"role_uuid": None, "key": "owner", "name": "Owner"}

    collaborators = []
    if all(row.user_id != goal.owner_user_id for row in rows):
        # The owner can do everything without a membership row.
        collaborators.append({
            "collaborator_uuid": None, "user": user_summary(db, goal.owner_user_id), "role": role_ref(admin_role),
            "is_owner": True, "is_subject": goal.owner_user_id == goal.subject_user_id,
        })
    collaborators += [{
        "collaborator_uuid": row.collaborator_uuid, "user": user_summary(db, row.user_id), "role": role_ref(role_by_id.get(row.role_id)),
        "is_owner": row.user_id == goal.owner_user_id, "is_subject": row.user_id == goal.subject_user_id,
    } for row in rows]
    org_roles = {item.key: item for item in db.exec(select(OrganizationPlanRole).where(OrganizationPlanRole.org_id == goal.org_id)).all()} if goal.org_id else {}
    invitations = []
    if "manage_collaborators" in granted:
        invitations = [{
            "invitation_uuid": item.invitation_uuid, "email": _invitation_label(db, item), "kind": _value(item.kind), "status": _value(item.status),
            "role": ({"key": role_by_id[item.role_id].key, "name": role_by_id[item.role_id].name} if item.role_id in role_by_id else None),
            "creation_date": item.creation_date,
        } for item in db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id).order_by(PlanInvitation.id.desc())).all()]  # type: ignore[union-attr]
    return {
        "goal_uuid": goal.goal_uuid, "is_owner": goal.owner_user_id == current_user.id,
        "capabilities": sorted(granted), "collaborators": collaborators, "invitations": invitations,
        "roles": [{
            "role_uuid": role.role_uuid, "key": role.key, "name": "Learner" if role.key == "subject" else role.name,
            "capabilities": sorted(effective(db, goal, current_user.id, set(ALL_CAPABILITIES) if role.key == "plan_admin" else access.normalized(role.capabilities))),
            "grantable_role_keys": role.grantable_role_keys or [], "locked": role.key == "plan_admin",
            "organization_role_uuid": org_roles[role.key].role_uuid if role.key in org_roles else None,
        } for role in roles],
        "available_capabilities": sorted(effective(db, goal, current_user.id, set(ALL_CAPABILITIES))),
        "can_manage_organization_roles": bool(goal.org_id and "manage_roles" in granted and is_org_admin(current_user.id, int(goal.org_id), db)),
        "choices": sharing_choices(),
    }


# Roles -------------------------------------------------------------------------------

def _validate_authority(db: Session, goal: Goal, user_id: int, capabilities: list[str], grantable: list[str]) -> None:
    if goal.owner_user_id == user_id:
        return
    actor = access.membership(db, goal, user_id)
    if actor and actor[1].key == "plan_admin":
        return
    own = access.normalized(actor[1].capabilities) if actor else set()
    grants = set(actor[1].grantable_role_keys or []) if actor else set()
    if set(capabilities) - own or set(grantable) - grants:
        raise HTTPException(status_code=403, detail="A role cannot grant permissions beyond your own")


def _check_capabilities(capabilities) -> None:
    invalid = set(capabilities or []) - ALL_CAPABILITIES
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unknown capabilities: {', '.join(sorted(invalid))}")


def _clean_name(changes: dict) -> None:
    if "name" in changes:
        changes["name"] = str(changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Role name is required")


def update_role(db: Session, current_user: PublicUser, goal_uuid: str, role_uuid: str, payload: PlanRoleUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    require_individual(db, goal)
    access.require(db, goal, current_user.id, "manage_roles")
    role = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.role_uuid == role_uuid)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Goal role not found")
    if role.key == "plan_admin":
        raise HTTPException(status_code=422, detail="The goal admin role is locked with all permissions")
    changes = payload.model_dump(exclude_unset=True)
    capabilities = changes.get("capabilities", role.capabilities or [])
    grantable = changes.get("grantable_role_keys", role.grantable_role_keys or [])
    _check_capabilities(capabilities)
    if set(grantable) - set(db.exec(select(PlanRole.key).where(PlanRole.goal_id == goal.id)).all()):
        raise HTTPException(status_code=422, detail="A grantable role does not exist")
    _validate_authority(db, goal, current_user.id, capabilities, grantable)
    _clean_name(changes)
    for key, value in changes.items():
        setattr(role, key, value)
    role.update_date = _stamp()
    db.add(role)
    access.log(db, goal, current_user.id, "role.updated", {"role_uuid": role_uuid, "fields": sorted(changes)})
    db.commit()
    return {"role_uuid": role.role_uuid, "key": role.key, "name": role.name, "capabilities": role.capabilities, "grantable_role_keys": role.grantable_role_keys}


def _org_role_dict(role: OrganizationPlanRole) -> dict:
    return {"role_uuid": role.role_uuid, "key": role.key, "name": role.name, "capabilities": role.capabilities or []}


def _materialize(db: Session, goal: Goal, role: OrganizationPlanRole) -> PlanRole:
    """The goal's copy of an organization role, created on first use."""
    local = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == role.key)).first()
    if local:
        return local
    now = _stamp()
    local = PlanRole(
        role_uuid=f"plan_role_{uuid4()}", goal_id=goal.id, key=role.key, name=role.name,
        capabilities=list(role.capabilities or []), grantable_role_keys=[], creation_date=now, update_date=now,
    )
    db.add(local)
    admin = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == "plan_admin")).first()
    if admin and role.key not in (admin.grantable_role_keys or []):
        admin.grantable_role_keys = [*(admin.grantable_role_keys or []), role.key]
        admin.update_date = now
        db.add(admin)
    db.flush()
    return local


def _org_goal(db: Session, current_user: PublicUser, goal_uuid: str, missing: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "manage_roles")
    if not goal.org_id:
        raise HTTPException(status_code=422 if missing == "create" else 404, detail="Organization roles require a goal that belongs to an organization" if missing == "create" else "Organization role not found")
    require_org_admin(current_user.id, int(goal.org_id), db)
    return goal


def _org_role(db: Session, goal: Goal, role_uuid: str) -> OrganizationPlanRole:
    role = db.exec(select(OrganizationPlanRole).where(OrganizationPlanRole.org_id == goal.org_id, OrganizationPlanRole.role_uuid == role_uuid)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Organization role not found")
    return role


def _org_goal_ids(db: Session, org_id: int) -> list[int]:
    return [int(goal_id) for goal_id in db.exec(select(Goal.id).where(Goal.org_id == org_id)).all()]


def create_organization_role(db: Session, current_user: PublicUser, goal_uuid: str, payload: OrganizationPlanRoleCreate) -> dict:
    goal = _org_goal(db, current_user, goal_uuid, "create")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Role name is required")
    _check_capabilities(payload.capabilities)
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:72] or "custom_role"
    taken = set(db.exec(select(OrganizationPlanRole.key).where(OrganizationPlanRole.org_id == goal.org_id)).all()) | {item["key"] for item in DEFAULT_ROLE_DEFINITIONS}
    key, suffix = base, 2
    while key in taken:
        key, suffix = f"{base}_{suffix}", suffix + 1
    now = _stamp()
    role = OrganizationPlanRole(
        role_uuid=f"org_plan_role_{uuid4()}", org_id=int(goal.org_id), key=key, name=name,  # type: ignore[arg-type]
        capabilities=sorted(set(payload.capabilities)), creation_date=now, update_date=now,
    )
    db.add(role)
    db.flush()
    for managed in db.exec(select(Goal).where(Goal.org_id == goal.org_id)).all():
        _materialize(db, managed, role)
    access.log(db, goal, current_user.id, "organization_role.created", {"key": key})
    db.commit()
    return _org_role_dict(role)


def update_organization_role(db: Session, current_user: PublicUser, goal_uuid: str, role_uuid: str, payload: OrganizationPlanRoleUpdate) -> dict:
    goal = _org_goal(db, current_user, goal_uuid, "update")
    role = _org_role(db, goal, role_uuid)
    changes = payload.model_dump(exclude_unset=True)
    _clean_name(changes)
    if "capabilities" in changes:
        _check_capabilities(changes["capabilities"])
        changes["capabilities"] = sorted(set(changes["capabilities"] or []))
    for key, value in changes.items():
        setattr(role, key, value)
    role.update_date = _stamp()
    db.add(role)
    goal_ids = _org_goal_ids(db, int(goal.org_id))  # type: ignore[arg-type]
    for local in (db.exec(select(PlanRole).where(PlanRole.goal_id.in_(goal_ids), PlanRole.key == role.key)).all() if goal_ids else []):  # type: ignore[union-attr]
        local.name, local.capabilities, local.update_date = role.name, list(role.capabilities or []), role.update_date
        db.add(local)
    access.log(db, goal, current_user.id, "organization_role.updated", {"key": role.key, "fields": sorted(changes)})
    db.commit()
    return _org_role_dict(role)


def delete_organization_role(db: Session, current_user: PublicUser, goal_uuid: str, role_uuid: str) -> dict:
    goal = _org_goal(db, current_user, goal_uuid, "delete")
    role = _org_role(db, goal, role_uuid)
    goal_ids = _org_goal_ids(db, int(goal.org_id))  # type: ignore[arg-type]
    local_roles = db.exec(select(PlanRole).where(PlanRole.goal_id.in_(goal_ids), PlanRole.key == role.key)).all() if goal_ids else []  # type: ignore[union-attr]
    local_ids = [int(item.id) for item in local_roles]  # type: ignore[arg-type]
    if local_ids and db.exec(select(PlanCollaborator.id).where(PlanCollaborator.role_id.in_(local_ids), PlanCollaborator.active == True)).first() is not None:  # type: ignore[attr-defined]  # noqa: E712
        raise HTTPException(status_code=409, detail="Reassign collaborators before deleting this organization role")
    for local in local_roles:
        db.delete(local)
    for admin in (db.exec(select(PlanRole).where(PlanRole.goal_id.in_(goal_ids), PlanRole.key == "plan_admin")).all() if goal_ids else []):  # type: ignore[union-attr]
        if role.key in (admin.grantable_role_keys or []):
            admin.grantable_role_keys = [key for key in admin.grantable_role_keys if key != role.key]
            db.add(admin)
    db.delete(role)
    access.log(db, goal, current_user.id, "organization_role.deleted", {"key": role.key})
    db.commit()
    return {"deleted": True, "role_uuid": role_uuid}
