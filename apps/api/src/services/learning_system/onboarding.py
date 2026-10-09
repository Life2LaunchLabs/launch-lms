"""Keep the system "Launch Ready" onboarding badge in sync with launch_ready.json.

The badge, its Welcome activity and the retired Launch Ready activities are
described as data (Activity Documents plus a little system metadata) instead
of code. Two sync policies apply to activities and pages:

- ``seed``: created once, then left to admins (only placement and missing
  variable bindings are restored). The Welcome activity and its name/goal
  pages are seeded.
- ``managed``: rewritten from the data on every sync. Stale system pages are
  removed.
"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from sqlmodel import Session, func, select

from src.db.learning import (
    BadgeCollection,
    LearningActivity,
    LearningActivityRun,
    LearningBadge,
    LearningBadgeStatus,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPage,
    LearningPageProgress,
    LearningPageType,
    LearningPath,
    LearningResponseAttempt,
)
from src.db.organizations import Organization
from src.services.learning_page_convert import find_question_block

DATA_PATH = Path(__file__).with_name("launch_ready.json")
SYSTEM_PAGE_PREFIX = "learning_page_system_onboarding_"


@lru_cache(maxsize=1)
def launch_ready_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def _merge_variable_bindings(page: LearningPage, defaults: dict) -> None:
    """Restore missing variable bindings without overwriting admin edits."""

    def merged(completion: dict) -> dict:
        existing = completion.get("variable_bindings") or {}
        if not isinstance(existing, dict):
            existing = {}
        for section, values in defaults.items():
            target = existing.get(section)
            if not isinstance(target, dict):
                target = {}
            for key, binding in values.items():
                if not target.get(key):
                    target[key] = binding
            existing[section] = target
        return existing

    content = deepcopy(page.content or {})
    block = find_question_block(content)
    if block and isinstance(block.get("completion"), dict) and block.get("completion"):
        completion = block.get("completion") or {}
        completion["variable_bindings"] = merged(completion)
        block["completion"] = completion
        page.content = content
        return
    completion = deepcopy(page.completion or {})
    completion["variable_bindings"] = merged(completion)
    page.completion = completion


def _default_bindings(page_data: dict) -> dict:
    block = find_question_block(page_data.get("content")) or {}
    return deepcopy((block.get("completion") or {}).get("variable_bindings") or {})


def _delete_activity_with_history(db_session: Session, activity: LearningActivity) -> None:
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all()
    for page in pages:
        for model in (LearningPageProgress, LearningResponseAttempt):
            for row in db_session.exec(select(model).where(model.page_id == page.id)).all():  # type: ignore[attr-defined]
                db_session.delete(row)
        db_session.delete(page)
    for activity_run in db_session.exec(select(LearningActivityRun).where(LearningActivityRun.activity_id == activity.id)).all():
        for progress in db_session.exec(select(LearningPageProgress).where(LearningPageProgress.activity_run_id == activity_run.id)).all():
            db_session.delete(progress)
        db_session.delete(activity_run)
    db_session.delete(activity)


def _remove_legacy_activities(db_session: Session, badge: LearningBadge, system_uuids: set[str]) -> None:
    from src.services.learning import LEGACY_LAUNCH_READY_ACTIVITY_UUIDS

    stale_profiles = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.badge_id == badge.id,
            func.lower(LearningActivity.title).in_(("complete your profile", "complete your portfolio")),  # type: ignore[attr-defined]
            LearningActivity.activity_uuid.notin_(system_uuids),  # type: ignore[union-attr]
        )
    ).all()
    for activity in stale_profiles:
        db_session.delete(activity)
    legacy = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.badge_id == badge.id,
            LearningActivity.activity_uuid.in_(LEGACY_LAUNCH_READY_ACTIVITY_UUIDS),  # type: ignore[union-attr]
        )
    ).all()
    for activity in legacy:
        _delete_activity_with_history(db_session, activity)
    if stale_profiles or legacy:
        db_session.flush()


def _sync_collection(db_session: Session, org: Organization, now: str) -> BadgeCollection:
    from src.services.learning import ONBOARDING_COLLECTION_UUID

    data = launch_ready_data()["collection"]
    collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == ONBOARDING_COLLECTION_UUID)).first()
    if not collection:
        collection = BadgeCollection(org_id=org.id or 0, collection_uuid=ONBOARDING_COLLECTION_UUID, creation_date=now, **data)
    collection.org_id = org.id or collection.org_id
    for key in ("public", "hidden", "protected", "system_type"):
        setattr(collection, key, data[key])
    collection.update_date = now
    db_session.add(collection)
    db_session.flush()
    return collection


def _sync_badge(db_session: Session, org: Organization, collection: BadgeCollection, now: str) -> LearningBadge:
    from src.services.learning import ONBOARDING_BADGE_UUID

    data = launch_ready_data()["badge"]
    badge = db_session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == ONBOARDING_BADGE_UUID)).first()
    if not badge:
        badge = LearningBadge(
            org_id=org.id or 0,
            badge_uuid=ONBOARDING_BADGE_UUID,
            direct_conferral_enabled=data["direct_conferral_enabled"],
            creation_date=now,
            name=data["name"],
        )
    badge.org_id = org.id or badge.org_id
    badge.collection_id = collection.id
    for key in ("name", "description", "about", "criteria", "public", "protected", "system_type"):
        setattr(badge, key, data[key])
    badge.status = LearningBadgeStatus(data["status"])
    badge.badge_metadata = {**(badge.badge_metadata or {}), **data["badge_metadata"]}
    badge.update_date = now
    db_session.add(badge)
    db_session.flush()
    return badge


def _sync_version_and_path(db_session: Session, org: Organization, badge: LearningBadge, now: str):
    from src.services.learning import _badge_definition, _get_path_for_badge

    version = db_session.exec(
        select(LearningBadgeVersion).where(
            LearningBadgeVersion.badge_id == badge.id,
            LearningBadgeVersion.state == LearningBadgeVersionState.PUBLISHED,
        )
    ).first()
    if not version:
        data = launch_ready_data()["version"]
        version = LearningBadgeVersion(
            version_uuid=f"badge_version_{uuid4()}",
            badge_id=badge.id or 0,
            org_id=badge.org_id,
            state=LearningBadgeVersionState(data["state"]),
            semantic_version=data["semantic_version"],
            title=data["title"],
            definition=_badge_definition(badge),
            published_at=datetime.utcnow(),
            creation_date=now,
            update_date=now,
        )
        db_session.add(version)
        db_session.flush()
    badge.active_version_id = version.id
    db_session.add(badge)
    path: LearningPath = _get_path_for_badge(db_session, badge, version)
    path.org_id = org.id or path.org_id
    path.update_date = now
    db_session.add(path)
    db_session.flush()
    return version, path


def _sync_activity(db_session: Session, entry: dict, *, org: Organization, badge: LearningBadge, path: LearningPath, now: str) -> LearningActivity:
    system, document = entry["system"], entry["document"]
    meta = document["activity"]
    seeded = system["policy"] == "seed"
    settings = {**meta["settings"], **system["hidden_settings"]}
    activity = db_session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == meta["activity_uuid"])).first()
    if not activity:
        activity = LearningActivity(
            activity_uuid=meta["activity_uuid"],
            title=meta["title"],
            description=meta["description"],
            icon=meta["icon"],
            settings=settings,
            path_id=path.id or 0,
            badge_id=badge.id or 0,
            org_id=org.id or 0,
            creation_date=now,
        )
    elif not seeded:
        activity.title, activity.description = meta["title"], meta["description"]
    activity.path_id, activity.badge_id, activity.org_id = path.id or 0, badge.id or 0, org.id or 0
    activity.version_id = path.version_id
    activity.thumbnail_image = activity.thumbnail_image or meta["thumbnail_image"]
    activity.order = system["order"]
    activity.required, activity.published = meta["required"], system["published"]
    merged = {**(activity.settings or {}), **settings}
    if "flow" not in settings:
        merged.pop("flow", None)
    activity.settings = merged
    activity.update_date = now
    db_session.add(activity)
    db_session.flush()
    _sync_pages(db_session, entry, activity=activity, org=org, badge=badge, path=path, now=now)
    return activity


def _sync_pages(db_session: Session, entry: dict, *, activity: LearningActivity, org: Organization, badge: LearningBadge, path: LearningPath, now: str) -> None:
    seed_pages = set(entry["system"]["seed_pages"])
    desired = []
    for order, data in enumerate(entry["document"]["pages"], start=1):
        desired.append(data["page_uuid"])
        page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == data["page_uuid"])).first()
        if page is None:
            page = LearningPage(
                page_uuid=data["page_uuid"],
                page_type=LearningPageType(data["page_type"]),
                title=data["title"],
                content=deepcopy(data["content"]),
                design=deepcopy(data["design"]),
                scoring=deepcopy(data["scoring"]),
                completion=deepcopy(data["completion"]),
                activity_id=activity.id or 0,
                badge_id=badge.id or 0,
                org_id=org.id or 0,
                creation_date=now,
            )
        elif data["page_uuid"] in seed_pages:
            _merge_variable_bindings(page, _default_bindings(data))
        else:
            page.page_type = LearningPageType(data["page_type"])
            page.title, page.content = data["title"], deepcopy(data["content"])
        page.activity_id, page.badge_id, page.org_id = activity.id or 0, badge.id or 0, org.id or 0
        page.version_id = path.version_id
        page.order, page.required = order, data["required"]
        page.update_date = now
        db_session.add(page)
    if entry["system"]["policy"] == "managed":
        for stale in db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all():
            if stale.page_uuid.startswith(SYSTEM_PAGE_PREFIX) and stale.page_uuid not in desired:
                db_session.delete(stale)
    db_session.flush()


def sync_launch_ready_badge(db_session: Session) -> tuple[Organization, BadgeCollection, LearningBadge, LearningActivity]:
    """Create or update the onboarding badge to match launch_ready.json."""
    from src.services.learning import ONBOARDING_ACTIVITY_UUID, _get_owner_org, _now

    org = _get_owner_org(db_session)
    now = _now()
    collection = _sync_collection(db_session, org, now)
    badge = _sync_badge(db_session, org, collection, now)
    _version, path = _sync_version_and_path(db_session, org, badge, now)
    entries = launch_ready_data()["activities"]
    _remove_legacy_activities(db_session, badge, {entry["document"]["activity"]["activity_uuid"] for entry in entries})
    welcome = None
    for entry in entries:
        activity = _sync_activity(db_session, entry, org=org, badge=badge, path=path, now=now)
        if activity.activity_uuid == ONBOARDING_ACTIVITY_UUID:
            welcome = activity
    db_session.commit()
    for item in (collection, badge, welcome):
        db_session.refresh(item)
    assert welcome is not None, "launch_ready.json must define the Welcome activity"
    return org, collection, badge, welcome
