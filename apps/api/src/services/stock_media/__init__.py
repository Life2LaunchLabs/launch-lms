"""Stock photos and videos people (and the connector) can search and bring into an organization's media library.

Pexels is the only provider for now; a provider turns its API into ``StockItem`` dicts and fetches one item by id
again at import time, so a client can never point the server at a URL of its choosing. Imported files are copied
into the media library (we host them) with the photographer's credit kept on the asset.
"""

from __future__ import annotations

import time

from fastapi import HTTPException
from sqlmodel import Session

from src.db.media import MediaAsset, MediaOwnerType, MediaType
from src.db.users import PublicUser
from src.services import media
from src.services.media_download import MAX_BYTES, download, filename, store
from src.services.stock_media import pexels

PROVIDERS = {"pexels": pexels}
KINDS = {"photo": MediaType.image, "video": MediaType.video}
ORIENTATIONS = {"landscape", "portrait", "square"}
PER_PAGE = 24
CACHE_SECONDS = 3600
_cache: dict[tuple, tuple[float, dict]] = {}


def _provider(name: str):
    provider = PROVIDERS.get(name)
    if provider is None:
        raise HTTPException(status_code=422, detail=f"Unknown stock provider: {name}")
    if not provider.api_key():
        raise HTTPException(status_code=503, detail=f"Stock search isn't set up: add {provider.KEY_ENV} to the API's environment")
    return provider


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail="kind must be photo or video")
    return kind


async def search(db: Session, user: PublicUser, org_id: int, query: str, kind: str = "photo", orientation: str | None = None,
                 page: int = 1, provider: str = "pexels") -> dict:
    """One page of results. Searches are cached for an hour: providers limit requests per hour."""
    media._authorize_read(MediaOwnerType.org, org_id, user, db)
    query = (query or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="Give a search query")
    if orientation and orientation not in ORIENTATIONS:
        raise HTTPException(status_code=422, detail="orientation must be landscape, portrait or square")
    source = _provider(provider)
    key = (provider, _kind(kind), query.lower(), orientation or "", max(1, int(page)))
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    result = await source.search(query, kind, orientation, key[4], PER_PAGE)
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.monotonic() + CACHE_SECONDS, result)
    return result


async def import_item(db: Session, user: PublicUser, org_id: int, item_id: str, kind: str = "photo", provider: str = "pexels",
                      title: str | None = None, folder: str | None = None) -> MediaAsset:
    """Copy one stock photo or video into the organization's media library, with its credit."""
    media._authorize_mutation(MediaOwnerType.org, org_id, user, db)
    source = _provider(provider)
    media_type = KINDS[_kind(kind)]
    item = await source.get(str(item_id), kind)
    content, content_type, path = await download(item["download_url"], MAX_BYTES[media_type])
    name = filename(path.rsplit("/", 1)[-1] or f"{provider}-{item['id']}", content_type, media_type)
    return await store(db, user, org_id, media_type, content, name, title=title or item["alt"] or None, folder=folder or "Stock", credit=item["credit"])
