"""Bringing media in from elsewhere: fetching a public file safely (every redirect checked against private
addresses, and a size cap) and storing it in an organization's media library."""

from __future__ import annotations

import io
import mimetypes
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException, UploadFile
from sqlmodel import Session

from src.db.media import MediaAsset, MediaOwnerType, MediaType
from src.db.users import PublicUser
from src.services.utils.link_preview import _validate_url

MB = 1024 * 1024
# What one connector call may bring in. Videos are the large ones; anything bigger belongs in the web upload.
MAX_BYTES = {MediaType.image: 15 * MB, MediaType.video: 250 * MB, MediaType.document: 25 * MB}
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
              "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "application/pdf": ".pdf"}
_HEADERS = {"User-Agent": "LaunchLMS Media Library/1.0", "Accept": "*/*"}


async def download(url: str, limit: int) -> tuple[bytes, str, str]:
    """Fetch a public file, checking every redirect against private addresses and stopping past ``limit`` bytes."""
    current = _validate_url(url)
    async with httpx.AsyncClient(follow_redirects=False, timeout=60, headers=_HEADERS) as client:
        for _ in range(6):
            async with client.stream("GET", current) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        break
                    current = _validate_url(urljoin(current, location))
                    continue
                if response.status_code >= 400:
                    raise HTTPException(status_code=400, detail=f"The URL returned HTTP {response.status_code}")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > limit:
                    raise HTTPException(status_code=413, detail=f"File is over the {limit // MB} MB limit")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise HTTPException(status_code=413, detail=f"File is over the {limit // MB} MB limit")
                content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                return bytes(body), content_type, urlparse(current).path
    raise HTTPException(status_code=400, detail="Too many redirects")


def filename(name: str, content_type: str, media_type: MediaType) -> str:
    """A name whose extension says what the file is: the given one when it has one, else from its type."""
    name = (name or "").strip().rsplit("/", 1)[-1] or f"connector-{media_type.value}"
    if "." in name and len(name.rsplit(".", 1)[-1]) <= 5:
        return name
    return name + (EXTENSIONS.get(content_type) or mimetypes.guess_extension(content_type or "") or "")


async def store(db: Session, user: PublicUser, org_id: int, media_type: MediaType, content: bytes, name: str,
                title: str | None = None, folder: str | None = None, credit: dict | None = None) -> MediaAsset:
    """Save bytes to the organization's media library through the normal upload (type and content checks included)."""
    from src.services import media

    upload = UploadFile(file=io.BytesIO(content), filename=name, headers={"content-type": mimetypes.guess_type(name)[0] or ""})  # type: ignore[arg-type]
    asset = await media.upload_media_asset(MediaOwnerType.org, org_id, media_type, upload, user, db, title=title, folder=folder, commit=credit is None)
    if credit is not None:
        asset.credit = credit
        db.add(asset)
        db.commit()
        db.refresh(asset)
    return asset
