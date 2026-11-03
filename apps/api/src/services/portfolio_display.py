"""How the portfolio front page is laid out: the highlights band, the header and section layout, and the
learner's look (their theme for the whole app, which visitors see their portfolio in).

All live in ``Portfolio.theme_settings`` and visitors see them."""

import re

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.media import MediaAsset
from src.db.portfolio import Portfolio
from src.db.portfolio_records import HighlightsUpdate, LayoutUpdate, ProgressSeen
from src.db.users import PublicUser
from src.services import portfolio as portfolio_service

LOOKS = {"pop", "studio", "midnight", "sunset"}
# The banner's gradients (components/Looks/looks.ts); "look" follows the look and the accent.
BANNERS = {"look", "ocean", "aurora", "ember", "candy", "forest", "mono"}
LAYOUT_CHOICES = {
    "header": {"left", "center"},
    "sections": {"grid", "list"},
    "look": LOOKS,
    "mode": {"light", "dark", "system"},
    "banner": BANNERS | {"image"},
}
# No look until the learner picks one: the app keeps its own theme, and picking one is a quest step.
# No mode until they pick one either: the page then goes by the look (Midnight dark, the rest light).
DEFAULT_LAYOUT = {"header": "left", "sections": "grid", "look": None, "mode": None, "banner": "look"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def display_for_shell(portfolio: Portfolio) -> dict:
    settings = portfolio.theme_settings or {}
    stored = settings.get("layout") or {}
    layout = {key: stored.get(key) if stored.get(key) in choices else DEFAULT_LAYOUT[key] for key, choices in LAYOUT_CHOICES.items()}
    accent = stored.get("accent")
    layout["accent"] = accent.lower() if isinstance(accent, str) and HEX.match(accent) else None
    image = stored.get("banner_image")
    layout["banner_image"] = image if isinstance(image, dict) and image.get("url") else None
    if layout["banner"] == "image" and not layout["banner_image"]:
        layout["banner"] = "look"
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
    for key, value in payload.model_dump(exclude_none=True, exclude={"accent", "banner_image_uuid"}).items():
        if value not in LAYOUT_CHOICES[key]:
            raise HTTPException(status_code=422, detail=f"Unknown {key} layout")
        layout[key] = value
    if "accent" in payload.model_fields_set:
        if payload.accent and not HEX.match(payload.accent):
            raise HTTPException(status_code=422, detail="An accent is a color like #4c8dff")
        layout["accent"] = payload.accent.lower() if payload.accent else None
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
