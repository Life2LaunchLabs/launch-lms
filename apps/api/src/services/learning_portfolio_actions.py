"""Trusted, transactional portfolio outcomes for completed learning activities."""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlparse
from uuid import uuid4

from sqlmodel import Session, select

from src.db.portfolio import (
    JourneyEntry, JourneyWorkLink, Portfolio, PortfolioContentStatus, PortfolioLink,
    PortfolioSection, PortfolioVisibility, ProfileTrait, WorkItem, WorkItemBlock,
)
from src.db.media import MediaAsset
from src.db.users import User
from src.db.learning import LearningBadge, LearningPath, LearningRun, LearningRunStatus


class PortfolioActionError(ValueError):
    def __init__(self, action_id: str, field: str, message: str):
        super().__init__(message)
        self.action_id, self.field, self.message = action_id, field, message


ACTION_TYPES = {
    "set_portfolio_fields", "create_work_item", "create_journey_entry",
    "link_work_to_journey", "set_traits", "set_portfolio_links", "set_theme",
    "set_featured_content", "confirm_privacy", "publish_portfolio", "emit_event",
    "enroll_badges",
}
PORTFOLIO_FIELDS = {"display_name", "headline", "short_bio", "location_label"}
WORK_FIELDS = {"title", "story_kind", "subtitle", "summary", "role_label", "featured", "start_date", "end_date"}
JOURNEY_FIELDS = {"title", "entry_type", "organization", "location_label", "summary", "start_date", "end_date", "is_current", "cover_asset_uuid"}
TRAIT_TYPES = {"strength", "value", "interest", "goal", "skill"}


def validate_outcomes(outcomes: dict | None, trusted: bool) -> None:
    if not outcomes:
        return
    if not trusted:
        raise PortfolioActionError("outcomes", "authorization", "Portfolio outcomes are limited to trusted system badges")
    if outcomes.get("version") != 1 or not isinstance(outcomes.get("actions"), list):
        raise PortfolioActionError("outcomes", "version", "Outcomes must use version 1 and contain actions")
    ids: set[str] = set()
    for action in outcomes["actions"]:
        action_id = str(action.get("id") or "")
        if not action_id or action_id in ids:
            raise PortfolioActionError(action_id or "outcomes", "id", "Every outcome needs a unique stable id")
        ids.add(action_id)
        if action.get("type") not in ACTION_TYPES:
            raise PortfolioActionError(action_id, "type", "Unsupported portfolio outcome")


def _resolve(value, context: dict):
    if isinstance(value, list):
        return [_resolve(item, context) for item in value]
    if isinstance(value, dict) and "$source" not in value:
        return {key: _resolve(item, context) for key, item in value.items()}
    if not isinstance(value, dict):
        return value
    source = value.get("$source")
    if source == "binding":
        return context.get("bindings", {}).get(str(value.get("key") or ""))
    if source != "answer":
        return None
    current = context.get("answers", {})
    for part in str(value.get("path") or "").split("."):
        if not isinstance(current, dict) or part not in current:
            return value.get("default")
        current = current[part]
    if value.get("transform") == "first" and isinstance(current, list):
        return current[0] if current else value.get("default")
    return current


def _mapped(action: dict, context: dict, allowed: set[str]) -> dict:
    fields = action.get("fields") or {}
    unknown = set(fields) - allowed
    if unknown:
        raise PortfolioActionError(action["id"], "fields", f"Unsupported fields: {', '.join(sorted(unknown))}")
    return {key: _resolve(value, context) for key, value in fields.items()}


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:80] or "item"


def _unique_slug(model, portfolio_id: int, title: str, db: Session) -> str:
    base, candidate, counter = _slug(title), _slug(title), 2
    while db.exec(select(model).where(model.portfolio_id == portfolio_id, model.slug == candidate)).first():
        candidate, counter = f"{base}-{counter}", counter + 1
    return candidate


def _portfolio_date(value, field: str) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])(?:-([0-2]\d|3[01]))?", raw):
        raise PortfolioActionError("portfolio-date", field, "Dates must use YYYY-MM or YYYY-MM-DD")
    try:
        datetime.strptime(raw if len(raw) == 10 else f"{raw}-01", "%Y-%m-%d")
    except ValueError as exc:
        raise PortfolioActionError("portfolio-date", field, "Date is not valid") from exc
    return raw


def _portfolio(db: Session, user: User, now: str) -> Portfolio:
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user.id)).first()
    if portfolio:
        return portfolio
    portfolio = Portfolio(
        portfolio_uuid=f"por_{uuid4().hex}", user_id=user.id or 0,
        display_name=" ".join(filter(None, [user.first_name, user.last_name])), short_bio=user.bio or "",
        creation_date=now, update_date=now,
    )
    db.add(portfolio); db.flush()
    for index, section_type in enumerate(("identity_hero", "featured_work", "about", "links")):
        db.add(PortfolioSection(section_uuid=f"sec_{uuid4().hex}", portfolio_id=portfolio.id or 0, section_type=section_type, sort_order=index, creation_date=now, update_date=now))
    return portfolio


def apply_portfolio_outcomes(db: Session, user: User, activity_run_id: int, outcomes: dict, context: dict, prior_receipts: dict | None = None) -> tuple[dict, dict]:
    """Apply without committing; the caller owns the transaction."""
    receipts, bindings = dict(prior_receipts or {}), dict(context.get("bindings") or {})
    now, portfolio = str(datetime.now()), _portfolio(db, user, str(datetime.now()))
    run_ref = f"learning_activity_run:{activity_run_id}"
    for action in outcomes.get("actions", []):
        action_id, kind = action["id"], action["type"]
        if action_id in receipts:
            continue
        local = {**context, "bindings": bindings}
        if kind == "set_portfolio_fields":
            for key, value in _mapped(action, local, PORTFOLIO_FIELDS).items(): setattr(portfolio, key, str(value or "").strip())
        elif kind == "enroll_badges":
            badge_uuids = list(dict.fromkeys(_resolve(action.get("badge_uuids"), local) or []))[:3]
            enrolled: list[str] = []
            for badge_uuid in badge_uuids:
                badge = db.exec(select(LearningBadge).where(
                    LearningBadge.badge_uuid == str(badge_uuid),
                    LearningBadge.status == "published",
                    LearningBadge.public == True,  # type: ignore
                    LearningBadge.system_type.is_(None),  # type: ignore
                )).first()
                if not badge:
                    continue
                existing = db.exec(select(LearningRun).where(
                    LearningRun.user_id == user.id, LearningRun.badge_id == badge.id
                )).first()
                if not existing:
                    path = db.exec(select(LearningPath).where(LearningPath.badge_id == badge.id)).first()
                    if not path:
                        continue
                    db.add(LearningRun(
                        run_uuid=f"learning_run_{uuid4()}", badge_id=badge.id or 0,
                        path_id=path.id or 0, org_id=badge.org_id, user_id=user.id,
                        status=LearningRunStatus.IN_PROGRESS, creation_date=now, update_date=now,
                    ))
                enrolled.append(badge.badge_uuid)
            receipts[action_id] = {"type": kind, "badge_uuids": enrolled}
        elif kind == "create_work_item":
            values = _mapped(action, local, WORK_FIELDS); title = str(values.pop("title", "") or "").strip()
            if not title: raise PortfolioActionError(action_id, "title", "Work title is required")
            for date_field in ("start_date", "end_date"):
                if date_field in values:
                    values[date_field] = _portfolio_date(values[date_field], date_field)
            cover_asset_uuid = str(_resolve(action.get("cover_asset_uuid"), local) or "").strip()
            cover_asset_id = None
            if cover_asset_uuid:
                cover = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == cover_asset_uuid, MediaAsset.owner_user_id == user.id, MediaAsset.media_type == "image")).first()
                if not cover: raise PortfolioActionError(action_id, "cover_asset_uuid", "Cover image must be an image owned by the learner")
                cover_asset_id = cover.id
            work = WorkItem(
                work_uuid=f"wrk_{uuid4().hex}", portfolio_id=portfolio.id or 0, title=title,
                cover_asset_id=cover_asset_id,
                slug=_unique_slug(WorkItem, portfolio.id or 0, title, db), status=PortfolioContentStatus.PUBLISHED,
                visibility=PortfolioVisibility.PUBLIC, source="activity", source_reference=f"{run_ref}:{action_id}",
                creation_date=now, update_date=now, **values,
            )
            db.add(work); db.flush()
            story = str(_resolve(action.get("story"), local) or "").strip()
            if story:
                db.add(WorkItemBlock(block_uuid=f"wkb_{uuid4().hex}", work_item_id=work.id or 0, block_type="text", data={"text": story}, sort_order=0, creation_date=now, update_date=now))
            if cover_asset_uuid and cover:
                db.add(WorkItemBlock(block_uuid=f"wkb_{uuid4().hex}", work_item_id=work.id or 0, block_type="image", data={"asset_uuid": cover.asset_uuid, "url": cover.url, "caption": ""}, sort_order=1, creation_date=now, update_date=now))
            binding = str(action.get("store_as") or "work_item_id"); bindings[binding] = work.work_uuid
            receipts[action_id] = {"type": kind, "entity_uuid": work.work_uuid}
        elif kind == "create_journey_entry":
            values = _mapped(action, local, JOURNEY_FIELDS); title = str(values.pop("title", "") or "").strip()
            if not title: raise PortfolioActionError(action_id, "title", "Journey title is required")
            for date_field in ("start_date", "end_date"):
                if date_field in values:
                    values[date_field] = _portfolio_date(values[date_field], date_field)
            cover_asset_uuid = str(values.pop("cover_asset_uuid", "") or "").strip()
            cover_asset_id = None
            if cover_asset_uuid:
                cover = db.exec(select(MediaAsset).where(
                    MediaAsset.asset_uuid == cover_asset_uuid,
                    MediaAsset.owner_user_id == user.id,
                    MediaAsset.media_type == "image",
                )).first()
                if not cover:
                    raise PortfolioActionError(action_id, "cover_asset_uuid", "Cover image must be an image owned by the learner")
                cover_asset_id = cover.id
            journey = JourneyEntry(
                journey_uuid=f"jrn_{uuid4().hex}", portfolio_id=portfolio.id or 0, title=title,
                cover_asset_id=cover_asset_id,
                slug=_unique_slug(JourneyEntry, portfolio.id or 0, title, db), status=PortfolioContentStatus.PUBLISHED,
                visibility=PortfolioVisibility.PUBLIC, source="activity", source_reference=f"{run_ref}:{action_id}",
                creation_date=now, update_date=now, **values,
            )
            db.add(journey); db.flush(); binding = str(action.get("store_as") or "journey_entry_id"); bindings[binding] = journey.journey_uuid
            receipts[action_id] = {"type": kind, "entity_uuid": journey.journey_uuid}
        elif kind == "link_work_to_journey":
            work_uuid = str(_resolve(action.get("work"), local) or bindings.get("work_item_id") or "")
            journey_uuid = str(_resolve(action.get("journey"), local) or bindings.get("journey_entry_id") or "")
            work = db.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio.id, WorkItem.work_uuid == work_uuid)).first()
            journey = db.exec(select(JourneyEntry).where(JourneyEntry.portfolio_id == portfolio.id, JourneyEntry.journey_uuid == journey_uuid)).first()
            if not journey_uuid and action.get("optional"):
                receipts[action_id] = {"type": kind, "skipped": True}
                continue
            if not work or not journey: raise PortfolioActionError(action_id, "bindings", "Linked entities must belong to this portfolio")
            existing = db.exec(select(JourneyWorkLink).where(JourneyWorkLink.work_item_id == work.id, JourneyWorkLink.journey_entry_id == journey.id)).first()
            if not existing: db.add(JourneyWorkLink(link_uuid=f"jwl_{uuid4().hex}", work_item_id=work.id or 0, journey_entry_id=journey.id or 0, relationship_label=str(action.get("label") or "Related work"), creation_date=now, update_date=now))
        elif kind == "set_traits":
            trait_type = str(action.get("trait_type") or "")
            if trait_type not in TRAIT_TYPES: raise PortfolioActionError(action_id, "trait_type", "Unsupported trait type")
            labels = _resolve(action.get("values"), local) or []
            if not isinstance(labels, list): labels = [labels]
            for existing in db.exec(select(ProfileTrait).where(ProfileTrait.portfolio_id == portfolio.id, ProfileTrait.trait_type == trait_type)).all():
                db.delete(existing)
            for index, label in enumerate(labels):
                label = str(label or "").strip()
                if label: db.add(ProfileTrait(trait_uuid=f"trt_{uuid4().hex}", portfolio_id=portfolio.id or 0, trait_type=trait_type, label=label, source="activity", source_reference=f"{run_ref}:{action_id}", sort_order=index, creation_date=now, update_date=now))
        elif kind == "set_portfolio_links":
            links = _resolve(action.get("links"), local) or []
            if not isinstance(links, list): raise PortfolioActionError(action_id, "links", "Links must be a list")
            for index, item in enumerate(links):
                url = str(item.get("url") or ""); parsed = urlparse(url)
                if not url and action.get("optional"):
                    continue
                if parsed.scheme not in {"http", "https"} or not parsed.netloc: raise PortfolioActionError(action_id, "url", "Links must use http or https")
                db.add(PortfolioLink(link_uuid=f"lnk_{uuid4().hex}", portfolio_id=portfolio.id or 0, link_type=str(item.get("link_type") or "other"), platform=item.get("platform"), label=str(item.get("label") or parsed.netloc), url=url, safety_status="pending", sort_order=index, creation_date=now, update_date=now))
        elif kind == "set_theme":
            portfolio.theme_id = str(_resolve(action.get("theme_id"), local) or "default")
            settings = _resolve(action.get("theme_settings"), local)
            if isinstance(settings, dict): portfolio.theme_settings = settings
        elif kind == "set_featured_content":
            work_uuid = str(_resolve(action.get("work"), local) or bindings.get("work_item_id") or "")
            work = db.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio.id, WorkItem.work_uuid == work_uuid)).first()
            if not work: raise PortfolioActionError(action_id, "work", "Featured Work must belong to this portfolio")
            work.featured = True; db.add(work)
        elif kind == "confirm_privacy": portfolio.privacy_confirmed_at = now
        elif kind == "publish_portfolio":
            if not portfolio.privacy_confirmed_at: raise PortfolioActionError(action_id, "publish", "Privacy confirmation is required")
            portfolio.previewed_at = portfolio.previewed_at or now
            portfolio.published_at = now; portfolio.first_published_at = portfolio.first_published_at or now; portfolio.visibility = PortfolioVisibility.PUBLIC
        receipts.setdefault(action_id, {"type": kind, "applied_at": now})
    portfolio.revision += 1; portfolio.update_date = now; db.add(portfolio)
    return receipts, bindings
