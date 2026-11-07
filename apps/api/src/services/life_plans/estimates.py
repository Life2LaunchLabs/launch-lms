"""Estimates: the most specific reviewed fact for a metric, a place and a breakdown.

The resolver walks the place ladder (city, county, wage area, state, US) and, at each
place, tries the full breakdown first and then drops optional dimensions from the end.
The first reviewed fact wins, and the answer says which level it landed on and which
source it came from. No fact means no estimate.

A metric with a `scale` (a price-level metric, like BEA's Regional Price Parities) turns a
national figure into a local one: national value x the most specific price level on the
ladder / 100. The answer names both sources, and the level is the price level's.
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
    metrics |= {METRICS[m][k] for m in list(metrics) for k in ("scale", "compose") if METRICS.get(m, {}).get(k)}
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
        if METRICS.get(q.metric, {}).get("compose") == "food_plan":
            found = _food(q, index)
        for place in ([] if found else ladders[q.id]):
            for dims in _dim_ladder(q.metric, q.dims):
                hit = index.get((q.metric, place, dims_key(dims)))
                if hit:
                    found = _fact_view(hit[0], hit[1], asked_place=q.place, asked_dims={k: v for k, v in q.dims.items() if v not in (None, "")})
                    break
            if found:
                break
        scale = METRICS.get(q.metric, {}).get("scale")
        if found and scale and found["place"] == "us":
            found = _scaled(found, next((index[(scale, p, "")] for p in ladders[q.id] if (scale, p, "") in index), None), q.place)
        out[q.id] = found
    return out


# USDA's household-size adjustment to its per-person costs (people in the household -> factor).
FOOD_SIZE = {1: 1.2, 2: 1.1, 3: 1.05, 4: 1.0, 5: 0.95, 6: 0.95}
FOOD_KID_GROUPS = ((1, "1"), (3, "2-3"), (5, "4-5"), (8, "6-8"), (11, "9-11"), (13, "12-13"), (17, "14-18"))


def _food(q: EstimateQuery, index: dict) -> dict | None:
    """Groceries for the household: USDA's cost for each person (adults and teens averaged over women
    and men, since we don't ask), added up, times USDA's household-size adjustment."""
    plan = q.dims.get("plan") or "moderate"
    adults = max(1, min(2, int(q.dims.get("adults") or 1)))
    kids = [int(a) for a in (q.dims.get("kids") or [])]

    def cost(group: str) -> tuple[EstimateFact, EstimateSource] | None:
        return index.get(("food_plan", "us", dims_key({"group": group, "plan": plan})))

    def person(groups: list[str]) -> float | None:
        hits = [cost(g) for g in groups]
        return sum(h[0].value for h in hits) / len(hits) if all(hits) else None

    parts = [person(["adultf", "adultm"])] * adults
    for age in kids:
        band = next(g for top, g in FOOD_KID_GROUPS if max(age, 1) <= top)
        parts.append(person([band]) if age < 12 else person([band + "f", band + "m"]))
    if any(p is None for p in parts):
        return None
    n = len(parts)
    factor = FOOD_SIZE.get(n, 0.9)
    fact, src = cost("adultf")  # type: ignore[misc]
    who = "you" if n == 1 else f"{n} people"
    view = _fact_view(fact, src, asked_place=q.place, asked_dims={})
    return {**view, "metric": q.metric, "value": round(sum(parts) * factor, 2), "dims": {"plan": plan, "adults": adults, "kids": kids},
            "label": f"{fact.label} for {who}" + ("" if factor == 1 else f", {'+' if factor > 1 else ''}{round((factor - 1) * 100)}% for a household of {n} (USDA's adjustment)"),
            "stat": "our sum of USDA per-person costs", "fallback": False}


def _scaled(found: dict, price: tuple[EstimateFact, EstimateSource] | None, asked_place: str | None) -> dict:
    """A national figure moved to the place's price level (no price level: the national figure as is)."""
    if not price or price[0].place == "us":
        return found
    fact, src = price
    level = places.level_of(fact.place)
    return {
        **found,
        "value": round(found["value"] * fact.value / 100, 2),
        "percentiles": None,
        "label": f"{found['label']}, at {places.label(fact.place)} prices",
        "place": fact.place,
        "place_label": places.label(fact.place),
        "level": level,
        "fallback": level != (places.level_of(asked_place) if asked_place else "us"),
        "scaled_by": {"value": fact.value, "label": fact.label, "place_label": places.label(fact.place), "source": _source_view(src)},
    }


def available_metrics(db: Session, place: str | None) -> list[str]:
    """Metrics with at least one reviewed fact somewhere on this place's ladder, so the app only
    promises an estimate it can give."""
    keys = places.ladder(place)
    have = set(db.exec(select(EstimateFact.metric).where(col(EstimateFact.place).in_(keys), EstimateFact.status == REVIEWED).distinct()).all())
    have |= {m for m, spec in METRICS.items() if spec.get("compose") in have}
    return sorted(have)


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
    """Per source: how many facts and catalog entries, by status, for the admin coverage view."""
    from src.services.life_plans import public_data
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
        entries = public_data.entry_counts(db, src.id)
        for status, n in entries.items():
            by_status[status] = by_status.get(status, 0) + n
        out.append({**_source_view(src), "id": src.id, "facts": len(facts), "entries": sum(entries.values()), "by_status": by_status, "levels": levels, "metrics": sorted(metrics)})
    return out
