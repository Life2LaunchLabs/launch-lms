"""Pexels (https://www.pexels.com/api/): free photos and videos. Requests carry the key; results are mapped to
StockItem dicts: {provider, id, kind, alt, width, height, duration, preview_url, download_url, credit}."""

from __future__ import annotations

import os

import httpx
from fastapi import HTTPException

KEY_ENV = "PEXELS_API_KEY"
API = "https://api.pexels.com"
# Largest video rendition we copy: big enough for full screen on a laptop, small enough to store and stream.
MAX_VIDEO_HEIGHT = 1080


def api_key() -> str:
    return os.environ.get(KEY_ENV, "").strip()


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{API}{path}", params=params, headers={"Authorization": api_key()})
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="That stock item no longer exists")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Stock search is busy; try again in a few minutes")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Pexels returned HTTP {response.status_code}")
    return response.json()


def _photo(photo: dict) -> dict:
    src = photo.get("src") or {}
    return {
        "provider": "pexels", "id": str(photo["id"]), "kind": "photo", "alt": photo.get("alt") or "",
        "width": photo.get("width"), "height": photo.get("height"), "duration": None,
        "preview_url": src.get("medium") or src.get("small") or "", "download_url": src.get("large2x") or src.get("original") or "",
        "credit": {"provider": "Pexels", "name": photo.get("photographer") or "", "url": photo.get("photographer_url") or "", "source_url": photo.get("url") or ""},
    }


def _best_file(files: list[dict]) -> dict | None:
    """The largest mp4 no taller than MAX_VIDEO_HEIGHT (else the smallest mp4)."""
    mp4s = [item for item in files if item.get("file_type") == "video/mp4" and item.get("link")]
    fitting = [item for item in mp4s if (item.get("height") or 0) <= MAX_VIDEO_HEIGHT]
    if fitting:
        return max(fitting, key=lambda item: item.get("height") or 0)
    return min(mp4s, key=lambda item: item.get("height") or 0) if mp4s else None


def _video(video: dict) -> dict:
    best = _best_file(video.get("video_files") or []) or {}
    user = video.get("user") or {}
    slug = (video.get("url") or "").rstrip("/").rsplit("/", 1)[-1]
    return {
        "provider": "pexels", "id": str(video["id"]), "kind": "video", "alt": slug.rsplit("-", 1)[0].replace("-", " ").capitalize() if slug else "",
        "width": best.get("width") or video.get("width"), "height": best.get("height") or video.get("height"), "duration": video.get("duration"),
        "preview_url": video.get("image") or "", "download_url": best.get("link") or "",
        "credit": {"provider": "Pexels", "name": user.get("name") or "", "url": user.get("url") or "", "source_url": video.get("url") or ""},
    }


async def search(query: str, kind: str, orientation: str | None, page: int, per_page: int) -> dict:
    params = {"query": query, "page": page, "per_page": per_page, **({"orientation": orientation} if orientation else {})}
    if kind == "video":
        data = await _get("/videos/search", params)
        items = [_video(video) for video in data.get("videos") or []]
    else:
        data = await _get("/v1/search", params)
        items = [_photo(photo) for photo in data.get("photos") or []]
    return {"items": [item for item in items if item["download_url"]], "page": page, "total": data.get("total_results") or 0,
            "has_more": bool(data.get("next_page"))}


async def get(item_id: str, kind: str) -> dict:
    if not item_id.isdigit():
        raise HTTPException(status_code=422, detail="Unknown stock item")
    item = _video(await _get(f"/videos/videos/{item_id}")) if kind == "video" else _photo(await _get(f"/v1/photos/{item_id}"))
    if not item["download_url"]:
        raise HTTPException(status_code=404, detail="That stock item has no file we can use")
    return item
