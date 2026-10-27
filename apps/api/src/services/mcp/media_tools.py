"""The connector's media tools: put an image, video or PDF into the organization's media library and get
back the address plans, badges and activities use (``/content/orgs/<org>/media/<file>``)."""

from __future__ import annotations

import base64
import binascii
import io
import mimetypes
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session

from src.db.media import MediaAsset, MediaOwnerType, MediaType
from src.services import media
from src.services.mcp.tool import Tool
from src.services.oauth.server import AccessContext
from src.services.utils.link_preview import _validate_url

MB = 1024 * 1024
# What one connector call may bring in. Videos are the large ones; anything bigger belongs in the web upload.
MAX_BYTES = {MediaType.image: 15 * MB, MediaType.video: 250 * MB, MediaType.document: 25 * MB}
MAX_BASE64_BYTES = 15 * MB
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
              "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "application/pdf": ".pdf"}
_HEADERS = {"User-Agent": "LaunchLMS Media Library/1.0", "Accept": "*/*"}


def _media_type(value) -> MediaType:
    try:
        return MediaType(str(value or ""))
    except ValueError:
        raise HTTPException(status_code=422, detail="media_type must be image, video or document")


def _filename(name: str, content_type: str, media_type: MediaType) -> str:
    """A name whose extension says what the file is: the given one when it has one, else from its type."""
    name = (name or "").strip().rsplit("/", 1)[-1] or f"connector-{media_type.value}"
    if "." in name and len(name.rsplit(".", 1)[-1]) <= 5:
        return name
    return name + (EXTENSIONS.get(content_type) or mimetypes.guess_extension(content_type or "") or "")


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
                    raise HTTPException(status_code=413, detail=f"File is over the {limit // MB} MB limit for the connector")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise HTTPException(status_code=413, detail=f"File is over the {limit // MB} MB limit for the connector")
                content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                return bytes(body), content_type, urlparse(current).path
    raise HTTPException(status_code=400, detail="Too many redirects")


def asset_dict(asset: MediaAsset) -> dict:
    return {
        "asset_uuid": asset.asset_uuid, "url": asset.url, "media_type": getattr(asset.media_type, "value", asset.media_type),
        "title": asset.title, "folder": asset.folder, "mime_type": asset.mime_type, "size_bytes": asset.size_bytes,
    }


async def upload_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    media_type = _media_type(args.get("media_type"))
    url, data = str(args.get("url") or "").strip(), args.get("data_base64")
    if bool(url) == bool(data):
        raise HTTPException(status_code=422, detail="Give either url or data_base64")
    if url:
        content, content_type, path = await download(url, MAX_BYTES[media_type])
        name = _filename(str(args.get("filename") or path), content_type, media_type)
    else:
        try:
            content = base64.b64decode(str(data), validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="data_base64 is not valid base64")
        if len(content) > min(MAX_BASE64_BYTES, MAX_BYTES[media_type]):
            raise HTTPException(status_code=413, detail="Send files over 15 MB by url instead")
        if not args.get("filename"):
            raise HTTPException(status_code=422, detail="filename is required with data_base64, e.g. cover.jpg")
        name = _filename(str(args["filename"]), "", media_type)
    upload = UploadFile(file=io.BytesIO(content), filename=name, headers={"content-type": mimetypes.guess_type(name)[0] or ""})  # type: ignore[arg-type]
    asset = await media.upload_media_asset(
        MediaOwnerType.org, ctx.org_id, media_type, upload, ctx.user, db_session,
        title=args.get("title") or None, folder=args.get("folder") or "Connector",
    )
    return asset_dict(asset)


async def list_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    media_type = _media_type(args["media_type"]) if args.get("media_type") else None
    assets = media.list_media_assets(MediaOwnerType.org, ctx.org_id, ctx.user, db_session, media_type=media_type, folder=args.get("folder") or None)
    query = str(args.get("query") or "").strip().lower()
    if query:
        assets = [asset for asset in assets if query in (asset.title or "").lower()]
    return {"assets": [asset_dict(asset) for asset in assets[:100]]}


_MEDIA_TYPE = {"type": "string", "enum": ["image", "video", "document"], "description": "image (jpg, png, gif, webp), video (mp4, webm, mov) or document (pdf)."}

MEDIA_TOOLS = [
    Tool(
        "upload_media",
        "Upload media",
        "Put an image, video or PDF into the organization's media library, from a public https URL or base64 data (up to 15 MB; "
        "videos up to 250 MB by URL). Returns the `url` to use in plan covers, badge images, activity image blocks and video pages. "
        "Only upload media the organization may use (its own, or openly licensed).",
        {"properties": {
            "media_type": _MEDIA_TYPE,
            "url": {"type": "string", "description": "A public http(s) address of the file itself."},
            "data_base64": {"type": "string", "description": "The file's bytes, base64 encoded. Needs filename."},
            "filename": {"type": "string", "description": "With an extension, e.g. cover.jpg. Taken from the URL when omitted."},
            "title": {"type": "string", "description": "How it's listed in the media library."},
            "folder": {"type": "string", "description": "Media library folder. Default Connector."},
        }, "required": ["media_type"]},
        upload_media,
        scope="activities:write",
        read_only=False,
    ),
    Tool(
        "list_media",
        "List media",
        "List the organization's media library (newest first, up to 100) to reuse an image or video already uploaded.",
        {"properties": {"media_type": _MEDIA_TYPE, "folder": {"type": "string"}, "query": {"type": "string", "description": "Filter on title."}}},
        list_media,
    ),
]
