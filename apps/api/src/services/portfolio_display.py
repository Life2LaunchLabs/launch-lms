"""How the portfolio front page is laid out: the highlights band and the header and section layout.

Both live in ``Portfolio.theme_settings`` and visitors see them."""

from fastapi import HTTPException
from sqlmodel import Session

from src.db.portfolio import Portfolio
from src.db.portfolio_records import HighlightsUpdate, LayoutUpdate, ProgressSeen
from src.db.users import PublicUser
from src.services import portfolio as portfolio_service

LAYOUT_CHOICES = {"header": {"left", "center"}, "sections": {"grid", "list"}}
DEFAULT_LAYOUT = {"header": "left", "sections": "grid"}


def display_for_shell(portfolio: Portfolio) -> dict:
    settings = portfolio.theme_settings or {}
    stored = settings.get("layout") or {}
    layout = {key: stored.get(key) if stored.get(key) in choices else DEFAULT_LAYOUT[key] for key, choices in LAYOUT_CHOICES.items()}
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
    for key, value in payload.model_dump(exclude_none=True).items():
        if value not in LAYOUT_CHOICES[key]:
            raise HTTPException(status_code=422, detail=f"Unknown {key} layout")
        layout[key] = value
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
