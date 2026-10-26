"""Captures: a dashboard frozen at one moment, for the record, for printing, or to share with a link.

Capturing runs every card of the saved dashboard for the capturer, as Insights would show it to them right
then, and stores the results; nothing is re-run when a capture is opened, so it reads the same forever.
Who can open one:

- the person who made it;
- anyone with See reports who can see its dashboard (their learners include the capturer's);
- anyone with the read-only link while it is on, with small numbers hidden (``shield``).

Other parts of the product add material to a capture through ``ATTACHMENTS`` (a requirement report adds
each learner's evidence); each kind says whether a read-only link may show it.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.insights import InsightCapture, InsightDashboard
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.services.insights import dashboards, engine, sentences
from src.services.insights.context import Ctx, window
from src.services.insights.dimensions import DIMENSIONS
from src.services.insights.measures import MEASURES
from src.services.insights.spec import CustomRange

LINK_DAYS = (7, 30, 90)
LIST_LIMIT = 100


@dataclass(frozen=True)
class Attachment:
    label: str
    # Builds the attachment for a capture: (ctx of the capturer, the capture being made) -> JSON.
    build: Callable[[Ctx, InsightCapture], dict]
    scopes: tuple[str, ...] = ("org", "plan", "group", "learner")
    # Whether a read-only link shows it. Anything naming learners must stay False.
    public: bool = False


ATTACHMENTS: dict[str, Attachment] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _name(user: User | None) -> str:
    if not user:
        return "Someone"
    return " ".join(part for part in (user.first_name, user.last_name) if part) or user.username


def _range_json(range_) -> str | dict:
    return range_.model_dump(mode="json") if isinstance(range_, CustomRange) else range_


def _readable(row: InsightCapture, dashboard: InsightDashboard | None, viewer: dict) -> bool:
    if row.captured_by_user_id == viewer["id"]:
        return True
    return viewer["see_reports"] and (dashboard is None or dashboards._visible(dashboard, viewer))


def _read(row: InsightCapture, dashboard: InsightDashboard | None, viewer: dict, people: dict[int, User], *, full: bool = True) -> dict:
    out = {
        "capture_uuid": row.capture_uuid, "title": row.title, "scope": row.scope, "object_key": row.object_key, "object_label": row.object_label,
        "range": row.range, "note": row.note, "captured_by": _name(people.get(row.captured_by_user_id or 0)),
        "mine": row.captured_by_user_id == viewer["id"], "whole_org": row.whole_org, "learners": row.learners,
        "dashboard_uuid": dashboard.dashboard_uuid if dashboard and not dashboard.deleted_at else None,
        "scheduled": row.rule_id is not None, "card_count": len(row.cards or []),
        "attachments": [{"kind": item.get("kind"), "label": item.get("label", "")} for item in row.attachments or []],
        "can_share": (sharer := row.captured_by_user_id == viewer["id"] or viewer["admin"]), "link": _link(row) if sharer else None,
        "creation_date": row.creation_date,
    }
    if full:
        out["cards"], out["results"], out["attachments"] = row.cards, row.results, row.attachments
    return out


def _link(row: InsightCapture) -> dict | None:
    if not row.link_token:
        return None
    return {"token": row.link_token, "expires_at": row.link_expires_at, "expired": _expired(row)}


def _expired(row: InsightCapture) -> bool:
    return bool(row.link_expires_at and row.link_expires_at < _now())


def _people(db: Session, rows: list[InsightCapture]) -> dict[int, User]:
    ids = {row.captured_by_user_id for row in rows if row.captured_by_user_id}
    return {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_(ids))).all()} if ids else {}  # type: ignore[arg-type]


def _dashboards(db: Session, rows: list[InsightCapture]) -> dict[int, InsightDashboard]:
    ids = {row.dashboard_id for row in rows if row.dashboard_id}
    return {int(item.id): item for item in db.exec(select(InsightDashboard).where(col(InsightDashboard.id).in_(ids))).all()} if ids else {}  # type: ignore[arg-type]


# Making one ---------------------------------------------------------------------------------------

def make(db: Session, user: PublicUser, org_id: int, dashboard: InsightDashboard, *, key: str | None, range_=None, note: str = "",
         attach: list[str] | tuple[str, ...] = (), rule_id: int | None = None) -> InsightCapture:
    """Run the saved dashboard for ``user`` and store what it shows. Rules call this as the rule's owner."""
    ctx = engine.context(db, user, org_id, dashboard.scope, key)
    document = dashboard.document or {}
    range_ = range_ or document.get("range") or "90d"
    if isinstance(range_, dict):
        range_ = CustomRange(**range_)
    unknown = [kind for kind in attach if kind not in ATTACHMENTS or dashboard.scope not in ATTACHMENTS[kind].scopes]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Can't attach {', '.join(unknown)} to this dashboard")
    cards = document.get("cards", [])
    win = window(range_, None, ctx.today)
    now = _now()
    row = InsightCapture(
        capture_uuid=f"capture_{uuid4()}", org_id=org_id, dashboard_id=dashboard.id, rule_id=rule_id, title=dashboard.title, scope=dashboard.scope,
        object_key=ctx.scope.key, object_label=ctx.scope.label,
        range={"asked": _range_json(range_), "start": win.start.isoformat() if win.start else None, "end": (win.end - timedelta(days=1)).isoformat()},
        note=note.strip(), captured_by_user_id=user.id, whole_org=ctx.pop.see_reports, learners=len(ctx.pop.learners(("active", "alumni"))),
        cards=cards, results=engine.run_cards(ctx, cards, range_), creation_date=now, update_date=now,
    )
    row.attachments = [{"kind": kind, "label": ATTACHMENTS[kind].label, **ATTACHMENTS[kind].build(ctx, row)} for kind in dict.fromkeys(attach)]
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def capture_dashboard(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str, *, key: str | None = None, range_=None,
                      note: str = "", attach: list[str] | None = None) -> dict:
    viewer = dashboards._viewer(db, user, org_id)
    dashboard = dashboards._get(db, org_id, dashboard_uuid, viewer)
    row = make(db, user, org_id, dashboard, key=key, range_=range_, note=note, attach=attach or [])
    return _read(row, dashboard, viewer, _people(db, [row]))


# Reading ------------------------------------------------------------------------------------------

def list_captures(db: Session, user: PublicUser, org_id: int, *, dashboard_uuid: str | None = None, scope: str | None = None,
                  key: str | None = None, mine: bool = False, scheduled: bool | None = None) -> list[dict]:
    """The log, newest first: every capture this viewer may open, narrowed by the filters."""
    viewer = dashboards._viewer(db, user, org_id)
    query = select(InsightCapture).where(InsightCapture.org_id == org_id)
    if dashboard_uuid:
        board = db.exec(select(InsightDashboard.id).where(InsightDashboard.dashboard_uuid == dashboard_uuid, InsightDashboard.org_id == org_id)).first()
        query = query.where(InsightCapture.dashboard_id == (board or -1))
    if scope:
        query = query.where(InsightCapture.scope == scope)
    if key:
        query = query.where(InsightCapture.object_key == key)
    if mine or not viewer["see_reports"]:
        query = query.where(InsightCapture.captured_by_user_id == viewer["id"])
    if scheduled is not None:
        query = query.where(col(InsightCapture.rule_id).is_not(None) if scheduled else col(InsightCapture.rule_id).is_(None))
    rows = db.exec(query.order_by(col(InsightCapture.id).desc())).all()
    boards = _dashboards(db, list(rows))
    rows = [row for row in rows if _readable(row, boards.get(row.dashboard_id or 0), viewer)][:LIST_LIMIT]
    people = _people(db, rows)
    return [_read(row, boards.get(row.dashboard_id or 0), viewer, people, full=False) for row in rows]


def _get(db: Session, org_id: int, capture_uuid: str, viewer: dict) -> tuple[InsightCapture, InsightDashboard | None]:
    row = db.exec(select(InsightCapture).where(InsightCapture.capture_uuid == capture_uuid, InsightCapture.org_id == org_id)).first()
    dashboard = db.get(InsightDashboard, row.dashboard_id) if row and row.dashboard_id else None
    if row is None or not _readable(row, dashboard, viewer):
        raise HTTPException(status_code=404, detail="Capture not found")
    return row, dashboard


def get_capture(db: Session, user: PublicUser, org_id: int, capture_uuid: str) -> dict:
    viewer = dashboards._viewer(db, user, org_id)
    row, dashboard = _get(db, org_id, capture_uuid, viewer)
    return _read(row, dashboard, viewer, _people(db, [row]))


def update_note(db: Session, user: PublicUser, org_id: int, capture_uuid: str, note: str) -> dict:
    """Only the note changes after the fact, and only its maker changes it; the numbers never do."""
    viewer = dashboards._viewer(db, user, org_id)
    row, dashboard = _get(db, org_id, capture_uuid, viewer)
    if row.captured_by_user_id != viewer["id"]:
        raise HTTPException(status_code=403, detail="Only the person who captured it can change its note")
    row.note, row.update_date = note.strip(), _now()
    db.add(row)
    db.commit()
    return _read(row, dashboard, viewer, _people(db, [row]))


def set_link(db: Session, user: PublicUser, org_id: int, capture_uuid: str, *, on: bool, days: int | None = None) -> dict:
    """Turn the read-only link on (a new token, expiring after ``days`` or never) or off."""
    viewer = dashboards._viewer(db, user, org_id)
    row, dashboard = _get(db, org_id, capture_uuid, viewer)
    if row.captured_by_user_id != viewer["id"] and not viewer["admin"]:
        raise HTTPException(status_code=403, detail="Only the person who captured it, or an admin, can share it")
    if on and days is not None and days not in LINK_DAYS:
        raise HTTPException(status_code=422, detail=f"A link lasts {', '.join(map(str, LINK_DAYS))} days, or until it's turned off")
    row.link_token = secrets.token_urlsafe(24) if on else None
    row.link_expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds") if on and days else None
    row.update_date = _now()
    db.add(row)
    db.commit()
    return _read(row, dashboard, viewer, _people(db, [row]))


# The read-only link -------------------------------------------------------------------------------

def shared(db: Session, token: str) -> dict:
    """What anyone with the link sees: the frozen cards with small numbers hidden, no names, nothing to click into."""
    row = db.exec(select(InsightCapture).where(InsightCapture.link_token == token)).first() if token else None
    if row is None or _expired(row):
        raise HTTPException(status_code=404, detail="This link has expired or been turned off")
    org = db.get(Organization, row.org_id)
    specs = {card.get("key"): card.get("spec") or {} for card in row.cards or []}
    return {
        "title": row.title, "scope": row.scope, "object_label": row.object_label, "range": row.range, "note": row.note,
        "org": {"name": org.name if org else "", "slug": org.slug if org else ""}, "creation_date": row.creation_date,
        "cards": row.cards, "results": {key: shield(result, specs.get(key)) for key, result in (row.results or {}).items()},
        "attachments": [item for item in row.attachments or [] if item.get("kind") in ATTACHMENTS and ATTACHMENTS[item["kind"]].public],
    }


def _small(cell: dict | None) -> bool:
    return bool(cell) and 0 < (cell.get("n") or 0) < sentences.MIN_N  # type: ignore[union-attr]


def _hide(cell: dict) -> dict:
    return {**cell, "v": None, "text": f"Fewer than {sentences.MIN_N}", "few": True, "hidden": True, "drill": None, "prior": None, "change": ""}


def shield(result: dict, spec: dict | None = None) -> dict:
    """A card's result for outside the organization: any number resting on fewer than ten is hidden and left out of the headline."""
    if "error" in result:
        return {"error": result["error"], "errors": []}
    measure = MEASURES.get(result.get("measure", ""))
    out = {**result, "drill": None}
    hidden = False

    def guard(cell: dict) -> dict:
        nonlocal hidden
        cell = {**cell, "drill": None, **({"link": None} if "link" in cell else {})}
        if _small(cell):
            hidden = True
            return _hide(cell)
        return cell

    value_hidden = _small(result.get("value"))
    out["value"] = guard(result["value"]) if result.get("value") else result.get("value")
    out["rows"] = [{**guard(row), **({"cells": [guard(cell) for cell in row["cells"]]} if row.get("cells") else {})} for row in result.get("rows") or []]
    out["more"] = guard(result["more"]) if result.get("more") else None
    if result.get("series"):
        out["series"] = {**result["series"], "points": [guard(point) for point in result["series"]["points"]], "ghost": None}
    if value_hidden and out.get("compare"):
        out["compare"] = None
    custom = result.get("headline") != result.get("auto_headline")
    if not hidden or custom or measure is None:
        return {**out, "auto_headline": out["headline"]} if custom else out
    headline = f"Too few to share (fewer than {sentences.MIN_N})" if value_hidden else sentences.phrase(measure, result["value"].get("v"))
    by = (spec or {}).get("by")
    if result.get("shape") == "ranked" and by in DIMENSIONS and not value_hidden:
        headline = sentences.funnel(measure, out["rows"]) if measure.funnel and by == "step" else sentences.ranked(measure, out["rows"], DIMENSIONS[by].plural)
    out["headline"] = out["auto_headline"] = headline
    return out


# Kinds other parts of the product attach; importing them here registers them.
from src.services.insights import evidence as _evidence  # noqa: E402,F401
