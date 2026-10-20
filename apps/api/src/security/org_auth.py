"""
Centralized organization authorization helpers.

All org membership and admin checks go through this module.
Superadmin bypass is baked in — superadmins pass every check automatically.
"""


from fastapi import HTTPException, status
from sqlmodel import Session, select
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS, ADMIN_ROLE_ID

# What an admin lets each staff member do. Admins can do all of it, and they alone change
# org settings, roles and these permissions. Staff without a saved set get the defaults.
STAFF_PERMISSIONS: dict[str, str] = {
    "build_plans": "Create and edit plan templates, activities and badges",
    "run_assignments": "Assign plans, set dates, pause and end assignments",
    "review_work": "Confirm steps, grade and request changes",
    "manage_learners": "Invite and remove learners, change their groups and status",
    "see_reports": "See insights and requirement evidence across the org",
}
DEFAULT_STAFF_PERMISSIONS: tuple[str, ...] = ("run_assignments", "review_work")


def staff_permissions(membership: UserOrganization | None) -> set[str]:
    """What this member may do as staff: everything for admins, their saved set (or the defaults) for staff."""
    if membership is None or membership.role_id not in ADMIN_OR_MAINTAINER_ROLE_IDS:
        return set()
    if membership.role_id == ADMIN_ROLE_ID:
        return set(STAFF_PERMISSIONS)
    saved = membership.permissions
    return {key for key in (DEFAULT_STAFF_PERMISSIONS if saved is None else saved) if key in STAFF_PERMISSIONS}


def _is_user_superadmin(user_id: int, db_session: Session) -> bool:
    from src.security.superadmin import is_user_superadmin

    return is_user_superadmin(user_id, db_session)


def is_org_member(user_id: int, org_id: int, db_session: Session) -> bool:
    """Check if user is a member of the org (or a superadmin)."""
    if _is_user_superadmin(user_id, db_session):
        return True
    statement = select(UserOrganization).where(
        UserOrganization.user_id == user_id,
        UserOrganization.org_id == org_id,
    )
    return db_session.exec(statement).first() is not None


def is_org_admin(user_id: int, org_id: int, db_session: Session, permission: str | None = None) -> bool:
    """Check if user is an admin or staff member of the org (or a superadmin).

    With ``permission``, staff pass only when the admin gave them that permission (see STAFF_PERMISSIONS).
    """
    if _is_user_superadmin(user_id, db_session):
        return True
    statement = select(UserOrganization).where(
        UserOrganization.user_id == user_id,
        UserOrganization.org_id == org_id,
        UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS),
    )
    membership = db_session.exec(statement).first()
    if membership is None:
        return False
    return permission is None or permission in staff_permissions(membership)


def is_org_owner_admin(user_id: int, org_id: int, db_session: Session) -> bool:
    """An admin of the org (not staff), or a superadmin."""
    if _is_user_superadmin(user_id, db_session):
        return True
    membership = get_user_org(user_id, org_id, db_session)
    return membership is not None and membership.role_id == ADMIN_ROLE_ID


def get_user_org(user_id: int, org_id: int, db_session: Session) -> UserOrganization | None:
    """Return the UserOrganization row, or None. Does NOT check superadmin."""
    statement = select(UserOrganization).where(
        UserOrganization.user_id == user_id,
        UserOrganization.org_id == org_id,
    )
    return db_session.exec(statement).first()


def get_user_org_role(user_id: int, org_id: int, db_session: Session) -> Role | None:
    """Return the user's Role in the org, or None. Does NOT check superadmin."""
    user_org = get_user_org(user_id, org_id, db_session)
    if not user_org:
        return None
    statement = select(Role).where(Role.id == user_org.role_id)
    return db_session.exec(statement).first()


def require_org_membership(user_id: int, org_id: int, db_session: Session) -> None:
    """Raise 403 if user is not an org member and not a superadmin."""
    if not is_org_member(user_id, org_id, db_session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )


def require_org_admin(user_id: int, org_id: int, db_session: Session, permission: str | None = None) -> None:
    """Raise 403 if user is not an org admin or staff member (with ``permission``, when given) and not a superadmin."""
    if not is_org_admin(user_id, org_id, db_session, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(f"Your admin hasn't given you permission to {STAFF_PERMISSIONS[permission][0].lower() + STAFF_PERMISSIONS[permission][1:]}"
                    if permission and get_user_org(user_id, org_id, db_session) else
                    "Only organization administrators and staff can perform this action"),
        )


def require_org_owner_admin(user_id: int, org_id: int, db_session: Session) -> None:
    """Raise 403 unless the user is an admin of the org (not staff) or a superadmin."""
    if not is_org_owner_admin(user_id, org_id, db_session):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only organization admins can perform this action")


def require_org_role_permission(
    user_id: int,
    org_id: int,
    db_session: Session,
    resource: str,
    action: str,
    fallback_role_ids: frozenset = ADMIN_OR_MAINTAINER_ROLE_IDS,
) -> None:
    """
    Check that the user has a specific permission via their org role's rights dict.
    Superadmins bypass entirely.

    Args:
        resource: e.g. 'roles', 'courses'
        action: e.g. 'action_create', 'action_read'
        fallback_role_ids: allowed role IDs when rights dict is absent
    """
    if _is_user_superadmin(user_id, db_session):
        return

    user_org = get_user_org(user_id, org_id, db_session)
    if not user_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )

    role = db_session.exec(select(Role).where(Role.id == user_org.role_id)).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role in this organization could not be determined",
        )

    if role.rights and isinstance(role.rights, dict):
        resource_rights = role.rights.get(resource)
        if resource_rights is not None:
            # Rights explicitly defined for this resource — enforce them
            if not resource_rights.get(action, False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"You don't have permission to perform this action ({resource}.{action})",
                )
            return
        # Resource type not in rights dict (role predates this resource type) —
        # fall through to role ID check below

    if role.id not in fallback_role_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Maintainer role required for this action",
        )
