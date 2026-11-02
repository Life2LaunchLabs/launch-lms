"""Load facts from the official files, as drafts, keyed to the source they came from.

Each importer reads a file exactly as its publisher releases it (.xlsx or .csv) and
writes one draft fact per number it keeps. Nothing is estimated or adjusted here: a
fact carries the published value, its period and the dollar year. A person then
reviews the source's facts before the resolver will use them.

- HUD Fair Market Rents, county-level file (fmr_0 .. fmr_4 by county).
- BLS Occupational Employment and Wage Statistics (OEWS), the all-data file or the
  national, state or metropolitan/nonmetropolitan area files (H_PCT10 .. H_PCT90 by
  occupation; only the cross-industry, all-ownerships rows).
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterator
from datetime import UTC, datetime

from sqlmodel import Session, delete, select

from src.db.life_plans import EstimateFact, EstimateSource
from src.services.life_plans import places
from src.services.life_plans.estimates import dims_key


class ImportProblem(ValueError):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


def read_table(data: bytes, filename: str) -> Iterator[dict[str, str]]:
    """Rows of the first sheet (or the CSV) as dicts keyed by lowercased header."""
    name = filename.lower()
    if name.endswith(".csv"):
        text = data.decode("utf-8-sig", errors="replace")
        for row in csv.DictReader(io.StringIO(text)):
            yield {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        return
    if name.endswith(".xlsx"):
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except ValueError:
            # Some publisher files (HUD's FY2026 FMRs) carry a malformed document
            # date in docProps/core.xml that openpyxl refuses. Those properties don't
            # matter here, so drop the dates and read the sheet as published.
            wb = load_workbook(io.BytesIO(_without_core_dates(data)), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        it = ws.iter_rows(values_only=True)
        header = None
        for raw in it:
            cells = ["" if c is None else str(c).strip() for c in raw]
            if header is None:
                # The header is the first row with several named columns.
                if sum(1 for c in cells if c) >= 3:
                    header = [c.lower() for c in cells]
                continue
            if not any(cells):
                continue
            yield dict(zip(header, cells))
        return
    raise ImportProblem("Upload the publisher's .xlsx or .csv file.")


def _without_core_dates(data: bytes) -> bytes:
    """The same workbook with the created/modified dates removed from its core properties."""
    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            body = zin.read(item.filename)
            if item.filename == "docProps/core.xml":
                body = re.sub(rb"<dcterms:(created|modified)\b[^>]*>.*?</dcterms:\1>", b"", body, flags=re.S)
            zout.writestr(item, body)
    return out.getvalue()


def _num(text: str | None) -> float | None:
    if text is None:
        return None
    t = str(text).replace(",", "").replace("$", "").strip()
    try:
        return float(t)
    except ValueError:
        return None


def upsert_source(db: Session, *, key: str, publisher: str, title: str, dataset: str, url: str, released: str, license: str = "", notes: str = "") -> EstimateSource:
    src = db.exec(select(EstimateSource).where(EstimateSource.key == key)).first()
    if not src:
        src = EstimateSource(key=key, creation_date=_now())
    src.publisher, src.title, src.dataset, src.url, src.released = publisher, title, dataset, url, released
    src.retrieved = _now()[:10]
    src.license, src.notes = license, notes
    db.add(src)
    db.flush()
    return src


def _replace_facts(db: Session, src: EstimateSource, facts: list[EstimateFact]) -> int:
    db.exec(delete(EstimateFact).where(EstimateFact.source_id == src.id))
    for f in facts:
        f.source_id = src.id
        f.dims_key = dims_key(f.dims)
        f.creation_date = _now()
        db.add(f)
    db.commit()
    return len(facts)


def import_hud_fmr(db: Session, data: bytes, filename: str, *, fiscal_year: int, url: str, state: str = "OR") -> dict:
    """HUD Fair Market Rents by county, studio to 4 bedrooms, for one state's counties."""
    rows = list(read_table(data, filename))
    if not rows:
        raise ImportProblem("The file has no rows.")
    cols = rows[0].keys()
    fmr_cols = {int(m.group(1)): c for c in cols if (m := re.fullmatch(r"fmr_?([0-4])", c))}
    state_col = next((c for c in ("stusps", "state_alpha", "state_abbr", "st") if c in cols), None)
    county_col = next((c for c in ("countyname", "county_name", "county_town_name", "areaname") if c in cols), None)
    if len(fmr_cols) < 5 or not state_col or not county_col:
        raise ImportProblem(f"Expected columns fmr_0..fmr_4, a state column and a county column; found {', '.join(cols)}.")
    facts: list[EstimateFact] = []
    unmatched: list[str] = []
    for r in rows:
        if r.get(state_col, "").upper() != state:
            continue
        name = re.sub(r"\s+county$", "", r.get(county_col, ""), flags=re.I)
        cslug = places.slug(name)
        if cslug not in places.OR_COUNTIES:
            unmatched.append(r.get(county_col, ""))
            continue
        for beds, c in fmr_cols.items():
            v = _num(r.get(c))
            if v is None:
                continue
            facts.append(EstimateFact(metric="rent", place=f"county:{state}:{cslug}", dims={"bedrooms": beds}, value=v, period="mo", stat="fair market rent (40th percentile)", dollar_year=fiscal_year, label=f"{'Studio' if beds == 0 else f'{beds} bedroom'} fair market rent", status="draft"))
    if not facts:
        raise ImportProblem(f"No {state} counties found in the file.")
    src = upsert_source(
        db,
        key=f"hud-fmr-fy{fiscal_year}-{state.lower()}",
        publisher="U.S. Department of Housing and Urban Development (HUD)",
        title=f"Fair Market Rents, FY{fiscal_year}",
        dataset="County-level Fair Market Rents, studio to 4 bedrooms",
        url=url,
        released=f"FY{fiscal_year}",
        license="U.S. government work, public domain",
        notes="Fair Market Rents are set at the 40th percentile of gross rents (rent plus utilities) for standard-quality units, so most rents in the area are higher.",
    )
    n = _replace_facts(db, src, facts)
    return {"source": src.key, "facts": n, "unmatched": sorted(set(unmatched))[:20]}


OEWS_PCTS = (("p10", "pct10"), ("p25", "pct25"), ("p50", "median"), ("p75", "pct75"), ("p90", "pct90"))


def import_bls_oews(db: Session, data: bytes, filename: str, *, year: int, url: str) -> dict:
    """BLS OEWS wages by occupation: national, state, and Oregon's metro and nonmetro areas."""
    rows = read_table(data, filename)
    oregon_areas = {code for _, code, _ in places.OR_COUNTIES.values()}
    facts: list[EstimateFact] = []
    kept_areas: set[str] = set()
    first = True
    for r in rows:
        if first:
            need = {"area", "occ_code", "occ_title", "h_median", "a_median"}
            if not need <= set(r):
                raise ImportProblem(f"Expected OEWS columns {', '.join(sorted(need))}; found {', '.join(r)}.")
            first = False
        group = (r.get("o_group") or r.get("occ_group") or "").lower()
        if group and group not in ("detailed", "total"):
            continue
        # The all-data file also breaks each job down by industry and by ownership
        # (private, state government, ...). Keep only the all-industries,
        # all-ownerships row, or those rows would overwrite each other.
        i_group = (r.get("i_group") or "").lower()
        if i_group and i_group != "cross-industry":
            continue
        own = (r.get("own_code") or "").split(".")[0]
        if own and own != "1235":
            continue
        area_type = (r.get("area_type") or "").strip()
        area = (r.get("area") or "").strip()
        if area_type == "1" or area == "99":
            place = "us"
        elif area_type == "2":
            st = (r.get("prim_state") or r.get("st") or "").upper()
            if st not in places.STATES:
                continue
            place = f"state:{st}"
        else:
            code = area.zfill(7)
            if code not in oregon_areas:
                continue
            place = f"area:{code}"
        hourly = {k: _num(r.get(f"h_{c}")) for k, c in OEWS_PCTS}
        annual = {k: _num(r.get(f"a_{c}")) for k, c in OEWS_PCTS}
        if hourly["p50"] is not None:
            pct, period = hourly, "hr"
        elif annual["p50"] is not None:
            pct, period = annual, "yr"
        else:
            continue
        kept_areas.add(place)
        facts.append(EstimateFact(metric="wage", place=place, dims={"soc": r["occ_code"]}, label=r["occ_title"], value=pct["p50"], percentiles={k: v for k, v in pct.items() if v is not None}, period=period, stat="median", dollar_year=year, status="draft"))
    if not facts:
        raise ImportProblem("No national, state or Oregon area rows found in the file.")
    kinds = sorted({places.level_of(p) for p in kept_areas})
    src = upsert_source(
        db,
        key=f"bls-oews-{year}-{'-'.join(kinds)}",
        publisher="U.S. Bureau of Labor Statistics (BLS)",
        title=f"Occupational Employment and Wage Statistics, May {year}",
        dataset=f"Wages by occupation ({', '.join(kinds)}), 10th to 90th percentile",
        url=url,
        released=f"May {year}",
        license="U.S. government work, public domain",
        notes="Percentiles are of wages for people working in that job in that area. Hourly figures are used when published; some jobs (like teachers) are published only as yearly pay.",
    )
    n = _replace_facts(db, src, facts)
    return {"source": src.key, "facts": n, "places": len(kept_areas)}


def review_source(db: Session, source_key: str, reviewer_id: int, status: str = "reviewed") -> int:
    src = db.exec(select(EstimateSource).where(EstimateSource.key == source_key)).first()
    if not src:
        raise ImportProblem("No such source.")
    facts = db.exec(select(EstimateFact).where(EstimateFact.source_id == src.id)).all()
    now = _now()
    for f in facts:
        f.status = status
        f.reviewed_by_user_id = reviewer_id if status == "reviewed" else None
        f.reviewed_at = now if status == "reviewed" else None
        db.add(f)
    db.commit()
    return len(facts)
