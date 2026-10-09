"""Read and write activities as Activity Documents.

Writes only ever land in a draft badge version (published versions stay
locked) and are guarded by the document etag, so a save made from a stale copy
returns 409 with the current document instead of overwriting someone's work.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.learning import (
    LearningActivity,
    LearningBadge,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPage,
    LearningPageType,
)
from src.db.users import AnonymousUser, PublicUser
from src.services import learning
from src.services.learning_documents.document import (
    PreparedDocument,
    document_etag,
    export_document,
    prepare_document,
)
from src.services.learning_documents.models import (
    HIDDEN_CONTENT_KEYS,
    HIDDEN_SETTINGS_KEYS,
    ActivityDocumentCreate,
    ActivityDocumentSave,
)

User = PublicUser | AnonymousUser


def activity_pages(db_session: Session, activity: LearningActivity) -> list[LearningPage]:
    return list(
        db_session.exec(
            select(LearningPage)
            .where(LearningPage.activity_id == activity.id)
            .order_by(LearningPage.order.asc())  # type: ignore[union-attr]
        ).all()
    )


def _context(db_session: Session, activity: LearningActivity) -> dict:
    badge = db_session.get(LearningBadge, activity.badge_id)
    version = db_session.get(LearningBadgeVersion, activity.version_id) if activity.version_id else None
    state = version.state.value if version and hasattr(version.state, "value") else (version.state if version else None)
    return {
        "activity_uuid": activity.activity_uuid,
        "org_id": activity.org_id,
        "badge_uuid": badge.badge_uuid if badge else None,
        "badge_name": badge.name if badge else None,
        "version_uuid": version.version_uuid if version else None,
        "version_title": version.title if version else None,
        "version_state": state,
        "editable": state == LearningBadgeVersionState.DRAFT.value,
    }


def envelope(db_session: Session, activity: LearningActivity, warnings: list | None = None) -> dict:
    document = export_document(activity, activity_pages(db_session, activity))
    return {
        "document": document,
        "etag": document_etag(document),
        "context": _context(db_session, activity),
        "warnings": [item.model_dump() for item in warnings or []],
    }


def _invalid(prepared: PreparedDocument) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "code": "invalid_document",
            "message": "The activity document has problems. Fix every listed error and try again.",
            "errors": [item.model_dump() for item in prepared.errors],
            "warnings": [item.model_dump() for item in prepared.warnings],
        },
    )


def _is_system_badge(db_session: Session, badge_id: int) -> bool:
    badge = db_session.get(LearningBadge, badge_id)
    return bool(badge and learning._is_system_object(badge))


async def get_activity_document(request: Request, activity_uuid: str, current_user: User, db_session: Session) -> dict:
    activity = learning._get_activity(db_session, activity_uuid)
    learning._require_org_admin(db_session, current_user, activity.org_id)
    return envelope(db_session, activity)


async def validate_activity_document(
    request: Request,
    raw: dict,
    current_user: User,
    db_session: Session,
    *,
    activity_uuid: str | None = None,
    badge_uuid: str | None = None,
) -> dict:
    existing: set[str] = set()
    if activity_uuid:
        activity = learning._get_activity(db_session, activity_uuid)
        learning._require_org_admin(db_session, current_user, activity.org_id)
        existing = {page.page_uuid for page in activity_pages(db_session, activity)}
        badge_id = activity.badge_id
    elif badge_uuid:
        badge = learning._get_badge(db_session, badge_uuid)
        learning._require_org_admin(db_session, current_user, badge.org_id)
        badge_id = badge.id or 0
    else:
        raise HTTPException(status_code=422, detail="Pass activity_uuid or badge_uuid to validate against")
    prepared = prepare_document(
        raw, existing_page_uuids=existing, allow_system_blocks=_is_system_badge(db_session, badge_id)
    )
    return {
        "valid": prepared.ok,
        "errors": [item.model_dump() for item in prepared.errors],
        "warnings": [item.model_dump() for item in prepared.warnings],
    }


def _write_pages(
    db_session: Session,
    activity: LearningActivity,
    prepared: PreparedDocument,
    existing: dict[str, LearningPage],
    now: str,
) -> None:
    keep = {page["page_uuid"] for page in prepared.pages}
    for page_uuid, page in existing.items():
        if page_uuid not in keep:
            db_session.delete(page)
    for order, data in enumerate(prepared.pages, start=1):
        page = existing.get(data["page_uuid"])
        hidden = {key: value for key, value in ((page.content if page else None) or {}).items() if key in HIDDEN_CONTENT_KEYS}
        if page is None:
            page = LearningPage(
                activity_id=activity.id or 0,
                badge_id=activity.badge_id,
                version_id=activity.version_id,
                org_id=activity.org_id,
                page_uuid=data["page_uuid"],
                page_type=LearningPageType(data["page_type"]),
                title=data["title"],
                creation_date=now,
            )
        page.page_type = LearningPageType(data["page_type"])
        page.title = data["title"].strip()
        page.required = data["required"]
        page.order = order
        page.content = {**data["content"], **hidden}
        page.design = data["design"]
        page.scoring = data["scoring"]
        page.completion = data["completion"]
        page.update_date = now
        db_session.add(page)


def _write_activity(activity: LearningActivity, prepared: PreparedDocument, now: str) -> None:
    data = prepared.activity
    hidden = {key: value for key, value in (activity.settings or {}).items() if key in HIDDEN_SETTINGS_KEYS}
    activity.title = data["title"].strip()
    activity.description = data["description"]
    activity.icon = data["icon"]
    activity.thumbnail_image = data["thumbnail_image"]
    activity.required = data["required"]
    activity.settings = {**(data["settings"] or {}), **hidden}
    activity.update_date = now


async def save_activity_document(
    request: Request, activity_uuid: str, payload: ActivityDocumentSave, current_user: User, db_session: Session
) -> dict:
    activity = learning._get_activity(db_session, activity_uuid)
    learning._require_org_admin(db_session, current_user, activity.org_id)
    version = learning._assert_content_editable(db_session, activity.version_id)
    current = envelope(db_session, activity)
    if payload.base_etag != current["etag"]:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "stale_document",
                "message": "This activity changed since it was read. Merge your edits into the current document and save again.",
                "current": current,
            },
        )
    claimed = payload.document.activity.activity_uuid
    if claimed and claimed != activity.activity_uuid:
        raise HTTPException(status_code=422, detail="Document activity_uuid does not match the activity being saved")
    existing = {page.page_uuid: page for page in activity_pages(db_session, activity)}
    prepared = prepare_document(
        payload.document.model_dump(),
        existing_page_uuids=set(existing),
        allow_system_blocks=_is_system_badge(db_session, activity.badge_id),
    )
    if not prepared.ok:
        raise _invalid(prepared)
    now = learning._now()
    _write_activity(activity, prepared, now)
    db_session.add(activity)
    _write_pages(db_session, activity, prepared, existing, now)
    learning._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(activity)
    return envelope(db_session, activity, prepared.warnings)


def resolve_draft_version(db_session: Session, badge: LearningBadge, version_uuid: str | None) -> LearningBadgeVersion:
    if version_uuid:
        version = learning._get_badge_version(db_session, badge, version_uuid)
        learning._ensure_draft(version)
        return version
    version = db_session.exec(
        select(LearningBadgeVersion)
        .where(
            LearningBadgeVersion.badge_id == badge.id,
            LearningBadgeVersion.state == LearningBadgeVersionState.DRAFT,
        )
        .order_by(LearningBadgeVersion.update_date.desc())  # type: ignore[union-attr]
    ).first()
    if not version:
        raise HTTPException(
            status_code=409,
            detail="This badge has no draft version. Create a draft in Launch LMS before adding activities.",
        )
    return version


async def create_activity_from_document(
    request: Request, payload: ActivityDocumentCreate, current_user: User, db_session: Session
) -> dict:
    badge = learning._get_badge(db_session, payload.badge_uuid)
    learning._require_org_admin(db_session, current_user, badge.org_id)
    version = resolve_draft_version(db_session, badge, payload.version_uuid)
    prepared = prepare_document(
        payload.document.model_dump(), existing_page_uuids=set(), allow_system_blocks=learning._is_system_object(badge)
    )
    if not prepared.ok:
        raise _invalid(prepared)
    path = learning._get_path_for_badge(db_session, badge, version)
    last = db_session.exec(
        select(LearningActivity)
        .where(LearningActivity.path_id == path.id)
        .order_by(LearningActivity.order.desc())  # type: ignore[union-attr]
    ).first()
    now = learning._now()
    activity = LearningActivity(
        path_id=path.id or 0,
        badge_id=badge.id or 0,
        version_id=version.id,
        org_id=badge.org_id,
        title=prepared.activity["title"],
        order=(last.order + 1) if last else 1,
        published=False,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
    )
    _write_activity(activity, prepared, now)
    db_session.add(activity)
    db_session.flush()
    _write_pages(db_session, activity, prepared, {}, now)
    learning._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(activity)
    return envelope(db_session, activity, prepared.warnings)
