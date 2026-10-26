"""At a glance: insight cards on Home, run through the Insights card engine.

A member pins a card from a dashboard they can see: ``{dashboard_uuid, card_key, scope_key}``, where the
scope key picks the plan, group, learner or framework a scoped dashboard was showing. Until they pin one,
Home shows up to three starter cards picked from what they do: the org's active learners for those who see
reports, how the group on their first assignment is doing, and how the plan they edited last finishes.
Starter cards come from the starter dashboards (``insights.library``), so each opens in Insights.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from src.db.goals import GoalTemplate, TemplateStatus
from src.db.insights import InsightDashboard
from src.db.users import PublicUser
from src.services.insights import dashboards, engine, library

MAX_PINS = 6
STARTERS_SHOWN = 3


class HomePin(BaseModel):
    dashboard_uuid: str = Field(min_length=1, max_length=80)
    card_key: str = Field(min_length=1, max_length=64)
    scope_key: str | None = Field(default=None, max_length=80)


def _card(document: dict | None, key: str) -> dict | None:
    return next((card for card in (document or {}).get("cards") or [] if card.get("key") == key), None)


def _run(db: Session, user: PublicUser, org_id: int, *, scope: str, scope_key: str | None, card: dict, range_) -> tuple[dict, dict] | None:
    """The card's result and the scope it ran on; None when the viewer can't see that scope any more."""
    try:
        ctx = engine.context(db, user, org_id, scope, scope_key)
    except HTTPException:
        return None
    outcome = engine.run_cards(ctx, [{"key": card["key"], "spec": card["spec"]}], range_)[card["key"]]
    return outcome, {"kind": scope, "key": scope_key, "name": ctx.scope.label}


def _shown(row: InsightDashboard | None, source: str, card: dict, ran: tuple[dict, dict], template: str | None = None) -> dict:
    outcome, scope = ran
    return {"key": f"{row.dashboard_uuid if row else template}:{card['key']}:{scope['key'] or ''}", "source": source,
            "dashboard_uuid": row.dashboard_uuid if row else None, "dashboard_title": row.title if row else "", "scope": scope,
            "card": {"key": card["key"], "span": card.get("span", 3), "spec": card["spec"]}, "result": outcome}


def _dashboard(db: Session, org_id: int, viewer: dict, dashboard_uuid: str) -> InsightDashboard | None:
    try:
        return dashboards._get(db, org_id, dashboard_uuid, viewer)
    except HTTPException:
        return None


def pinned(db: Session, user: PublicUser, org_id: int, pins: list[dict]) -> list[dict]:
    viewer = dashboards._viewer(db, user, org_id)
    out = []
    for pin in pins:
        row = _dashboard(db, org_id, viewer, pin["dashboard_uuid"])
        card = _card(row.document, pin["card_key"]) if row else None
        ran = _run(db, user, org_id, scope=row.scope, scope_key=pin.get("scope_key"), card=card, range_=(row.document or {}).get("range", "90d")) if row and card else None
        if row and card and ran:
            out.append(_shown(row, "pin", card, ran))
    return out


def _starter(db: Session, org_id: int, template: str) -> tuple[InsightDashboard | None, dict]:
    row = db.exec(select(InsightDashboard).where(InsightDashboard.org_id == org_id, InsightDashboard.source_template == f"starter:{template}",
                                                 col(InsightDashboard.deleted_at).is_(None))).first()
    return row, {"cards": (library.template(template) or {}).get("cards", [])} if row is None else row.document or {}


def starters(db: Session, user: PublicUser, org_id: int, permissions: set[str], focus: dict | None) -> list[dict]:
    """Up to three cards picked from the viewer's permissions and their first assignment."""
    dashboards.ensure_starters(db, org_id)
    picks: list[tuple[str, str, str | None]] = []
    if "see_reports" in permissions:
        picks.append(("org.overview", "active", None))
    target = (focus or {}).get("target") or {}
    if target.get("type") == "group" and target.get("uuid"):
        picks.append(("group.progress", "status", target["uuid"]))
    if "build_plans" in permissions:
        plan = db.exec(select(GoalTemplate.template_uuid).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED.value,
                                                                 col(GoalTemplate.system_type).is_(None), col(GoalTemplate.published_version_id).is_not(None))
                       .order_by(col(GoalTemplate.update_date).desc())).first()
        if plan:
            picks.append(("plan.performance", "completion", plan))
    if focus and len(picks) < STARTERS_SHOWN:
        picks.append(("plan.performance", "starts", focus["template_uuid"]))
    out = []
    for template, card_key, scope_key in picks:
        row, document = _starter(db, org_id, template)
        card = _card(document, card_key)
        scope = (library.template(template) or {}).get("scope", "org")
        ran = _run(db, user, org_id, scope=scope, scope_key=scope_key, card=card, range_=document.get("range", "90d")) if card else None
        if ran and "error" not in ran[0]:
            out.append(_shown(row, "starter", card, ran, template))  # type: ignore[arg-type]
        if len(out) == STARTERS_SHOWN:
            break
    return out


def glance(db: Session, user: PublicUser, org_id: int, permissions: set[str], pins: list[dict], focus: dict | None) -> dict:
    cards = pinned(db, user, org_id, pins) if pins else []
    return {"cards": cards, "starter": False} if pins else {"cards": starters(db, user, org_id, permissions, focus), "starter": True}


def clean_pins(db: Session, user: PublicUser, org_id: int, pins: list[HomePin]) -> list[dict]:
    """The pins to keep: each on a dashboard the viewer sees, a card on it, and a scope it can show."""
    if len(pins) > MAX_PINS:
        raise HTTPException(status_code=422, detail=f"Pin up to {MAX_PINS} cards to Home")
    viewer = dashboards._viewer(db, user, org_id)
    out: list[dict] = []
    for pin in pins:
        row = _dashboard(db, org_id, viewer, pin.dashboard_uuid)
        if row is None or _card(row.document, pin.card_key) is None:
            raise HTTPException(status_code=404, detail="That card isn't on a dashboard you can see")
        scope_key = pin.scope_key if row.scope != "org" else None
        try:
            engine.context(db, user, org_id, row.scope, scope_key)
        except HTTPException as error:
            raise HTTPException(status_code=422, detail=f"Pick the {row.scope} this card shows") from error
        item = {"dashboard_uuid": pin.dashboard_uuid, "card_key": pin.card_key, "scope_key": scope_key}
        if item not in out:
            out.append(item)
    return out
