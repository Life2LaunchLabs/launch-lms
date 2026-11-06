"""Datasets: the published files behind life plans and careers, as platform admins see them.

A dataset is one publisher's table (HUD Fair Market Rents, BLS wages, the O*NET database,
the College Scorecard). Every file loaded from it is a release, kept as an `EstimateSource`,
and a release holds one or more tables: estimate facts, O*NET careers, Scorecard schools.
Admins browse a release's rows with search and filters and export them as CSV; rows are
never edited here, only loaded from the publisher's file and approved or retired as a whole.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, SchoolEntry
from src.services.life_plans import places

# The datasets we expect, in the order admins see them. `prefix` picks out a dataset's
# releases by their source key; `used_for` says where learners meet the numbers.
DATASETS: list[dict] = [
    {
        "kind": "hud_fmr",
        "prefix": "hud-fmr-",
        "title": "HUD Fair Market Rents",
        "publisher": "U.S. Department of Housing and Urban Development",
        "description": "Rent for studio to 4-bedroom homes at the 40th percentile, by county, set each federal fiscal year.",
        "used_for": "The Rent line in life plan budgets, by county and number of bedrooms.",
        "license": "Public domain (U.S. government work).",
        "url": "https://www.huduser.gov/portal/datasets/fmr.html",
        "file": "The county file, like FY27_FMRs.xlsx",
    },
    {
        "kind": "bls_oews",
        "prefix": "bls-oews-",
        "title": "BLS wages (OEWS)",
        "publisher": "U.S. Bureau of Labor Statistics",
        "description": "Pay by occupation at the 10th, 25th, 50th, 75th and 90th percentiles for the US, each state and Oregon's metro and nonmetro areas, as of May each year.",
        "used_for": "The Job line's pay in life plan budgets, and pay on career pages.",
        "license": "Public domain (U.S. government work). Cite BLS.",
        "url": "https://www.bls.gov/oes/tables.htm",
        "file": "The all-data zip, like oesm25all.zip",
    },
    {
        "kind": "onet",
        "prefix": "onet-",
        "title": "O*NET database",
        "publisher": "U.S. Department of Labor, Employment and Training Administration",
        "description": "Occupations with descriptions, everyday tasks, interest profiles (RIASEC), job zones and other job titles.",
        "used_for": "Career pages, Career swipe and matching careers to the interest quiz.",
        "license": "CC BY 4.0: credit O*NET with its version number and say what we changed.",
        "url": "https://www.onetcenter.org/database.html",
        "file": "The text database zip, like db_31_0_text.zip",
    },
    {
        "kind": "scorecard",
        "prefix": "college-scorecard-",
        "title": "College Scorecard",
        "publisher": "U.S. Department of Education",
        "description": "Colleges and training schools with size, admission and completion rates, earnings after attending, and tuition.",
        "used_for": "School listings, and the Tuition line in life plan budgets.",
        "license": "Public domain (U.S. government work).",
        "url": "https://collegescorecard.ed.gov/data/",
        "file": "Most-Recent-Cohorts-Institution.csv, or the zip that holds it",
    },
]

TABLE_TITLES = {"facts": "Estimate facts", "careers": "Careers", "schools": "Schools"}
STATUSES = ["reviewed", "draft", "retired"]
MAX_PAGE = 200


class DatasetProblem(Exception):
    pass


def kind_of(key: str) -> str | None:
    for spec in DATASETS:
        if key.startswith(spec["prefix"]):
            return spec["kind"]
    return None


def _counts(db: Session, model, source_id: int) -> dict[str, int]:
    rows = db.exec(select(model.status, func.count()).where(model.source_id == source_id).group_by(model.status)).all()
    return {status: n for status, n in rows}


def _release(db: Session, src: EstimateSource) -> dict:
    tables = []
    by_status: dict[str, int] = {}
    for name, model in (("facts", EstimateFact), ("careers", CareerEntry), ("schools", SchoolEntry)):
        counts = _counts(db, model, src.id)
        if not counts:
            continue
        tables.append({"name": name, "title": TABLE_TITLES[name], "rows": sum(counts.values())})
        for status, n in counts.items():
            by_status[status] = by_status.get(status, 0) + n
    return {
        "key": src.key,
        "label": src.released or src.title or src.key,
        "title": src.title,
        "publisher": src.publisher,
        "dataset": src.dataset,
        "url": src.url,
        "released": src.released,
        "retrieved": src.retrieved,
        "license": src.license,
        "notes": src.notes,
        "tables": tables,
        "by_status": by_status,
    }


def catalog(db: Session) -> list[dict]:
    """Every expected dataset with its loaded releases, newest first, plus any loaded source
    that belongs to none of them (so nothing loaded is ever hidden)."""
    sources = db.exec(select(EstimateSource).order_by(col(EstimateSource.id).desc())).all()
    out = []
    for spec in DATASETS:
        releases = [_release(db, src) for src in sources if src.key.startswith(spec["prefix"])]
        out.append({**{k: v for k, v in spec.items() if k != "prefix"}, "origin": "external", "importable": True, "releases": releases})
    other = [_release(db, src) for src in sources if kind_of(src.key) is None]
    if other:
        out.append({"kind": "other", "title": "Other sources", "publisher": "", "description": "Sources loaded before datasets were named.", "used_for": "", "license": "", "url": "", "file": "", "origin": "external", "importable": False, "releases": other})
    return out


# --- rows -------------------------------------------------------------------------------


@dataclass
class Column:
    key: str
    label: str
    get: Callable
    numeric: bool = False


@dataclass
class Table:
    model: type
    columns: list[Column]
    search: list  # model columns matched with a case-insensitive "contains"
    filters: dict[str, Callable] = field(default_factory=dict)  # name -> (model) column for equality
    options: Callable | None = None  # (db, source_id) -> {filter: [values]}


def _dims_text(dims: dict | None) -> str:
    return ", ".join(f"{k} {v}" for k, v in sorted((dims or {}).items()))


def _pct(name: str) -> Callable:
    return lambda fact: (fact.percentiles or {}).get(name)


def _interest_code(career: CareerEntry) -> str:
    scores = career.interests or {}
    return "".join(sorted(scores, key=lambda k: -float(scores[k] or 0))[:3])


FACT_COLUMNS = [
    Column("place", "Place", lambda f: places.label(f.place)),
    Column("place_key", "Place key", lambda f: f.place),
    Column("metric", "Metric", lambda f: f.metric),
    Column("label", "Label", lambda f: f.label),
    Column("breakdown", "Breakdown", lambda f: _dims_text(f.dims)),
    Column("value", "Value", lambda f: f.value, True),
    Column("p10", "10th", _pct("p10"), True),
    Column("p25", "25th", _pct("p25"), True),
    Column("p50", "Median", _pct("p50"), True),
    Column("p75", "75th", _pct("p75"), True),
    Column("p90", "90th", _pct("p90"), True),
    Column("period", "Per", lambda f: f.period),
    Column("stat", "Statistic", lambda f: f.stat),
    Column("dollar_year", "Dollar year", lambda f: f.dollar_year, True),
    Column("status", "Status", lambda f: f.status),
]

CAREER_COLUMNS = [
    Column("code", "O*NET code", lambda c: c.code),
    Column("soc", "SOC", lambda c: c.soc),
    Column("title", "Title", lambda c: c.title),
    Column("job_zone", "Job zone", lambda c: c.job_zone, True),
    Column("interests", "Interests", _interest_code),
    Column("tasks", "Tasks", lambda c: len(c.tasks or []), True),
    Column("alt_titles", "Other titles", lambda c: len(c.alt_titles or []), True),
    Column("description", "Description", lambda c: c.description),
    Column("status", "Status", lambda c: c.status),
]

SCHOOL_COLUMNS = [
    Column("unitid", "Unit ID", lambda s: s.unitid),
    Column("name", "Name", lambda s: s.name),
    Column("city", "City", lambda s: s.city),
    Column("state", "State", lambda s: s.state),
    Column("control", "Control", lambda s: s.control),
    Column("degree", "Degree", lambda s: s.degree),
    Column("students", "Students", lambda s: s.students, True),
    Column("admission_rate", "Admission rate", lambda s: s.admission_rate, True),
    Column("completion_rate", "Completion rate", lambda s: s.completion_rate, True),
    Column("median_earnings", "Median earnings", lambda s: s.median_earnings, True),
    Column("url", "Website", lambda s: s.url),
    Column("status", "Status", lambda s: s.status),
]


def _distinct(db: Session, column, source_column, source_id: int) -> list:
    return sorted(v for v in db.exec(select(column).where(source_column == source_id).distinct()).all() if v not in (None, ""))


def _fact_options(db: Session, source_id: int) -> dict:
    keys = _distinct(db, EstimateFact.place, EstimateFact.source_id, source_id)
    return {
        "metric": _distinct(db, EstimateFact.metric, EstimateFact.source_id, source_id),
        "level": sorted({places.level_of(k) for k in keys}, key=lambda v: ["city", "county", "area", "state", "us"].index(v) if v in ("city", "county", "area", "state", "us") else 9),
        "status": _distinct(db, EstimateFact.status, EstimateFact.source_id, source_id),
    }


def _level_filter(value: str):
    return EstimateFact.place == "us" if value == "us" else col(EstimateFact.place).like(f"{value}:%")


TABLES: dict[str, Table] = {
    "facts": Table(
        EstimateFact, FACT_COLUMNS, [EstimateFact.label, EstimateFact.place, EstimateFact.dims_key],
        {"metric": lambda v: EstimateFact.metric == v, "status": lambda v: EstimateFact.status == v, "level": _level_filter},
        _fact_options,
    ),
    "careers": Table(
        CareerEntry, CAREER_COLUMNS, [CareerEntry.code, CareerEntry.title],
        {"job_zone": lambda v: CareerEntry.job_zone == int(v), "status": lambda v: CareerEntry.status == v},
        lambda db, sid: {"job_zone": _distinct(db, CareerEntry.job_zone, CareerEntry.source_id, sid), "status": _distinct(db, CareerEntry.status, CareerEntry.source_id, sid)},
    ),
    "schools": Table(
        SchoolEntry, SCHOOL_COLUMNS, [SchoolEntry.name, SchoolEntry.city, SchoolEntry.unitid],
        {"state": lambda v: SchoolEntry.state == v, "control": lambda v: SchoolEntry.control == v, "status": lambda v: SchoolEntry.status == v},
        lambda db, sid: {"state": _distinct(db, SchoolEntry.state, SchoolEntry.source_id, sid), "control": _distinct(db, SchoolEntry.control, SchoolEntry.source_id, sid), "status": _distinct(db, SchoolEntry.status, SchoolEntry.source_id, sid)},
    ),
}


def _source(db: Session, key: str) -> EstimateSource:
    src = db.exec(select(EstimateSource).where(EstimateSource.key == key)).first()
    if not src:
        raise DatasetProblem("No such release.")
    return src


def _query(table: Table, source_id: int, q: str, filters: dict[str, str]):
    stmt = select(table.model).where(table.model.source_id == source_id)
    q = (q or "").strip().lower()
    if q:
        stmt = stmt.where(or_(*[func.lower(column).contains(q) for column in table.search]))
    for name, value in filters.items():
        if value and name in table.filters:
            try:
                stmt = stmt.where(table.filters[name](value))
            except ValueError as exc:
                raise DatasetProblem(f"Bad {name} filter.") from exc
    return stmt


def _table(name: str) -> Table:
    if name not in TABLES:
        raise DatasetProblem("No such table.")
    return TABLES[name]


def rows(db: Session, key: str, table_name: str, *, q: str = "", filters: dict[str, str] | None = None, page: int = 1, per_page: int = 50) -> dict:
    """One page of a release's table, with the filter choices its rows allow."""
    src = _source(db, key)
    table = _table(table_name)
    per_page = min(max(per_page, 1), MAX_PAGE)
    page = max(page, 1)
    stmt = _query(table, src.id, q, filters or {})
    total = db.exec(select(func.count()).select_from(stmt.subquery())).one()
    found = db.exec(stmt.order_by(col(table.model.id)).offset((page - 1) * per_page).limit(per_page)).all()
    return {
        "source": src.key,
        "table": table_name,
        "columns": [{"key": c.key, "label": c.label, "numeric": c.numeric} for c in table.columns],
        "rows": [{c.key: c.get(item) for c in table.columns} for item in found],
        "total": total,
        "page": page,
        "per_page": per_page,
        "filters": table.options(db, src.id) if table.options else {},
    }


def export_name(key: str, table_name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", f"{key}-{table_name}".lower()).strip("-") + ".csv"


def export_csv(db: Session, key: str, table_name: str, *, q: str = "", filters: dict[str, str] | None = None) -> str:
    """Every row of a release's table that matches, as CSV text. Read whole while the
    session is open; the largest release (a BLS year) is a few megabytes."""
    src = _source(db, key)
    table = _table(table_name)
    found = db.exec(_query(table, src.id, q, filters or {}).order_by(col(table.model.id))).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([c.label for c in table.columns])
    for item in found:
        writer.writerow(["" if (v := c.get(item)) is None else v for c in table.columns])
    return buffer.getvalue()
