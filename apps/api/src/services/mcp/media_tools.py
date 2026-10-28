"""The connector's media tools: put an image, video or PDF into the organization's media library and get
back the address plans, badges and activities use (``/content/orgs/<org>/media/<file>``)."""

from __future__ import annotations

import base64
import binascii

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.media import MediaAsset, MediaOwnerType, MediaType
from src.services import media
from src.services.mcp.tool import Tool
from src.services.oauth.server import AccessContext
from src.services.media_download import MAX_BYTES, MB, download, filename, store

MAX_BASE64_BYTES = 15 * MB


def _media_type(value) -> MediaType:
    try:
        return MediaType(str(value or ""))
    except ValueError:
        raise HTTPException(status_code=422, detail="media_type must be image, video or document")


def asset_dict(asset: MediaAsset) -> dict:
    return {
        "asset_uuid": asset.asset_uuid, "url": asset.url, "media_type": getattr(asset.media_type, "value", asset.media_type),
        "title": asset.title, "folder": asset.folder, "mime_type": asset.mime_type, "size_bytes": asset.size_bytes,
        **({"credit": asset.credit} if asset.credit else {}),
    }


async def upload_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    media_type = _media_type(args.get("media_type"))
    url, data = str(args.get("url") or "").strip(), args.get("data_base64")
    if bool(url) == bool(data):
        raise HTTPException(status_code=422, detail="Give either url or data_base64")
    if url:
        content, content_type, path = await download(url, MAX_BYTES[media_type])
        name = filename(str(args.get("filename") or path), content_type, media_type)
    else:
        try:
            content = base64.b64decode(str(data), validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="data_base64 is not valid base64")
        if len(content) > min(MAX_BASE64_BYTES, MAX_BYTES[media_type]):
            raise HTTPException(status_code=413, detail="Send files over 15 MB by url instead")
        if not args.get("filename"):
            raise HTTPException(status_code=422, detail="filename is required with data_base64, e.g. cover.jpg")
        name = filename(str(args["filename"]), "", media_type)
    asset = await store(db_session, ctx.user, ctx.org_id, media_type, content, name, title=args.get("title") or None, folder=args.get("folder") or "Connector")
    return asset_dict(asset)


async def list_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    media_type = _media_type(args["media_type"]) if args.get("media_type") else None
    assets = media.list_media_assets(MediaOwnerType.org, ctx.org_id, ctx.user, db_session, media_type=media_type, folder=args.get("folder") or None)
    query = str(args.get("query") or "").strip().lower()
    if query:
        assets = [asset for asset in assets if query in (asset.title or "").lower()]
    return {"assets": [asset_dict(asset) for asset in assets[:100]]}


async def search_stock_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    from src.services import stock_media

    return await stock_media.search(db_session, ctx.user, ctx.org_id, str(args.get("query") or ""), str(args.get("kind") or "photo"),
                                    args.get("orientation") or None, int(args.get("page") or 1))


async def add_stock_media(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    from src.services import stock_media

    asset = await stock_media.import_item(db_session, ctx.user, ctx.org_id, str(args["id"]), str(args.get("kind") or "photo"),
                                          title=args.get("title") or None, folder=args.get("folder") or None)
    return asset_dict(asset)


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
    Tool(
        "search_stock_media",
        "Search stock photos and videos",
        "Search free stock photos or videos (Pexels) for plan covers, badge art and activity pages. Each result has an id, a preview_url to look at, "
        "its size (and a video's duration in seconds) and the photographer's credit. Prefer real, candid, young and energetic shots over posed ones; "
        "search several phrasings and pick the strongest.",
        {"properties": {
            "query": {"type": "string", "description": "What should be in the picture, e.g. \"teen skateboarding sunset\"."},
            "kind": {"type": "string", "enum": ["photo", "video"], "description": "Default photo."},
            "orientation": {"type": "string", "enum": ["landscape", "portrait", "square"], "description": "portrait for phone-first activity pages, landscape for covers."},
            "page": {"type": "integer", "description": "1-based; 24 results a page."},
        }, "required": ["query"]},
        search_stock_media,
    ),
    Tool(
        "add_stock_media",
        "Add a stock photo or video",
        "Copy one search_stock_media result into the organization's media library (folder Stock) with its credit, and return the `url` to use, "
        "as with upload_media.",
        {"properties": {
            "id": {"type": "string", "description": "The result's id."},
            "kind": {"type": "string", "enum": ["photo", "video"], "description": "Default photo."},
            "title": {"type": "string"},
            "folder": {"type": "string"},
        }, "required": ["id"]},
        add_stock_media,
        scope="activities:write",
        read_only=False,
    ),
]
