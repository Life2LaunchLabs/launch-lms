"""What staff may do: the permission catalog, a staff member's permissions, and a pending staff invitation's (see services/orgs/staff_permissions.py)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.orgs import staff_permissions
from src.services.orgs.staff_permissions import PermissionsUpdate

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/{org_id}/staff-permissions")
def api_staff_permission_catalog(org_id: int, db: Session = DB, current_user: PublicUser = USER):
    """The permissions an admin can give staff, and which new staff start with."""
    return staff_permissions.catalog(db, current_user, org_id)


@router.put("/{org_id}/users/{user_id}/permissions")
def api_set_staff_permissions(org_id: int, user_id: int, payload: PermissionsUpdate, db: Session = DB, current_user: PublicUser = USER):
    """Set what a staff member may do (admins only)."""
    return staff_permissions.set_permissions(db, current_user, org_id, user_id, payload.permissions)


@router.put("/{org_id}/invites/users/{invitation_uuid}/permissions")
def api_set_invitation_permissions(org_id: int, invitation_uuid: str, payload: PermissionsUpdate, db: Session = DB, current_user: PublicUser = USER):
    """Set what someone invited as staff will be able to do once they accept (admins only)."""
    return staff_permissions.set_invitation_permissions(db, current_user, org_id, invitation_uuid, payload.permissions)
