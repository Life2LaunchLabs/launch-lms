"""Small shared helpers: time, ids, org lookup and admin checks."""

from datetime import datetime
from fastapi import HTTPException, status
from sqlmodel import Session, select
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
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
    db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int
) -> PublicUser:
    user = _require_user(current_user)
    if is_user_superadmin(user.id, db_session):
        return user
    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user.id,
            UserOrganization.org_id == org_id,
            UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS),  # type: ignore
        )
    ).first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin access required",
        )
    return user


def _is_org_admin(db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int) -> bool:
    """Whether the viewer may change the organization's badges: its admins and maintainers, or a superadmin."""
    try:
        _require_org_admin(db_session, current_user, org_id)
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
