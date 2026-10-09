"""Badge version drafts: cloning, diffs, publishing and activation."""

import re
from copy import deepcopy
from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningBadge,
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionCreate,
    LearningBadgeVersionPublish,
    LearningBadgeVersionState,
    LearningBadgeVersionUpdate,
    LearningPage,
    LearningPath,
)
from src.services.learning_documents.references import rewrite_page_references as _replace_uuid_values
from src.services.learning import access_rules, enrollment, lookups


def _clone_version_graph(db_session: Session, badge: LearningBadge, source: LearningBadgeVersion, target: LearningBadgeVersion) -> None:
    source_path = lookups._get_path_for_badge(db_session, badge, source, create=False)
    if not source_path:
        return
    now = access_rules._now()
    target_path = LearningPath(
        path_uuid=f"path_{uuid4()}", badge_id=badge.id or 0, version_id=target.id,
        org_id=badge.org_id, title=source_path.title, description=source_path.description,
        creation_date=now, update_date=now,
    )
    db_session.add(target_path)
    db_session.flush()
    source_activities = db_session.exec(select(LearningActivity).where(LearningActivity.path_id == source_path.id).order_by(LearningActivity.order.asc())).all()  # type: ignore
    page_replacements: dict[str, str] = {}
    activity_pairs: list[tuple[LearningActivity, LearningActivity]] = []
    for source_activity in source_activities:
        target_activity = LearningActivity(
            path_id=target_path.id or 0, badge_id=badge.id or 0, version_id=target.id,
            org_id=badge.org_id, title=source_activity.title, description=source_activity.description,
            thumbnail_image=source_activity.thumbnail_image, icon=source_activity.icon,
            order=source_activity.order, required=source_activity.required, published=True,
            settings=deepcopy(source_activity.settings or {}), activity_uuid=f"learning_activity_{uuid4()}",
            creation_date=now, update_date=now,
        )
        target_activity.settings = {**target_activity.settings, "version_lineage_uuid": (source_activity.settings or {}).get("version_lineage_uuid") or source_activity.activity_uuid}
        db_session.add(target_activity)
        db_session.flush()
        activity_pairs.append((source_activity, target_activity))
        for source_page in db_session.exec(select(LearningPage).where(LearningPage.activity_id == source_activity.id).order_by(LearningPage.order.asc())).all():  # type: ignore
            next_uuid = f"learning_page_{uuid4()}"
            page_replacements[source_page.page_uuid] = next_uuid
            target_page = LearningPage(
                activity_id=target_activity.id or 0, badge_id=badge.id or 0, version_id=target.id,
                org_id=badge.org_id, page_type=source_page.page_type, title=source_page.title,
                order=source_page.order, required=source_page.required, content=deepcopy(source_page.content or {}),
                design=deepcopy(source_page.design or {}), scoring=deepcopy(source_page.scoring or {}),
                completion=deepcopy(source_page.completion or {}), page_uuid=next_uuid,
                creation_date=now, update_date=now,
            )
            target_page.content = {**target_page.content, "version_lineage_uuid": (source_page.content or {}).get("version_lineage_uuid") or source_page.page_uuid}
            db_session.add(target_page)
    db_session.flush()
    for _, target_activity in activity_pairs:
        target_activity.settings = _replace_uuid_values(target_activity.settings, page_replacements)
        db_session.add(target_activity)
    target_pages = db_session.exec(select(LearningPage).where(LearningPage.version_id == target.id)).all()
    for target_page in target_pages:
        target_page.content = {**_replace_uuid_values(target_page.content, page_replacements), "version_lineage_uuid": target_page.content["version_lineage_uuid"]}
        target_page.design = _replace_uuid_values(target_page.design, page_replacements)
        target_page.scoring = _replace_uuid_values(target_page.scoring, page_replacements)
        target_page.completion = _replace_uuid_values(target_page.completion, page_replacements)
        db_session.add(target_page)


def _version_graph_summary(db_session: Session, version: LearningBadgeVersion) -> dict:
    activities = db_session.exec(select(LearningActivity).where(LearningActivity.version_id == version.id)).all()
    pages = db_session.exec(select(LearningPage).where(LearningPage.version_id == version.id)).all()
    activity_items = {}
    activity_lineage_by_id = {}
    for item in activities:
        settings = deepcopy(item.settings or {})
        lineage_uuid = settings.pop("version_lineage_uuid", None) or item.activity_uuid
        activity_items[lineage_uuid] = {
            "title": item.title, "description": item.description, "thumbnail_image": item.thumbnail_image,
            "icon": item.icon, "order": item.order, "required": item.required, "settings": settings,
        }
        activity_lineage_by_id[item.id] = lineage_uuid
    page_items = {}
    for item in pages:
        content = deepcopy(item.content or {})
        lineage_uuid = content.pop("version_lineage_uuid", None) or item.page_uuid
        page_items[lineage_uuid] = {
            "title": item.title, "order": item.order, "required": item.required, "page_type": item.page_type,
            "content": content, "design": item.design, "scoring": item.scoring, "completion": item.completion,
            "activity_lineage_uuid": activity_lineage_by_id.get(item.activity_id),
        }
    return {"definition": version.definition or {}, "activities": activity_items, "pages": page_items}


def _map_diff(before: dict, after: dict) -> dict:
    before_keys, after_keys = set(before), set(after)
    return {
        "added": sorted(after_keys - before_keys), "deleted": sorted(before_keys - after_keys),
        "modified": sorted(key for key in before_keys & after_keys if before[key] != after[key]),
    }


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
    "protected": "Protection settings",
    "system_type": "System settings",
}


def _version_change_sections(previous: dict, current: dict) -> dict:
    definition_fields = {
        key
        for key in set(previous["definition"]) | set(current["definition"])
        if previous["definition"].get(key) != current["definition"].get(key)
    }
    before_activities = previous["activities"]
    after_activities = current["activities"]
    before_keys, after_keys = set(before_activities), set(after_activities)
    added_keys = after_keys - before_keys
    deleted_keys = before_keys - after_keys

    activity_settings_changed = {
        key
        for key in before_keys & after_keys
        if before_activities[key].get("settings") != after_activities[key].get("settings")
    }
    activity_content_changed = {
        key
        for key in before_keys & after_keys
        if {k: v for k, v in before_activities[key].items() if k != "settings"}
        != {k: v for k, v in after_activities[key].items() if k != "settings"}
    }

    page_diff = _map_diff(previous["pages"], current["pages"])
    for change_type in ("added", "modified", "deleted"):
        source = current["pages"] if change_type != "deleted" else previous["pages"]
        for page_key in page_diff[change_type]:
            activity_key = source.get(page_key, {}).get("activity_lineage_uuid")
            if activity_key and activity_key not in added_keys and activity_key not in deleted_keys:
                activity_content_changed.add(activity_key)

    modified = [
        after_activities[key]["title"]
        for key in sorted(activity_content_changed)
        if key in after_activities
    ]
    modified.extend(
        f'Removed “{before_activities[key]["title"]}”' for key in sorted(deleted_keys)
    )
    return {
        "achievement_definition": [
            _DEFINITION_FIELD_LABELS.get(key, key.replace("_", " ").title())
            for key in sorted(definition_fields - set(_DEFINITION_SETTING_LABELS))
        ],
        "activities_added": [after_activities[key]["title"] for key in sorted(added_keys)],
        "activities_modified": modified,
        "settings_changed": [
            _DEFINITION_SETTING_LABELS[key]
            for key in sorted(definition_fields & set(_DEFINITION_SETTING_LABELS))
        ] + [
            f'{after_activities[key]["title"]} activity settings'
            for key in sorted(activity_settings_changed)
        ],
    }


async def list_badge_versions(request: Request, badge_uuid: str, current_user, db_session: Session) -> list[dict]:
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    versions = db_session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id).order_by(LearningBadgeVersion.update_date.desc())).all()  # type: ignore
    return [lookups._version_summary(item, badge.active_version_id) for item in versions]


async def create_badge_version_draft(request: Request, badge_uuid: str, data: LearningBadgeVersionCreate, current_user, db_session: Session) -> dict:
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
    db_session.flush()
    if source:
        _clone_version_graph(db_session, badge, source, draft)
    else:
        lookups._get_path_for_badge(db_session, badge, draft)
    db_session.commit()
    db_session.refresh(draft)
    return lookups._version_summary(draft, badge.active_version_id)


async def update_badge_version_draft(request: Request, badge_uuid: str, version_uuid: str, data: LearningBadgeVersionUpdate, current_user, db_session: Session) -> dict:
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    current = _version_graph_summary(db_session, version)
    base = db_session.get(LearningBadgeVersion, version.based_on_version_id) if version.based_on_version_id else None
    previous = _version_graph_summary(db_session, base) if base else {"definition": {}, "activities": {}, "pages": {}}
    return {
        "revision": version.revision,
        "change_sections": _version_change_sections(previous, current),
        "definition_fields": sorted(key for key in set(previous["definition"]) | set(current["definition"]) if previous["definition"].get(key) != current["definition"].get(key)),
        "activities": _map_diff(previous["activities"], current["activities"]),
        "pages": _map_diff(previous["pages"], current["pages"]),
    }


def _parse_semver(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", value.strip())
    if not match:
        raise HTTPException(status_code=422, detail="Version must use major.minor.patch format")
    return tuple(int(item) for item in match.groups())  # type: ignore[return-value]


async def publish_badge_version(request: Request, badge_uuid: str, version_uuid: str, data: LearningBadgeVersionPublish, current_user, db_session: Session) -> dict:
    badge = enrollment._get_badge(db_session, badge_uuid)
    admin = access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
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
    badge = enrollment._get_badge(db_session, badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, version_uuid)
    lookups._ensure_draft(version)
    db_session.delete(version)
    db_session.commit()
    return {"detail": "Draft deleted"}
