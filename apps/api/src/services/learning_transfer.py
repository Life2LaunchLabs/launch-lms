"""Badge collection packages (zip): a collection and the definitions of its badges.

A badge is the credential, so a package carries each badge's definition from
its current version (name, criteria, image, Marketing and certificate
settings). The ways to earn a badge are plan templates, shared through the
plan library. Importing creates each badge with a draft version in the
chosen collection. Activities in packages from before badges were earned
through plans are not imported.
"""

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
from src.db.learning import BadgeCollection, LearningBadge, LearningBadgeCreate, LearningBadgeVersion
from src.db.users import AnonymousUser, PublicUser
from src.services import learning as learning_service

LEARNING_EXPORT_FORMAT = "launch-lms-badge-export"
PACKAGE_VERSION = "3.0.0"
MAX_PACKAGE_SIZE = 500 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
TEMP_IMPORT_DIR = "content/temp/badge-imports"
BADGE_FIELDS = ("name", "description", "about", "criteria", "thumbnail_image", "public", "direct_conferral_enabled", "badge_metadata")


def sanitize_path(path: str) -> str:
    normalized = os.path.normpath(path).replace("\\", "/").lstrip("/")
    return "" if normalized == ".." or normalized.startswith("../") else normalized


def validate_zip(content: bytes) -> None:
    if len(content) > MAX_PACKAGE_SIZE:
        raise HTTPException(status_code=413, detail=f"Package too large. Maximum size is {MAX_PACKAGE_SIZE // 1024 // 1024}MB")
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=415, detail="Invalid file format. Package must be a ZIP file.")


def _normalize_collection_uuid(value: str) -> str:
    return value if value.startswith(("badge_collection_", "collection_")) else f"badge_collection_{value}"


def _get_collection(db_session: Session, collection_uuid: str) -> BadgeCollection:
    for candidate in (_normalize_collection_uuid(collection_uuid), collection_uuid):
        collection = db_session.exec(
            select(BadgeCollection).where(BadgeCollection.collection_uuid == candidate, BadgeCollection.deleted_at.is_(None))  # type: ignore[union-attr]
        ).first()
        if collection:
            return collection
    raise HTTPException(status_code=404, detail="Badge collection not found")


def _read_json(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(zip_file: zipfile.ZipFile, path: str, payload: dict) -> None:
    zip_file.writestr(path, json.dumps(payload, indent=2, default=str, ensure_ascii=False))


def _export_version(db_session: Session, badge: LearningBadge) -> LearningBadgeVersion | None:
    """The version a package should carry: the active one, else the newest draft."""
    if badge.active_version_id:
        version = db_session.get(LearningBadgeVersion, badge.active_version_id)
        if version:
            return version
    return db_session.exec(
        select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id).order_by(LearningBadgeVersion.update_date.desc())  # type: ignore[union-attr]
    ).first()


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
        select(LearningBadge)
        .where(LearningBadge.collection_id == collection.id, LearningBadge.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(LearningBadge.creation_date.asc())  # type: ignore[union-attr]
    ).all()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        _write_json(zip_file, "collection/collection.json", {"name": collection.name, "description": collection.description or ""})
        entries = []
        for badge in badges:
            badge_path = f"badges/{badge.badge_uuid}"
            version = _export_version(db_session, badge)
            definition = {**{field: getattr(badge, field) for field in BADGE_FIELDS}, **((version.definition or {}) if version else {})}
            _write_json(zip_file, f"{badge_path}/badge.json", {"badge_uuid": badge.badge_uuid, **{field: definition.get(field) for field in BADGE_FIELDS}})
            entries.append({"badge_uuid": badge.badge_uuid, "name": badge.name, "path": badge_path})
        _write_json(
            zip_file,
            "manifest.json",
            {
                "format": LEARNING_EXPORT_FORMAT,
                "version": PACKAGE_VERSION,
                "created_at": datetime.now().isoformat(),
                "organization": {"org_uuid": org.org_uuid, "name": org.name},
                "badges": entries,
            },
        )
    buffer.seek(0)
    return buffer.getvalue()


def _extract_zip(content: bytes, temp_dir: str) -> str:
    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(content), "r") as zip_ref:
        if sum(info.file_size for info in zip_ref.infolist()) > len(content) * MAX_COMPRESSION_RATIO:
            raise HTTPException(status_code=400, detail="Invalid package: Suspicious compression ratio")
        for info in zip_ref.infolist():
            safe_path = sanitize_path(info.filename)
            target_path = os.path.join(extract_dir, safe_path)
            if not safe_path or not os.path.abspath(target_path).startswith(os.path.abspath(extract_dir)):
                continue
            if info.is_dir():
                os.makedirs(target_path, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with zip_ref.open(info) as source, open(target_path, "wb") as target:
                shutil.copyfileobj(source, target)
    return extract_dir


async def analyze_badge_import_package(
    request: Request,
    zip_file: UploadFile,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    learning_service._require_org_admin(db_session, current_user, org_id)
    learning_service._require_badge_creation_access(db_session, current_user, org_id)
    content = await zip_file.read()
    validate_zip(content)
    temp_id = str(uuid4())
    temp_dir = os.path.join(TEMP_IMPORT_DIR, temp_id)
    try:
        extract_dir = _extract_zip(content, temp_dir)
        manifest_path = os.path.join(extract_dir, "manifest.json")
        if not os.path.exists(manifest_path):
            raise HTTPException(status_code=400, detail="Invalid package: manifest.json not found")
        manifest = _read_json(manifest_path)
        if manifest.get("format") != LEARNING_EXPORT_FORMAT:
            raise HTTPException(status_code=400, detail="Invalid package: Unsupported import format")
        badges = []
        for entry in manifest.get("badges", []):
            badge_path = os.path.join(extract_dir, sanitize_path(entry.get("path", "")))
            badge_data = _read_json(os.path.join(badge_path, "badge.json"))
            badges.append(
                {
                    "badge_uuid": badge_data.get("badge_uuid") or entry.get("badge_uuid"),
                    "name": badge_data.get("name") or entry.get("name") or "Untitled Badge",
                    "description": badge_data.get("description") or "",
                    "has_thumbnail": bool(badge_data.get("thumbnail_image")),
                }
            )
        if not badges:
            raise HTTPException(status_code=400, detail="Invalid package: No valid badges found")
        return {"temp_id": temp_id, "version": manifest.get("version", "1.0.0"), "badges": badges}
    except HTTPException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except (OSError, ValueError, KeyError) as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Invalid package: {exc}") from exc


async def _import_single_badge(
    request: Request, badge_path: str, org_id: int, collection: BadgeCollection, name_prefix: str | None, current_user, db_session: Session
) -> LearningBadge:
    data = _read_json(os.path.join(badge_path, "badge.json"))
    name = data.get("name") or "Untitled Badge"
    created = await learning_service.create_badge(
        request,
        LearningBadgeCreate(
            org_id=org_id,
            collection_id=collection.id,
            name=f"{name_prefix} {name}" if name_prefix else name,
            **{field: data[field] for field in BADGE_FIELDS if field != "name" and data.get(field) is not None},
        ),
        current_user,
        db_session,
    )
    return db_session.get(LearningBadge, created.id)


async def import_badge_package(
    request: Request,
    org_id: int,
    payload: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    temp_id = str(payload.get("temp_id") or "")
    if not temp_id or sanitize_path(temp_id) != temp_id or "/" in temp_id:
        raise HTTPException(status_code=400, detail="temp_id is required")
    extract_dir = os.path.join(TEMP_IMPORT_DIR, temp_id, "extracted")
    manifest_path = os.path.join(extract_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(status_code=404, detail="Package not found. Please upload and analyze again.")
    manifest = _read_json(manifest_path)
    if manifest.get("format") != LEARNING_EXPORT_FORMAT:
        raise HTTPException(status_code=400, detail="Unsupported import package")
    collection = _get_collection(db_session, payload.get("collection_uuid") or "")
    if collection.org_id != org_id:
        raise HTTPException(status_code=409, detail="Badge collection does not belong to this organization")
    learning_service._require_org_admin(db_session, current_user, org_id)
    wanted = set(payload.get("badge_uuids") or [])
    if not wanted:
        raise HTTPException(status_code=400, detail="At least one badge is required")
    results = []
    for entry in manifest.get("badges", []):
        original_uuid = entry.get("badge_uuid")
        if original_uuid not in wanted:
            continue
        try:
            badge = await _import_single_badge(
                request, os.path.join(extract_dir, sanitize_path(entry.get("path", ""))), org_id, collection, payload.get("name_prefix"), current_user, db_session
            )
            results.append({"original_uuid": original_uuid, "new_uuid": badge.badge_uuid, "name": badge.name, "success": True})
        except HTTPException as exc:
            db_session.rollback()
            detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, default=str)
            results.append({"original_uuid": original_uuid, "new_uuid": "", "name": entry.get("name", ""), "success": False, "error": detail})
    shutil.rmtree(os.path.join(TEMP_IMPORT_DIR, temp_id), ignore_errors=True)
    successful = len([result for result in results if result["success"]])
    return {
        "total_badges": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "badges": results,
    }
