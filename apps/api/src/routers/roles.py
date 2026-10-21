from fastapi import APIRouter, Depends, Request
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.roles import RoleRead
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.roles.roles import get_roles_by_organization, read_role

router = APIRouter()


@router.get("/org/{org_id}")
async def api_get_roles_by_organization(
    request: Request,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
)-> list[RoleRead]:
    """
    Get all roles for a specific organization, including global roles
    """
    return await get_roles_by_organization(request, db_session, org_id, current_user)


@router.get("/{role_id}")
async def api_get_role(
    request: Request,
    role_id: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
)-> RoleRead:
    """
    Get single role by role_id
    """
    return await read_role(request, db_session, role_id, current_user)
