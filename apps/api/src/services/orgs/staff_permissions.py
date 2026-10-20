"""What each staff member may do: the permissions an admin gives them (security/org_auth.STAFF_PERMISSIONS).

An organization has three roles: Admin, Staff and Learner. Admins can do everything; staff can do
what their permissions allow, and a new staff member starts with the defaults.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import DEFAULT_STAFF_PERMISSIONS, STAFF_PERMISSIONS, require_org_admin, require_org_owner_admin, staff_permissions
from src.security.rbac.constants import STAFF_ROLE_ID


class PermissionsUpdate(BaseModel):
    permissions: list[str]


def catalog(db: Session, current_user: PublicUser, org_id: int) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return {"permissions": [{"key": key, "label": label, "default": key in DEFAULT_STAFF_PERMISSIONS} for key, label in STAFF_PERMISSIONS.items()]}


def set_permissions(db: Session, current_user: PublicUser, org_id: int, user_id: int, permissions: list[str]) -> dict:
    require_org_owner_admin(current_user.id, org_id, db)
    unknown = sorted(set(permissions) - set(STAFF_PERMISSIONS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permissions: {', '.join(unknown)}")
    membership = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    if membership.role_id != STAFF_ROLE_ID:
        raise HTTPException(status_code=422, detail="Only staff have permissions; admins can do everything")
    membership.permissions = [key for key in STAFF_PERMISSIONS if key in permissions]
    membership.update_date = datetime.now().isoformat()
    db.add(membership)
    db.commit()
    return {"user_id": user_id, "permissions": sorted(staff_permissions(membership))}
