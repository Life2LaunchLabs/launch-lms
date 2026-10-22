"""The roles an organization assigns: Admin, Staff and Learner. Custom roles are retired."""

from fastapi import HTTPException, Request
from sqlmodel import Session, col, select
from src.db.organizations import Organization
from src.db.roles import Role, RoleRead, RoleTypeEnum
from src.db.users import PublicUser
from src.security.org_auth import require_org_role_permission
from src.security.rbac.constants import ORG_ROLE_UUIDS
from src.security.rbac.rbac import authorization_verify_if_user_is_anon


async def get_roles_by_organization(
    request: Request,
    db_session: Session,
    org_id: int,
    current_user: PublicUser,
) -> list[RoleRead]:
    """
    Get all roles for a specific organization, including global roles.
    
    Args:
        request: FastAPI request object
        db_session: Database session
        org_id: Organization ID
        current_user: Current authenticated user
        
    Returns:
        List[RoleRead]: List of roles for the organization (including global roles)
        
    Raises:
        HTTPException: If organization not found or user lacks permissions
    """
    # ============================================================================
    # VERIFICATION 1: Check if the organization exists
    # ============================================================================
    statement = select(Organization).where(Organization.id == org_id)
    organization = db_session.exec(statement).first()
    
    if not organization:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # ============================================================================
    # VERIFICATION 2+3: Membership + permission (superadmins bypass)
    # ============================================================================
    require_org_role_permission(current_user.id, org_id, db_session, "roles", "action_read")

    # ============================================================================
    # GET ROLES: Fetch all roles for the organization AND global roles
    # ============================================================================
    # Get global roles first
    # Only the three roles an organization assigns: Admin, Staff and Learner (custom roles are retired).
    global_roles_statement = select(Role).where(
        Role.role_type == RoleTypeEnum.TYPE_GLOBAL, col(Role.role_uuid).in_(ORG_ROLE_UUIDS),
    ).order_by(Role.id)  # type: ignore

    all_roles = list(db_session.exec(global_roles_statement).all())
    
    # Convert to RoleRead objects
    role_reads = []
    for role in all_roles:
        role_data = role.model_dump()
        # Ensure org_id is properly handled
        if role_data.get('org_id') is None:
            role_data['org_id'] = 0
        role_reads.append(RoleRead(**role_data))
    
    return role_reads


async def read_role(
    request: Request, db_session: Session, role_id: str, current_user: PublicUser
):
    # Convert role_id to integer
    try:
        role_id_int = int(role_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid role ID format. Role ID must be a number.",
        )
    
    statement = select(Role).where(Role.id == role_id_int)
    result = db_session.exec(statement)

    role = result.first()

    if not role:
        raise HTTPException(
            status_code=404,
            detail="Role not found",
        )

    # RBAC check — scope permission to the role's own org to prevent cross-org IDOR.
    # Global roles (org_id=None) are readable by any authenticated user.
    await authorization_verify_if_user_is_anon(current_user.id)
    if role.org_id is not None:
        require_org_role_permission(current_user.id, role.org_id, db_session, "roles", "action_read")

    role = RoleRead(**role.model_dump())

    return role
