"""What a career's card says, for Coach to agree with (DEV-112, FEED-157).

A career's card (its profile in Discover) and its "Add to my plans" box show the training it takes and the usual
routes in, with years, worked out from the career's O*NET job zone and the education people in the job report.
When a message is about a career the learner can see, Coach gets those same facts, so it never says "vet school is
four years" while the card says two. ``career_routes`` mirrors ``routesFor`` in
apps/web/components/Goals/phases/careers.ts; change both together (their tests pin the same cases).
"""

from __future__ import annotations

import logging
import re

from sqlmodel import Session

from src.db.life_plans import CareerEntry

logger = logging.getLogger(__name__)
CODE = re.compile(r"(\d{2}-\d{4}\.\d{2})")
MAX_CAREERS = 3

# The card's "What it takes" headline for each job zone (CareerProfile.tsx ZONE).
TRAINING = {
    1: "Little or no training. Many people start right after high school and learn on the job.",
    2: "High school plus on-the-job training. Many people start right after high school and learn on the job.",
    3: "Training after high school: a certificate, an apprenticeship or a 2-year degree.",
    4: "Usually a 4-year degree. Most people in this job have a bachelor's degree.",
    5: "Graduate school. Most people in this job have a master's, doctorate or professional degree.",
}
# O*NET's required levels of education, grouped as the card's "What people in the job say it takes" chart.
SCHOOLING = (
    ("High school or less", (1, 2)),
    ("Certificate or some college", (3, 4)),
    ("Associate's", (5,)),
    ("Bachelor's", (6, 7)),
    ("Master's or more", (8, 9, 10, 11, 12)),
)


def career_name(title: str) -> str:
    """"Electrician" from "Electricians"; drops "and ..." tails so names stay short (careerName in careers.ts)."""
    head = re.split(r",| and ", title or "")[0].strip()
    return re.sub(r"s$", "", head)


def graduate_years(education: list | None) -> int:
    """Years of graduate school after college: 4 when most people in the job hold a professional or doctoral
    degree (O*NET levels 10 to 12, like a DVM, MD or PhD), else 2 (a master's)."""
    rows = [row for row in education or [] if isinstance(row, dict) and row.get("pct") is not None]
    if not rows:
        return 2
    top = max(rows, key=lambda row: float(row.get("pct") or 0))
    return 4 if int(top.get("level") or 0) >= 10 else 2


def career_routes(code: str, title: str, job_zone: int | None, education: list | None = None) -> list[dict]:
    """The usual routes in, as the card and "Add to my plans" show them: [{common, why, steps: [(title, years)]}]."""
    name, zone = career_name(title), job_zone or 3
    job = (name, None)
    if zone >= 5:
        return [{"common": True, "steps": [("College", 4), ("Graduate school", graduate_years(education)), job]}]
    if zone == 4:
        return [
            {"common": True, "steps": [("College", 4), job]},
            {"why": "Cheaper first two years, then transfer", "steps": [("Community college", 2), ("University", 2), job]},
        ]
    if zone == 3:
        if re.match(r"^(47|49|51)", code or ""):
            return [{"common": True, "steps": [(f"{name} apprentice", 4), job]}, {"steps": [("Trade school", 1), job]}]
        return [
            {"common": True, "why": "A short program at a community college or training center", "steps": [("Certificate program", 1), job]},
            {"why": "An associate degree, which can also count toward a 4-year degree later", "steps": [("2-year degree", 2), job]},
            {"why": "Some people start in a related job", "steps": [("Entry job", 2), job]},
        ]
    return [{"common": True, "why": "Most learn on the job", "steps": [job]}, {"steps": [("Short training program", 1), job]}]


def _route_text(route: dict) -> str:
    parts = [f"{title} ({years} year{'s' if years != 1 else ''})" if years else f"then working as {title}" for title, years in route["steps"]]
    text = ", ".join(parts)
    lead = "Usual route" if route.get("common") else "Another route"
    return f"{lead}: {text}" + (f" ({route['why']})" if route.get("why") else "")


def _schooling_text(education: list | None) -> str:
    rows = [row for row in education or [] if isinstance(row, dict)]
    if not rows:
        return ""
    shares = []
    for label, levels in SCHOOLING:
        pct = sum(float(row.get("pct") or 0) for row in rows if int(row.get("level") or 0) in levels)
        if pct >= 1:
            shares.append(f"{label} {round(pct)}%")
    return ("What people in the job say it takes: " + ", ".join(shares) + ".") if shares else ""


def career_card(entry: CareerEntry) -> str:
    lines = [f"Career: {entry.title} (O*NET-SOC {entry.code})."]
    if entry.job_zone in TRAINING:
        lines.append(f"What it takes: {TRAINING[entry.job_zone]}")
    schooling = _schooling_text(entry.education)
    if schooling:
        lines.append(schooling)
    lines += [_route_text(route) + "." for route in career_routes(entry.code, entry.title, entry.job_zone, entry.education)]
    return "\n".join(lines)


def _mentioned(query: str, entries: list[CareerEntry]) -> list[CareerEntry]:
    text = f" {re.sub(r'[^a-z0-9]+', ' ', (query or '').lower())} "
    found = []
    for entry in entries:
        name = re.sub(r"[^a-z0-9]+", " ", career_name(entry.title).lower()).strip()
        if len(name) >= 4 and (f" {name} " in text or f" {name}s " in text):
            found.append(entry)
    # The longest names first, so "Veterinary technician" wins over a shorter name inside it.
    return sorted(found, key=lambda entry: -len(entry.title))


def career_card_notes(db_session: Session, query: str, resources: list[dict] | None) -> str:
    """The cards of careers in this turn (career resources Coach is grounded in, or careers the message names),
    ready to add to Coach's context, or ''."""
    from src.services.life_plans.public_data import live_careers

    codes = [m.group(1) for resource in resources or [] if str(resource.get("resource_type") or "") == "career"
             for m in [CODE.search(str(resource.get("external_url") or ""))] if m]
    try:
        entries = list(db_session.exec(live_careers()).all())
    except Exception:  # noqa: BLE001  (the cards add to a reply; they never stop one)
        logger.warning("coach_career_cards_unavailable", exc_info=True)
        return ""
    by_code = {entry.code: entry for entry in entries}
    picked: list[CareerEntry] = []
    for entry in [*(by_code[code] for code in codes if code in by_code), *_mentioned(query, entries)]:
        if entry not in picked:
            picked.append(entry)
        if len(picked) >= MAX_CAREERS:
            break
    if not picked:
        return ""
    body = "\n\n".join(f"<career_card>\n{career_card(entry)}\n</career_card>" for entry in picked)
    return (
        "\n\n<launch_lms_career_cards>\nWhat each career's card in this app shows, and what its \"Add to my plans\" box adds "
        "to the learner's plan. When you say how long training takes, what schooling a career needs or how people get in, "
        "use these facts and years so you agree with the card. You may add detail that fits them (like the name of the "
        "degree), but never give a different number of years.\n\n"
        f"{body}\n</launch_lms_career_cards>"
    )
