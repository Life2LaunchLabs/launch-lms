"""Resolve configurable hero content without exposing drafts or private sources."""
from copy import deepcopy
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.core.capabilities import CORE_CAPABILITIES
from src.db.discover import DiscoverSettings, DiscoverSlide
from src.db.learning import LearningBadge
from src.db.news import NewsArticle, NewsArticleStatus
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.learning import lookups


def _site(db: Session, org_id: int | None) -> Organization | None:
    if org_id is None:
        return db.exec(select(Organization).order_by(Organization.id)).first()
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


def _config(db: Session, org_id: int) -> OrganizationConfig | None:
    if not inspect(db.connection()).has_table("organizationconfig"):
        return None
    return db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()


def _settings(config: OrganizationConfig | None) -> DiscoverSettings:
    try:
        customization = (config.config or {}).get("customization") if config else None
        raw = customization.get("discover", {}) if isinstance(customization, dict) else {}
        return DiscoverSettings.model_validate(raw)
    except ValidationError:
        # Older malformed editorial settings cannot break the learner's catalog.
        return DiscoverSettings()


def _news(db: Session, org_id: int) -> list[NewsArticle]:
    if not CORE_CAPABILITIES["news"] or not inspect(db.connection()).has_table("newsarticle"):
        return []
    return list(db.exec(select(NewsArticle).where(NewsArticle.org_id == org_id, NewsArticle.status == NewsArticleStatus.published).order_by(NewsArticle.published_at.desc(), NewsArticle.creation_date.desc())).all())


def _sources(db: Session, org_id: int, user_id: int | None = None) -> dict:
    from src.services.badge_discover import _cards, _collection_dict, _public_collections

    badges = list(db.exec(lookups._public_badge_query().order_by(LearningBadge.id)).all())
    cards = _cards(db, badges, user_id)
    collections = _public_collections(db, None)
    groups = {int(collection.id): [] for collection in collections}
    for badge, card in zip(badges, cards):
        if badge.collection_id in groups:
            groups[badge.collection_id].append(card)
    return {
        "badge": {card["badge_uuid"]: card for card in cards},
        "collection": {collection.collection_uuid: _collection_dict(collection, groups[int(collection.id)]) for collection in collections if groups[int(collection.id)]},
        "news": {article.article_uuid: article for article in _news(db, org_id)},
    }


def _resolve(slide: DiscoverSlide, sources: dict) -> dict | None:
    item = sources.get(slide.kind, {}).get(slide.target)
    if slide.kind not in {"link", "challenges"} and item is None:
        return None
    if slide.kind == "badge":
        defaults = {"title": item["name"], "description": item["subtitle"] or item["description"], "eyebrow": "Featured badge", "action_label": "View badge", "href": f'/badges/{item["badge_uuid"].removeprefix("badge_")}', "thumbnail_url": item["thumbnail_image"], "badge": item}
    elif slide.kind == "collection":
        defaults = {"title": item["name"], "description": item["description"], "eyebrow": "Badge series", "action_label": "Explore series", "href": f'/badges/collections/{item["collection_uuid"].removeprefix("badge_collection_")}', "thumbnail_url": item["thumbnail_image"], "collection": item}
    elif slide.kind == "news":
        defaults = {"title": item.title, "description": item.summary or "", "eyebrow": "News", "action_label": "Read story", "href": f"/news/{item.slug}", "thumbnail_url": ""}
    elif slide.kind == "challenges":
        defaults = {"title": "Monthly challenges", "description": "A new way to stretch your skills. Fresh challenges are coming soon.", "eyebrow": "Coming soon", "action_label": "", "href": "", "thumbnail_url": "/jungle_landscape.jpg"}
    else:
        defaults = {"title": slide.title, "description": "", "eyebrow": "Featured", "action_label": "Learn more", "href": slide.target, "thumbnail_url": ""}
    return {**defaults, "key": f"{slide.kind}:{slide.target}", "kind": slide.kind, "theme": slide.theme, "image_url": slide.image_url, **{field: getattr(slide, field) for field in ("title", "description", "eyebrow", "action_label", "thumbnail_url") if getattr(slide, field)}}


def hero_slides(db: Session, org_id: int | None, featured: list[dict], user_id: int | None = None) -> list[dict]:
    site = _site(db, org_id)
    if not site:
        return []
    settings = _settings(_config(db, int(site.id)))
    if not settings.enabled:
        return []
    sources = _sources(db, int(site.id), user_id)
    if settings.mode == "curated":
        chosen = settings.slides
    else:
        news = [DiscoverSlide(kind="news", target=article.article_uuid) for article in sources["news"].values() if article.featured][:2]
        badges = [DiscoverSlide(kind="badge", target=card["badge_uuid"], theme="blue") for card in featured]
        series = [DiscoverSlide(kind="collection", target=uuid, theme="light") for uuid, collection in sources["collection"].items() if len(collection["badges"]) > 1][:1]
        chosen = (news + badges + series)[:5]
        if not chosen:
            chosen = [DiscoverSlide(kind="link", target="/plans", title="Find your next chapter", description="Explore badges and put your next step into a plan.", eyebrow="Discover", action_label="Explore your plans", image_url="/jungle_landscape.jpg")]
        chosen.append(DiscoverSlide(kind="challenges", target="challenges", image_url="/jungle_landscape.jpg"))
    return [resolved for slide in chosen if (resolved := _resolve(slide, sources)) is not None]


def read_settings(db: Session, user: PublicUser, org_id: int) -> dict:
    require_org_admin(user.id, org_id, db)
    site = _site(db, org_id)
    sources = _sources(db, int(site.id))
    return {
        "settings": _settings(_config(db, org_id)).model_dump(),
        "options": {
            "badges": [{"id": card["badge_uuid"], "name": card["name"]} for card in sources["badge"].values()],
            "collections": [{"id": collection["collection_uuid"], "name": collection["name"]} for collection in sources["collection"].values()],
            "news": [{"id": article.article_uuid, "name": article.title} for article in sources["news"].values()],
        },
    }


def save_settings(db: Session, user: PublicUser, org_id: int, settings: DiscoverSettings) -> dict:
    require_org_admin(user.id, org_id, db)
    _site(db, org_id)
    sources = _sources(db, org_id)
    for slide in settings.slides if settings.enabled and settings.mode == "curated" else []:
        if slide.kind not in {"link", "challenges"} and slide.target not in sources[slide.kind]:
            raise HTTPException(422, "A featured source is no longer published or available. Choose another source.")
    row = _config(db, org_id)
    if not row:
        row = OrganizationConfig(org_id=org_id, config={})
    config = deepcopy(row.config or {})
    if not isinstance(config.get("customization"), dict):
        config["customization"] = {}
    config["customization"]["discover"] = settings.model_dump()
    row.config = config
    row.update_date = datetime.now(timezone.utc).isoformat()
    db.add(row)
    db.commit()
    return read_settings(db, user, org_id)
