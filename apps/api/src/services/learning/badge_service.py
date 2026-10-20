"""Badge creation."""

from uuid import uuid4
from fastapi import Request
from sqlmodel import Session
from src.db.learning import (
    LearningBadge,
    LearningBadgeCreate,
    LearningBadgeRead,
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionState,
)
from src.db.users import AnonymousUser, PublicUser
from src.security.access.access import ensure_feature
from src.security.superadmin import is_user_superadmin
from src.services.learning import access_rules, lookups


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
        **data.model_dump(exclude={"status"}),
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
    ensure_feature(org_id, "badge_publishing", db_session)
