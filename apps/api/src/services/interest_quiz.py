"""The interest quiz: the O*NET Mini Interest Profiler (Mini-IP), 30 work activities rated on five points.

The items, their order and the answer labels are O*NET's, word for word (O*NET Mini-IP report, appendix A),
used under CC BY-ND 4.0: no item is reworded, added or dropped. Scoring follows the same report: each answer
counts 0 ("Strongly dislike") to 4 ("Strongly like") and each RIASEC type sums its five items, so 0 to 20.

Taking it writes one "What I'm like" result (taking it again updates it), and careers come from the O*NET
catalog the platform admin imports, ranked by the shape of the profile, with BLS pay where we have it."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.life_plans import EstimateFact
from src.db.portfolio_records import PortfolioResult, ResultWrite
from src.db.users import PublicUser
from src.services import portfolio as portfolio_service, portfolio_results
from src.services.life_plans import public_data
from src.services.life_plans.estimates import REVIEWED, dims_key

SOURCE = "interest_quiz"
REFERENCE = "onet-mini-ip"
TEMPLATE = "riasec"
NAME = "Interests (RIASEC)"
MAX = 20
# The two ways to find your interest types: this quiz, or the picture sort for learners who read little. Both
# land on the same six types, so a learner keeps one result: the newest way they took it.
WAYS = {"interest_quiz": "onet-mini-ip", "picture_sort": "l2l-picture-sort"}

TYPES = {"R": "Realistic", "I": "Investigative", "A": "Artistic", "S": "Social", "E": "Enterprising", "C": "Conventional"}

# O*NET's suggested order: one item from each type in RIASEC order, five times.
ITEMS: list[tuple[str, str]] = [
    ("R", "Build kitchen cabinets"),
    ("I", "Develop a new medicine"),
    ("A", "Write books or plays"),
    ("S", "Help people with personal or emotional problems"),
    ("E", "Manage a department within a large company"),
    ("C", "Install software across computers on a large network"),
    ("R", "Repair household appliances"),
    ("I", "Study ways to reduce water pollution"),
    ("A", "Compose or arrange music"),
    ("S", "Give career guidance to people"),
    ("E", "Start your own business"),
    ("C", "Operate a calculator"),
    ("R", "Assemble electronic parts"),
    ("I", "Conduct chemical experiments"),
    ("A", "Create special effects for movies"),
    ("S", "Perform rehabilitation therapy"),
    ("E", "Negotiate business contracts"),
    ("C", "Keep shipping and receiving records"),
    ("R", "Drive a truck to deliver packages to offices and homes"),
    ("I", "Examine blood samples using a microscope"),
    ("A", "Paint sets for plays"),
    ("S", "Do volunteer work at a non-profit organization"),
    ("E", "Market a new line of clothing"),
    ("C", "Inventory supplies using a hand-held computer"),
    ("R", "Test the quality of parts before shipment"),
    ("I", "Develop a way to better predict the weather"),
    ("A", "Write scripts for movies or television shows"),
    ("S", "Teach a high-school class"),
    ("E", "Sell merchandise at a department store"),
    ("C", "Stamp, sort, and distribute mail for an organization"),
]
ANSWERS = ["Strongly Dislike", "Dislike", "Unsure", "Like", "Strongly Like"]

CREDIT = (
    "This quiz is the O*NET Mini Interest Profiler from the O*NET Career Exploration Tools by the U.S. Department "
    "of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY-ND 4.0 license. "
    "O*NET® is a trademark of USDOL/ETA."
)
CREDIT_LINKS = {"tool": "https://www.onetcenter.org/IP.html", "license": "https://creativecommons.org/licenses/by-nd/4.0/"}

# Where pay is looked up first, then the country.
PAY_PLACES = ["state:OR", "us"]
HOURS_A_YEAR = 2080


def quiz() -> dict:
    return {
        "items": [{"n": n + 1, "type": kind, "text": text} for n, (kind, text) in enumerate(ITEMS)],
        "answers": [{"value": value, "label": label} for value, label in enumerate(ANSWERS)],
        "types": [{"key": key, "label": label} for key, label in TYPES.items()],
        "max": MAX, "credit": CREDIT, "links": CREDIT_LINKS,
    }


def score(answers: list[int]) -> dict[str, int]:
    """Each type's total, 0 to 20."""
    if len(answers) != len(ITEMS) or any(not isinstance(a, int) or isinstance(a, bool) or a < 0 or a > 4 for a in answers):
        raise HTTPException(status_code=422, detail=f"Answer all {len(ITEMS)} questions with a number from 0 to 4")
    totals = {key: 0 for key in TYPES}
    for (kind, _), answer in zip(ITEMS, answers):
        totals[kind] += answer
    return totals


def ranked(scores: dict[str, int]) -> list[str]:
    """The types from strongest to weakest; ties keep RIASEC order."""
    return sorted(TYPES, key=lambda key: -scores.get(key, 0))


def _pay(db: Session, socs: list[str]) -> dict[str, dict]:
    """The median yearly pay for each SOC code, from the first place in PAY_PLACES that has it."""
    if not socs:
        return {}
    keys = {dims_key({"soc": soc}): soc for soc in socs}
    rows = db.exec(select(EstimateFact).where(EstimateFact.metric == "wage", EstimateFact.status == REVIEWED, col(EstimateFact.place).in_(PAY_PLACES), col(EstimateFact.dims_key).in_(list(keys)))).all()
    out: dict[str, dict] = {}
    for place in PAY_PLACES:
        for fact in rows:
            soc = keys[fact.dims_key]
            if fact.place != place or soc in out or fact.value is None:
                continue
            yearly = fact.value * HOURS_A_YEAR if fact.period == "hr" else fact.value
            out[soc] = {"yearly": round(yearly, -2), "place": "Oregon" if place == "state:OR" else "the U.S.", "year": fact.dollar_year}
    return out


def careers(db: Session, scores: dict[str, int], limit: int = 60) -> list[dict]:
    """Careers whose O*NET interest profile lines up with these scores, closest first, with pay where we have it.
    Enough of them that the page's training filters still have some to show.
    Empty when the catalog hasn't been imported, or when every score is the same (there's no shape to match)."""
    if len(set(scores.values())) < 2:
        return []
    try:
        found = public_data.match_careers(db, scores, limit=limit)
    except public_data.CatalogProblem:
        return []
    pay = _pay(db, sorted({c["soc"] for c in found}))
    return [{**c, "pay": pay.get(c["soc"])} for c in found]


def _rows(portfolio_id: int, db: Session) -> list[PortfolioResult]:
    """The learner's interest results from the quiz or the picture sort, newest first."""
    rows = db.exec(select(PortfolioResult).where(PortfolioResult.portfolio_id == portfolio_id, col(PortfolioResult.source).in_(list(WAYS)),
                                                 col(PortfolioResult.source_reference).in_(list(WAYS.values())))).all()
    return sorted((row for row in rows if WAYS.get(row.source) == row.source_reference), key=lambda row: row.update_date or row.creation_date or "", reverse=True)


def mine(current_user: PublicUser, db: Session) -> PortfolioResult | None:
    """The learner's one interest result, however they took it."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    rows = _rows(portfolio.id or 0, db)
    return rows[0] if rows else None


def save(current_user: PublicUser, payload: ResultWrite, source: str, db: Session) -> dict:
    """Write the learner's interest result from one way of taking it, over the result the other way left, so
    there is only ever one. A result the learner hid or featured keeps that."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    rows = _rows(portfolio.id or 0, db)
    if rows:
        keep = rows[0]
        for extra in rows[1:]:
            db.delete(extra)
        keep.source, keep.source_reference = source, WAYS[source]
        db.add(keep)
        db.flush()
    return portfolio_results.record_result(current_user, payload, source, WAYS[source], db)


def latest(current_user: PublicUser, db: Session) -> dict:
    """The quiz, and the learner's last result with its careers if they've taken it."""
    row = mine(current_user, db)
    taken = None
    if row:
        scores = {key: int((row.data or {}).get("scores", {}).get(key, 0)) for key in TYPES}
        taken = {"way": row.source, "max": int((row.data or {}).get("max") or MAX), "result": portfolio_results.result_dto(row), "scores": scores, "code": "".join(ranked(scores)[:3]), "careers": careers(db, scores)}
    return {"quiz": quiz(), "taken": taken}


def take(answers: list[int], current_user: PublicUser, db: Session) -> dict:
    scores = score(answers)
    top = ranked(scores)
    data = {"template": TEMPLATE, "scores": scores, "max": MAX, "quiz": REFERENCE, "answers": answers}
    payload = ResultWrite(kind="interests", name=NAME, summary=" · ".join(TYPES[key] for key in top[:3]), data=data, taken_on=datetime.now(timezone.utc).strftime("%Y-%m"), visibility="public")
    result = save(current_user, payload, SOURCE, db)
    return {"way": SOURCE, "max": MAX, "result": result, "scores": scores, "code": "".join(top[:3]), "careers": careers(db, scores)}
