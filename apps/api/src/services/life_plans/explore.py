"""The learner's own Explore: the "Unlock your matches" quest and the home it fills in.

The quest is five things from the learner's portfolio, each turning on part of the matching: interests (fit),
skills they're good at and how they like to work (which of their skills a job uses), a home base (pay and schools
near them) and their school. Everything is read from what the learner already saved; nothing new is stored.

The home ranks the organization's careers for the learner: interest fit first, nudged by how many of their skills
the job uses, with pay near their home base and how long training takes, plus the careers they've saved.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.life_plans import CareerEntry, EstimateFact
from src.db.portfolio import Portfolio, TimelineEntry
from src.db.resources import UserSavedResource
from src.db.users import PublicUser
from src.services.life_plans import places as place_service
from src.services.life_plans import skill_words
from src.services.life_plans import careers as career_service
from src.services.life_plans.careers import _yearly, career_resources, home_base, median_pay
from src.services.life_plans.estimates import REVIEWED, dims_key
from src.services.life_plans.public_data import _career_view, _correlation, live_careers

# How many skills and work styles the quest asks for.
SKILLS_WANTED = 5
STYLES_WANTED = 2
# Each skill a job uses lifts its fit a little, so among equally good interest matches the ones using your skills come first.
SKILL_NUDGE = 0.03
HOME_SIZE = 40


def _is_style(chip: str) -> bool:
    """Work-style chips ("Attention to detail", "Staying calm") point at O*NET work styles (1.D); the rest are skills."""
    elements = skill_words.CHIPS.get(chip, ())
    return bool(elements) and all(element.startswith("1.D") for element in elements)


def quest(db: Session, user_id: int) -> dict:
    """The five quest items, each with whether it's done and what it turns on."""
    chips = skill_words.my_chips(db, user_id) or []
    styles = [chip for chip in chips if _is_style(chip)]
    skills = [chip for chip in chips if chip in skill_words.CHIPS and not _is_style(chip)]
    home = home_base(db, user_id)
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    school = bool(portfolio and db.exec(select(TimelineEntry.id).where(TimelineEntry.portfolio_id == portfolio.id, TimelineEntry.entry_type == "education")).first())
    items = [
        {"key": "interests", "title": "Find your interests", "unlocks": "Turns on: fit for you", "done": career_service.quiz_scores(db, user_id) is not None},
        {"key": "skills", "title": f"Pick {SKILLS_WANTED} things you’re good at", "unlocks": "Turns on: uses your skills",
         "done": len(skills) >= SKILLS_WANTED, "have": min(len(skills), SKILLS_WANTED), "need": SKILLS_WANTED},
        {"key": "styles", "title": "Pick how you like to work", "unlocks": "Turns on: sharper fit",
         "done": len(styles) >= STYLES_WANTED, "have": min(len(styles), STYLES_WANTED), "need": STYLES_WANTED},
        {"key": "home", "title": "Set your home base", "unlocks": "Turns on: pay and programs near you", "done": bool(home and home["from"] == "portfolio")},
        {"key": "school", "title": "Add your school", "unlocks": "Turns on: where you are now", "done": school},
    ]
    done = sum(1 for item in items if item["done"])
    return {"items": items, "done": done, "total": len(items), "complete": done == len(items)}


def _pay_near(db: Session, socs: list[str], home: str | None) -> dict[str, dict]:
    """Median yearly pay for many jobs at the place nearest home that has it, else Oregon (or the US)."""
    ladder = [key for key in place_service.ladder(home) if key != "us"] if home else []
    keys = {dims_key({"soc": soc}): soc for soc in socs}
    out: dict[str, dict] = {}
    if ladder and keys:
        facts = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED, col(EstimateFact.place).in_(ladder),
                                                   col(EstimateFact.dims_key).in_(list(keys)))).all()
        facts = sorted(facts, key=lambda fact: (ladder.index(fact.place), -(fact.dollar_year or 0), -(fact.id or 0)))
        for fact in facts:
            soc = keys[fact.dims_key]
            if soc not in out and fact.value is not None:
                out[soc] = {"yearly": _yearly(fact, fact.value), "place": "Oregon" if fact.place == "state:OR" else place_service.label(fact.place),
                            "near": fact.place != "state:OR"}
    for soc, yearly in median_pay(db, [soc for soc in socs if soc not in out]).items():
        out[soc] = {"yearly": yearly, "place": "Oregon", "near": False}
    return out


def home(db: Session, user: PublicUser, org_id: int, size: int = HOME_SIZE) -> dict:
    """The personal Explore home: the quest, the careers that fit best (each with fit, skills used, pay near home and
    training), and the careers the learner saved."""
    resources = career_resources(db, user, org_id)
    entries = {c.code: c for c in db.exec(live_careers().where(col(CareerEntry.code).in_(list(resources)))).all()} if resources else {}
    scores = career_service.quiz_scores(db, user.id)
    chips = skill_words.my_chips(db, user.id)
    base = home_base(db, user.id)

    def fit(entry: CareerEntry) -> tuple[float | None, list[str]]:
        used = skill_words.used(chips or [], entry.skills or [])
        match = _correlation(scores, entry.interests) if scores and len(entry.interests or {}) == 6 else None
        return match, used

    ranked = []
    for code, entry in entries.items():
        match, used = fit(entry)
        score = (match if match is not None else -1) + SKILL_NUDGE * len(used)
        ranked.append((score, entry.title, code, match, used))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    top = ranked[:size]
    pay = _pay_near(db, [entries[code].soc for _, _, code, _, _ in top], base["key"] if base else None)

    careers = []
    for _, _, code, match, used in top:
        entry = entries[code]
        careers.append({
            **_career_view(entry), "resource_uuid": resources[code].resource_uuid,
            "match": round(match, 3) if match is not None else None, "skills_used": used, "pay": pay.get(entry.soc),
        })
    saved_ids = set(db.exec(select(UserSavedResource.resource_id).where(UserSavedResource.user_id == user.id,
                                                                        col(UserSavedResource.resource_id).in_([r.id for r in resources.values()]))).all()) if resources else set()
    saved = [{"code": code, "title": entries[code].title, "resource_uuid": resource.resource_uuid}
             for code, resource in resources.items() if resource.id in saved_ids and code in entries]
    return {
        "quest": quest(db, user.id), "careers": careers, "saved": sorted(saved, key=lambda item: item["title"]),
        "home": base, "has_quiz": scores is not None, "has_skills": chips is not None, "has_careers": bool(entries),
    }
