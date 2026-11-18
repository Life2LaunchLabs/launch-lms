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
import itertools
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime

from sqlmodel import Session, delete, select

from src.db.life_plans import EstimateFact, EstimateSource
from src.services.life_plans import places
from src.services.life_plans.estimates import dims_key
from src.services.life_plans.titles import singular_title


class ImportProblem(ValueError):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


def read_table(data: bytes, filename: str) -> Iterator[dict[str, str]]:
    """Rows of the first sheet (or the CSV) as dicts keyed by lowercased header."""
    name = filename.lower()
    if name.endswith(".zip"):
        data, filename = _unzip_table(data)
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
    raise ImportProblem("Upload the publisher's .xlsx, .csv or .zip file.")


def _unzip_table(data: bytes) -> tuple[bytes, str]:
    """The workbook or CSV inside a publisher's zip (BLS ships OEWS as oesm25all.zip)."""
    import zipfile

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ImportProblem("That zip file could not be opened.") from exc
    with zf:
        tables = [i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith((".xlsx", ".csv")) and not i.filename.startswith("__MACOSX/")]
        if not tables:
            raise ImportProblem("The zip has no .xlsx or .csv file in it.")
        # The data file is the biggest one (BLS zips hold only the workbook today).
        item = max(tables, key=lambda i: i.file_size)
        if item.file_size > 400 * 1024 * 1024:
            raise ImportProblem("The file inside the zip is too large.")
        return zf.read(item), item.filename.rsplit("/", 1)[-1]


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


def _pay(text: str | None) -> float | None:
    """A wage, or None for a blank, a footnote mark or a withheld-value code (anything not above zero)."""
    n = _num(text)
    return n if n is not None and n > 0 else None


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


def import_hud_fmr(db: Session, data: bytes, filename: str, *, fiscal_year: int, url: str, state: str = "OR", rows: Iterable[dict[str, str]] | None = None) -> dict:
    """HUD Fair Market Rents by county, studio to 4 bedrooms, for one state's counties."""
    rows = list(rows if rows is not None else read_table(data, filename))
    if not rows:
        raise ImportProblem("The file has no rows.")
    cols = rows[0].keys()
    fmr_cols = {int(m.group(1)): c for c in cols if (m := re.fullmatch(r"fmr_?([0-4])", c))}
    state_col = next((c for c in ("stusps", "state_alpha", "state_abbr", "st") if c in cols), None)
    county_col = next((c for c in ("countyname", "county_name", "county_town_name", "areaname") if c in cols), None)
    if len(fmr_cols) < 5 or not state_col or not county_col:
        if "occ_code" in cols:
            raise ImportProblem("This looks like the BLS wages (OEWS) file. Choose BLS wages (OEWS) as the source and load it again.")
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


HUD_FMR_URL = "https://www.huduser.gov/portal/datasets/fmr.html"
BLS_OEWS_URL = "https://www.bls.gov/oes/tables.htm"
NOT_ALLOWED = "We can't load that file. Upload HUD's county Fair Market Rents file (like FY27_FMRs.xlsx), BLS's OEWS all-data file (like oesm25all.zip), the O*NET text database (like db_31_0_text.zip) the College Scorecard institution or field-of-study file (Most-Recent-Cohorts-Institution.csv or Most-Recent-Cohorts-Field-of-Study.csv), the Oregon Employment Department's occupational projections or wage information workbook, BLS's Consumer Expenditure table by household size (cu-size-2025.xlsx), a USDA food plan history file (like usda-moderatecostplan-sept2007-sept2026.xlsx) or a BEA price parities file (SARPP, MARPP or PARPP .csv), as the publisher gives it."


def _zip_table_name(data: bytes) -> str:
    import zipfile

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            tables = [i for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith((".xlsx", ".csv"))]
            return max(tables, key=lambda i: i.file_size).filename if tables else ""
    except zipfile.BadZipFile:
        return ""


def _year_from(names: list[str], patterns: tuple[str, ...]) -> int | None:
    for name in names:
        for pattern in patterns:
            if m := re.search(pattern, name.lower()):
                n = int(m.group(1))
                return n + 2000 if n < 100 else n
    return None


def import_file(db: Session, data: bytes, filename: str) -> dict:
    """Load whichever allowed file this is, working out the source and year from the file.

    Allowed: HUD's county Fair Market Rents (FYxx_FMRs.xlsx), BLS's OEWS all-data
    file (oesmYYall.zip), the O*NET text database (db_XX_X_text.zip) and the College
    Scorecard institution file. Anything else is refused."""
    from src.services.life_plans import oregon, public_data

    try:
        oed = oregon.kind_of(data, filename)
        if oed == "projections":
            return oregon.import_projections(db, data, filename)
        if oed == "wages":
            return oregon.import_wages(db, data, filename)
    except oregon.OregonProblem as exc:
        raise ImportProblem(str(exc)) from exc
    from src.services.life_plans import programs

    try:
        if programs.is_programs_file(data, filename):
            return programs.import_programs(db, data, filename)
    except programs.ProgramProblem as exc:
        raise ImportProblem(str(exc)) from exc
    from src.services.life_plans import spending

    if kind := spending.kind_of(data, filename):
        return spending.import_spending(db, data, filename, kind)
    try:
        if public_data.is_onet_zip(data, filename):
            return public_data.import_onet(db, data, filename)
        if public_data.scorecard_member(data, filename):
            return public_data.import_scorecard(db, data, filename)
    except public_data.CatalogProblem as exc:
        raise ImportProblem(str(exc)) from exc
    names = [filename] + ([_zip_table_name(data)] if filename.lower().endswith(".zip") else [])
    rows = read_table(data, filename)
    first = next(rows, None)
    if first is None:
        raise ImportProblem("The file has no rows.")
    cols = set(first)
    rows = itertools.chain([first], rows)
    if {"area", "occ_code", "h_median", "a_median"} <= cols:
        year = _year_from(names, (r"oesm(\d{2})", r"_m_?(20\d{2})"))
        if not year:
            raise ImportProblem("We couldn't tell the year of this OEWS file. Upload it with the name BLS gives it, like oesm25all.zip.")
        return {"kind": "bls_oews", "year": year, **import_bls_oews(db, data, filename, year=year, url=BLS_OEWS_URL, rows=rows)}
    if all(f"fmr_{n}" in cols for n in range(5)) and "countyname" in cols:
        year = _year_from(names, (r"fy_?(20\d{2}|\d{2})",))
        if not year:
            # HUD's county file carries the population year the FMRs were built on, three years before the fiscal year.
            pop = next((int(c[3:]) for c in cols if re.fullmatch(r"pop20\d{2}", c)), None)
            year = pop + 3 if pop else None
        if not year:
            raise ImportProblem("We couldn't tell the fiscal year of this FMR file. Upload it with the name HUD gives it, like FY27_FMRs.xlsx.")
        return {"kind": "hud_fmr", "year": year, **import_hud_fmr(db, data, filename, fiscal_year=year, url=HUD_FMR_URL, rows=rows)}
    if public_data.is_scorecard_columns(cols):
        try:
            return public_data.import_scorecard(db, data, filename, rows=rows)
        except public_data.CatalogProblem as exc:
            raise ImportProblem(str(exc)) from exc
    raise ImportProblem(NOT_ALLOWED)


OEWS_PCTS = (("p10", "pct10"), ("p25", "pct25"), ("p50", "median"), ("p75", "pct75"), ("p90", "pct90"))


def import_bls_oews(db: Session, data: bytes, filename: str, *, year: int, url: str, rows: Iterable[dict[str, str]] | None = None) -> dict:
    """BLS OEWS wages by occupation: national, state, and Oregon's metro and nonmetro areas."""
    rows = rows if rows is not None else read_table(data, filename)
    oregon_areas = {code for _, code, _ in places.OR_COUNTIES.values()}
    facts: list[EstimateFact] = []
    kept_areas: set[str] = set()
    first = True
    for r in rows:
        if first:
            need = {"area", "occ_code", "occ_title", "h_median", "a_median"}
            if not need <= set(r):
                if any(re.fullmatch(r"fmr_?[0-4]", c) for c in r):
                    raise ImportProblem("This looks like the HUD Fair Market Rents file. Choose HUD Fair Market Rents as the source and load it again.")
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
        hourly = {k: _pay(r.get(f"h_{c}")) for k, c in OEWS_PCTS}
        annual = {k: _pay(r.get(f"a_{c}")) for k, c in OEWS_PCTS}
        if hourly["p50"] is not None:
            pct, period = hourly, "hr"
        elif annual["p50"] is not None:
            pct, period = annual, "yr"
        else:
            continue
        kept_areas.add(place)
        facts.append(EstimateFact(metric="wage", place=place, dims={"soc": r["occ_code"]}, label=singular_title(r["occ_title"]), value=pct["p50"], percentiles={k: v for k, v in pct.items() if v is not None}, period=period, stat="median", dollar_year=year, status="draft"))
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
    from src.services.life_plans import public_data

    entries = public_data.review_entries(db, src.id, status)
    db.commit()
    return len(facts) + entries
