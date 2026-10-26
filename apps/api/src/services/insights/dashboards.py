"""Dashboards: saved pages of cards, who sees them, and the starters every organization gets.

Visibility is ``me`` (the owner), ``staff`` (every staff member) or ``admins`` (the organization's
admins). Sharing needs See reports, and sharing with admins only is for admins. Anyone who can see a
dashboard can open it; only its owner, or an admin on a shared one, saves over it. Anyone else's save
makes their own copy, so a staff member can change a shared dashboard without changing it for everyone.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, col, select

from src.db.insights import InsightDashboard
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import ADMIN_ROLE_ID, is_org_admin, is_org_owner_admin, require_org_admin
from src.services.insights import library
from src.services.insights.context import SCOPES
from src.services.insights.spec import CardSpec, CustomRange, check, upgrade

VISIBILITIES = ("me", "staff", "admins")
SPANS = (3, 4, 5, 6, 7, 8, 12)
MAX_CARDS = 40


class DashboardCard(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    spec: dict
    span: int = 6


class DashboardDocument(BaseModel):
    cards: list[DashboardCard] = Field(default_factory=list, max_length=MAX_CARDS)
    range: str | CustomRange = "90d"


def _now() -> str:
    return datetime.now().isoformat()


def _viewer(db: Session, user: PublicUser, org_id: int) -> dict:
    require_org_admin(user.id, org_id, db)
    return {"id": user.id, "admin": is_org_owner_admin(user.id, org_id, db), "see_reports": is_org_admin(user.id, org_id, db, "see_reports")}


def _visible(row: InsightDashboard, viewer: dict) -> bool:
    if row.owner_user_id == viewer["id"]:
        return True
    return row.visibility == "staff" or (row.visibility == "admins" and viewer["admin"])


def _editable(row: InsightDashboard, viewer: dict) -> bool:
    return row.owner_user_id == viewer["id"] or (row.visibility != "me" and viewer["admin"])


def _check_visibility(visibility: str, viewer: dict) -> None:
    if visibility not in VISIBILITIES:
        raise HTTPException(status_code=422, detail=f"Visibility is one of: {', '.join(VISIBILITIES)}")
    if visibility != "me" and not viewer["see_reports"]:
        raise HTTPException(status_code=403, detail="Sharing a dashboard needs the See reports permission")
    if visibility == "admins" and not viewer["admin"]:
        raise HTTPException(status_code=403, detail="Only admins can share a dashboard with admins only")


def clean_document(raw: dict, scope: str) -> dict:
    """A stored document: specs brought up to date, each card checked against the dashboard's scope.

    Cards are checked as if by a See reports viewer: a card a viewer may not run is shown locked, not refused.
    """
    try:
        document = DashboardDocument.model_validate(raw or {})
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": "That dashboard isn't valid", "errors": exc.errors(include_url=False, include_context=False)}) from exc
    errors, seen, cards = [], set(), []
    for card in document.cards:
        if card.key in seen:
            errors.append({"card": card.key, "field": "key", "message": "Two cards share this key"})
        seen.add(card.key)
        if card.span not in SPANS:
            errors.append({"card": card.key, "field": "span", "message": f"Span is one of {', '.join(map(str, SPANS))}"})
        try:
            spec = CardSpec.model_validate(upgrade(card.spec))
        except ValidationError as exc:
            errors.append({"card": card.key, "field": "spec", "message": str(exc.errors(include_url=False)[0]["msg"])})
            continue
        errors += [{"card": card.key, **problem} for problem in check(spec, scope, see_reports=True)]
        cards.append({"key": card.key, "span": card.span, "spec": spec.model_dump(mode="json", exclude_defaults=True) | {"v": spec.v}})
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Some cards don't fit this dashboard", "errors": errors})
    range_ = document.range.model_dump(mode="json") if isinstance(document.range, CustomRange) else document.range
    if isinstance(range_, str) and range_ not in ("28d", "90d", "12m", "all"):
        raise HTTPException(status_code=422, detail="Range is 28d, 90d, 12m, all or a custom range")
    return {"cards": cards, "range": range_}


def _read(row: InsightDashboard, viewer: dict, *, full: bool = True) -> dict:
    out = {
        "dashboard_uuid": row.dashboard_uuid, "scope": row.scope, "title": row.title, "description": row.description,
        "visibility": row.visibility, "mine": row.owner_user_id == viewer["id"], "editable": _editable(row, viewer),
        "revision": row.revision, "source_template": row.source_template, "update_date": row.update_date,
        "card_count": len((row.document or {}).get("cards", [])),
    }
    if full:
        out["document"] = row.document
    return out


def _owner_admin(db: Session, org_id: int) -> int | None:
    return db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, UserOrganization.role_id == ADMIN_ROLE_ID)
                   .order_by(col(UserOrganization.user_id))).first()


def ensure_starters(db: Session, org_id: int) -> None:
    """The first time an organization opens Insights, give it the starter dashboards, shared with staff.

    Any row, deleted or not, means the organization has been here, so deleting a starter keeps it gone.
    """
    if db.exec(select(InsightDashboard.id).where(InsightDashboard.org_id == org_id)).first() is not None:
        return
    owner, now = _owner_admin(db, org_id), _now()
    for key in library.STARTERS:
        item = library.template(key)
        if item is None:
            continue
        db.add(InsightDashboard(
            dashboard_uuid=f"dashboard_{uuid4()}", org_id=org_id, scope=item["scope"], title=item["title"], description=item["description"],
            visibility="staff", owner_user_id=owner, document=clean_document({"cards": item["cards"]}, item["scope"]),
            source_template=f"starter:{key}", creation_date=now, update_date=now,
        ))
    db.commit()


def list_dashboards(db: Session, user: PublicUser, org_id: int, scope: str | None = None) -> list[dict]:
    viewer = _viewer(db, user, org_id)
    ensure_starters(db, org_id)
    query = select(InsightDashboard).where(InsightDashboard.org_id == org_id, col(InsightDashboard.deleted_at).is_(None))
    if scope:
        query = query.where(InsightDashboard.scope == scope)
    rows = [row for row in db.exec(query.order_by(col(InsightDashboard.id))).all() if _visible(row, viewer)]
    order = {kind: index for index, kind in enumerate(SCOPES)}
    rows.sort(key=lambda row: (order.get(row.scope, 9), row.owner_user_id != viewer["id"], row.id))
    return [_read(row, viewer, full=False) for row in rows]


def _get(db: Session, org_id: int, dashboard_uuid: str, viewer: dict) -> InsightDashboard:
    row = db.exec(select(InsightDashboard).where(InsightDashboard.dashboard_uuid == dashboard_uuid, InsightDashboard.org_id == org_id,
                                                 col(InsightDashboard.deleted_at).is_(None))).first()
    if row is None or not _visible(row, viewer):
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return row


def get_dashboard(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str) -> dict:
    viewer = _viewer(db, user, org_id)
    return _read(_get(db, org_id, dashboard_uuid, viewer), viewer)


def _new(db: Session, org_id: int, viewer: dict, *, scope: str, title: str, description: str, visibility: str, document: dict, source: str | None) -> InsightDashboard:
    now = _now()
    row = InsightDashboard(dashboard_uuid=f"dashboard_{uuid4()}", org_id=org_id, scope=scope, title=title.strip() or "Untitled dashboard",
                           description=description, visibility=visibility, owner_user_id=viewer["id"], document=document,
                           source_template=source, creation_date=now, update_date=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_dashboard(db: Session, user: PublicUser, org_id: int, *, scope: str, title: str | None = None, description: str = "",
                     visibility: str = "me", template: str | None = None, document: dict | None = None) -> dict:
    """A new dashboard: blank, from a template's cards, or from a document the caller wrote."""
    viewer = _viewer(db, user, org_id)
    if scope not in SCOPES:
        raise HTTPException(status_code=422, detail=f"Scope is one of: {', '.join(SCOPES)}")
    _check_visibility(visibility, viewer)
    source = None
    if template:
        item = library.template(template)
        if item is None or item["scope"] != scope:
            raise HTTPException(status_code=404, detail="Template not found for this kind of dashboard")
        document = {"cards": item["cards"], "range": (document or {}).get("range", "90d")}
        title, description, source = title or item["title"], description or item["description"], template
    row = _new(db, org_id, viewer, scope=scope, title=title or "Untitled dashboard", description=description, visibility=visibility,
               document=clean_document(document or {}, scope), source=source)
    return _read(row, viewer)


def save_dashboard(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str, *, revision: int, document: dict | None = None,
                   title: str | None = None, description: str | None = None, visibility: str | None = None) -> dict:
    """Save over a dashboard at ``revision``. A stale revision gets 409 with the current dashboard to merge into.

    A viewer who can't edit it gets their own copy with the change instead (``copied`` in the reply).
    """
    viewer = _viewer(db, user, org_id)
    row = _get(db, org_id, dashboard_uuid, viewer)
    cleaned = clean_document(document, row.scope) if document is not None else None
    if not _editable(row, viewer):
        copy = _new(db, org_id, viewer, scope=row.scope, title=title or f"{row.title} (my copy)", description=row.description if description is None else description,
                    visibility="me", document=cleaned or row.document, source=row.source_template)
        return {**_read(copy, viewer), "copied": True}
    if revision != row.revision:
        raise HTTPException(status_code=409, detail={"message": "Someone saved this dashboard since you opened it", "current": _read(row, viewer)})
    if visibility is not None and visibility != row.visibility:
        _check_visibility(visibility, viewer)
        row.visibility = visibility
    if cleaned is not None:
        row.document = cleaned
    if title is not None:
        row.title = title.strip() or row.title
    if description is not None:
        row.description = description
    row.revision += 1
    row.update_date = _now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return {**_read(row, viewer), "copied": False}


def duplicate_dashboard(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str, title: str | None = None) -> dict:
    viewer = _viewer(db, user, org_id)
    row = _get(db, org_id, dashboard_uuid, viewer)
    copy = _new(db, org_id, viewer, scope=row.scope, title=title or f"{row.title} (copy)", description=row.description, visibility="me",
                document=row.document, source=row.source_template)
    return _read(copy, viewer)


def delete_dashboard(db: Session, user: PublicUser, org_id: int, dashboard_uuid: str) -> dict:
    """Mark it deleted. Only someone who can save over it can delete it."""
    viewer = _viewer(db, user, org_id)
    row = _get(db, org_id, dashboard_uuid, viewer)
    if not _editable(row, viewer):
        raise HTTPException(status_code=403, detail="Only the owner or an admin can delete this dashboard")
    row.deleted_at = _now()
    db.add(row)
    db.commit()
    return {"deleted": True}


def library_for(db: Session, user: PublicUser, org_id: int, scope: str) -> dict:
    viewer = _viewer(db, user, org_id)
    if scope not in SCOPES:
        raise HTTPException(status_code=422, detail=f"Scope is one of: {', '.join(SCOPES)}")
    return library.library(scope, viewer["see_reports"])
