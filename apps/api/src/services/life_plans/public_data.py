"""The public catalog: careers from O*NET and schools from the College Scorecard.

Facts are numbers; catalog entries are things a learner can pick (a career, a school).
Both load the same way: a superadmin uploads the publisher's file as released, every
entry lands as a draft tied to its source, and nothing shows until the source is
reviewed. Numbers that come with an entry (a school's tuition) load as facts, so the
budget resolves them like rent and pay.

- O*NET database, text edition (db_31_0_text.zip): Occupation Data, interests (RIASEC,
  the OI scale), Job Zones and other titles. Release 31.0 renamed Interests.txt to
  Career Interest Types.txt and Alternate Titles.txt to Job Titles.txt, and added
  Sample of Reported Titles.txt; both layouts load.
- College Scorecard, most recent institution file (Most-Recent-Cohorts-Institution.csv,
  or the data zip that holds it): schools that are currently operating, with tuition.
"""

from __future__ import annotations

import csv
import io
import math
import re
import zipfile
from collections.abc import Iterable, Iterator

from sqlalchemy import and_, func
from sqlmodel import Session, col, delete, select

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, SchoolEntry
from src.services.life_plans.estimates import REVIEWED, dims_key
from src.services.life_plans.skill_words import career_skills

RIASEC = "RIASEC"
INTEREST_NAMES = {"realistic": "R", "investigative": "I", "artistic": "A", "social": "S", "enterprising": "E", "conventional": "C"}
ONET_URL = "https://www.onetcenter.org/database.html"
SCORECARD_URL = "https://collegescorecard.ed.gov/data/"
MAX_ALT_TITLES = 25
MAX_TASKS = 5
MAX_RELATED = 10


class CatalogProblem(ValueError):
    pass


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


# --- recognising the files ---------------------------------------------------------


def _members(data: bytes) -> dict[str, zipfile.ZipInfo]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return {}
    with zf:
        return {i.filename.rsplit("/", 1)[-1].lower(): i for i in zf.infolist() if not i.is_dir() and not i.filename.startswith("__MACOSX/")}


def is_onet_zip(data: bytes, filename: str) -> bool:
    return filename.lower().endswith(".zip") and "occupation data.txt" in _members(data)


def scorecard_member(data: bytes, filename: str) -> str | None:
    """The institution file inside a Scorecard zip, if this is one."""
    if not filename.lower().endswith(".zip"):
        return None
    names = [n for n in _members(data) if n.startswith("most-recent-cohorts-institution") and n.endswith(".csv")]
    return min(names, key=len) if names else None


def is_scorecard_columns(cols: Iterable[str]) -> bool:
    return {"unitid", "instnm", "stabbr"} <= set(cols)


# --- O*NET -------------------------------------------------------------------------


def _onet_version(filename: str) -> str:
    m = re.search(r"db_(\d+)_(\d+)", filename.lower())
    if not m:
        raise CatalogProblem("We couldn't tell the O*NET version. Upload the zip with the name O*NET gives it, like db_31_0_text.zip.")
    return f"{int(m.group(1))}.{int(m.group(2))}"


def _tsv(zf: zipfile.ZipFile, *names: str, required: bool = True) -> list[dict[str, str]]:
    """The first of `names` the zip holds (O*NET renames files between releases)."""
    by_name = {i.filename.rsplit("/", 1)[-1].lower(): i for i in zf.infolist() if not i.is_dir()}
    found = next((by_name[n.lower()] for n in names if n.lower() in by_name), None)
    if found is None:
        if required:
            raise CatalogProblem(f"The O*NET zip has no {' or '.join(names)}. Upload the text edition (db_XX_X_text.zip).")
        return []
    text = zf.read(found).decode("utf-8-sig", errors="replace")
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(io.StringIO(text), delimiter="\t")]


def import_onet(db: Session, data: bytes, filename: str, *, url: str = ONET_URL) -> dict:
    """Careers from the O*NET text database: title, description, RIASEC profile, job zone, other titles."""
    version = _onet_version(filename)
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise CatalogProblem("That zip file could not be opened.") from exc
    with zf:
        occupations = _tsv(zf, "Occupation Data.txt")
        interests = _tsv(zf, "Career Interest Types.txt", "Interests.txt")
        zones = _tsv(zf, "Job Zones.txt", required=False)
        reported = _tsv(zf, "Sample of Reported Titles.txt", required=False)
        alts = _tsv(zf, "Job Titles.txt", "Alternate Titles.txt", required=False)
        task_rows = _tsv(zf, "Task Statements.txt", required=False)
        ratings = _tsv(zf, "Task Ratings.txt", required=False)
        schooling = _tsv(zf, "Education, Training, and Experience.txt", "Education.txt", required=False)
        related_rows = _tsv(zf, "Related Occupations.txt", required=False)
        # Release 31.0 split Skills.txt into essential and transferable skills.
        skill_rows = _tsv(zf, "Skills.txt", required=False) or (_tsv(zf, "Essential Skills.txt", required=False) + _tsv(zf, "Transferable Skills.txt", required=False))
        style_rows = _tsv(zf, "Work Styles.txt", required=False)
    code_col = "o*net-soc code"
    if not occupations or code_col not in occupations[0] or "title" not in occupations[0]:
        raise CatalogProblem("Occupation Data.txt doesn't have the O*NET-SOC Code and Title columns.")

    profile: dict[str, dict[str, float]] = {}
    for r in interests:
        # OI is the occupational interest score (1 to 7); IH rows are the high-point codes.
        letter = INTEREST_NAMES.get(r.get("element name", "").lower())
        if r.get("scale id", "").upper() != "OI" or not letter:
            continue
        try:
            profile.setdefault(r[code_col], {})[letter] = round(float(r.get("data value", "")), 2)
        except ValueError:
            continue
    job_zone: dict[str, int] = {}
    for r in zones:
        try:
            job_zone[r[code_col]] = int(float(r.get("job zone", "")))
        except ValueError:
            continue
    # Other titles: the ones workers report (those My Next Move shows first), then the
    # longer list of job titles, up to MAX_ALT_TITLES each.
    alt_titles: dict[str, list[str]] = {}
    titled = (
        [(r, r.get("reported job title", "")) for r in reported if r.get("shown in my next move", "").upper() == "Y"]
        + [(r, r.get("reported job title", "")) for r in reported if r.get("shown in my next move", "").upper() != "Y"]
        + [(r, r.get("job title") or r.get("alternate title", "")) for r in alts]
    )
    for r, title in titled:
        bucket = alt_titles.setdefault(r.get(code_col, ""), [])
        if title and title.lower() != "n/a" and title not in bucket and len(bucket) < MAX_ALT_TITLES:
            bucket.append(title)

    # What people in the job do: core tasks, the most important first (O*NET's importance rating, 1 to 5).
    importance: dict[tuple[str, str], float] = {}
    for r in ratings:
        if r.get("scale id", "").upper() == "IM":
            try:
                importance[(r.get(code_col, ""), r.get("task id", ""))] = float(r.get("data value", ""))
            except ValueError:
                continue
    ranked_tasks: dict[str, list[tuple[int, float, str]]] = {}
    for r in task_rows:
        text = r.get("task", "")
        if not text:
            continue
        core = 0 if r.get("task type", "").lower() == "core" else 1
        ranked_tasks.setdefault(r.get(code_col, ""), []).append((core, -importance.get((r.get(code_col, ""), r.get("task id", "")), 0), text))
    tasks = {code: [text for _, _, text in sorted(rows)[:MAX_TASKS]] for code, rows in ranked_tasks.items()}

    # What people in the job say it takes: O*NET's "Required Level of Education" survey, the share of workers
    # at each of 12 levels. Levels nobody picked are left out.
    education: dict[str, list[dict]] = {}
    for r in schooling:
        if r.get("scale id", "").upper() != "RL":
            continue
        try:
            level, pct = int(float(r.get("category", ""))), round(float(r.get("data value", "")), 1)
        except ValueError:
            continue
        if pct > 0:
            education.setdefault(r.get(code_col, ""), []).append({"level": level, "pct": pct})
    # Careers O*NET itself says are related, closest first.
    related: dict[str, list[str]] = {}
    for r in sorted(related_rows, key=lambda row: int(row.get("index") or 0) if (row.get("index") or "").isdigit() else 999):
        other = r.get("related o*net-soc code", "")
        bucket = related.setdefault(r.get(code_col, ""), [])
        if other and other not in bucket and len(bucket) < MAX_RELATED:
            bucket.append(other)

    skills = career_skills(skill_rows, style_rows, code_col)

    src = _upsert_source(
        db,
        key=f"onet-{version.replace('.', '-')}",
        publisher="U.S. Department of Labor, Employment and Training Administration (USDOL/ETA)",
        title=f"O*NET {version} Database",
        dataset="Occupation Data, Career Interest Types, Job Zones, job titles, task statements, required level of education, related occupations, skills and work styles",
        url=url,
        released=f"O*NET {version}",
        license="CC BY 4.0. Credit: O*NET " + version + " Database by USDOL/ETA. O*NET is a trademark of USDOL/ETA. Used under the CC BY 4.0 license; our descriptions may be shortened or reformatted.",
        notes="Interest scores are O*NET's occupational interest ratings (1 to 7) for each RIASEC type. Job zones run from 1 (little preparation) to 5 (extensive preparation).",
    )
    # A release replaces only its own earlier load. Older releases keep their careers, so learners see
    # the reviewed ones until this release is approved (readers take the newest reviewed release).
    db.exec(delete(CareerEntry).where(CareerEntry.source_id == src.id))
    now = _now()
    n = 0
    for r in occupations:
        code = r[code_col]
        if not re.fullmatch(r"\d{2}-\d{4}\.\d{2}", code):
            continue
        db.add(CareerEntry(code=code, soc=code[:7], title=r["title"], description=r.get("description", ""), job_zone=job_zone.get(code), interests=profile.get(code, {}), alt_titles=alt_titles.get(code, []), tasks=tasks.get(code, []),
                               education=sorted(education.get(code, []), key=lambda row: row["level"]), related=related.get(code, []), skills=skills.get(code, []), source_id=src.id, status="draft", creation_date=now))
        n += 1
    if not n:
        raise CatalogProblem("No occupations found in Occupation Data.txt.")
    db.commit()
    return {"kind": "onet", "source": src.key, "careers": n, "with_interests": sum(1 for r in occupations if r[code_col] in profile)}


# --- College Scorecard -------------------------------------------------------------

CONTROL = {"1": "Public", "2": "Private nonprofit", "3": "Private for-profit"}
DEGREE = {"1": "Certificates", "2": "Associate degrees", "3": "Bachelor's degrees", "4": "Graduate degrees"}


def _val(text: str | None) -> float | None:
    t = (text or "").strip()
    if not t or t.upper() in ("NULL", "NA", "PRIVACYSUPPRESSED", "PS"):
        return None
    try:
        v = float(t.replace(",", ""))
    except ValueError:
        return None
    return v if math.isfinite(v) else None


# The institution file has about 3,300 columns; only these are kept while reading it.
SCORECARD_COLUMNS = ("unitid", "instnm", "city", "stabbr", "insturl", "control", "preddeg", "curroper", "ugds", "adm_rate", "c150_4", "c150_l4", "md_earn_wne_p10", "tuitionfee_in", "tuitionfee_out", "roomboard_on", "roomboard_off", "booksupply", "otherexpense_on", "otherexpense_off", "otherexpense_fam")

# The school's own cost-of-attendance budget (IPEDS, via the Scorecard), yearly, full time: (metric, dims, column, label).
COST_COLUMNS = (
    ("room_board", {"housing": "on"}, "roomboard_on", "room and board on campus"),
    ("room_board", {"housing": "off"}, "roomboard_off", "room and board off campus"),
    ("books", {}, "booksupply", "books and supplies"),
    ("other_costs", {"housing": "on"}, "otherexpense_on", "other costs, living on campus"),
    ("other_costs", {"housing": "off"}, "otherexpense_off", "other costs, living off campus"),
    ("other_costs", {"housing": "family"}, "otherexpense_fam", "other costs, living with family"),
)


def scorecard_rows(data: bytes, filename: str) -> Iterator[dict[str, str]]:
    """The institution file's rows, streamed from the zip, keeping SCORECARD_COLUMNS."""
    if filename.lower().endswith(".zip"):
        member = scorecard_member(data, filename)
        if not member:
            raise CatalogProblem("The zip has no Most-Recent-Cohorts-Institution file in it.")
        zf = zipfile.ZipFile(io.BytesIO(data))
        info = next(i for i in zf.infolist() if i.filename.rsplit("/", 1)[-1].lower() == member)
        stream = zf.open(info)
    elif filename.lower().endswith(".csv"):
        stream = io.BytesIO(data)
    else:
        raise CatalogProblem("Upload the College Scorecard institution CSV, or the zip that holds it.")
    with io.TextIOWrapper(stream, encoding="utf-8-sig", errors="replace", newline="") as text:
        reader = csv.reader(text)
        header = [(h or "").strip().lower() for h in next(reader, [])]
        if not is_scorecard_columns(header):
            raise CatalogProblem("Expected the Scorecard columns UNITID, INSTNM and STABBR.")
        at = {name: header.index(name) for name in SCORECARD_COLUMNS if name in header}
        for row in reader:
            yield {name: row[i].strip() if i < len(row) else "" for name, i in at.items()}


def _scorecard_release(filename: str) -> str:
    m = re.search(r"(\d{2})(\d{2})(20\d{2})", filename)
    return f"{m.group(3)}-{m.group(1)}-{m.group(2)}" if m else ""


def import_scorecard(db: Session, data: bytes, filename: str, *, url: str = SCORECARD_URL, rows: Iterable[dict[str, str]] | None = None) -> dict:
    """Schools from the Scorecard's most recent institution file, plus their yearly tuition as facts."""
    rows = rows if rows is not None else scorecard_rows(data, filename)
    release = _scorecard_release(filename)
    src = _upsert_source(
        db,
        key=f"college-scorecard-institutions{('-' + release) if release else ''}",
        publisher="U.S. Department of Education",
        title="College Scorecard, most recent institution data",
        dataset="Schools: type, size, admission and completion rates, earnings 10 years after entry, tuition and fees, and each school's cost-of-attendance budget (room and board, books, other costs)",
        url=url,
        released=f"Data files dated {release}" if release else "Most recent cohorts (release date not in the file name)",
        license="U.S. government work, public domain",
        notes="Completion is the share finishing within 150% of normal time. Earnings are the median for students working 10 years after they started, reported for a school and its branch campuses together. Tuition and fees are yearly published prices, before aid. Room and board, books and other costs are the school's own yearly budget for a full-time student, as reported to IPEDS.",
    )
    # Keep only the columns used, so a full-width file passed in as rows stays small.
    rows = [{k: r[k] for k in SCORECARD_COLUMNS if k in r} for r in rows]
    # Only this release's own earlier load is replaced; older releases stay live until this one is approved.
    db.exec(delete(SchoolEntry).where(SchoolEntry.source_id == src.id))
    db.exec(delete(EstimateFact).where(EstimateFact.source_id == src.id))
    now = _now()
    schools = facts = 0
    first = True
    for r in rows:
        if first:
            if not is_scorecard_columns(r):
                raise CatalogProblem("Expected the Scorecard columns UNITID, INSTNM and STABBR.")
            first = False
        if r.get("curroper", "1") not in ("1", ""):
            continue
        unitid = r["unitid"]
        degree_level = r.get("preddeg", "")
        four_year = degree_level in ("3", "4")
        completion = _val(r.get("c150_4")) if four_year else _val(r.get("c150_l4"))
        if completion is None:
            completion = _val(r.get("c150_4")) or _val(r.get("c150_l4"))
        students = _val(r.get("ugds"))
        # A few schools put notes after the address ("... OR school of radiologic technology").
        url_ = (r.get("insturl", "").split() or [""])[0]
        if url_ and not url_.lower().startswith("http"):
            url_ = "https://" + url_
        db.add(SchoolEntry(unitid=unitid, name=r["instnm"], city=r.get("city", ""), state=r.get("stabbr", "").upper(), url=url_[:500], control=CONTROL.get(r.get("control", ""), ""), degree=DEGREE.get(degree_level, ""), students=int(students) if students is not None else None, admission_rate=_val(r.get("adm_rate")), completion_rate=completion, median_earnings=_val(r.get("md_earn_wne_p10")), source_id=src.id, status="draft", creation_date=now))
        schools += 1
        for residency, column in (("in", "tuitionfee_in"), ("out", "tuitionfee_out")):
            v = _val(r.get(column))
            if v is None:
                continue
            dims = {"school": unitid, "residency": residency}
            db.add(EstimateFact(metric="tuition", place="us", dims=dims, dims_key=dims_key(dims), label=f"{r['instnm']} tuition and fees ({'in-state' if residency == 'in' else 'out-of-state'})", value=v, period="yr", stat="published price", source_id=src.id, status="draft", creation_date=now))
            facts += 1
        for metric, extra, column, what in COST_COLUMNS:
            if (v := _val(r.get(column))) is None:
                continue
            dims = {"school": unitid, **extra}
            db.add(EstimateFact(metric=metric, place="us", dims=dims, dims_key=dims_key(dims), label=f"{r['instnm']} {what}", value=v, period="yr", stat="school's cost-of-attendance budget", source_id=src.id, status="draft", creation_date=now))
            facts += 1
    if not schools:
        raise CatalogProblem("No operating schools found in the file.")
    db.commit()
    return {"kind": "scorecard", "source": src.key, "schools": schools, "facts": facts}


# --- shared ------------------------------------------------------------------------


def _upsert_source(db: Session, **fields) -> EstimateSource:
    from src.services.life_plans.importers import upsert_source

    return upsert_source(db, **fields)


def review_entries(db: Session, source_id: int, status: str) -> int:
    from sqlalchemy import update

    from src.db.life_plans import ProgramEntry

    # Programs run to hundreds of thousands of rows, so they change in one statement.
    n = db.exec(update(ProgramEntry).where(ProgramEntry.source_id == source_id).values(status=status)).rowcount or 0
    for model in (CareerEntry, SchoolEntry):
        for row in db.exec(select(model).where(model.source_id == source_id)).all():
            row.status = status
            db.add(row)
            n += 1
    return n


def entry_counts(db: Session, source_id: int) -> dict[str, int]:
    from src.db.life_plans import ProgramEntry

    out: dict[str, int] = {}
    for model in (CareerEntry, SchoolEntry, ProgramEntry):
        rows = db.exec(select(model.status).where(model.source_id == source_id)).all()
        for status in rows:
            out[status] = out.get(status, 0) + 1
    return out


# --- reading the catalog -----------------------------------------------------------


def _live(model, key):
    """Reviewed rows, each from the newest reviewed release that has its code. A new release sits beside
    the older one as drafts until it is approved, so importing never hides what learners see."""
    newest = (
        select(key.label("k"), func.max(model.source_id).label("sid"))
        .where(model.status == REVIEWED)
        .group_by(key)
        .subquery()
    )
    return select(model).join(newest, and_(key == newest.c.k, model.source_id == newest.c.sid)).where(model.status == REVIEWED)


def live_careers():
    return _live(CareerEntry, CareerEntry.code)


def live_schools():
    return _live(SchoolEntry, SchoolEntry.unitid)


def _career_view(c: CareerEntry, *, full: bool = False) -> dict:
    out = {"code": c.code, "soc": c.soc, "title": c.title, "job_zone": c.job_zone, "interests": c.interests, "top_interests": top_interests(c.interests)}
    if full:
        out |= {"description": c.description, "alt_titles": c.alt_titles, "tasks": c.tasks or [], "education": c.education or [], "related": c.related or [], "skills": c.skills or []}
    return out


def top_interests(profile: dict) -> str:
    """The two or three strongest RIASEC letters, like "IRC"."""
    ranked = sorted((k for k in RIASEC if k in profile), key=lambda k: -profile[k])
    return "".join(ranked[:3])


def search_careers(db: Session, query: str = "", limit: int = 20) -> list[dict]:
    rows = db.exec(live_careers()).all()
    q = query.strip().lower()
    if not q:
        return [_career_view(c) for c in sorted(rows, key=lambda c: c.title)[:limit]]
    scored = []
    for c in rows:
        title = c.title.lower()
        if title.startswith(q):
            rank = 0
        elif q in title:
            rank = 1
        elif any(q in a.lower() for a in c.alt_titles):
            rank = 2
        else:
            continue
        scored.append((rank, c.title, c))
    return [_career_view(c) for _, _, c in sorted(scored, key=lambda t: (t[0], t[1]))[:limit]]


def get_career(db: Session, code: str) -> dict | None:
    c = db.exec(live_careers().where(CareerEntry.code == code)).first()
    if not c:
        return None
    src = db.get(EstimateSource, c.source_id)
    return {**_career_view(c, full=True), "source": {"key": src.key, "title": src.title, "license": src.license, "url": src.url} if src else None}


def _correlation(a: dict, b: dict) -> float | None:
    xs = [float(a.get(k, 0) or 0) for k in RIASEC]
    ys = [float(b.get(k, 0) or 0) for k in RIASEC]
    mx, my = sum(xs) / 6, sum(ys) / 6
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def match_careers(db: Session, scores: dict, *, job_zones: list[int] | None = None, limit: int = 20) -> list[dict]:
    """Careers whose RIASEC profile has the same shape as the learner's scores.

    The match is the correlation between the two six-number profiles, so it works with
    any scale (O*NET's 1 to 7, a 0 to 40 total). It's a "these line up" signal, not a
    prediction, and the response says how it was worked out."""
    if sum(1 for k in RIASEC if scores.get(k) is not None) < 6:
        raise CatalogProblem("Send a score for each of R, I, A, S, E and C.")
    rows = db.exec(live_careers()).all()
    out = []
    for c in rows:
        if job_zones and c.job_zone not in job_zones:
            continue
        r = _correlation(scores, c.interests) if len(c.interests) == 6 else None
        if r is None:
            continue
        out.append((r, c))
    out.sort(key=lambda t: (-t[0], t[1].title))
    return [{**_career_view(c), "match": round(r, 3)} for r, c in out[:limit]]


def _school_view(s: SchoolEntry) -> dict:
    return {"unitid": s.unitid, "name": s.name, "city": s.city, "state": s.state, "url": s.url, "control": s.control, "degree": s.degree, "students": s.students, "admission_rate": s.admission_rate, "completion_rate": s.completion_rate, "median_earnings": s.median_earnings}


def search_schools(db: Session, query: str = "", state: str | None = None, limit: int = 20) -> list[dict]:
    stmt = live_schools()
    if state:
        stmt = stmt.where(SchoolEntry.state == state.upper())
    q = query.strip()
    if q:
        stmt = stmt.where(col(SchoolEntry.name).ilike(f"%{q}%"))
    rows = db.exec(stmt.limit(500)).all()
    rows = sorted(rows, key=lambda s: (not s.name.lower().startswith(q.lower()), -(s.students or 0), s.name))
    return [_school_view(s) for s in rows[:limit]]


def get_school(db: Session, unitid: str) -> dict | None:
    s = db.exec(live_schools().where(SchoolEntry.unitid == unitid)).first()
    if not s:
        return None
    src = db.get(EstimateSource, s.source_id)
    keys = {dims_key({"school": unitid, "residency": r}): r for r in ("in", "out")}
    tuition = {}
    for f in db.exec(select(EstimateFact).where(EstimateFact.metric == "tuition", col(EstimateFact.dims_key).in_(list(keys)), EstimateFact.status == REVIEWED)).all():
        tuition[keys[f.dims_key]] = f.value
    return {**_school_view(s), "tuition": tuition, "source": {"key": src.key, "title": src.title, "released": src.released, "url": src.url} if src else None}
