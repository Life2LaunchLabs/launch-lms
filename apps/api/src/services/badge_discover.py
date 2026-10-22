"""What learners see when browsing badges: the Discover feed, a badge's page and a collection's page.

Cards carry the published badge definition (its Marketing fields included) plus
what the viewer has going on with it: earned, or a badge goal in progress.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, col, select

from src.db.badge_routes import BadgeRoute
from src.db.learning import BadgeCollection, LearningBadge, LearningBadgeAward, LearningBadgeStatus, LearningBadgeVersion
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import lookups

FEATURED_COUNT = 5
# The feature an owner organization needs (the verified badge publisher program) for Discover to list its badges.
PUBLISHING = "badge_publishing"


def _user_id(current_user: PublicUser | AnonymousUser | None) -> int | None:
    return None if current_user is None or isinstance(current_user, AnonymousUser) else int(current_user.id)


def _definitions(db: Session, badges: list[LearningBadge]) -> dict[int, dict]:
    """Badge id -> its row merged with its published version's definition."""
    version_ids = [badge.active_version_id for badge in badges if badge.active_version_id]
    versions = {version.id: version for version in db.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.id.in_(version_ids))).all()} if version_ids else {}  # type: ignore[union-attr]
    merged = {}
    for badge in badges:
        payload = badge.model_dump()
        version = versions.get(badge.active_version_id)
        payload.update((version.definition or {}) if version else {})
        merged[int(badge.id)] = payload  # type: ignore[arg-type]
    return merged


def _publishers(db: Session, org_ids: set[int]) -> set[int]:
    """The organizations approved to publish badges beyond their own learners."""
    from sqlalchemy import inspect

    from src.security.access.access import orgs_with_feature

    if not org_ids or not inspect(db.connection()).has_table("organizationconfig"):
        return set()
    return orgs_with_feature(org_ids, PUBLISHING, db)


def _offered_to(db: Session, org_ids: set[int]) -> set[int]:
    """Other organizations' badges these organizations may issue (approved on one of the badge's plans)."""
    from src.services.goals.plan_issuers import issued_badge_ids

    return issued_badge_ids(db, org_ids)


def discoverable(db: Session, org_id: int | None = None, site_org_id: int | None = None, statement=None) -> list[LearningBadge]:
    """Public badges Discover may list: their owner is approved to publish badges, or the site organization
    (or ``org_id``) is authorized to issue them. ``org_id`` narrows it to that organization's own and offered badges.

    A published badge is listed only while some organization allowed to issue it lets learners start one of
    its plans, open or by request (``goals/plan_access``); coming-soon badges are previews and need none."""
    from src.services.goals.plan_access import offered_badge_ids

    offered = _offered_to(db, {item for item in (site_org_id, org_id) if item is not None})
    statement = statement if statement is not None else lookups._public_badge_query()
    if org_id is not None:
        statement = statement.where(or_(LearningBadge.org_id == org_id, col(LearningBadge.id).in_(offered or {0})))
    badges = list(db.exec(statement.order_by(LearningBadge.id)).all())
    approved = _publishers(db, {badge.org_id for badge in badges if badge.id not in offered})
    listed = [badge for badge in badges if badge.id in offered or badge.org_id in approved]
    startable = offered_badge_ids(db, [badge for badge in listed if _status(badge) != LearningBadgeStatus.COMING_SOON.value])
    return [badge for badge in listed if badge.id in startable or _status(badge) == LearningBadgeStatus.COMING_SOON.value]


def _status(badge: LearningBadge) -> str:
    return getattr(badge.status, "value", badge.status)


class _Viewer:
    """What one learner has going on across a set of badges."""

    def __init__(self, db: Session, user_id: int | None, badge_ids: list[int]):
        from src.services.goals.badges import goal_summaries

        self.earned: set[int] = set()
        self.goals: dict[int, dict] = {}
        if not user_id or not badge_ids:
            return
        self.earned = set(db.exec(select(LearningBadgeAward.badge_id).where(LearningBadgeAward.user_id == user_id, LearningBadgeAward.badge_id.in_(badge_ids))).all())  # type: ignore[union-attr]
        self.goals = goal_summaries(db, user_id, badge_ids)


def _route_counts(db: Session, badge_ids: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for badge_id in db.exec(select(BadgeRoute.badge_id).where(BadgeRoute.badge_id.in_(badge_ids))).all() if badge_ids else []:  # type: ignore[union-attr]
        counts[badge_id] = counts.get(badge_id, 0) + 1
    return counts


def _orgs(db: Session, org_ids: set[int]) -> dict[int, dict]:
    if not org_ids:
        return {}
    return {
        int(org.id): {"id": org.id, "name": org.name, "slug": org.slug, "logo_image": org.logo_image or "", "org_uuid": org.org_uuid}  # type: ignore[arg-type]
        for org in db.exec(select(Organization).where(Organization.id.in_(list(org_ids)))).all()  # type: ignore[union-attr]
    }


def _cards(db: Session, badges: list[LearningBadge], user_id: int | None, collections: dict[int, BadgeCollection] | None = None) -> list[dict]:
    ids = [int(badge.id) for badge in badges]  # type: ignore[arg-type]
    definitions = _definitions(db, badges)
    viewer = _Viewer(db, user_id, ids)
    routes = _route_counts(db, ids)
    orgs = _orgs(db, {badge.org_id for badge in badges})
    collections = collections if collections is not None else {
        int(item.id): item for item in db.exec(select(BadgeCollection).where(BadgeCollection.id.in_({badge.collection_id for badge in badges if badge.collection_id}))).all()  # type: ignore[union-attr]
    }
    cards = []
    for badge in badges:
        payload = definitions[int(badge.id)]  # type: ignore[arg-type]
        metadata = payload.get("badge_metadata") or {}
        collection = collections.get(badge.collection_id or 0)
        cards.append({
            "badge_uuid": badge.badge_uuid, "name": payload.get("name") or badge.name, "description": payload.get("description") or "",
            "thumbnail_image": payload.get("thumbnail_image") or "", "status": getattr(badge.status, "value", badge.status),
            "subtitle": metadata.get("overview_subtitle") or "", "time_label": metadata.get("estimated_time_label") or metadata.get("estimated_time") or "",
            "creator": orgs.get(badge.org_id), "route_count": routes.get(int(badge.id), 0),  # type: ignore[arg-type]
            "collection": {"collection_uuid": collection.collection_uuid, "name": collection.name} if collection else None,
            "earned": badge.id in viewer.earned,
            "goal": viewer.goals.get(int(badge.id)),  # type: ignore[arg-type]
            "update_date": badge.update_date,
        })
    return cards


def _collection_dict(collection: BadgeCollection, cards: list[dict], creator: dict | None = None) -> dict:
    metadata = collection.collection_metadata or {}
    return {
        "collection_uuid": collection.collection_uuid, "name": collection.name, "description": collection.description or "",
        "thumbnail_image": collection.thumbnail_image or "", "creator": creator,
        "credibility": metadata.get("credibility") or "", "endorsers": metadata.get("endorsers") or [],
        "badges": cards,
    }


def _public_collections(db: Session, org_id: int | None) -> list[BadgeCollection]:
    statement = select(BadgeCollection).where(BadgeCollection.public == True, BadgeCollection.hidden == False, BadgeCollection.deleted_at.is_(None))  # noqa: E712  # type: ignore[union-attr]
    if org_id is not None:
        statement = statement.where(BadgeCollection.org_id == org_id)
    return list(db.exec(statement.order_by(BadgeCollection.id)).all())


def discover(db: Session, current_user: PublicUser | AnonymousUser | None, org_id: int | None = None, site_org_id: int | None = None) -> dict:
    """Everything the Discover page shows, in one call."""
    user_id = _user_id(current_user)
    badges = discoverable(db, org_id, site_org_id)
    collections = {int(item.id): item for item in _public_collections(db, org_id)}  # type: ignore[arg-type]
    cards = _cards(db, badges, user_id, collections)
    by_collection: dict[int, list[dict]] = {}
    for badge, card in zip(badges, cards):
        if badge.collection_id in collections:
            by_collection.setdefault(int(badge.collection_id), []).append(card)  # type: ignore[arg-type]
    available = [card for card in cards if not card["earned"] and not card["goal"]]
    startable = [card for card in available if card["status"] == LearningBadgeStatus.PUBLISHED.value]
    # Badges with art first, newest first: the hero carousel is image-led.
    featured = sorted(startable, key=lambda card: (bool(card["thumbnail_image"]), card["update_date"] or ""), reverse=True)[:FEATURED_COUNT]
    from src.services.discover_featured import hero_slides

    return {
        # The hero draws on the whole public catalog; reuse this feed's cards when it is that catalog.
        "hero_slides": hero_slides(db, site_org_id or org_id, featured, user_id, (badges, cards, list(collections.values())) if org_id is None else None),
        "featured": featured,
        "keep_going": [card for card in cards if card["goal"]],
        "collections": [_collection_dict(collections[collection_id], items) for collection_id, items in by_collection.items()],
        "badges": available,
        "earned_count": sum(card["earned"] for card in cards),
    }


def _collection_or_404(db: Session, collection_uuid: str) -> BadgeCollection:
    clean = collection_uuid if collection_uuid.startswith("badge_collection_") else f"badge_collection_{collection_uuid}"
    collection = db.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid.in_([collection_uuid, clean]), BadgeCollection.deleted_at.is_(None))).first()  # type: ignore[union-attr]
    if not collection or not collection.public:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def collection_page(db: Session, current_user: PublicUser | AnonymousUser | None, collection_uuid: str) -> dict:
    """A collection with every public badge in it (hidden collections are reachable by link)."""
    collection = _collection_or_404(db, collection_uuid)
    badges = discoverable(db, statement=lookups._public_badge_query(None).where(LearningBadge.collection_id == collection.id))
    cards = _cards(db, badges, _user_id(current_user), {int(collection.id): collection})  # type: ignore[arg-type]
    return _collection_dict(collection, cards, _orgs(db, {collection.org_id}).get(collection.org_id))


def badge_page(db: Session, current_user: PublicUser | AnonymousUser | None, badge_uuid: str) -> dict:
    """A badge's page: the card, its Marketing story, the ways to earn it and the rest of its set."""
    from src.services.goals.badge_routes import list_routes

    badge = lookups._get_badge(db, badge_uuid)
    if not lookups._can_read_badge(db, badge, current_user or AnonymousUser()):
        raise HTTPException(status_code=404, detail="Badge not found")
    user_id = _user_id(current_user)
    card = _cards(db, [badge], user_id)[0]
    payload = _definitions(db, [badge])[int(badge.id)]  # type: ignore[arg-type]
    metadata = payload.get("badge_metadata") or {}
    collection = db.get(BadgeCollection, badge.collection_id) if badge.collection_id else None
    siblings = []
    if collection and collection.public and collection.deleted_at is None:
        others = discoverable(db, statement=lookups._public_badge_query(None).where(LearningBadge.collection_id == collection.id, LearningBadge.id != badge.id))
        siblings = _cards(db, others, user_id, {int(collection.id): collection})  # type: ignore[arg-type]
    return {
        **card,
        "about": payload.get("about") or "", "criteria": payload.get("criteria") or "",
        "trust_line": metadata.get("trust_line") or "",
        "proves": [item for item in metadata.get("overview_cards") or [] if (item or {}).get("title") or (item or {}).get("body")],
        "collection": _collection_dict(collection, siblings) if collection and collection.public and collection.deleted_at is None else None,
        "ways": list_routes(db, current_user if user_id else None, badge.badge_uuid),
    }
