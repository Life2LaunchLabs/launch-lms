"""Shelves: small generators that each find candidates for a context and say why.

Each shelf returns ``Shelf`` objects with scored items; the title is the reason the person reads. Shelves never
see each other: the ranker (engine.py) drops what the person hid, removes duplicates and orders everything. A new
shelf (more like what you saved, popular with people planning the same thing) is one more function here.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from sqlalchemy import func
from sqlmodel import Session, col, select

from src.db.life_plans import CareerEntry, SchoolEntry
from src.db.resources import Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink, UserSavedResource
from src.services.life_plans.careers import _site, career_resources, code_of, school_links
from src.services.life_plans.places import STATES
from src.services.life_plans.public_data import live_careers, live_schools

from .context import Context
from .topics import TOPICS

STATE_TAGS = {name.lower(): code for code, name in STATES.items()}
RELATED_PER_CAREER = 8
SIMILAR_SCHOOLS = 8


@dataclass
class Item:
    resource_id: int
    score: float
    reason: str


@dataclass
class Shelf:
    key: str
    title: str
    why: str
    items: list[Item] = field(default_factory=list)

    @property
    def best(self) -> float:
        return max((i.score for i in self.items), default=0)


@dataclass
class Pool:
    """The resources the person may open here, with what the shelves match on, read once per request."""
    ids: set[int]
    tags: dict[int, set[str]]
    channels: dict[int, set[str]]
    types: dict[int, str]
    featured: set[int]
    saved: dict[int, UserSavedResource]


def pool(db: Session, user, org_id: int) -> Pool:
    from src.services.resources import _org_resource_ids

    library = set(db.exec(
        select(ResourceChannelResource.resource_id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(ResourceChannel.listed == True)  # noqa: E712
    ).all())
    ids = _org_resource_ids(org_id, db, user) | library
    saved_rows = db.exec(select(UserSavedResource).where(UserSavedResource.user_id == user.id)).all()
    saved = {row.resource_id: row for row in saved_rows}
    ids |= set(saved) & _accessible(db, user, set(saved) - ids)
    tags: dict[int, set[str]] = {}
    channels: dict[int, set[str]] = {}
    types: dict[int, str] = {}
    featured: set[int] = set()
    if ids:
        id_list = list(ids)
        for rid, name in db.exec(select(ResourceTagLink.resource_id, func.lower(ResourceTag.name)).join(ResourceTag, ResourceTag.id == ResourceTagLink.tag_id).where(col(ResourceTagLink.resource_id).in_(id_list))).all():
            tags.setdefault(rid, set()).add((name or "").strip())
        for rid, name in db.exec(select(ResourceChannelResource.resource_id, func.lower(ResourceChannel.name)).join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id).where(col(ResourceChannelResource.resource_id).in_(id_list))).all():
            channels.setdefault(rid, set()).add((name or "").strip())
        for rid, kind, star in db.exec(select(Resource.id, Resource.resource_type, Resource.is_featured).where(col(Resource.id).in_(id_list))).all():
            types[rid] = getattr(kind, "value", kind)
            if star:
                featured.add(rid)
    return Pool(ids=ids, tags=tags, channels=channels, types=types, featured=featured, saved={k: v for k, v in saved.items() if k in ids})


def _accessible(db: Session, user, ids: set[int]) -> set[int]:
    """Saved resources outside the org's channels that the person can still open (a Library one, say)."""
    from src.services.resources import _resource_in_accessible_channel

    if not ids:
        return set()
    return {r.id for r in db.exec(select(Resource).where(col(Resource.id).in_(list(ids)))).all() if _resource_in_accessible_channel(r, db, user)}


def topic_shelves(ctx: Context, p: Pool) -> list[Shelf]:
    shelves = []
    for key, (weight, why) in ctx.topics.items():
        topic = TOPICS.get(key)
        if not topic:
            continue
        tag_set, channel_set = set(topic["tags"]), set(topic["channels"])
        shelf = Shelf(key=f"topic:{key}", title=topic["title"], why=why)
        for rid in p.ids:
            if p.types.get(rid) in {"career", "school"}:
                continue
            names = p.tags.get(rid, set())
            tag_hit, channel_hit = bool(names & tag_set), bool(p.channels.get(rid, set()) & channel_set)
            if not (tag_hit or channel_hit):
                continue
            states = {STATE_TAGS[n] for n in names if n in STATE_TAGS}
            if states and ctx.state not in states:
                continue
            score = weight * (1.0 if tag_hit else 0.8) + (0.5 if states else 0) + (0.2 if rid in p.featured else 0)
            shelf.items.append(Item(rid, score, topic["title"]))
        if shelf.items:
            shelves.append(shelf)
    return shelves


def _career_titles(db: Session, codes: list[str]) -> dict[str, CareerEntry]:
    if not codes:
        return {}
    return {c.code: c for c in db.exec(live_careers().where(col(CareerEntry.code).in_(codes))).all()}


def saved_careers(db: Session, p: Pool, limit: int = 2) -> dict[str, str]:
    """Careers the person saved and is into (2 or 3), most into first, by code."""
    rows = sorted((s for s in p.saved.values() if (s.interest_level or 0) >= 2), key=lambda s: -(s.interest_level or 0))
    out: dict[str, str] = {}
    for row in rows:
        resource = db.get(Resource, row.resource_id)
        code = code_of(resource) if resource and getattr(resource.resource_type, "value", resource.resource_type) == "career" else None
        if code and code not in out:
            out[code] = ""
        if len(out) >= limit:
            break
    return out


def career_shelves(db: Session, user, org_id: int, ctx: Context, p: Pool) -> tuple[list[Shelf], Shelf | None]:
    """"Careers like X" for each career in the context and the careers they saved, plus the context's own careers."""
    by_code = career_resources(db, user, org_id)
    mine = dict(ctx.careers)
    seeds = list(mine) + [c for c in saved_careers(db, p) if c not in mine]
    entries = _career_titles(db, seeds)
    shelves: list[Shelf] = []
    own = Shelf(key="in_context", title="In this phase", why="What you picked for this phase")
    for code in ctx.careers:
        if code in by_code and by_code[code].id in p.ids:
            own.items.append(Item(by_code[code].id, 1.2, "Picked for this phase"))
    for code in seeds:
        entry = entries.get(code)
        if not entry:
            continue
        name = (mine.get(code) or entry.title).strip()
        shelf = Shelf(key=f"careers_like:{code}", title=f"Careers like {name}", why="On your plan" if code in mine else "You saved it")
        for i, related in enumerate((entry.related or [])[:RELATED_PER_CAREER]):
            resource = by_code.get(related)
            if resource and resource.id in p.ids:
                shelf.items.append(Item(resource.id, (2.2 if code in mine else 1.8) - i * 0.1, shelf.title))
        if shelf.items:
            shelves.append(shelf)
    return shelves, own


def school_shelves(db: Session, user, org_id: int, ctx: Context, p: Pool, own: Shelf) -> list[Shelf]:
    """"Schools like X": schools in the same state with the same kind of degree, closest in size first."""
    if not ctx.schools:
        return []
    links = school_links(db, user, org_id)
    if not links:
        return []
    uuids = {r.resource_uuid: r.id for r in db.exec(select(Resource).where(col(Resource.resource_uuid).in_(list(links.values())))).all()}

    def resource_id(school: SchoolEntry) -> int | None:
        rid = uuids.get(links.get(_site(school.url), ""))
        return rid if rid in p.ids else None

    entries = {s.unitid: s for s in db.exec(live_schools().where(col(SchoolEntry.unitid).in_(list(ctx.schools)))).all()}
    if ctx.picked_school in entries and (rid := resource_id(entries[ctx.picked_school])):
        own.items.append(Item(rid, 1.2, "Picked for this phase"))
    seed = entries.get(ctx.picked_school or "") or next(iter(entries.values()), None)
    if not seed:
        return []
    rows = db.exec(live_schools().where(SchoolEntry.state == seed.state, SchoolEntry.degree == seed.degree, SchoolEntry.unitid != seed.unitid)).all()
    size = math.log((seed.students or 1000) + 1)
    ranked = sorted(rows, key=lambda s: abs(math.log((s.students or 1000) + 1) - size) + (0 if s.control == seed.control else 0.7))
    shelf = Shelf(key=f"schools_like:{seed.unitid}", title=f"Schools like {seed.name}", why="Your school for this phase" if seed.unitid == ctx.picked_school else "You're weighing it")
    for i, school in enumerate(ranked):
        rid = resource_id(school)
        if rid:
            shelf.items.append(Item(rid, 1.9 - len(shelf.items) * 0.1, shelf.title))
        if len(shelf.items) >= SIMILAR_SCHOOLS:
            break
    return [shelf] if shelf.items else []


def library_shelf(p: Pool, others: list[Shelf]) -> Shelf | None:
    """What they already saved that fits here: shown as theirs, never as something new."""
    fits = {i.resource_id for s in others for i in s.items}
    shelf = Shelf(key="library", title="From your Library", why="Saved before, useful here")
    for rid, row in p.saved.items():
        if rid in fits:
            shelf.items.append(Item(rid, 1.6 - (0.3 if row.completed_at else 0), "Saved in your Library"))
    return shelf if shelf.items else None
