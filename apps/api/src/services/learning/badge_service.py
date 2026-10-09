"""Badge creation, CRUD and the system onboarding badge."""

from uuid import uuid4
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    BadgeCollection,
    LearningActivity,
    LearningBadge,
    LearningBadgeCreate,
    LearningBadgeRead,
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPath,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.security.features_utils.resolve import resolve_feature
from src.security.superadmin import is_user_superadmin
from src.services.learning import access_rules, lookups


def ensure_onboarding_learning_badge(
    db_session: Session,
) -> tuple[Organization, BadgeCollection, LearningBadge, LearningActivity]:
    """Sync the system Launch Ready badge from its data file (learning_system/launch_ready.json)."""
    from src.services.learning_system.onboarding import sync_launch_ready_badge

    return sync_launch_ready_badge(db_session)


async def create_badge(
    request: Request,
    data: LearningBadgeCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningBadgeRead:
    access_rules._require_org_admin(db_session, current_user, data.org_id)
    _require_badge_creation_access(db_session, current_user, data.org_id)
    now = access_rules._now()
    badge = LearningBadge(
        **access_rules._strip_system_fields(data.model_dump(exclude={"status"})),
        status=LearningBadgeStatus.DRAFT,
        badge_uuid=f"badge_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    try:
        db_session.add(badge)
        db_session.flush()
        version = LearningBadgeVersion(
            version_uuid=f"badge_version_{uuid4()}", badge_id=badge.id or 0,
            org_id=badge.org_id, state=LearningBadgeVersionState.DRAFT,
            title="Initial Version", definition=lookups._badge_definition(badge),
            created_by_user_id=getattr(current_user, "id", None), creation_date=now, update_date=now,
        )
        db_session.add(version)
        db_session.flush()
        path = LearningPath(
            path_uuid=f"path_{uuid4()}",
            badge_id=badge.id or 0,
            version_id=version.id,
            org_id=badge.org_id,
            title=f"{badge.name} Path",
            description=badge.description or "",
            creation_date=now,
            update_date=now,
        )
        db_session.add(path)
        db_session.commit()
        db_session.refresh(badge)
    except Exception:
        db_session.rollback()
        raise
    return lookups._versioned_badge_read(db_session, badge, version)


def _require_badge_creation_access(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    org_id: int,
) -> None:
    """Require Badge Publishing access before creating or importing a badge."""
    if isinstance(current_user, PublicUser) and is_user_superadmin(current_user.id, db_session):
        return
    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    config = org_config.config if org_config and org_config.config else {}
    if not resolve_feature("marketplace_publishing", config, org_id).get("enabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Badge Publishing is not enabled for this organization. Add the Badge Publishing package to create badges.",
        )
