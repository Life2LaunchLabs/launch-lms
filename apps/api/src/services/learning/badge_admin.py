"""Badge updates, thumbnails, notifications and listing."""

from copy import deepcopy
from datetime import datetime, timedelta
from uuid import uuid4
from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from src.db.learning import (
    BadgeCollection,
    LearningBadge,
    LearningBadgeNotificationSignup,
    LearningBadgeRead,
    LearningBadgeUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.utils.upload_content import upload_file
from src.services.learning import access_rules, enrollment, lookups


async def update_badge(
    request: Request,
    badge_uuid: str,
    data: LearningBadgeUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    version_uuid: str | None = None,
) -> LearningBadgeRead:
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    definition = deepcopy(version.definition or {})
    patch = access_rules._strip_system_fields(data.model_dump(exclude_unset=True))
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


async def update_badge_thumbnail(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
    version_uuid: str | None = None,
) -> LearningBadgeRead:
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    lookups._ensure_draft(version)
    org = access_rules._get_org(db_session, badge.org_id)

    if not thumbnail_file or not thumbnail_file.filename:
        raise HTTPException(status_code=400, detail="Thumbnail file is required")

    filename = await upload_file(
        file=thumbnail_file,
        directory=f"badges/{badge.badge_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
    )
    thumbnail_image = (
        f"/content/orgs/{org.org_uuid}/badges/{badge.badge_uuid}/thumbnails/{filename}"
    )
    version.definition = {**(version.definition or {}), "thumbnail_image": thumbnail_image}
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)
    return lookups._versioned_badge_read(db_session, badge, version)


async def create_badge_notification_signup(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to get notified"
        )
    badge = enrollment._get_badge(db_session, badge_uuid)
    lookups._ensure_read_badge(db_session, badge, current_user)
    existing = db_session.exec(
        select(LearningBadgeNotificationSignup).where(
            LearningBadgeNotificationSignup.badge_id == badge.id,
            LearningBadgeNotificationSignup.user_id == current_user.id,
        )
    ).first()
    if existing:
        return {
            "detail": "Notification signup already exists",
            "signup_uuid": existing.signup_uuid,
        }
    now = access_rules._now()
    signup = LearningBadgeNotificationSignup(
        signup_uuid=f"badge_notification_{uuid4()}",
        badge_id=badge.id or 0,
        org_id=badge.org_id,
        user_id=current_user.id,
        creation_date=now,
        update_date=now,
    )
    db_session.add(signup)
    db_session.commit()
    db_session.refresh(signup)
    return {"detail": "Notification signup created", "signup_uuid": signup.signup_uuid}


async def get_badge(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    version_uuid: str | None = None,
) -> LearningBadgeRead:
    badge = enrollment._get_badge(db_session, badge_uuid)
    lookups._ensure_read_badge(db_session, badge, current_user)
    version = lookups._get_badge_version(db_session, badge, version_uuid) if (version_uuid or badge.active_version_id) else None
    return lookups._versioned_badge_read(db_session, badge, version)


async def list_badges(
    request: Request,
    org_id: int | None,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    admin: bool = False,
) -> list[LearningBadgeRead]:
    if org_id is not None:
        access_rules._ensure_onboarding_for_owner_org(db_session, org_id)
    if admin:
        if org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id is required for admin badge listing",
            )
        access_rules._require_org_admin(db_session, current_user, org_id)
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
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    if access_rules._is_system_object(badge):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System badges cannot be deleted",
        )
    badge.deleted_at = datetime.utcnow()
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    return {"detail": "Badge moved to trash"}


async def list_deleted_badges(request: Request, org_id: int, current_user, db_session: Session) -> list[LearningBadgeRead]:
    access_rules._require_org_admin(db_session, current_user, org_id)
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
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
