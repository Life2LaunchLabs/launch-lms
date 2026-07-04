from __future__ import annotations

import io
import json
import os
import shutil
import zipfile
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session, select

from src.db.learning import BadgeCollection, LearningActivity, LearningBadge, LearningPage, LearningPath
from src.db.users import AnonymousUser, PublicUser
from src.services import learning as learning_service
from src.services.courses.transfer.import_service import (
    MAX_COMPRESSION_RATIO,
    MAX_PACKAGE_SIZE,
    TEMP_IMPORT_DIR,
    import_courses,
    sanitize_path,
    validate_zip,
)
from src.services.courses.transfer.models import ImportOptions


LEARNING_EXPORT_FORMAT = "launch-lms-badge-export"
LEGACY_COURSE_EXPORT_FORMAT = "launch-lms-course-export"


def _now() -> str:
    return str(datetime.now())


def _normalize_collection_uuid(value: str) -> str:
    return value if value.startswith(("badge_collection_", "collection_")) else f"badge_collection_{value}"


def _get_collection(db_session: Session, collection_uuid: str) -> BadgeCollection:
    collection = db_session.exec(
        select(BadgeCollection).where(BadgeCollection.collection_uuid == _normalize_collection_uuid(collection_uuid))
    ).first()
    if not collection:
        collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == collection_uuid)).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    return collection


def _read_json(path: str) -> dict:
    with open(path, "r") as handle:
        return json.load(handle)


def _write_json(zip_file: zipfile.ZipFile, path: str, payload: dict) -> None:
    zip_file.writestr(path, json.dumps(payload, indent=2, default=str))


async def export_badge_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> bytes:
    collection = _get_collection(db_session, collection_uuid)
    learning_service._require_org_admin(db_session, current_user, collection.org_id)
    org = learning_service._get_org(db_session, collection.org_id)
    badges = db_session.exec(
        select(LearningBadge).where(LearningBadge.collection_id == collection.id).order_by(LearningBadge.creation_date.asc())  # type: ignore
    ).all()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        badge_entries = []
        _write_json(
            zip_file,
            "collection/collection.json",
            {
                key: value
                for key, value in collection.model_dump().items()
                if key not in {"id", "org_id", "creation_date", "update_date"}
            },
        )

        for badge in badges:
            badge_path = f"badges/{badge.badge_uuid}"
            badge_entries.append({"badge_uuid": badge.badge_uuid, "name": badge.name, "path": badge_path})
            _export_badge(zip_file, badge_path, badge, db_session)

        manifest = {
            "version": "1.0.0",
            "format": LEARNING_EXPORT_FORMAT,
            "created_at": datetime.now().isoformat(),
            "organization": {"org_uuid": org.org_uuid, "name": org.name},
            "collection": {"collection_uuid": collection.collection_uuid, "name": collection.name, "path": "collection"},
            "badges": badge_entries,
        }
        _write_json(zip_file, "manifest.json", manifest)

    buffer.seek(0)
    return buffer.getvalue()


def _export_badge(zip_file: zipfile.ZipFile, badge_path: str, badge: LearningBadge, db_session: Session) -> None:
    _write_json(
        zip_file,
        f"{badge_path}/badge.json",
        {
            key: value
            for key, value in badge.model_dump().items()
            if key not in {"id", "org_id", "collection_id", "creation_date", "update_date"}
        },
    )
    path = db_session.exec(select(LearningPath).where(LearningPath.badge_id == badge.id)).first()
    if path:
        _write_json(
            zip_file,
            f"{badge_path}/path.json",
            {
                key: value
                for key, value in path.model_dump().items()
                if key not in {"id", "badge_id", "org_id", "creation_date", "update_date"}
            },
        )
    activities = db_session.exec(
        select(LearningActivity).where(LearningActivity.badge_id == badge.id).order_by(LearningActivity.order.asc())  # type: ignore
    ).all()
    for activity in activities:
        activity_path = f"{badge_path}/activities/{activity.activity_uuid}"
        _write_json(
            zip_file,
            f"{activity_path}/activity.json",
            {
                key: value
                for key, value in activity.model_dump().items()
                if key not in {"id", "path_id", "badge_id", "org_id", "creation_date", "update_date"}
            },
        )
        pages = db_session.exec(
            select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())  # type: ignore
        ).all()
        for page in pages:
            _write_json(
                zip_file,
                f"{activity_path}/pages/{page.page_uuid}.json",
                {
                    key: value
                    for key, value in page.model_dump().items()
                    if key not in {"id", "activity_id", "badge_id", "org_id", "creation_date", "update_date"}
                },
            )


async def analyze_badge_import_package(
    request: Request,
    zip_file: UploadFile,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    learning_service._require_org_admin(db_session, current_user, org_id)
    content = await zip_file.read()
    if len(content) > MAX_PACKAGE_SIZE:
        raise HTTPException(status_code=413, detail=f"Package too large. Maximum size is {MAX_PACKAGE_SIZE / 1024 / 1024:.0f}MB")
    if not validate_zip(content):
        raise HTTPException(status_code=415, detail="Invalid file format. Package must be a ZIP file.")

    temp_id = str(uuid4())
    temp_dir = os.path.join(TEMP_IMPORT_DIR, temp_id)
    try:
        extract_dir = _extract_zip(content, temp_dir)
        manifest_path = os.path.join(extract_dir, "manifest.json")
        if not os.path.exists(manifest_path):
            raise HTTPException(status_code=400, detail="Invalid package: manifest.json not found")
        manifest = _read_json(manifest_path)
        package_format = manifest.get("format")

        if package_format == LEARNING_EXPORT_FORMAT:
            badges = []
            for badge_entry in manifest.get("badges", []):
                badge_path = os.path.join(extract_dir, badge_entry.get("path", ""))
                badge_data = _read_json(os.path.join(badge_path, "badge.json"))
                badges.append({
                    "badge_uuid": badge_data.get("badge_uuid") or badge_entry.get("badge_uuid"),
                    "name": badge_data.get("name") or badge_entry.get("name") or "Untitled Badge",
                    "description": badge_data.get("description") or "",
                    "activities_count": _count_activity_dirs(badge_path),
                    "pages_count": _count_page_files(badge_path),
                    "has_thumbnail": bool(badge_data.get("thumbnail_image")),
                })
            if not badges:
                raise HTTPException(status_code=400, detail="Invalid package: No valid badges found")
            return {
                "temp_id": temp_id,
                "version": manifest.get("version", "1.0.0"),
                "source_format": LEARNING_EXPORT_FORMAT,
                "requires_conversion": False,
                "badges": badges,
                "courses": [],
            }

        if package_format == LEGACY_COURSE_EXPORT_FORMAT:
            analysis = await _analyze_legacy_course_export(extract_dir, manifest)
            return {
                "temp_id": temp_id,
                "version": manifest.get("version", "1.0.0"),
                "source_format": LEGACY_COURSE_EXPORT_FORMAT,
                "requires_conversion": True,
                "badges": [],
                "courses": analysis,
            }

        raise HTTPException(status_code=400, detail="Invalid package: Unsupported import format")
    except HTTPException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error analyzing package: {exc}")


def _extract_zip(content: bytes, temp_dir: str) -> str:
    os.makedirs(temp_dir, exist_ok=True)
    zip_path = os.path.join(temp_dir, "package.zip")
    with open(zip_path, "wb") as handle:
        handle.write(content)
    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        total_size = sum(info.file_size for info in zip_ref.infolist())
        if total_size > len(content) * MAX_COMPRESSION_RATIO:
            raise HTTPException(status_code=400, detail="Invalid package: Suspicious compression ratio")
        for info in zip_ref.infolist():
            safe_path = sanitize_path(info.filename)
            if not safe_path:
                continue
            target_path = os.path.join(extract_dir, safe_path)
            if not os.path.abspath(target_path).startswith(os.path.abspath(extract_dir)):
                continue
            if info.is_dir():
                os.makedirs(target_path, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with zip_ref.open(info) as source, open(target_path, "wb") as target:
                    shutil.copyfileobj(source, target)
    return extract_dir


async def _analyze_legacy_course_export(extract_dir: str, manifest: dict) -> list[dict]:
    courses = []
    for course_entry in manifest.get("courses", []):
        course_path = os.path.join(extract_dir, course_entry.get("path", ""))
        course_json_path = os.path.join(course_path, "course.json")
        if not os.path.exists(course_json_path):
            continue
        course_data = _read_json(course_json_path)
        courses.append({
            "course_uuid": course_data.get("course_uuid"),
            "name": course_data.get("name", "Untitled Course"),
            "description": course_data.get("description"),
            "chapters_count": _count_chapter_dirs(course_path),
            "activities_count": _count_legacy_activity_dirs(course_path),
            "has_thumbnail": bool(course_data.get("thumbnail_image") or course_data.get("thumbnail_video")),
            "media_count": 0,
        })
    if not courses:
        raise HTTPException(status_code=400, detail="Invalid package: No valid courses found")
    return courses


async def import_badge_package(
    request: Request,
    org_id: int,
    payload: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    temp_id = payload.get("temp_id")
    if not temp_id:
        raise HTTPException(status_code=400, detail="temp_id is required")
    temp_dir = os.path.join(TEMP_IMPORT_DIR, temp_id)
    extract_dir = os.path.join(temp_dir, "extracted")
    manifest_path = os.path.join(extract_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(status_code=404, detail="Package not found. Please upload and analyze again.")
    manifest = _read_json(manifest_path)
    package_format = manifest.get("format")

    if package_format == LEGACY_COURSE_EXPORT_FORMAT:
        options = ImportOptions(
            course_uuids=payload.get("course_uuids") or [],
            name_prefix=payload.get("name_prefix"),
            set_private=payload.get("set_private", True),
            set_unpublished=payload.get("set_unpublished", True),
            collection_uuid=None,
        )
        result = await import_courses(request, temp_id, org_id, options, current_user, db_session)
        return {**result.model_dump(), "source_format": LEGACY_COURSE_EXPORT_FORMAT, "requires_conversion": True}

    if package_format != LEARNING_EXPORT_FORMAT:
        raise HTTPException(status_code=400, detail="Unsupported import package")

    target_collection = _get_collection(db_session, payload.get("collection_uuid") or "")
    if target_collection.org_id != org_id:
        raise HTTPException(status_code=409, detail="Badge collection does not belong to this organization")
    learning_service._require_org_admin(db_session, current_user, org_id)

    badge_uuids = set(payload.get("badge_uuids") or [])
    if not badge_uuids:
        raise HTTPException(status_code=400, detail="At least one badge is required")

    results = []
    for badge_entry in manifest.get("badges", []):
        original_uuid = badge_entry.get("badge_uuid")
        if original_uuid not in badge_uuids:
            continue
        try:
            new_badge = _import_single_badge(
                os.path.join(extract_dir, badge_entry.get("path", "")),
                org_id,
                target_collection,
                payload.get("name_prefix"),
                db_session,
            )
            results.append({"original_uuid": original_uuid, "new_uuid": new_badge.badge_uuid, "name": new_badge.name, "success": True})
        except Exception as exc:
            results.append({"original_uuid": original_uuid, "new_uuid": "", "name": badge_entry.get("name", ""), "success": False, "error": str(exc)})

    shutil.rmtree(temp_dir, ignore_errors=True)
    successful = len([result for result in results if result.get("success")])
    failed = len(results) - successful
    return {
        "source_format": LEARNING_EXPORT_FORMAT,
        "requires_conversion": False,
        "total_badges": len(results),
        "successful": successful,
        "failed": failed,
        "badges": results,
    }


def _import_single_badge(
    badge_path: str,
    org_id: int,
    target_collection: BadgeCollection,
    name_prefix: str | None,
    db_session: Session,
) -> LearningBadge:
    badge_data = _read_json(os.path.join(badge_path, "badge.json"))
    now = _now()
    name = badge_data.get("name") or "Untitled Badge"
    if name_prefix:
        name = f"{name_prefix} {name}"
    badge = LearningBadge(
        badge_uuid=f"badge_{uuid4()}",
        org_id=org_id,
        collection_id=target_collection.id,
        name=name,
        description=badge_data.get("description") or "",
        about=badge_data.get("about") or "",
        criteria=badge_data.get("criteria") or "",
        thumbnail_image=badge_data.get("thumbnail_image") or "",
        public=badge_data.get("public", True),
        published=badge_data.get("published", False),
        protected=False,
        system_type=None,
        direct_conferral_enabled=badge_data.get("direct_conferral_enabled", True),
        badge_metadata=badge_data.get("badge_metadata") or {},
        creation_date=now,
        update_date=now,
    )
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)

    path = learning_service._get_path_for_badge(db_session, badge)
    path_data_path = os.path.join(badge_path, "path.json")
    if os.path.exists(path_data_path):
        path_data = _read_json(path_data_path)
        path.title = path_data.get("title") or f"{badge.name} Path"
        path.description = path_data.get("description") or badge.description or ""
        path.update_date = now
        db_session.add(path)

    activities_dir = os.path.join(badge_path, "activities")
    if os.path.exists(activities_dir):
        for activity_dir_name in os.listdir(activities_dir):
            activity_dir = os.path.join(activities_dir, activity_dir_name)
            activity_json_path = os.path.join(activity_dir, "activity.json")
            if os.path.isdir(activity_dir) and os.path.exists(activity_json_path):
                _import_activity(activity_dir, _read_json(activity_json_path), org_id, badge, path, db_session)

    db_session.commit()
    return badge


def _import_activity(activity_dir: str, activity_data: dict, org_id: int, badge: LearningBadge, path: LearningPath, db_session: Session) -> LearningActivity:
    now = _now()
    activity = LearningActivity(
        activity_uuid=f"learning_activity_{uuid4()}",
        path_id=path.id or 0,
        badge_id=badge.id or 0,
        org_id=org_id,
        title=activity_data.get("title") or "Untitled Activity",
        description=activity_data.get("description") or "",
        thumbnail_image=activity_data.get("thumbnail_image") or "",
        icon=activity_data.get("icon"),
        order=activity_data.get("order") or 1,
        required=activity_data.get("required", True),
        published=False,
        settings=activity_data.get("settings") or {},
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    pages_dir = os.path.join(activity_dir, "pages")
    if os.path.exists(pages_dir):
        page_files = sorted([name for name in os.listdir(pages_dir) if name.endswith(".json")])
        for index, page_file in enumerate(page_files, start=1):
            page_data = _read_json(os.path.join(pages_dir, page_file))
            page = LearningPage(
                page_uuid=f"learning_page_{uuid4()}",
                activity_id=activity.id or 0,
                badge_id=badge.id or 0,
                org_id=org_id,
                page_type=page_data.get("page_type") or "info",
                title=page_data.get("title") or "Untitled Page",
                order=page_data.get("order") or index,
                required=page_data.get("required", True),
                content=page_data.get("content") or {},
                design=page_data.get("design") or {},
                scoring=page_data.get("scoring") or {},
                completion=page_data.get("completion") or {},
                creation_date=now,
                update_date=now,
            )
            db_session.add(page)
    return activity


def _count_activity_dirs(badge_path: str) -> int:
    activities_dir = os.path.join(badge_path, "activities")
    if not os.path.exists(activities_dir):
        return 0
    return len([name for name in os.listdir(activities_dir) if os.path.isdir(os.path.join(activities_dir, name))])


def _count_page_files(badge_path: str) -> int:
    count = 0
    activities_dir = os.path.join(badge_path, "activities")
    if not os.path.exists(activities_dir):
        return 0
    for activity_name in os.listdir(activities_dir):
        pages_dir = os.path.join(activities_dir, activity_name, "pages")
        if os.path.exists(pages_dir):
            count += len([name for name in os.listdir(pages_dir) if name.endswith(".json")])
    return count


def _count_chapter_dirs(course_path: str) -> int:
    chapters_dir = os.path.join(course_path, "chapters")
    if not os.path.exists(chapters_dir):
        return 0
    return len([name for name in os.listdir(chapters_dir) if os.path.isdir(os.path.join(chapters_dir, name))])


def _count_legacy_activity_dirs(course_path: str) -> int:
    count = 0
    chapters_dir = os.path.join(course_path, "chapters")
    if not os.path.exists(chapters_dir):
        return 0
    for chapter_name in os.listdir(chapters_dir):
        activities_dir = os.path.join(chapters_dir, chapter_name, "activities")
        if os.path.exists(activities_dir):
            count += len([name for name in os.listdir(activities_dir) if os.path.isdir(os.path.join(activities_dir, name))])
    return count
