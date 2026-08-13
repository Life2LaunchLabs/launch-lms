import json
from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException, UploadFile
from sqlmodel import Session
from starlette.datastructures import Headers

from src.db.learning import LearningBadgeCreate, LearningBadgeStatus, OpenBadgeImport
from src.db.media import MediaOwnerType, MediaType
from src.db.users import AnonymousUser, PublicUser
from src.services import learning as learning_service, media as media_service
from src.services.utils.link_preview import _validate_url

_MAX_JSON_BYTES = 1024 * 1024
_MAX_IMAGE_BYTES = 20 * 1024 * 1024
_HEADERS = {
    "User-Agent": "LaunchLMS Open Badges Importer/1.0",
    "Accept": "application/ld+json,application/json,image/*;q=0.9,*/*;q=0.1",
}
_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def _resource_id(value: object) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        resource_id = value.get("id") or value.get("@id")
        return resource_id.strip() if isinstance(resource_id, str) and resource_id.strip() else None
    return None


def parse_open_badge(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Open Badge JSON must be an object")

    badge_type = payload.get("type") or payload.get("@type")
    types = badge_type if isinstance(badge_type, list) else [badge_type]
    if "BadgeClass" not in types and "Achievement" not in types:
        raise HTTPException(status_code=400, detail="JSON must describe an Open Badges BadgeClass or Achievement")

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=400, detail="Open Badge JSON is missing a badge name")

    description = payload.get("description")
    if not isinstance(description, str):
        description = ""

    criteria_value = payload.get("criteria")
    criteria = ""
    if isinstance(criteria_value, str):
        criteria = criteria_value.strip()
    elif isinstance(criteria_value, dict):
        narrative = criteria_value.get("narrative")
        criteria_id = _resource_id(criteria_value)
        criteria = narrative.strip() if isinstance(narrative, str) and narrative.strip() else (criteria_id or "")

    return {
        "name": name.strip(),
        "description": description.strip(),
        "criteria": criteria,
        "image_url": _resource_id(payload.get("image")),
        "issuer_url": _resource_id(payload.get("issuer")),
        "source_id": _resource_id(payload.get("id")),
    }


async def _fetch(url: str, *, max_bytes: int) -> tuple[bytes, str, str]:
    current_url = _validate_url(url)
    async with httpx.AsyncClient(follow_redirects=False, timeout=20, headers=_HEADERS) as client:
        for _ in range(6):
            async with client.stream("GET", current_url) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise HTTPException(status_code=400, detail="Remote badge resource returned an invalid redirect")
                    current_url = _validate_url(urljoin(current_url, location))
                    continue
                if response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Could not download badge resource (HTTP {response.status_code})")

                content_length = response.headers.get("content-length")
                if content_length and content_length.isdigit() and int(content_length) > max_bytes:
                    raise HTTPException(status_code=413, detail="Remote badge resource is too large")

                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise HTTPException(status_code=413, detail="Remote badge resource is too large")
                    chunks.append(chunk)
                content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
                return b"".join(chunks), content_type, current_url
    raise HTTPException(status_code=400, detail="Remote badge resource redirected too many times")


async def _fetch_issuer(url: str) -> dict:
    content, _content_type, _final_url = await _fetch(url, max_bytes=_MAX_JSON_BYTES)
    try:
        payload = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Badge issuer did not return valid JSON") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Badge issuer JSON must be an object")
    return payload


async def _download_image_to_library(
    url: str,
    org_id: int,
    badge_name: str,
    current_user: PublicUser,
    db_session: Session,
):
    content, content_type, final_url = await _fetch(url, max_bytes=_MAX_IMAGE_BYTES)
    if content_type not in _IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Badge image has an unsupported type: {content_type or 'unknown'}")
    source_name = PurePosixPath(urlparse(final_url).path).name
    filename = source_name if "." in source_name else f"badge{_IMAGE_EXTENSIONS[content_type]}"
    upload = UploadFile(
        filename=filename,
        file=BytesIO(content),
        headers=Headers({"content-type": content_type}),
    )
    return await media_service.upload_media_asset(
        MediaOwnerType.org,
        org_id,
        MediaType.image,
        upload,
        current_user,
        db_session,
        title=f"{badge_name} badge image",
        folder="Badge imports",
        commit=False,
    )


async def import_open_badge(
    request,
    data: OpenBadgeImport,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    learning_service._require_org_admin(db_session, current_user, data.org_id)
    parsed = parse_open_badge(data.badge)
    warnings: list[str] = []

    issuer_metadata = None
    if parsed["issuer_url"]:
        try:
            issuer_metadata = await _fetch_issuer(parsed["issuer_url"])
        except (HTTPException, httpx.HTTPError):
            warnings.append("The issuer metadata could not be downloaded; its URL was preserved instead.")

    image_asset = None
    if parsed["image_url"]:
        try:
            image_asset = await _download_image_to_library(
                parsed["image_url"], data.org_id, parsed["name"], current_user, db_session
            )
        except httpx.HTTPError as error:
            raise HTTPException(status_code=400, detail="Could not download the badge image") from error
    else:
        warnings.append("The imported badge did not specify an image.")

    imported_metadata = {
        "format": "Open Badges",
        "source_id": parsed["source_id"],
        "badge_class": data.badge,
        "issuer": issuer_metadata or ({"id": parsed["issuer_url"]} if parsed["issuer_url"] else None),
        "imported_at": datetime.now().isoformat(),
    }
    badge = await learning_service.create_badge(
        request,
        LearningBadgeCreate(
            org_id=data.org_id,
            collection_id=data.collection_id,
            name=parsed["name"],
            description=parsed["description"],
            about=parsed["description"],
            criteria=parsed["criteria"],
            thumbnail_image=image_asset.url if image_asset else "",
            public=True,
            status=LearningBadgeStatus.DRAFT,
            badge_metadata={"open_badges_import": imported_metadata},
        ),
        current_user,
        db_session,
    )
    return {
        "badge": badge.model_dump(),
        "media_asset": image_asset.model_dump() if image_asset else None,
        "warnings": warnings,
    }
