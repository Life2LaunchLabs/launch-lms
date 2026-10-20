"""Badge updates, listing, trash and restore."""

from copy import deepcopy
from datetime import datetime, timedelta
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    BadgeCollection,
    LearningBadge,
    LearningBadgeRead,
    LearningBadgeUpdate,
)
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import access_rules, lookups


async def update_badge(
    request: Request,
    badge_uuid: str,
    data: LearningBadgeUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    version_uuid: str | None = None,
) -> LearningBadgeRead:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    definition = deepcopy(version.definition or {})
    patch = data.model_dump(exclude_unset=True)
    versioned_patch = {key for key in patch if key in lookups.VERSIONED_BADGE_FIELDS}
    if versioned_patch:
        lookups._ensure_draft(version)
    for key, value in patch.items():
        if key in lookups.VERSIONED_BADGE_FIELDS:
            definition[key] = value
        elif key in ("collection_id", "public", "marketplace_listed"):
            setattr(badge, key, value)
        elif key == "status":
            raise HTTPException(status_code=422, detail="Publish and activate versions from the version toolbar")
    if versioned_patch:
        version.definition = definition
        lookups._bump_version(version)
        db_session.add(version)
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(version)
    return lookups._versioned_badge_read(db_session, badge, version)


async def get_badge(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    version_uuid: str | None = None,
) -> LearningBadgeRead:
    badge = lookups._get_badge(db_session, badge_uuid)
    lookups._ensure_read_badge(db_session, badge, current_user)
    version = lookups._get_badge_version(db_session, badge, version_uuid) if (version_uuid or badge.active_version_id) else None
    result = lookups._versioned_badge_read(db_session, badge, version)
    # For the admin detail page: whether this viewer may change it (the owner's admins) and who made it.
    result.can_edit = access_rules._is_org_admin(db_session, current_user, badge.org_id)
    owner = db_session.get(Organization, badge.org_id)
    result.creator_org = {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None
    return result


async def list_badges(
    request: Request,
    org_id: int | None,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    admin: bool = False,
) -> list[LearningBadgeRead]:
    if admin:
        if org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id is required for admin badge listing",
            )
        access_rules._require_org_staff(db_session, current_user, org_id)
        statement = select(LearningBadge).where(
            LearningBadge.org_id == org_id, LearningBadge.deleted_at.is_(None)
        )
    else:
        statement = lookups._public_badge_query(org_id)
    badges = db_session.exec(
        statement.order_by(LearningBadge.creation_date.desc())
    ).all()  # type: ignore
    return [LearningBadgeRead(**badge.model_dump()) for badge in badges]


async def delete_badge(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    badge.deleted_at = datetime.utcnow()
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    return {"detail": "Badge moved to trash"}


async def list_deleted_badges(request: Request, org_id: int, current_user, db_session: Session) -> list[LearningBadgeRead]:
    access_rules._require_org_admin(db_session, current_user, org_id, "build_plans")
    cutoff = datetime.utcnow() - timedelta(days=14)
    badges = db_session.exec(select(LearningBadge).where(
        LearningBadge.org_id == org_id,
        LearningBadge.deleted_at.is_not(None),
        LearningBadge.deleted_at >= cutoff,
    ).order_by(LearningBadge.deleted_at.desc())).all()
    deleted_collection_ids = set(db_session.exec(select(BadgeCollection.id).where(
        BadgeCollection.org_id == org_id,
        BadgeCollection.deleted_at.is_not(None),
    )).all())
    return [
        LearningBadgeRead(**badge.model_dump())
        for badge in badges
        if badge.collection_id not in deleted_collection_ids
    ]


async def restore_badge(request: Request, badge_uuid: str, current_user, db_session: Session) -> LearningBadgeRead:
    badge = db_session.exec(select(LearningBadge).where(
        LearningBadge.badge_uuid == access_rules._clean_uuid(badge_uuid, "badge_"),
        LearningBadge.deleted_at.is_not(None),
    )).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found in trash")
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    if badge.deleted_at < datetime.utcnow() - timedelta(days=14):
        raise HTTPException(status_code=410, detail="The 14-day restore period has expired")
    if badge.collection_id is not None:
        deleted_collection = db_session.exec(select(BadgeCollection).where(
            BadgeCollection.id == badge.collection_id,
            BadgeCollection.deleted_at.is_not(None),
        )).first()
        if deleted_collection:
            raise HTTPException(status_code=409, detail="Restore the badge collection first")
    badge.deleted_at = None
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return LearningBadgeRead(**badge.model_dump())
