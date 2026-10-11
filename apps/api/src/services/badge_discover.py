"""What learners see when browsing badges: the Discover feed, a badge's page and a collection's page.

Cards carry the published badge definition (its Marketing fields included) plus
what the viewer has going on with it: earned, or a badge plan in progress.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute
from src.db.learning import BadgeCollection, LearningBadge, LearningBadgeAward, LearningBadgeStatus, LearningBadgeVersion
from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus, PlanStatus
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import lookups

FEATURED_COUNT = 5


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


def _plan_progress(db: Session, plans: list[Plan]) -> dict[int, tuple[int, int]]:
    """Plan id -> (steps done, steps in all)."""
    if not plans:
        return {}
    counts: dict[int, list[int]] = {int(plan.id): [0, 0] for plan in plans}  # type: ignore[arg-type]
    rows = db.exec(
        select(PlanObjective.plan_id, PlanObjectiveProgress.status).outerjoin(PlanObjectiveProgress, PlanObjectiveProgress.plan_objective_id == PlanObjective.id)
        .where(PlanObjective.plan_id.in_(list(counts)))  # type: ignore[union-attr]
    ).all()
    for plan_id, status in rows:
        if getattr(status, "value", status) == PlanObjectiveStatus.CANCELED.value:
            continue
        counts[plan_id][1] += 1
        counts[plan_id][0] += getattr(status, "value", status) == PlanObjectiveStatus.COMPLETED.value
    return {plan_id: (done, total) for plan_id, (done, total) in counts.items()}


class _Viewer:
    """What one learner has going on across a set of badges."""

    def __init__(self, db: Session, user_id: int | None, badge_ids: list[int]):
        self.earned: set[int] = set()
        self.plans: dict[int, Plan] = {}
        self.progress: dict[int, tuple[int, int]] = {}
        if not user_id or not badge_ids:
            return
        self.earned = set(db.exec(select(LearningBadgeAward.badge_id).where(LearningBadgeAward.user_id == user_id, LearningBadgeAward.badge_id.in_(badge_ids))).all())  # type: ignore[union-attr]
        plans = db.exec(select(Plan).where(
            Plan.subject_user_id == user_id, Plan.source_badge_id.in_(badge_ids), Plan.status == PlanStatus.ACTIVE,  # type: ignore[union-attr]
        ).order_by(Plan.id)).all()
        self.plans = {int(plan.source_badge_id): plan for plan in plans}  # type: ignore[arg-type]
        self.progress = _plan_progress(db, list(self.plans.values()))


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
        plan = viewer.plans.get(int(badge.id))  # type: ignore[arg-type]
        done, total = viewer.progress.get(int(plan.id), (0, 0)) if plan else (0, 0)  # type: ignore[arg-type]
        collection = collections.get(badge.collection_id or 0)
        cards.append({
            "badge_uuid": badge.badge_uuid, "name": payload.get("name") or badge.name, "description": payload.get("description") or "",
            "thumbnail_image": payload.get("thumbnail_image") or "", "status": getattr(badge.status, "value", badge.status),
            "subtitle": metadata.get("overview_subtitle") or "", "time_label": metadata.get("estimated_time_label") or metadata.get("estimated_time") or "",
            "creator": orgs.get(badge.org_id), "route_count": routes.get(int(badge.id), 0),  # type: ignore[arg-type]
            "collection": {"collection_uuid": collection.collection_uuid, "name": collection.name} if collection else None,
            "earned": badge.id in viewer.earned,
            "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "done": done, "total": total} if plan else None,
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


def discover(db: Session, current_user: PublicUser | AnonymousUser | None, org_id: int | None = None) -> dict:
    """Everything the Discover page shows, in one call."""
    user_id = _user_id(current_user)
    badges = list(db.exec(lookups._public_badge_query(org_id)).all())
    collections = {int(item.id): item for item in _public_collections(db, org_id)}  # type: ignore[arg-type]
    cards = _cards(db, badges, user_id, collections)
    by_collection: dict[int, list[dict]] = {}
    for badge, card in zip(badges, cards):
        if badge.collection_id in collections:
            by_collection.setdefault(int(badge.collection_id), []).append(card)  # type: ignore[arg-type]
    available = [card for card in cards if not card["earned"] and not card["plan"]]
    startable = [card for card in available if card["status"] == LearningBadgeStatus.PUBLISHED.value]
    # Badges with art first, newest first: the hero carousel is image-led.
    featured = sorted(startable, key=lambda card: (bool(card["thumbnail_image"]), card["update_date"] or ""), reverse=True)[:FEATURED_COUNT]
    return {
        "featured": featured,
        "keep_going": [card for card in cards if card["plan"]],
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
    badges = list(db.exec(lookups._public_badge_query(None).where(LearningBadge.collection_id == collection.id).order_by(LearningBadge.id)).all())
    cards = _cards(db, badges, _user_id(current_user), {int(collection.id): collection})  # type: ignore[arg-type]
    return _collection_dict(collection, cards, _orgs(db, {collection.org_id}).get(collection.org_id))


def badge_page(db: Session, current_user: PublicUser | AnonymousUser | None, badge_uuid: str) -> dict:
    """A badge's page: the card, its Marketing story, the ways to earn it and the rest of its set."""
    from src.services.badge_routes import _badge, list_routes

    badge = _badge(db, badge_uuid)
    if not lookups._can_read_badge(db, badge, current_user or AnonymousUser()):
        raise HTTPException(status_code=404, detail="Badge not found")
    user_id = _user_id(current_user)
    card = _cards(db, [badge], user_id)[0]
    payload = _definitions(db, [badge])[int(badge.id)]  # type: ignore[arg-type]
    metadata = payload.get("badge_metadata") or {}
    collection = db.get(BadgeCollection, badge.collection_id) if badge.collection_id else None
    siblings = []
    if collection and collection.public and collection.deleted_at is None:
        others = list(db.exec(lookups._public_badge_query(None).where(LearningBadge.collection_id == collection.id, LearningBadge.id != badge.id).order_by(LearningBadge.id)).all())
        siblings = _cards(db, others, user_id, {int(collection.id): collection})  # type: ignore[arg-type]
    return {
        **card,
        "about": payload.get("about") or "", "criteria": payload.get("criteria") or "",
        "trust_line": metadata.get("trust_line") or "",
        "proves": [item for item in metadata.get("overview_cards") or [] if (item or {}).get("title") or (item or {}).get("body")],
        "collection": _collection_dict(collection, siblings) if collection and collection.public and collection.deleted_at is None else None,
        "ways": list_routes(db, current_user if user_id else None, badge.badge_uuid),
    }
