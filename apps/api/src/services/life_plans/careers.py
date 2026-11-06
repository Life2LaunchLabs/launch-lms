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

from src.db.life_plans import CareerEntry, CareerSkip, EstimateFact, EstimateSource, LifePlan
from src.db.portfolio import Portfolio
from src.db.portfolio_records import PortfolioResult
from src.db.resources import Resource, UserSavedResource
from src.db.users import PublicUser
from src.services.life_plans import places as place_service
from src.services.life_plans import programs as program_service
from src.services.life_plans import skill_words
from src.services.life_plans.estimates import REVIEWED, dims_key
from src.services.life_plans.public_data import RIASEC, _career_view, _correlation, get_career, live_careers

HOURS_A_YEAR = 2080
CODE = re.compile(r"(\d{2}-\d{4}\.\d{2})")
QUIZ_SOURCE, QUIZ_REFERENCE = "interest_quiz", "onet-mini-ip"
SORT_SOURCE, SORT_REFERENCE = "picture_sort", "l2l-picture-sort"
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
    # The interest quiz or the picture sort, whichever the learner did last; matching uses the scores' shape, not their scale.
    rows = db.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio.id, col(PortfolioResult.source).in_([QUIZ_SOURCE, SORT_SOURCE]),
                                                 col(PortfolioResult.source_reference).in_([QUIZ_REFERENCE, SORT_REFERENCE]))).all()
    row = max(rows, key=lambda item: item.update_date or item.creation_date or "", default=None)
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


def home_base(db: Session, user_id: int) -> dict | None:
    """Where the learner lives, as a place key: the portfolio's location if we can place it, else the first place on
    their life plan. Pay and openings near them follow it."""
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    found = resolve_place(portfolio.location_label if portfolio else "")
    if found:
        return {**found, "from": "portfolio"}
    places = my_places(db, user_id)
    if places:
        return {"key": places[0]["key"], "label": places[0]["label"], "from": "plan"}
    return None


def resolve_place(text: str | None) -> dict | None:
    """A typed location ("Roseburg, OR", "Douglas County", "Idaho") as a place key we know, or None."""
    text = (text or "").strip()
    if not text:
        return None
    first = re.split(r"[,(]", text)[0].strip().lower().removesuffix(" county").strip()
    for row in place_service.search(first, limit=40):
        name = row["label"].split(",")[0].strip().lower().removesuffix(" county").strip()
        if name == first and row["level"] in ("city", "county", "state"):
            return {"key": row["key"], "label": row["label"]}
    rest = [part.strip().lower() for part in text.split(",")[1:]]
    for code, name in place_service.STATES.items():
        if any(part in (code.lower(), name.lower()) for part in rest):
            return {"key": f"state:{code}", "label": name}
    return None


# ---------------------------------------------------------------- pay

def _yearly(fact: EstimateFact, value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(value * HOURS_A_YEAR if fact.period == "hr" else value, -2))


def _newest(facts) -> dict[str, EstimateFact]:
    """One wage per place: the newest year when two datasets cover it (BLS May 2025 and OED 2026 both cover Oregon)."""
    out: dict[str, EstimateFact] = {}
    for fact in sorted(facts, key=lambda item: (item.dollar_year or 0, item.id or 0)):
        out[fact.place] = fact
    return out


def _pay_source(db: Session, fact: EstimateFact | None) -> str:
    source = db.get(EstimateSource, fact.source_id) if fact else None
    if source and source.publisher and "bureau of labor" not in source.publisher.lower():
        return ", ".join(part for part in (source.publisher, source.title) if part)
    return f"BLS Occupational Employment and Wage Statistics, May {fact.dollar_year}" if fact and fact.dollar_year else "BLS Occupational Employment and Wage Statistics"


def pay(db: Session, soc: str) -> dict:
    """Pay for a job: Oregon (or the U.S. when Oregon has none) with its middle half, and each Oregon wage area."""
    facts = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED,
                                               EstimateFact.dims_key == dims_key({"soc": soc}))).all()
    by_place = _newest(facts)
    main = by_place.get("state:OR") or by_place.get("us")
    overall = None
    if main and main.value is not None:
        pct = main.percentiles or {}
        overall = {"place": "Oregon" if main.place == "state:OR" else "the U.S.", "median": _yearly(main, main.value),
                   "p25": _yearly(main, pct.get("p25")), "p75": _yearly(main, pct.get("p75")), "year": main.dollar_year}
    areas = sorted(({"area": fact.place, "label": place_service.label(fact.place), "median": _yearly(fact, fact.value)}
                    for fact in by_place.values() if fact.place.startswith("area:") and fact.value is not None), key=lambda row: -row["median"])
    return {"overall": overall, "areas": areas, "source": _pay_source(db, main)}


def _hourly(fact: EstimateFact, value: float | None) -> float | None:
    if value is None:
        return None
    return round(value if fact.period == "hr" else value / HOURS_A_YEAR, 2)


PLACE_ORDER = {"region": 0, "area": 1, "state": 2, "us": 3}


def wages(db: Session, soc: str, home: str | None = None) -> dict:
    """Pay for a job in every place we have it, each with its 10th to 90th percentiles, hourly and yearly, from the
    newest release for that place; which place is nearest the learner; and the typical pay in Oregon and the US
    over the years we have."""
    facts = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED,
                                               EstimateFact.dims_key == dims_key({"soc": soc}))).all()
    sources = {src.id: src for src in db.exec(select(EstimateSource).where(col(EstimateSource.id).in_({fact.source_id for fact in facts}))).all()} if facts else {}
    # Oregon and its areas, the US, and the learner's own state when they live outside Oregon.
    home_state = next((key for key in place_service.ladder(home) if key.startswith("state:")), None) if home else None
    rows = []
    for fact in _newest(facts).values():
        if fact.value is None or (fact.place.startswith("state:") and fact.place not in ("state:OR", home_state)):
            continue
        pct = {**(fact.percentiles or {}), "p50": fact.value}
        level = place_service.level_of(fact.place)
        rows.append({
            "place": fact.place, "label": "Oregon" if fact.place == "state:OR" else place_service.label(fact.place), "level": level,
            "hourly": {key: _hourly(fact, pct.get(key)) for key in ("p10", "p25", "p50", "p75", "p90") if pct.get(key) is not None},
            "yearly": {key: _yearly(fact, pct.get(key)) for key in ("p10", "p25", "p50", "p75", "p90") if pct.get(key) is not None},
            "year": fact.dollar_year, "source": _pay_source(db, fact), "publisher": (sources.get(fact.source_id).publisher if sources.get(fact.source_id) else "") or "",
        })
    rows.sort(key=lambda row: (PLACE_ORDER.get(row["level"], 9), -(row["yearly"].get("p50") or 0)))
    have = {row["place"] for row in rows}
    here = next((key for key in place_service.ladder(home) if key in have), None) if home else None
    here = here or ("state:OR" if "state:OR" in have else "us" if "us" in have else None)

    # Typical pay over time: one figure a year, preferring BLS's own survey so the line is one method.
    history: dict[str, list[dict]] = {}
    for place in ("state:OR", "us"):
        by_year: dict[int, EstimateFact] = {}
        for fact in sorted((f for f in facts if f.place == place and f.dollar_year and f.value is not None), key=lambda f: f.id or 0):
            src = sources.get(fact.source_id)
            bls = bool(src and src.key.startswith("bls-"))
            kept = by_year.get(fact.dollar_year)
            kept_bls = bool(kept and sources.get(kept.source_id) and sources[kept.source_id].key.startswith("bls-"))
            if kept is None or bls or not kept_bls:
                by_year[fact.dollar_year] = fact
        history[place] = [{"year": year, "hourly": _hourly(fact, fact.value), "yearly": _yearly(fact, fact.value)} for year, fact in sorted(by_year.items())]
    return {"places": rows, "here": here, "history": history}


OUTLOOK_METRICS = ("employment", "employment_projected", "growth", "openings")
ENTRY = re.compile(r"typical entry:\s*([^;]+)(?:;\s*competitive:\s*(.+))?", re.I)


def outlook(db: Session, soc: str, home: str | None = None) -> dict | None:
    """Jobs now and in ten years, and openings a year, for Oregon and each of its regions, from the newest reviewed
    projections; which region is nearest the learner; and the education OED says people usually start with."""
    facts = db.exec(select(EstimateFact).where(col(EstimateFact.metric).in_(OUTLOOK_METRICS), EstimateFact.status == REVIEWED,
                                               EstimateFact.dims_key == dims_key({"soc": soc}))).all()
    if not facts:
        return None
    sources = {src.id: src for src in db.exec(select(EstimateSource).where(col(EstimateSource.id).in_({fact.source_id for fact in facts}))).all()}
    newest = max(sources.values(), key=lambda src: (src.key, src.id or 0))
    by_place: dict[str, dict] = {}
    for fact in facts:
        if fact.source_id != newest.id:
            continue
        row = by_place.setdefault(fact.place, {"place": fact.place, "label": "Oregon" if fact.place == "state:OR" else place_service.label(fact.place)})
        row[fact.metric] = fact.value
        if fact.metric == "openings" and fact.note:
            row["note"] = fact.note
    years = re.search(r"(20\d{2})\D+(20\d{2})", newest.key) or re.search(r"(20\d{2})\D+(20\d{2})", newest.title or "")
    rows = []
    for row in by_place.values():
        jobs, later = row.get("employment"), row.get("employment_projected")
        growth = (later - jobs) / jobs if jobs and later is not None else row.get("growth")
        rows.append({"place": row["place"], "label": row["label"], "jobs": int(jobs) if jobs is not None else None,
                     "jobs_later": int(later) if later is not None else None, "growth": round(growth, 4) if growth is not None else None,
                     "openings": int(round(row["openings"])) if row.get("openings") is not None else None})
    rows.sort(key=lambda row: (row["place"] != "state:OR", -(row["openings"] or 0)))
    have = {row["place"] for row in rows if row["openings"] is not None}
    here = next((key for key in place_service.ladder(home) if key in have and key != "state:OR"), None) if home else None
    entry = ENTRY.search((by_place.get("state:OR") or {}).get("note", ""))
    return {
        "places": rows, "here": here,
        "start": int(years.group(1)) if years else None, "end": int(years.group(2)) if years else None,
        "entry": {"typical": entry.group(1).strip(), "competitive": (entry.group(2) or "").strip() or None} if entry else None,
        "source": ", ".join(part for part in (newest.publisher, newest.title) if part),
    }


def median_pay(db: Session, socs: list[str]) -> dict[str, int]:
    """Oregon median yearly pay (the U.S. where Oregon has none) for many jobs at once."""
    keys = {dims_key({"soc": soc}): soc for soc in socs}
    if not keys:
        return {}
    rows = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED, col(EstimateFact.place).in_(["state:OR", "us"]),
                                              col(EstimateFact.dims_key).in_(list(keys)))).all()
    out: dict[str, int] = {}
    rows = sorted(rows, key=lambda item: (-(item.dollar_year or 0), -(item.id or 0)))
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


def school_links(db: Session, user, org_id: int) -> dict[str, str]:
    """The school resources this organization's people may open (resource_uuid), by website, lower-cased and without a trailing slash."""
    from src.services.resources import _org_resource_ids

    ids = _org_resource_ids(org_id, db, user)
    if not ids:
        return {}
    rows = db.exec(select(Resource).where(Resource.resource_type == "school", col(Resource.id).in_(ids)).order_by(Resource.id)).all()
    out: dict[str, str] = {}
    for resource in rows:
        out.setdefault(_site(resource.external_url), resource.resource_uuid)
    return out


def _site(url: str | None) -> str:
    url = (url or "").strip().lower().rstrip("/")
    return url.split("://", 1)[1] if "://" in url else url


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
    home = home_base(db, user.id)
    money = pay(db, career["soc"])
    mine = {place["area"]: place["label"] for place in places if place["area"]}
    areas = [{**row, "mine": row["area"] in mine, "my_place": mine.get(row["area"])} for row in money["areas"]]
    areas.sort(key=lambda row: (not row["mine"], -row["median"]))
    resources = career_resources(db, user, org_id) if org_id else {}

    # Similar careers: the ones O*NET says are related, else the closest interest profiles.
    related = career.get("related") or []
    live = {c.code: c for c in db.exec(live_careers().where(col(CareerEntry.code).in_(related))).all()} if related else {}
    similar = [(None, live[other]) for other in related if other in live and other != code][:6]
    if not similar and len(career["interests"]) == 6:
        others = [c for c in db.exec(live_careers().where(CareerEntry.code != code)).all() if len(c.interests) == 6]
        similar = sorted(((_correlation(career["interests"], c.interests) or -1, c) for c in others), key=lambda t: (-t[0], t[1].title))[:6]
    similar_pay = median_pay(db, [c.soc for _, c in similar])
    return {
        "career": career,
        "match": round(_correlation(scores, career["interests"]), 3) if scores and len(career["interests"]) == 6 and _correlation(scores, career["interests"]) is not None else None,
        "scores": scores,
        "skills": _skills(db, user.id, career),
        "pay": {**money, "areas": areas},
        "my_places": places,
        "home": home,
        "wages": wages(db, career["soc"], home["key"] if home else None),
        "outlook": outlook(db, career["soc"], home["key"] if home else None),
        "paths": _paths(db, user, code, home, org_id),
        "resource_uuid": resources[code].resource_uuid if code in resources else None,
        "similar": [{**_career_view(c), "pay": {"yearly": similar_pay[c.soc]} if c.soc in similar_pay else None,
                     "resource_uuid": resources[c.code].resource_uuid if c.code in resources else None} for _, c in similar],
        "link": onet_link(code),
    }


def _skills(db: Session, user_id: int, career: dict) -> dict:
    """The learner's picked skill chips (None before they pick any) and the ones this career uses."""
    mine = skill_words.my_chips(db, user_id)
    return {"mine": mine, "used": skill_words.used(mine or [], career.get("skills") or [])}


def _paths(db: Session, user, code: str, home: dict | None, org_id: int | None) -> dict:
    """Programs that train for the career, each school opening as the organization's school resource where it has one."""
    out = program_service.paths(db, code, home["key"] if home else None)
    sites = school_links(db, user, org_id) if org_id and out["programs"] else {}
    for program in out["programs"]:
        program["resource_uuid"] = sites.get(_site(program.pop("url", "")))
    return out


# ---------------------------------------------------------------- Career swipe

def deck(db: Session, user: PublicUser, org_id: int, size: int = DECK_SIZE) -> dict:
    """The next careers to swipe: the organization's career resources the learner hasn't saved, closest to their
    interests first, with skipped ones pushed back. Without a quiz result they come in a steady shuffle."""
    resources = career_resources(db, user, org_id)
    if not resources:
        return {"cards": [], "total": 0, "has_careers": False, "has_quiz": quiz_scores(db, user.id) is not None}
    saved = set(db.exec(select(UserSavedResource.resource_id).where(UserSavedResource.user_id == user.id, col(UserSavedResource.resource_id).in_([r.id for r in resources.values()]))).all())
    skips = {row.code: row.count for row in db.exec(select(CareerSkip).where(CareerSkip.user_id == user.id)).all()}
    entries = {c.code: c for c in db.exec(live_careers().where(col(CareerEntry.code).in_(list(resources)))).all()}
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
    return {"cards": cards, "total": len(candidates), "has_careers": True, "has_quiz": scores is not None}


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
