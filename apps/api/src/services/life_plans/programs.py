"""Programs at schools, and the ways into a career through them.

Programs come from the College Scorecard's field-of-study file (one row per school, program family and
credential, with graduates' earnings, debt and how many stay in the state). Careers link to program families
through O*NET's crosswalk from school programs (CIP 2020) to O*NET-SOC 2019 occupations, kept beside the code
in data/cip_onet.csv. A career's paths are the programs that train for it, at schools near the learner first.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections.abc import Iterable, Iterator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import func, insert
from sqlmodel import Session, col, delete, select

from src.db.life_plans import EstimateFact, EstimateSource, ProgramEntry
from src.services.life_plans import places
from src.services.life_plans.estimates import REVIEWED, dims_key

SCORECARD_URL = "https://collegescorecard.ed.gov/data/"
CROSSWALK = Path(__file__).parent / "data" / "cip_onet.csv"
CROSSWALK_CREDIT = ("O*NET Resource Center, Education crosswalk: 2020 CIP to O*NET-SOC 2019 (CC BY 4.0), "
                    "U.S. Department of Labor, Employment and Training Administration")
CREDENTIALS = {1: "Certificate", 2: "Associate degree", 3: "Bachelor's degree", 4: "Certificate after a bachelor's",
               5: "Master's degree", 6: "Doctorate", 7: "Professional degree", 8: "Graduate certificate"}
# Roughly how long each takes full time, for sorting by "shortest".
YEARS = {1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 6: 9, 7: 8, 8: 5}
# DISTANCE: 1 in person, 2 partly online, 3 fully online (0 or blank: not reported).
COLUMNS = ("unitid", "instnm", "cipcode", "cipdesc", "credlev", "ipedscount1", "ipedscount2", "earn_mdn_1yr", "earn_mdn_5yr",
           "earn_in_state_5yr", "earn_in_state_1yr", "earn_count_wne_5yr", "earn_count_wne_1yr", "debt_all_stgp_eval_mdn", "distance")


class ProgramProblem(ValueError):
    pass


# --- import ------------------------------------------------------------------------


def _member(data: bytes, filename: str) -> str | None:
    if not filename.lower().endswith(".zip"):
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            csvs = [i.filename for i in zf.infolist() if i.filename.lower().endswith(".csv")]
    except zipfile.BadZipFile:
        return None
    base = [name.rsplit("/", 1)[-1].lower() for name in csvs]
    # The full raw-data zip holds the institution file too; that one loads as schools.
    if any(b.startswith("most-recent-cohorts-institution") for b in base):
        return None
    names = [name for name, b in zip(csvs, base) if b.startswith("most-recent-cohorts-field-of-study")]
    return min(names, key=len) if names else None


def is_programs_file(data: bytes, filename: str) -> bool:
    """The Scorecard field-of-study file, as the CSV or the zip that holds it."""
    if _member(data, filename):
        return True
    if filename.lower().endswith(".csv"):
        head = data[:4000].decode("utf-8-sig", errors="replace").splitlines()[:1]
        cols = {c.strip().lower() for c in head[0].split(",")} if head else set()
        return {"unitid", "cipcode", "credlev"} <= cols
    return False


def _rows(data: bytes, filename: str) -> Iterator[dict[str, str]]:
    member = _member(data, filename)
    if member:
        zf = zipfile.ZipFile(io.BytesIO(data))
        stream = zf.open(member)
    else:
        stream = io.BytesIO(data)
    with io.TextIOWrapper(stream, encoding="utf-8-sig", errors="replace", newline="") as text:
        reader = csv.reader(text)
        header = [(h or "").strip().lower() for h in next(reader, [])]
        if not {"unitid", "cipcode", "credlev"} <= set(header):
            raise ProgramProblem("Expected the Scorecard field-of-study columns UNITID, CIPCODE and CREDLEV.")
        at = {name: header.index(name) for name in COLUMNS if name in header}
        for raw in reader:
            yield {name: (raw[i] if i < len(raw) else "") for name, i in at.items()}


def _val(text: str | None) -> float | None:
    t = (text or "").strip()
    if not t or t.upper() in ("NULL", "NA", "PRIVACYSUPPRESSED", "PS"):
        return None
    try:
        return float(t.replace(",", ""))
    except ValueError:
        return None


def _in_state(r: dict[str, str]) -> float | None:
    """The share of working graduates employed in the school's state: the Scorecard gives both as counts."""
    for years in ("5yr", "1yr"):
        stayed, working = _val(r.get(f"earn_in_state_{years}")), _val(r.get(f"earn_count_wne_{years}"))
        if stayed is not None and working:
            return round(min(stayed / working, 1.0), 3)
    return None


def _release(filename: str) -> str:
    m = re.search(r"(\d{2})(\d{2})(20\d{2})", filename)
    return f"{m.group(3)}-{m.group(1)}-{m.group(2)}" if m else ""


def import_programs(db: Session, data: bytes, filename: str, *, rows: Iterable[dict[str, str]] | None = None) -> dict:
    """Programs from the Scorecard's most recent field-of-study file, as drafts of their own release."""
    from src.services.life_plans.importers import _now, upsert_source

    release = _release(filename)
    src = upsert_source(
        db,
        key=f"scorecard-programs{('-' + release) if release else ''}",
        publisher="U.S. Department of Education",
        title="College Scorecard, most recent field of study data",
        dataset="Programs at each school by program family (4-digit CIP) and credential: graduates, earnings one and five years after, debt, and graduates working in the state",
        url=SCORECARD_URL,
        released=f"Data files dated {release}" if release else "Most recent cohorts (release date not in the file name)",
        license="U.S. government work, public domain",
    )
    src.notes = ("Earnings are medians for graduates working and not enrolled, one and five years after finishing, in dollars of the survey year. "
                 "Debt is the median federal loan debt at graduation. In-state is the share of working graduates employed in the school's state. "
                 "Small programs are suppressed for privacy and show no figure.")
    db.add(src)
    db.exec(delete(ProgramEntry).where(ProgramEntry.source_id == src.id))
    now, batch, n = _now(), [], 0
    seen: set[tuple[str, str, int]] = set()
    for r in rows if rows is not None else _rows(data, filename):
        code = re.sub(r"\D", "", r.get("cipcode", ""))
        level = _val(r.get("credlev"))
        if len(code) < 3 or level is None:
            continue
        code = code.zfill(4)
        cip, credential, unitid = f"{code[:2]}.{code[2:4]}", int(level), r.get("unitid", "").strip()
        if not unitid or (unitid, cip, credential) in seen:
            continue
        seen.add((unitid, cip, credential))
        graduates = _val(r.get("ipedscount2")) or _val(r.get("ipedscount1"))
        batch.append({"unitid": unitid, "school": r.get("instnm", ""), "cip": cip, "title": (r.get("cipdesc") or "").strip().rstrip("."), "credential": credential,
                      "graduates": int(graduates) if graduates is not None else None, "earnings_1yr": _val(r.get("earn_mdn_1yr")), "earnings_5yr": _val(r.get("earn_mdn_5yr")),
                      "in_state": _in_state(r),
                      "debt": _val(r.get("debt_all_stgp_eval_mdn")), "online": (r.get("distance") or "").strip() == "3",
                      "source_id": src.id, "status": "draft", "creation_date": now})
        if len(batch) >= 5000:
            db.exec(insert(ProgramEntry), params=batch)
            n += len(batch)
            batch = []
    if batch:
        db.exec(insert(ProgramEntry), params=batch)
        n += len(batch)
    if not n:
        raise ProgramProblem("No programs found in the file.")
    db.commit()
    return {"kind": "scorecard_programs", "source": src.key, "programs": n}


# --- the crosswalk -----------------------------------------------------------------


@lru_cache(maxsize=1)
def _crosswalk() -> dict[str, list[tuple[str, str]]]:
    """O*NET-SOC code -> the school programs (6-digit CIP, title) that train for it."""
    out: dict[str, list[tuple[str, str]]] = {}
    with CROSSWALK.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out.setdefault(row["onet_code"], []).append((row["cip"], row["cip_title"]))
    return out


def program_families(code: str) -> dict[str, int]:
    """The 4-digit program families that train for a career, with how many of their programs do."""
    found: dict[str, int] = {}
    for cip, _ in _crosswalk().get(code, []):
        found[cip[:5]] = found.get(cip[:5], 0) + 1
    return found


# --- a career's paths --------------------------------------------------------------


def _live_source(db: Session) -> int | None:
    return db.exec(select(func.max(ProgramEntry.source_id)).where(ProgramEntry.status == REVIEWED)).first()


def _county_of(city: str, state: str) -> str | None:
    if state != "OR":
        return None
    found = places.OR_CITIES.get(places.slug(city))
    return found[1] if found else None


def _nearness(home: str | None, school_city: str, school_state: str) -> tuple[int, str]:
    """0 same town, 1 same county, 2 same region, 3 elsewhere in the state, 4 farther."""
    ladder = places.ladder(home) if home else []
    home_state = next((key.split(":")[1] for key in ladder if key.startswith("state:")), None)
    county = _county_of(school_city, school_state)
    if home and home.startswith("city:") and county and places.slug(school_city) == home.split(":")[-1]:
        return 0, "In your town"
    if county and f"county:OR:{county}" in ladder:
        return 1, "In your county"
    if county and any(key in ladder for key in places.regions_of(county)):
        return 2, "In your region"
    if home_state and school_state == home_state:
        return 3, f"In {places.STATES.get(home_state, home_state)}"
    return 4, "Farther away"


def paths(db: Session, code: str, home: str | None = None, *, limit: int = 40) -> dict:
    """The programs that train for a career, and where to take them: schools in Oregon (or the learner's own state)
    and online programs, nearest first, each with its graduates' earnings, debt and in-state share, and tuition."""
    from src.db.life_plans import SchoolEntry
    from src.services.life_plans.public_data import live_schools

    families = program_families(code)
    out: dict = {"families": [], "programs": [], "has_data": False, "credit": CROSSWALK_CREDIT}
    source_id = _live_source(db)
    if not families or not source_id:
        return out
    out["has_data"] = True
    rows = db.exec(select(ProgramEntry).where(ProgramEntry.source_id == source_id, ProgramEntry.status == REVIEWED,
                                              col(ProgramEntry.cip).in_(list(families)), ProgramEntry.credential <= 7)).all()
    titles: dict[str, str] = {}
    for row in rows:
        titles.setdefault(row.cip, row.title)
    out["families"] = [{"cip": cip, "title": titles.get(cip) or cip, "weight": weight} for cip, weight in sorted(families.items(), key=lambda kv: -kv[1]) if cip in titles]

    ladder = places.ladder(home) if home else []
    home_state = next((key.split(":")[1] for key in ladder if key.startswith("state:")), None) or "OR"
    schools = {s.unitid: s for s in db.exec(live_schools().where(col(SchoolEntry.unitid).in_({row.unitid for row in rows}))).all()}
    kept = [row for row in rows if row.unitid in schools and (schools[row.unitid].state in ("OR", home_state) or row.online)]
    tuition = {}
    if kept:
        for fact in db.exec(select(EstimateFact).where(EstimateFact.metric == "tuition", EstimateFact.status == REVIEWED,
                                                       col(EstimateFact.dims_key).in_([dims_key({"school": row.unitid, "residency": "in"}) for row in kept]))).all():
            tuition[fact.dims.get("school")] = fact.value
    programs = []
    for row in kept:
        school = schools[row.unitid]
        rank, near = _nearness(home, school.city, school.state) if not (row.online and school.state not in ("OR", home_state)) else (5, "Online")
        programs.append({
            "unitid": row.unitid, "school": school.name, "city": school.city, "state": school.state, "url": school.url, "control": school.control,
            "cip": row.cip, "title": row.title, "credential": row.credential, "credential_label": CREDENTIALS.get(row.credential, ""), "years": YEARS.get(row.credential),
            "graduates": row.graduates, "earnings_1yr": row.earnings_1yr, "earnings_5yr": row.earnings_5yr, "in_state": row.in_state, "debt": row.debt,
            "online": row.online, "tuition": tuition.get(row.unitid), "near_rank": rank, "near": near, "weight": families.get(row.cip, 0),
        })
    programs.sort(key=lambda p: (p["near_rank"], -p["weight"], -(p["graduates"] or 0), p["school"]))
    out["programs"] = programs[:limit]
    out["counts"] = {str(level): sum(1 for p in programs if p["credential"] == level) for level in sorted({p["credential"] for p in programs})}
    src = db.get(EstimateSource, source_id)
    out["source"] = ", ".join(part for part in (src.publisher, src.title) if part) if src else ""
    return out
