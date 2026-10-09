"""Small shared helpers: time, ids, org lookup and admin checks."""

from datetime import datetime
from fastapi import HTTPException, status
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services.guest_sessions import LearningActor
from src.services.learning import badge_service, constants


def _now() -> str:
    return str(datetime.now())


def _clean_uuid(value: str, prefix: str) -> str:
    return value if value.startswith(prefix) else f"{prefix}{value}"


def _actor_filters(model, actor: LearningActor):
    if actor.user_id is not None:
        return [model.user_id == actor.user_id]
    return [model.guest_session_id == actor.guest_session_id]


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


def _strip_system_fields(payload: dict) -> dict:
    return {key: value for key, value in payload.items() if key not in constants._SYSTEM_FIELDS}


def _is_system_object(value) -> bool:
    system_type = getattr(value, "system_type", None)
    return bool(
        getattr(value, "protected", False)
        or (system_type and system_type != "legacy_badge_migration")
    )


def _is_locked_launch_ready_activity(activity: LearningActivity) -> bool:
    return bool(
        activity.activity_uuid in set(constants.LAUNCH_READY_ACTIVITY_UUIDS.values())
        and (activity.settings or {}).get("system_required")
    )


def _ensure_onboarding_for_owner_org(db_session: Session, org_id: int) -> None:
    owner_org = db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()
    if owner_org and owner_org.id == org_id:
        badge_service.ensure_onboarding_learning_badge(db_session)


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
