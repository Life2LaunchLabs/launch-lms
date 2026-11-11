"""The suggestion engine: context -> shelves -> ranker -> what the screen shows.

One entry point per surface (``for_phase`` so far). The ranker v1 is hand-set: it drops what the person hid
here and what is already in this context's list, gives saved things to the Library shelf, keeps each resource in
the first shelf that claims it, orders shelves by their best item, and picks the top few round-robin so the short
list mixes reasons. Every pick and shelf item carries its reason. Learned ranking replaces ``rank`` later, fed by
the event log (events.py), without touching shelves or screens.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.organizations import Organization
from src.db.recommendations import RecommendationEvent
from src.db.resources import Resource, ResourceRead
from src.services.shared_content import owner_org_payload

from . import shelves as S
from .context import Context, find_phase, phase_context
from .lists import list_ids, phase_list

PICKS = 4
SHELF_SIZE = 12


def hidden_ids(db: Session, user_id: int, context: str) -> set[int]:
    rows = db.exec(select(RecommendationEvent.resource_id, RecommendationEvent.kind).where(
        RecommendationEvent.user_id == user_id, RecommendationEvent.context == context,
        col(RecommendationEvent.kind).in_(["hide", "unhide"]),
    ).order_by(col(RecommendationEvent.id))).all()
    hidden: set[int] = set()
    for rid, kind in rows:
        if rid is None:
            continue
        if kind == "hide":
            hidden.add(rid)
        else:
            hidden.discard(rid)
    return hidden


def rank(shelves: list[S.Shelf], library: S.Shelf | None, own: S.Shelf | None, drop: set[int], saved: set[int]) -> tuple[list[S.Shelf], list[tuple[S.Item, str]]]:
    claimed: set[int] = set()
    ordered: list[S.Shelf] = []
    candidates = sorted(shelves, key=lambda s: -s.best)
    # The Library shelf claims saved things first; the context's own picks come last (they chose them already).
    for shelf in ([library] if library else []) + candidates + ([own] if own else []):
        kept = []
        for item in sorted(shelf.items, key=lambda i: -i.score):
            if item.resource_id in drop or item.resource_id in claimed:
                continue
            if shelf is not library and shelf is not own and item.resource_id in saved:
                continue
            kept.append(item)
            claimed.add(item.resource_id)
        shelf.items = kept[:SHELF_SIZE]
        if shelf.items:
            ordered.append(shelf)
    # Library goes where its best item ranks among the others, not always first.
    ordered.sort(key=lambda s: -s.best if s is not own else 1)
    picks: list[tuple[S.Item, str]] = []
    depth = 0
    while len(picks) < PICKS and any(depth < len(s.items) for s in ordered if s is not own):
        for shelf in ordered:
            if shelf is own or depth >= len(shelf.items):
                continue
            picks.append((shelf.items[depth], shelf.key))
            if len(picks) >= PICKS:
                break
        depth += 1
    return ordered, picks


def _serialize(db: Session, ids: list[int], org_id: int, saved: set[int], listed: set[int]) -> dict[int, dict]:
    if not ids:
        return {}
    resources = db.exec(select(Resource).where(col(Resource.id).in_(ids))).all()
    orgs = {o.id: o for o in db.exec(select(Organization).where(col(Organization.id).in_({r.org_id for r in resources}))).all()}
    out = {}
    for r in resources:
        data = ResourceRead.model_validate(r).model_dump(exclude={"tags"})
        if r.org_id in orgs:
            data |= owner_org_payload(orgs[r.org_id], org_id)
        out[r.id] = data | {"is_saved": r.id in saved, "in_list": r.id in listed}
    return out


def recommend(db: Session, user, org_id: int, ctx: Context, list_resource_ids: set[int]) -> dict:
    p = S.pool(db, user, org_id)
    found = S.topic_shelves(ctx, p)
    careers, own = S.career_shelves(db, user, org_id, ctx, p)
    found += careers
    found += S.school_shelves(db, user, org_id, ctx, p, own)
    library = S.library_shelf(p, found + [own])
    drop = hidden_ids(db, user.id, ctx.key) | list_resource_ids
    ordered, picks = rank(found, library, own if own.items else None, drop, set(p.saved))
    ids = list({i.resource_id for s in ordered for i in s.items})
    data = _serialize(db, ids, org_id, set(p.saved), list_resource_ids)
    card = lambda item, shelf_key: data[item.resource_id] | {"reason": item.reason, "shelf": shelf_key}  # noqa: E731
    return {
        "context": {"key": ctx.key, "label": ctx.label},
        "picks": [card(item, key) for item, key in picks if item.resource_id in data],
        "shelves": [{"key": s.key, "title": s.title, "why": s.why, "items": [card(i, s.key) for i in s.items if i.resource_id in data]} for s in ordered],
    }


def for_phase(db: Session, user, org_id: int, phase_id: str) -> dict:
    phase = find_phase(db, user.id, phase_id)
    ctx = phase_context(phase)
    lst = phase_list(db, user.id, phase_id)
    in_list = list_ids(db, user.id, lst)
    result = recommend(db, user, org_id, ctx, in_list)
    saved = _serialize(db, list(in_list), org_id, in_list, in_list)
    result["list"] = {
        "user_channel_uuid": lst.user_channel_uuid, "name": lst.name, "count": len(in_list),
        "items": sorted(saved.values(), key=lambda r: r["title"].lower()),
    } if lst else None
    return result
