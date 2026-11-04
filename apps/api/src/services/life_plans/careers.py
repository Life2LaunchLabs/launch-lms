"""The career explorer: careers as resources, each with a profile of sourced facts, and Career swipe.

A career is a resource (`resource_type` "career") that links to its O*NET OnLine page, so it is saved, noted and
reviewed like any other resource. Its profile comes from the catalog the platform admin imports: the O*NET career
(what it is, what people do, training, interest profile) and BLS pay for Oregon and each Oregon wage area. Places
the learner has put on their life plan phases are marked, so pay where they might live comes first.

Career swipe deals careers from the organization's career resources, closest to the learner's interest quiz first.
A skip only pushes a career back in later decks; nothing is ever marked as disliked.
"""

from __future__ import annotations

import random
import re
from datetime import UTC, datetime

from sqlmodel import Session, col, select

from src.db.life_plans import CareerEntry, CareerSkip, EstimateFact, LifePlan
from src.db.portfolio import Portfolio
from src.db.portfolio_records import PortfolioResult
from src.db.resources import Resource, UserSavedResource
from src.db.users import PublicUser
from src.services.life_plans import places as place_service
from src.services.life_plans.estimates import REVIEWED, dims_key
from src.services.life_plans.public_data import RIASEC, _career_view, _correlation, get_career

HOURS_A_YEAR = 2080
CODE = re.compile(r"(\d{2}-\d{4}\.\d{2})")
QUIZ_SOURCE, QUIZ_REFERENCE = "interest_quiz", "onet-mini-ip"
DECK_SIZE = 10
# A skipped career drops this many places per skip, so new ones come first but it never disappears.
SKIP_PENALTY = 100


def _now() -> str:
    return datetime.now(UTC).isoformat()


def code_of(resource: Resource) -> str | None:
    """The O*NET-SOC code a career resource is about, read from its O*NET OnLine link."""
    found = CODE.search(resource.external_url or "")
    return found.group(1) if found else None


def onet_link(code: str) -> str:
    return f"https://www.onetonline.org/link/summary/{code}"


# ---------------------------------------------------------------- the learner

def quiz_scores(db: Session, user_id: int) -> dict[str, int] | None:
    """The learner's interest quiz scores (0 to 20 for each type), or None if they haven't taken it."""
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return None
    row = db.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio.id, PortfolioResult.source == QUIZ_SOURCE,
                                                PortfolioResult.source_reference == QUIZ_REFERENCE)).first()
    scores = (row.data or {}).get("scores") if row else None
    if not scores:
        return None
    out = {key: int(scores.get(key, 0) or 0) for key in RIASEC}
    return out if len(set(out.values())) > 1 else None


def my_places(db: Session, user_id: int) -> list[dict]:
    """The places on the learner's life plan phases, each once, with the BLS wage area each sits in."""
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user_id)).first()
    found: list[dict] = []
    phases = ((plan.document or {}).get("phases") or []) if plan else []
    for phase in phases:
        key = phase.get("place") if isinstance(phase, dict) else None
        if not key or any(place["key"] == key for place in found):
            continue
        area = next((step for step in place_service.ladder(key) if step.startswith("area:")), None)
        found.append({"key": key, "label": phase.get("place_label") or place_service.label(key), "area": area})
    return found


# ---------------------------------------------------------------- pay

def _yearly(fact: EstimateFact, value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(value * HOURS_A_YEAR if fact.period == "hr" else value, -2))


def pay(db: Session, soc: str) -> dict:
    """BLS pay for a job: Oregon (or the U.S. when Oregon has none) with its middle half, and each Oregon wage area."""
    facts = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED,
                                               EstimateFact.dims_key == dims_key({"soc": soc}))).all()
    by_place = {fact.place: fact for fact in facts}
    main = by_place.get("state:OR") or by_place.get("us")
    overall = None
    if main and main.value is not None:
        pct = main.percentiles or {}
        overall = {"place": "Oregon" if main.place == "state:OR" else "the U.S.", "median": _yearly(main, main.value),
                   "p25": _yearly(main, pct.get("p25")), "p75": _yearly(main, pct.get("p75")), "year": main.dollar_year}
    areas = sorted(({"area": fact.place, "label": place_service.label(fact.place), "median": _yearly(fact, fact.value)}
                    for fact in facts if fact.place.startswith("area:") and fact.value is not None), key=lambda row: -row["median"])
    return {"overall": overall, "areas": areas, "source": f"BLS Occupational Employment and Wage Statistics, May {main.dollar_year}" if main and main.dollar_year else "BLS Occupational Employment and Wage Statistics"}


def median_pay(db: Session, socs: list[str]) -> dict[str, int]:
    """Oregon median yearly pay (the U.S. where Oregon has none) for many jobs at once."""
    keys = {dims_key({"soc": soc}): soc for soc in socs}
    if not keys:
        return {}
    rows = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED, col(EstimateFact.place).in_(["state:OR", "us"]),
                                              col(EstimateFact.dims_key).in_(list(keys)))).all()
    out: dict[str, int] = {}
    for place in ("state:OR", "us"):
        for fact in rows:
            soc = keys[fact.dims_key]
            if fact.place == place and soc not in out and fact.value is not None:
                out[soc] = _yearly(fact, fact.value)
    return out


# ---------------------------------------------------------------- career resources

def career_resources(db: Session, user, org_id: int) -> dict[str, Resource]:
    """The career resources this organization's people may open, by O*NET-SOC code."""
    from src.services.resources import _org_resource_ids

    ids = _org_resource_ids(org_id, db, user)
    if not ids:
        return {}
    out: dict[str, Resource] = {}
    for resource in db.exec(select(Resource).where(Resource.resource_type == "career", col(Resource.id).in_(ids)).order_by(Resource.id)).all():
        code = code_of(resource)
        if code and code not in out:
            out[code] = resource
    return out


def links(db: Session, user, org_id: int, codes: list[str]) -> dict[str, str]:
    """For each code, the career resource to open (its resource_uuid), where the organization has one."""
    found = career_resources(db, user, org_id)
    return {code: found[code].resource_uuid for code in codes if code in found}


# ---------------------------------------------------------------- the profile

def profile(db: Session, user: PublicUser, code: str, org_id: int | None = None) -> dict | None:
    """Everything the career's page shows, each fact with where it came from."""
    career = get_career(db, code)
    if not career:
        return None
    scores = quiz_scores(db, user.id)
    places = my_places(db, user.id)
    money = pay(db, career["soc"])
    mine = {place["area"]: place["label"] for place in places if place["area"]}
    areas = [{**row, "mine": row["area"] in mine, "my_place": mine.get(row["area"])} for row in money["areas"]]
    areas.sort(key=lambda row: (not row["mine"], -row["median"]))
    resources = career_resources(db, user, org_id) if org_id else {}

    others = [c for c in db.exec(select(CareerEntry).where(CareerEntry.status == REVIEWED, CareerEntry.code != code)).all() if len(c.interests) == 6]
    similar = sorted(((_correlation(career["interests"], c.interests) or -1, c) for c in others), key=lambda t: (-t[0], t[1].title))[:6] if len(career["interests"]) == 6 else []
    similar_pay = median_pay(db, [c.soc for _, c in similar])
    return {
        "career": career,
        "match": round(_correlation(scores, career["interests"]), 3) if scores and len(career["interests"]) == 6 and _correlation(scores, career["interests"]) is not None else None,
        "scores": scores,
        "pay": {**money, "areas": areas},
        "my_places": places,
        "resource_uuid": resources[code].resource_uuid if code in resources else None,
        "similar": [{**_career_view(c), "pay": {"yearly": similar_pay[c.soc]} if c.soc in similar_pay else None,
                     "resource_uuid": resources[c.code].resource_uuid if c.code in resources else None} for _, c in similar],
        "link": onet_link(code),
    }


# ---------------------------------------------------------------- Career swipe

def deck(db: Session, user: PublicUser, org_id: int, size: int = DECK_SIZE) -> dict:
    """The next careers to swipe: the organization's career resources the learner hasn't saved, closest to their
    interests first, with skipped ones pushed back. Without a quiz result they come in a steady shuffle."""
    resources = career_resources(db, user, org_id)
    if not resources:
        return {"cards": [], "total": 0, "has_quiz": quiz_scores(db, user.id) is not None}
    saved = set(db.exec(select(UserSavedResource.resource_id).where(UserSavedResource.user_id == user.id, col(UserSavedResource.resource_id).in_([r.id for r in resources.values()]))).all())
    skips = {row.code: row.count for row in db.exec(select(CareerSkip).where(CareerSkip.user_id == user.id)).all()}
    entries = {c.code: c for c in db.exec(select(CareerEntry).where(CareerEntry.status == REVIEWED, col(CareerEntry.code).in_(list(resources)))).all()}
    scores = quiz_scores(db, user.id)
    places = my_places(db, user.id)

    candidates = [code for code, resource in resources.items() if resource.id not in saved and code in entries]
    if scores:
        matched = {code: _correlation(scores, entries[code].interests) if len(entries[code].interests) == 6 else None for code in candidates}
        base = sorted(candidates, key=lambda code: (matched[code] is None, -(matched[code] or 0), entries[code].title))
    else:
        matched = {}
        base = sorted(candidates)
        random.Random(user.id).shuffle(base)
    rank = {code: index for index, code in enumerate(base)}
    ordered = sorted(base, key=lambda code: rank[code] + skips.get(code, 0) * SKIP_PENALTY)[:size]

    socs = [entries[code].soc for code in ordered]
    oregon = median_pay(db, socs)
    areas = {place["area"]: place["label"] for place in places if place["area"]}
    local: dict[str, tuple[str, int]] = {}
    if areas:
        facts = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED, col(EstimateFact.place).in_(list(areas)),
                                                   col(EstimateFact.dims_key).in_([dims_key({"soc": soc}) for soc in socs]))).all()
        for fact in facts:
            soc, yearly = fact.dims.get("soc"), _yearly(fact, fact.value)
            if soc and yearly and (soc not in local or yearly > local[soc][1]):
                local[soc] = (areas[fact.place], yearly)
    cards = []
    for code in ordered:
        entry = entries[code]
        cards.append({
            **_career_view(entry, full=True),
            "resource_uuid": resources[code].resource_uuid,
            "match": round(matched[code], 3) if matched.get(code) is not None else None,
            "pay": {"yearly": oregon[entry.soc]} if entry.soc in oregon else None,
            "my_place_pay": {"place": local[entry.soc][0], "yearly": local[entry.soc][1]} if entry.soc in local else None,
        })
    return {"cards": cards, "total": len(candidates), "has_quiz": scores is not None}


def skip(db: Session, user: PublicUser, code: str) -> dict:
    row = db.exec(select(CareerSkip).where(CareerSkip.user_id == user.id, CareerSkip.code == code)).first()
    if row:
        row.count += 1
    else:
        row = CareerSkip(user_id=user.id, code=code, count=1)
    row.update_date = _now()
    db.add(row)
    db.commit()
    return {"code": code, "skips": row.count}


def unskip(db: Session, user: PublicUser, code: str) -> dict:
    """Undo the last skip of a career (the swipe's undo button)."""
    row = db.exec(select(CareerSkip).where(CareerSkip.user_id == user.id, CareerSkip.code == code)).first()
    if not row:
        return {"code": code, "skips": 0}
    row.count -= 1
    if row.count <= 0:
        db.delete(row)
        db.commit()
        return {"code": code, "skips": 0}
    row.update_date = _now()
    db.add(row)
    db.commit()
    return {"code": code, "skips": row.count}
