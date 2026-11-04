"""How the portfolio front page is laid out: the highlights band, the section stack (order, widths, heights
per look, the learner's own section names, featured items), and the learner's look (their theme for the whole app, which visitors see their portfolio in).

All live in ``Portfolio.theme_settings`` and visitors see them."""

import re

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.media import MediaAsset
from src.db.portfolio import Portfolio
from src.db.portfolio_records import HighlightsUpdate, LayoutUpdate, ProgressSeen
from src.db.users import PublicUser
from src.services import portfolio as portfolio_service

LOOKS = {"playful", "gallery", "volt"}
# Looks before the section stack were color themes. Each becomes Playful with its color as the accent.
LEGACY_LOOKS = {"pop": None, "studio": "#111111", "midnight": "#5b2bd6", "sunset": "#e8642c"}
# Banner backgrounds (components/Looks/looks.ts), drawn in the accent; "look" follows the look's own colors.
BANNERS = {"look", "solid", "fade", "glow", "duo", "mesh", "stripes", "dots", "grid", "rays", "dusk", "ink"}
LAYOUT_CHOICES = {
    "header": {"left", "center"},
    "sections": {"grid", "list"},
    "look": LOOKS,
    "mode": {"light", "dark", "system"},
    "banner": BANNERS | {"image"},
}
# No look until the learner picks one: the app keeps its own theme, and picking one is a quest step.
# No mode until they pick one either: the page then follows the visitor's device.
DEFAULT_LAYOUT = {"header": "left", "sections": "grid", "look": None, "mode": None, "banner": "look"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# The front page's sections. About and experience can't be taken out.
SECTIONS = {"highlights", "feature", "about", "experience", "projects", "credentials", "results", "headed", "people"}
REQUIRED_SECTIONS = {"about", "experience"}
WIDTHS = {2, 3, 4, 6}
FEATURE_KINDS = {"project", "experience", "quote", "badge", "credential", "link"}
MAX_FEATURES = 12
HEIGHT_KEY = re.compile(r"^(playful|gallery|volt)(:phone)?$")


def _clean_stack(stack) -> list[list[dict]] | None:
    """Rows of one to three sections, each section once. A row of one is full width, three are thirds, and two
    share six sixths. Anything else is put right rather than refused, so an old layout still reads."""
    if not isinstance(stack, list):
        return None
    seen: set[str] = set()
    rows: list[list[dict]] = []
    for row in stack[:20]:
        if not isinstance(row, list):
            continue
        items = []
        for item in row[:3]:
            kind = item.get("type") if isinstance(item, dict) else None
            if kind in SECTIONS and kind not in seen:
                seen.add(kind)
                width = item.get("u")
                items.append({"type": kind, "u": width if width in WIDTHS else 3})
        if len(items) == 1:
            items[0]["u"] = 6
        elif len(items) == 3:
            for item in items:
                item["u"] = 2
        elif len(items) == 2 and (items[0]["u"] + items[1]["u"] != 6 or items[0]["u"] == 6):
            items[0]["u"] = items[1]["u"] = 3
        if items:
            rows.append(items)
    # Bio and experience are always on the page.
    for kind in sorted(REQUIRED_SECTIONS - seen):
        rows.append([{"type": kind, "u": 6}])
    return rows


def _clean_names(names) -> dict[str, str]:
    if not isinstance(names, dict):
        return {}
    return {key: value.strip()[:40] for key, value in names.items() if key in SECTIONS and isinstance(value, str) and value.strip()}


def _clean_heights(heights) -> dict[str, dict[str, int]]:
    if not isinstance(heights, dict):
        return {}
    clean: dict[str, dict[str, int]] = {}
    for key, values in heights.items():
        if not isinstance(key, str) or not HEIGHT_KEY.match(key) or not isinstance(values, dict):
            continue
        clean[key] = {kind: max(0, min(1200, int(px))) for kind, px in values.items() if kind in SECTIONS and isinstance(px, (int, float)) and not isinstance(px, bool)}
    return clean


def _clean_features(features) -> list[dict]:
    if not isinstance(features, list):
        return []
    clean, seen = [], set()
    for item in features:
        if not isinstance(item, dict):
            continue
        kind, ref = item.get("kind"), item.get("ref")
        if kind in FEATURE_KINDS and isinstance(ref, str) and 0 < len(ref) <= 200 and (kind, ref) not in seen:
            seen.add((kind, ref))
            clean.append({"kind": kind, "ref": ref})
    return clean[:MAX_FEATURES]


def display_for_shell(portfolio: Portfolio) -> dict:
    settings = portfolio.theme_settings or {}
    stored = dict(settings.get("layout") or {})
    legacy = stored.get("look") in LEGACY_LOOKS
    if legacy:
        if not stored.get("accent") and LEGACY_LOOKS[stored["look"]]:
            stored["accent"] = LEGACY_LOOKS[stored["look"]]
        if not stored.get("mode"):
            stored["mode"] = "dark" if stored["look"] == "midnight" else "light"
        stored["look"] = "playful"
    layout = {key: stored.get(key) if stored.get(key) in choices else DEFAULT_LAYOUT[key] for key, choices in LAYOUT_CHOICES.items()}
    accent = stored.get("accent")
    layout["accent"] = accent.lower() if isinstance(accent, str) and HEX.match(accent) else None
    image = stored.get("banner_image")
    layout["banner_image"] = image if isinstance(image, dict) and image.get("url") else None
    if layout["banner"] == "image" and not layout["banner_image"]:
        layout["banner"] = "look"
    layout["stack"] = _clean_stack(stored.get("stack"))
    layout["names"] = _clean_names(stored.get("names"))
    layout["heights"] = _clean_heights(stored.get("heights"))
    layout["features"] = _clean_features(stored.get("features"))
    layout["feature_autoplay"] = bool(stored.get("feature_autoplay"))
    return {"highlights": list(settings.get("highlights") or []), "layout": layout}


def _store(portfolio: Portfolio, db_session: Session, **values) -> dict:
    portfolio.theme_settings = {**(portfolio.theme_settings or {}), **values}
    portfolio_service._save(portfolio, db_session)
    db_session.refresh(portfolio)
    return display_for_shell(portfolio)


def update_highlights(payload: HighlightsUpdate, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    highlights = [{"value": item.value.strip(), "label": item.label.strip()} for item in payload.highlights]
    if any(not item["value"] or not item["label"] for item in highlights):
        raise HTTPException(status_code=422, detail="A highlight needs a number and what it means")
    return _store(portfolio, db_session, highlights=highlights)


def update_layout(payload: LayoutUpdate, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    layout = display_for_shell(portfolio)["layout"]
    shape = {"stack", "names", "heights", "features", "feature_autoplay"}
    for key, value in payload.model_dump(exclude_none=True, exclude={"accent", "banner_image_uuid"} | shape).items():
        if value not in LAYOUT_CHOICES[key]:
            raise HTTPException(status_code=422, detail=f"Unknown {key} layout")
        layout[key] = value
    if "accent" in payload.model_fields_set:
        if payload.accent and not HEX.match(payload.accent):
            raise HTTPException(status_code=422, detail="An accent is a color like #4c8dff")
        layout["accent"] = payload.accent.lower() if payload.accent else None
    if "stack" in payload.model_fields_set:
        layout["stack"] = _clean_stack(payload.stack)
    if payload.names is not None:
        layout["names"] = _clean_names(payload.names)
    if payload.heights is not None:
        layout["heights"] = _clean_heights(payload.heights)
    if payload.features is not None:
        layout["features"] = _clean_features(payload.features)
    if payload.feature_autoplay is not None:
        layout["feature_autoplay"] = payload.feature_autoplay
    if payload.banner_image_uuid:
        asset = db_session.exec(
            select(MediaAsset).where(MediaAsset.asset_uuid == payload.banner_image_uuid, MediaAsset.owner_user_id == current_user.id)
        ).first()
        media_type = getattr(asset.media_type, "value", asset.media_type) if asset else None
        if not asset or media_type != "image":
            raise HTTPException(status_code=422, detail="The banner photo must be one of your own images")
        layout["banner_image"] = {"asset_uuid": asset.asset_uuid, "url": asset.url}
        layout["banner"] = "image"
    if layout["banner"] == "image" and not layout.get("banner_image"):
        raise HTTPException(status_code=422, detail="Add a photo for the banner first")
    return _store(portfolio, db_session, layout=layout)


def seen_quests(portfolio: Portfolio) -> list[int]:
    """Quests whose unlock the learner has seen. Once seen, an unlock stays, whatever is removed later."""
    seen = (portfolio.theme_settings or {}).get("progress", {}).get("seen") or []
    return sorted({int(n) for n in seen if n in (1, 2, 3)})


def mark_seen(payload: ProgressSeen, current_user: PublicUser, db_session: Session) -> dict:
    """The page works out what's done from the portfolio itself; this keeps the unlocks the learner reached.
    Quests unlock in order, so seeing one also keeps the ones before it."""
    if payload.quest not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="Unknown quest")
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    seen = sorted(set(seen_quests(portfolio)) | set(range(1, payload.quest + 1)))
    _store(portfolio, db_session, progress={"seen": seen})
    return {"seen": seen}
