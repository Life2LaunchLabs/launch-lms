"""Small shared helpers: time, ids, org lookup and admin checks."""

from datetime import datetime
from fastapi import HTTPException, status
from sqlmodel import Session, select
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.security.superadmin import is_user_superadmin


def _now() -> str:
    return str(datetime.now())


def _clean_uuid(value: str, prefix: str) -> str:
    return value if value.startswith(prefix) else f"{prefix}{value}"


def _get_org(db_session: Session, org_id: int) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_owner_org(db_session: Session) -> Organization:
    org = db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return org


def _get_org_config(db_session: Session, org_id: int) -> OrganizationConfig | None:
    return db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()


def _require_user(current_user: PublicUser | AnonymousUser) -> PublicUser:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return current_user


def _require_org_admin(
    db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int, permission: str | None = None,
) -> PublicUser:
    """Admins, and staff (with ``permission``, when given: see security/org_auth.STAFF_PERMISSIONS), or a superadmin."""
    from src.security.org_auth import require_org_admin

    user = _require_user(current_user)
    if is_user_superadmin(user.id, db_session):
        return user
    require_org_admin(user.id, org_id, db_session, permission)
    return user


def _is_org_admin(db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int, permission: str | None = "build_plans") -> bool:
    """Whether the viewer may change the organization's badges: its admins and staff who build plans, or a superadmin."""
    try:
        _require_org_admin(db_session, current_user, org_id, permission)
        return True
    except HTTPException:
        return False


def _require_org_staff(db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int) -> PublicUser:
    """Reads for the organization's staff (admins, maintainers and staff roles); writes keep ``_require_org_admin``."""
    from src.services.school.roles import is_staff

    user = _require_user(current_user)
    if is_user_superadmin(user.id, db_session) or is_staff(db_session, org_id, user.id):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the organization's staff can see its badges")
