"""Badge version drafts: diffs, publishing and activation.

A version is a snapshot of the badge's definition (the credential: name,
criteria, image, Marketing and certificate settings). How the badge is earned
lives in its routes, which are plan templates with their own lifecycle.
"""

import re
from copy import deepcopy
from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.learning import (
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionCreate,
    LearningBadgeVersionPublish,
    LearningBadgeVersionState,
    LearningBadgeVersionUpdate,
)
from src.services.learning import access_rules, lookups


_DEFINITION_FIELD_LABELS = {
    "name": "Name",
    "description": "Description",
    "about": "About",
    "criteria": "Criteria",
    "thumbnail_image": "Badge image",
    "achievement_type": "Achievement type",
}
_DEFINITION_SETTING_LABELS = {
    "direct_conferral_enabled": "Direct issuance",
    "badge_metadata": "Achievement and certificate settings",
}


def _version_change_sections(previous: dict, current: dict) -> dict:
    changed = {key for key in set(previous) | set(current) if previous.get(key) != current.get(key)}
    return {
        "achievement_definition": [
            _DEFINITION_FIELD_LABELS.get(key, key.replace("_", " ").title())
            for key in sorted(changed - set(_DEFINITION_SETTING_LABELS))
        ],
        "settings_changed": [_DEFINITION_SETTING_LABELS[key] for key in sorted(changed & set(_DEFINITION_SETTING_LABELS))],
    }


async def list_badge_versions(request: Request, badge_uuid: str, current_user, db_session: Session) -> list[dict]:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    versions = db_session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id).order_by(LearningBadgeVersion.update_date.desc())).all()  # type: ignore
    return [lookups._version_summary(item, badge.active_version_id) for item in versions]


async def create_badge_version_draft(request: Request, badge_uuid: str, data: LearningBadgeVersionCreate, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Draft title is required")
    source = lookups._get_badge_version(db_session, badge, data.based_on_version_uuid, require_published=True) if data.based_on_version_uuid else None
    now = access_rules._now()
    draft = LearningBadgeVersion(
        version_uuid=f"badge_version_{uuid4()}", badge_id=badge.id or 0, org_id=badge.org_id,
        state=LearningBadgeVersionState.DRAFT, title=title, description=data.description or "",
        based_on_version_id=source.id if source else None, definition=deepcopy(source.definition if source else lookups._badge_definition(badge)),
        created_by_user_id=getattr(current_user, "id", None), creation_date=now, update_date=now,
    )
    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    return lookups._version_summary(draft, badge.active_version_id)


async def update_badge_version_draft(request: Request, badge_uuid: str, version_uuid: str, data: LearningBadgeVersionUpdate, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    lookups._ensure_draft(version)
    if data.expected_revision is not None and data.expected_revision != version.revision:
        raise HTTPException(status_code=409, detail="This draft was updated by another administrator. Reload before continuing.")
    for key, value in data.model_dump(exclude_unset=True, exclude={"expected_revision"}).items():
        setattr(version, key, value)
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(version)
    return lookups._version_summary(version, badge.active_version_id)


async def get_badge_version_diff(request: Request, badge_uuid: str, version_uuid: str, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    current = version.definition or {}
    base = db_session.get(LearningBadgeVersion, version.based_on_version_id) if version.based_on_version_id else None
    previous = (base.definition or {}) if base else {}
    return {
        "revision": version.revision,
        "change_sections": _version_change_sections(previous, current),
        "definition_fields": sorted(key for key in set(previous) | set(current) if previous.get(key) != current.get(key)),
    }


def _parse_semver(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", value.strip())
    if not match:
        raise HTTPException(status_code=422, detail="Version must use major.minor.patch format")
    return tuple(int(item) for item in match.groups())  # type: ignore[return-value]


async def publish_badge_version(request: Request, badge_uuid: str, version_uuid: str, data: LearningBadgeVersionPublish, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    admin = access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    lookups._ensure_draft(version)
    if data.expected_revision is not None and data.expected_revision != version.revision:
        raise HTTPException(status_code=409, detail="This draft changed before it could be published. Reload and review the diff again.")
    parsed = _parse_semver(data.semantic_version)
    published = db_session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id, LearningBadgeVersion.state == LearningBadgeVersionState.PUBLISHED)).all()
    if any(item.semantic_version == data.semantic_version for item in published):
        raise HTTPException(status_code=409, detail="That semantic version already exists")
    existing_versions = [_parse_semver(item.semantic_version) for item in published if item.semantic_version]
    if existing_versions and parsed <= max(existing_versions):
        raise HTTPException(status_code=422, detail="A new release must be greater than the latest published version")
    definition = version.definition or {}
    for field in ("name", "description", "criteria"):
        if not str(definition.get(field) or "").strip():
            raise HTTPException(status_code=422, detail=f"Achievement {field} is required")
    now = datetime.utcnow()
    version.state = LearningBadgeVersionState.PUBLISHED
    version.semantic_version = data.semantic_version
    version.title = data.title.strip() or version.title
    version.description = data.description or ""
    version.published_by_user_id = admin.id
    version.published_at = now
    version.update_date = str(now)
    version.revision += 1
    db_session.add(version)
    if data.set_active or not badge.active_version_id:
        badge.active_version_id = version.id
        badge.status = LearningBadgeStatus.PUBLISHED
        for key in lookups.VERSIONED_BADGE_FIELDS:
            if key in definition:
                setattr(badge, key, deepcopy(definition[key]))
        badge.update_date = str(now)
        db_session.add(badge)
    db_session.commit()
    db_session.refresh(version)
    return lookups._version_summary(version, badge.active_version_id)


async def activate_badge_version(request: Request, badge_uuid: str, version_uuid: str, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid, require_published=True)
    badge.active_version_id = version.id
    for key in lookups.VERSIONED_BADGE_FIELDS:
        if key in (version.definition or {}):
            setattr(badge, key, deepcopy(version.definition[key]))
    badge.status = LearningBadgeStatus.PUBLISHED
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    return lookups._version_summary(version, badge.active_version_id)


async def deactivate_badge_version(request: Request, badge_uuid: str, version_uuid: str, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid, require_published=True)
    if badge.active_version_id != version.id:
        raise HTTPException(status_code=409, detail="This version is not active")
    badge.active_version_id = None
    badge.status = LearningBadgeStatus.DRAFT
    badge.update_date = access_rules._now()
    db_session.add(badge)
    db_session.commit()
    return lookups._version_summary(version, badge.active_version_id)


async def delete_badge_version_draft(request: Request, badge_uuid: str, version_uuid: str, current_user, db_session: Session) -> dict:
    badge = lookups._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id, "build_plans")
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    lookups._ensure_draft(version)
    db_session.delete(version)
    db_session.commit()
    return {"detail": "Draft deleted"}
