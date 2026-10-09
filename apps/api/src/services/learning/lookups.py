"""Badge versions, lookups, serializers and read access."""

from copy import deepcopy
from uuid import uuid4
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    LearningActivity,
    LearningActivityRead,
    LearningBadge,
    LearningBadgeRead,
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPage,
    LearningPageRead,
    LearningPath,
    LearningResponseAttempt,
    LearningRun,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.guest_sessions import LearningActor
from src.services.learning import access_rules, constants


VERSIONED_BADGE_FIELDS = (
    "name", "description", "about", "criteria", "thumbnail_image", "protected",
    "system_type", "direct_conferral_enabled", "badge_metadata",
)


def _badge_definition(badge: LearningBadge) -> dict:
    return {key: deepcopy(getattr(badge, key)) for key in VERSIONED_BADGE_FIELDS}


def _get_badge_version(db_session: Session, badge: LearningBadge, version_uuid: str | None = None, *, require_published: bool = False) -> LearningBadgeVersion:
    statement = select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id)
    if version_uuid:
        statement = statement.where(LearningBadgeVersion.version_uuid == access_rules._clean_uuid(version_uuid, "badge_version_"))
    elif badge.active_version_id:
        statement = statement.where(LearningBadgeVersion.id == badge.active_version_id)
    else:
        statement = statement.order_by(LearningBadgeVersion.update_date.desc())  # type: ignore
    version = db_session.exec(statement).first()
    if not version or (require_published and version.state != LearningBadgeVersionState.PUBLISHED):
        raise HTTPException(status_code=404, detail="Badge version not found")
    return version


def _version_summary(version: LearningBadgeVersion, active_version_id: int | None = None) -> dict:
    return {
        **version.model_dump(exclude={"definition"}),
        "is_active": version.id == active_version_id,
    }


def _versioned_badge_read(db_session: Session, badge: LearningBadge, version: LearningBadgeVersion | None = None) -> LearningBadgeRead:
    versions = (
        db_session.exec(
            select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id).order_by(LearningBadgeVersion.update_date.desc())  # type: ignore
        ).all()
        if hasattr(db_session, "exec")
        else ([version] if version else [])
    )
    payload = badge.model_dump()
    if version:
        payload.update(version.definition or {})
    return LearningBadgeRead(
        **payload,
        selected_version=_version_summary(version, badge.active_version_id) if version else None,
        versions=[_version_summary(item, badge.active_version_id) for item in versions],
    )


def _ensure_draft(version: LearningBadgeVersion) -> None:
    if version.state != LearningBadgeVersionState.DRAFT:
        raise HTTPException(status_code=409, detail="Published versions are read-only. Create a draft to make changes.")


def _bump_version(version: LearningBadgeVersion) -> None:
    version.revision += 1
    version.update_date = access_rules._now()


def _version_for_content(db_session: Session, version_id: int | None) -> LearningBadgeVersion | None:
    return db_session.get(LearningBadgeVersion, version_id) if version_id else None


def _assert_content_editable(db_session: Session, version_id: int | None) -> LearningBadgeVersion:
    version = _version_for_content(db_session, version_id)
    if not version:
        raise HTTPException(status_code=409, detail="This legacy content is not attached to an editable draft.")
    _ensure_draft(version)
    return version


def _get_path_for_badge(db_session: Session, badge: LearningBadge, version: LearningBadgeVersion | None = None, *, create: bool = True) -> LearningPath | None:
    version_id = version.id if version else badge.active_version_id
    path = db_session.exec(select(LearningPath).where(LearningPath.badge_id == badge.id, LearningPath.version_id == version_id)).first()
    if not path:
        if not create:
            return None
        path = LearningPath(
            path_uuid=f"path_{uuid4()}",
            badge_id=badge.id or 0,
            version_id=version_id,
            org_id=badge.org_id,
            title=f"{badge.name} Path",
            description=badge.description or "",
            creation_date=access_rules._now(),
            update_date=access_rules._now(),
        )
        db_session.add(path)
        db_session.commit()
        db_session.refresh(path)
    return path


def _serialize_page(page: LearningPage) -> LearningPageRead:
    return LearningPageRead(**page.model_dump())


def _serialize_activity(
    activity: LearningActivity, pages: list[LearningPage] | None = None
) -> LearningActivityRead:
    return LearningActivityRead(
        **activity.model_dump(),
        pages=[_serialize_page(page) for page in (pages or [])],
    )


def _get_activity(db_session: Session, activity_uuid: str) -> LearningActivity:
    activity = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.activity_uuid
            == access_rules._clean_uuid(activity_uuid, "learning_activity_")
        )
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    return activity


def _get_page(db_session: Session, page_uuid: str) -> LearningPage:
    page = db_session.exec(
        select(LearningPage).where(
            LearningPage.page_uuid == access_rules._clean_uuid(page_uuid, "learning_page_")
        )
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Learning page not found")
    return page


def _get_run(
    db_session: Session, run_uuid: str, actor: LearningActor | None = None
) -> LearningRun:
    statement = select(LearningRun).where(
        LearningRun.run_uuid == access_rules._clean_uuid(run_uuid, "learning_run_")
    )
    if actor:
        for owner_filter in access_rules._actor_filters(LearningRun, actor):
            statement = statement.where(owner_filter)
    run = db_session.exec(statement).first()
    if not run:
        raise HTTPException(status_code=404, detail="Learning run not found")
    return run


PUBLIC_BADGE_STATUSES = (LearningBadgeStatus.COMING_SOON, LearningBadgeStatus.PUBLISHED)


def _is_publicly_visible_badge(badge: LearningBadge) -> bool:
    return bool(badge.public and badge.status in PUBLIC_BADGE_STATUSES)


def _is_startable_badge(badge: LearningBadge) -> bool:
    return bool(badge.public and badge.status == LearningBadgeStatus.PUBLISHED)


def _public_badge_query(org_id: int | None = None):
    statement = select(LearningBadge).where(
        LearningBadge.public == True,
        LearningBadge.status.in_(PUBLIC_BADGE_STATUSES),
        LearningBadge.deleted_at.is_(None),
        or_(
            LearningBadge.system_type.is_(None),  # type: ignore
            LearningBadge.system_type != constants.LEARNING_SYSTEM_TYPE_ONBOARDING,
        ),
    )
    if org_id is not None:
        statement = statement.where(LearningBadge.org_id == org_id)
    return statement


def _can_read_badge(
    db_session: Session, badge: LearningBadge, current_user: PublicUser | AnonymousUser
) -> bool:
    if _is_publicly_visible_badge(badge):
        return True
    if isinstance(current_user, AnonymousUser):
        return False
    try:
        access_rules._require_org_admin(db_session, current_user, badge.org_id)
        return True
    except HTTPException:
        pass
    authorized_issuer_org_ids = db_session.exec(
        select(BadgeIssuerAuthorization.issuer_org_id).where(
            BadgeIssuerAuthorization.badge_id == badge.id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )
    ).all()
    for issuer_org_id in authorized_issuer_org_ids:
        try:
            access_rules._require_org_admin(db_session, current_user, issuer_org_id)
            return True
        except HTTPException:
            continue
    return False


def _ensure_read_badge(
    db_session: Session, badge: LearningBadge, current_user: PublicUser | AnonymousUser
) -> None:
    if not _can_read_badge(db_session, badge, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Badge is not available"
        )


def _latest_attempts(
    db_session: Session, run_id: int
) -> dict[int, LearningResponseAttempt]:
    attempts = db_session.exec(
        select(LearningResponseAttempt)
        .where(LearningResponseAttempt.run_id == run_id)
        .order_by(LearningResponseAttempt.submitted_at.desc())  # type: ignore
    ).all()
    latest: dict[int, LearningResponseAttempt] = {}
    for attempt in attempts:
        if attempt.page_id not in latest:
            latest[attempt.page_id] = attempt
    return latest
