"""Estimates: the most specific reviewed fact for a metric, a place and a breakdown.

The resolver walks the place ladder (city, county, wage area, state, US) and, at each
place, tries the full breakdown first and then drops optional dimensions from the end.
The first reviewed fact wins, and the answer says which level it landed on and which
source it came from. No fact means no estimate.
"""

from __future__ import annotations

import json
from collections.abc import Iterable

from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from src.db.life_plans import EstimateFact, EstimateSource
from src.services.life_plans import places
from src.services.life_plans.catalog import METRICS

REVIEWED = "reviewed"


def dims_key(dims: dict) -> str:
    """A stable text form of a breakdown, so facts can be matched by index."""
    return json.dumps({k: dims[k] for k in sorted(dims)}, separators=(",", ":"), sort_keys=True) if dims else ""


class EstimateQuery(BaseModel):
    id: str = Field(max_length=80)
    metric: str = Field(max_length=64)
    place: str | None = Field(default=None, max_length=64)
    dims: dict = Field(default_factory=dict)


def _dim_ladder(metric: str, dims: dict) -> list[dict]:
    spec = METRICS.get(metric, {"dims": [], "required": []})
    order = [d for d in spec["dims"] if d in dims and dims[d] not in (None, "")]
    required = [d for d in spec["required"]]
    if any(d not in order for d in required):
        return []
    out = []
    keep = list(order)
    while True:
        out.append({d: dims[d] for d in keep})
        optional = [d for d in keep if d not in required]
        if not optional:
            break
        keep.remove(optional[-1])
    return out


def _source_view(src: EstimateSource) -> dict:
    return {"key": src.key, "publisher": src.publisher, "title": src.title, "dataset": src.dataset, "url": src.url, "released": src.released, "retrieved": src.retrieved, "notes": src.notes}


def _fact_view(fact: EstimateFact, src: EstimateSource, *, asked_place: str | None, asked_dims: dict) -> dict:
    level = places.level_of(fact.place)
    asked_level = places.level_of(asked_place) if asked_place else "us"
    broad = [d for d in asked_dims if d not in fact.dims]
    return {
        "metric": fact.metric,
        "value": fact.value,
        "percentiles": fact.percentiles,
        "period": fact.period,
        "stat": fact.stat,
        "label": fact.label,
        "dollar_year": fact.dollar_year,
        "place": fact.place,
        "place_label": places.label(fact.place),
        "level": level,
        "fallback": level != asked_level or bool(broad),
        "asked_place_label": places.label(asked_place) if asked_place else None,
        "dims": fact.dims,
        "dims_dropped": broad,
        "source": _source_view(src),
    }


def resolve_many(db: Session, queries: Iterable[EstimateQuery]) -> dict[str, dict | None]:
    queries = list(queries)
    if not queries:
        return {}
    metrics = {q.metric for q in queries}
    ladders = {q.id: places.ladder(q.place) for q in queries}
    keys = {k for ls in ladders.values() for k in ls}
    rows = db.exec(
        select(EstimateFact, EstimateSource)
        .join(EstimateSource, col(EstimateSource.id) == col(EstimateFact.source_id))
        .where(col(EstimateFact.metric).in_(metrics), col(EstimateFact.place).in_(keys), EstimateFact.status == REVIEWED)
    ).all()
    # Newest release wins when two reviewed facts match the same slot.
    index: dict[tuple[str, str, str], tuple[EstimateFact, EstimateSource]] = {}
    for fact, src in rows:
        slot = (fact.metric, fact.place, fact.dims_key)
        have = index.get(slot)
        if not have or (src.released or "") > (have[1].released or ""):
            index[slot] = (fact, src)
    out: dict[str, dict | None] = {}
    for q in queries:
        found = None
        for place in ladders[q.id]:
            for dims in _dim_ladder(q.metric, q.dims):
                hit = index.get((q.metric, place, dims_key(dims)))
                if hit:
                    found = _fact_view(hit[0], hit[1], asked_place=q.place, asked_dims={k: v for k, v in q.dims.items() if v not in (None, "")})
                    break
            if found:
                break
        out[q.id] = found
    return out


def occupations(db: Session, query: str = "", limit: int = 20) -> list[dict]:
    """Jobs we have reviewed pay figures for, matched on their title."""
    stmt = select(EstimateFact.dims, EstimateFact.label).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED)
    if query.strip():
        stmt = stmt.where(col(EstimateFact.label).ilike(f"%{query.strip()}%"))
    seen: dict[str, str] = {}
    for dims, lab in db.exec(stmt.limit(2000)).all():
        soc = (dims or {}).get("soc")
        if soc and soc not in seen and soc != "00-0000":
            seen[soc] = lab
    rows = sorted(({"soc": s, "title": t} for s, t in seen.items()), key=lambda r: (not r["title"].lower().startswith(query.strip().lower()), r["title"]))
    return rows[:limit]


def coverage(db: Session) -> list[dict]:
    """Per source: how many facts, by status, for the admin coverage view."""
    out = []
    for src in db.exec(select(EstimateSource).order_by(col(EstimateSource.id))).all():
        facts = db.exec(select(EstimateFact.status, EstimateFact.metric, EstimateFact.place).where(EstimateFact.source_id == src.id)).all()
        by_status: dict[str, int] = {}
        levels: dict[str, int] = {}
        metrics: set[str] = set()
        for status, metric, place in facts:
            by_status[status] = by_status.get(status, 0) + 1
            levels[places.level_of(place)] = levels.get(places.level_of(place), 0) + 1
            metrics.add(metric)
        out.append({**_source_view(src), "id": src.id, "facts": len(facts), "by_status": by_status, "levels": levels, "metrics": sorted(metrics)})
    return out
