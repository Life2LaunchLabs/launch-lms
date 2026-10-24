"""Resolve configurable hero content without exposing drafts or private sources."""
from copy import deepcopy
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.discover import DiscoverSettings, DiscoverSlide
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin


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
        if isinstance(raw, dict) and isinstance(raw.get("slides"), list):
            # News and badge slides were retired from Discover; drop them rather than the whole curation.
            raw = {**raw, "slides": [slide for slide in raw["slides"] if not (isinstance(slide, dict) and slide.get("kind") in ("news", "badge"))]}
        return DiscoverSettings.model_validate(raw)
    except ValidationError:
        # Older malformed editorial settings cannot break the learner's catalog.
        return DiscoverSettings()


def _sources(db: Session, user_id: int | None = None, catalog: tuple[list, list] | None = None, site_org_id: int | None = None) -> dict:
    """Publishable hero sources. ``catalog`` (plan cards, collections) reuses what Discover already built."""
    from src.services.goals import plan_joining

    if catalog:
        cards, collections = catalog
    else:
        items = plan_joining.offers(db, site_org_id=site_org_id)
        cards = plan_joining._cards(db, items, user_id)
        collections = plan_joining._collections(db, items, cards)
    return {
        "plan": {card["template_uuid"]: card for card in cards},
        "collection": {collection["collection_uuid"]: collection for collection in collections},
    }


def _resolve(slide: DiscoverSlide, sources: dict) -> dict | None:
    item = sources.get(slide.kind, {}).get(slide.target)
    if slide.kind not in {"link", "challenges"} and item is None:
        return None
    if slide.kind == "plan":
        eyebrow = "Earn a badge" if item["badge"] else "Featured plan"
        defaults = {"title": item["title"], "description": item["description"], "eyebrow": eyebrow, "action_label": "View plan",
                    "href": f'/discover/plans/{item["template_uuid"]}', "thumbnail_url": item["thumbnail_image"] or (item["badge"] or {}).get("image_url") or "", "plan": item}
    elif slide.kind == "collection":
        first = item["plans"][0] if item["plans"] else {}
        defaults = {"title": item["name"], "description": item["description"], "eyebrow": "Collection", "action_label": "Explore collection",
                    "href": f'/discover/collections/{item["collection_uuid"]}', "thumbnail_url": first.get("thumbnail_image") or "", "collection": item}
    elif slide.kind == "challenges":
        defaults = {"title": "Monthly challenges", "description": "A new way to stretch your skills. Fresh challenges are coming soon.", "eyebrow": "Coming soon", "action_label": "", "href": "", "thumbnail_url": "/jungle_landscape.jpg"}
    else:
        defaults = {"title": slide.title, "description": "", "eyebrow": "Featured", "action_label": "Learn more", "href": slide.target, "thumbnail_url": ""}
    return {**defaults, "key": f"{slide.kind}:{slide.target}", "kind": slide.kind, "theme": slide.theme, "image_url": slide.image_url, **{field: getattr(slide, field) for field in ("title", "description", "eyebrow", "action_label", "thumbnail_url") if getattr(slide, field)}}


def hero_slides(db: Session, org_id: int | None, featured: list[dict], user_id: int | None = None, catalog: tuple[list, list] | None = None) -> list[dict]:
    site = _site(db, org_id)
    if not site:
        return []
    settings = _settings(_config(db, int(site.id)))
    if not settings.enabled:
        return []
    sources = _sources(db, user_id, catalog, int(site.id))
    if settings.mode == "curated":
        chosen = settings.slides
    else:
        plans = [DiscoverSlide(kind="plan", target=card["template_uuid"], theme="blue") for card in featured]
        series = [DiscoverSlide(kind="collection", target=uuid, theme="light") for uuid in sources["collection"]][:1]
        chosen = (plans + series)[:5]
        if not chosen:
            chosen = [DiscoverSlide(kind="link", target="/plans", title="Find your next chapter", description="Explore plans and turn your next step into a goal.", eyebrow="Discover", action_label="Go to your goals", image_url="/jungle_landscape.jpg")]
        chosen.append(DiscoverSlide(kind="challenges", target="challenges", image_url="/jungle_landscape.jpg"))
    return [resolved for slide in chosen if (resolved := _resolve(slide, sources)) is not None]


def read_settings(db: Session, user: PublicUser, org_id: int) -> dict:
    require_org_admin(user.id, org_id, db)
    _site(db, org_id)
    sources = _sources(db, site_org_id=org_id)
    return {
        "settings": _settings(_config(db, org_id)).model_dump(),
        "options": {
            "plans": [{"id": card["template_uuid"], "name": card["title"]} for card in sources["plan"].values()],
            "collections": [{"id": collection["collection_uuid"], "name": collection["name"]} for collection in sources["collection"].values()],
        },
    }


def save_settings(db: Session, user: PublicUser, org_id: int, settings: DiscoverSettings) -> dict:
    require_org_admin(user.id, org_id, db)
    _site(db, org_id)
    sources = _sources(db, site_org_id=org_id)
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
