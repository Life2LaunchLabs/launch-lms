"""Photos of the places a phase can be set in, for the phase's cover.

Each photo was picked ahead of time from Wikimedia Commons and is stored with its
credit (author, license, file page) in place_photos.json, keyed by place key. Nothing
is looked up at runtime. A place without its own photo borrows the nearest one up its
ladder (a town's county, then its state); a place with none shows the drawn cover.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from src.services.life_plans import places

PHOTOS_FILE = Path(__file__).with_name("place_photos.json")


@lru_cache(maxsize=1)
def stored() -> dict[str, dict]:
    """The picked photos by place key: url, width, height, author, license, license_url, source_url."""
    try:
        data = json.loads(PHOTOS_FILE.read_text())
    except (OSError, ValueError):
        return {}
    return {key: photo for key, photo in data.items() if isinstance(photo, dict) and photo.get("url")}


def all_place_keys() -> list[str]:
    return [row["key"] for row in places.search("", limit=10_000)]


def photo_for(key: str | None, photos: dict[str, dict] | None = None) -> dict | None:
    """The photo for a place, borrowed from up its ladder when it has none of its own (never the US)."""
    photos = stored() if photos is None else photos
    for step in places.ladder(key):
        if step != "us" and step in photos:
            return photos[step]
    return None


def photos_by_place() -> dict[str, dict]:
    """Every place key that has a photo (its own or borrowed), for the catalog."""
    photos = stored()
    if not photos:
        return {}
    out = {}
    for key in all_place_keys():
        photo = photo_for(key, photos)
        if photo:
            out[key] = photo
    return out
