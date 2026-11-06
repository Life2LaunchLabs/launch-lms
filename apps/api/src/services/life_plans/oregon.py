"""Oregon Employment Department (OED) files: occupational projections and wages for Oregon and its areas.

Both come from qualityinfo.org as workbooks whose "All Areas" sheet holds every area: the state and the
OED areas listed in `places.OR_REGIONS`. Their rows load as estimate facts keyed by six-digit SOC code,
as drafts of their own source, like every other dataset.

- Projections (like "Oregon Occupational Employment Projections 2024-2034.xlsx"): `employment` (jobs in
  the base year), `employment_projected`, `growth` (a fraction) and `openings` (average a year, growth
  plus replacement), with typical and competitive entry education in the openings fact's note.
- Wages (like "Oregon Occupational Wage Information.xlsx"): `wage` with the 10th to 90th percentiles,
  hourly, or yearly for jobs OED publishes only that way. OED ages BLS OEWS wages to the file's year and
  adds its own areas; it says these extensions are not official BLS series.
"""

from __future__ import annotations

import io
import re

from sqlmodel import Session, delete

from src.db.life_plans import EstimateFact
from src.services.life_plans import places
from src.services.life_plans.estimates import dims_key

QUALITYINFO_URL = "https://www.qualityinfo.org/data"
LICENSE = "Public information from the State of Oregon. Cite the Oregon Employment Department, qualityinfo.org."


class OregonProblem(ValueError):
    pass


def _workbook(data: bytes):
    from openpyxl import load_workbook

    return load_workbook(io.BytesIO(data), read_only=True, data_only=True)


def kind_of(data: bytes, filename: str) -> str | None:
    """"projections" or "wages" for an OED workbook, else None."""
    if not filename.lower().endswith(".xlsx"):
        return None
    try:
        wb = _workbook(data)
    except Exception:  # noqa: BLE001 - not a workbook we can read means not ours
        return None
    if "All Areas" not in wb.sheetnames:
        return None
    title = str(next(wb.worksheets[0].iter_rows(max_row=1, values_only=True))[0] or "")
    if "Occupational Employment Projections" in title:
        return "projections"
    if "Wage Information" in title:
        return "wages"
    return None


def _rows(data: bytes) -> tuple[str, list[dict]]:
    """The "All Areas" sheet's title and its rows, keyed by lowercased header."""
    ws = _workbook(data)["All Areas"]
    # OED's workbooks declare a one-cell size, so a read-only sheet would stop at column A.
    ws.reset_dimensions()
    title, header, out = "", None, []
    for raw in ws.iter_rows(values_only=True):
        cells = ["" if c is None else c for c in raw]
        if not title and cells and isinstance(cells[0], str) and cells[0].strip():
            title = cells[0].strip()
            continue
        if header is None:
            if sum(1 for c in cells if str(c).strip()) >= 5 and any(re.sub(r"\s+", " ", str(c)).strip().lower() == "area name" for c in cells):
                # Footnote marks (superscript digits) are dropped from the names.
                header = [re.sub(r"\s+", " ", re.sub("[¹²³⁰-⁹]", "", str(c))).strip().lower() for c in cells]
            continue
        if any(str(c).strip() for c in cells):
            out.append(dict(zip(header, cells)))
    if header is None:
        raise OregonProblem("The All Areas sheet has no header row with an Area Name column.")
    return title, out


def _num(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").replace(",", "").replace("$", "").strip()
    try:
        return float(text)
    except ValueError:
        return None  # "-s-" and blanks are suppressed values


def _place(area: str, unmatched: set[str]) -> str | None:
    if area.strip().lower() == "oregon":
        return "state:OR"
    key = places.region_key(area)
    if not key:
        unmatched.add(area)
    return key


def _detailed(r: dict) -> str | None:
    code = str(r.get("occupation code") or "").strip()
    level = _num(r.get("soc level"))
    return code if level == 4 and re.fullmatch(r"\d{2}-\d{4}", code) else None


def import_projections(db: Session, data: bytes, filename: str) -> dict:
    from src.services.life_plans.importers import _now, upsert_source

    title, rows = _rows(data)
    years = re.search(r"(20\d{2})\s*-\s*(20\d{2})", title)
    if not years:
        raise OregonProblem("We couldn't find the projection years (like 2024-2034) in the file's title.")
    start, end = years.group(1), years.group(2)
    src = upsert_source(
        db,
        key=f"oed-projections-{start}-{end}",
        publisher="Oregon Employment Department",
        title=f"Oregon occupational employment projections, {start}-{end}",
        dataset="Jobs in the base year and projected, percent change and average yearly openings by occupation, for Oregon and its areas",
        url="https://www.qualityinfo.org/projections",
        released=f"{start}-{end} projections",
        license=LICENSE,
    )
    src.notes = ("Openings are the yearly average of new jobs plus replacement openings (people leaving the occupation or the labor force). "
                 "OED suppresses some small-area values; those are left out. Typical and competitive entry education are in each openings fact's note.")
    db.add(src)
    db.exec(delete(EstimateFact).where(EstimateFact.source_id == src.id))
    now, unmatched, n = _now(), set(), 0
    for r in rows:
        soc = _detailed(r)
        place = _place(str(r.get("area name") or ""), unmatched) if soc else None
        if not soc or not place:
            continue
        dims = {"soc": soc}
        label = str(r.get("occupation title") or "").strip()
        jobs, later = _num(r.get(f"employment {start}")), _num(r.get(f"projected employment {end}"))
        growth, openings = _num(r.get("percent change")), _num(r.get("total openings"))
        education = "; ".join(part for part in (
            f"typical entry: {r.get('typical entry-level education')}" if r.get("typical entry-level education") else "",
            f"competitive: {r.get('competitive education')}" if r.get("competitive education") else "") if part)
        for metric, value, period, stat, note in (
            ("employment", jobs, "", f"jobs in {start}", ""),
            ("employment_projected", later, "", f"projected jobs in {end}", ""),
            ("growth", growth, "", f"change in jobs, {start}-{end} (fraction)", ""),
            ("openings", round(openings / (int(end) - int(start)), 1) if openings is not None else None, "yr", f"average openings a year, {start}-{end}", education),
        ):
            if value is None:
                continue
            db.add(EstimateFact(metric=metric, place=place, dims=dims, dims_key=dims_key(dims), label=label, value=value, period=period, stat=stat,
                                note=note, source_id=src.id, status="draft", creation_date=now))
            n += 1
    if not n:
        raise OregonProblem("No detailed occupations found on the All Areas sheet.")
    db.commit()
    return {"kind": "oed_projections", "source": src.key, "facts": n, "unmatched": sorted(unmatched)}


PCTS = (("p10", "10th percentile"), ("p25", "25th percentile"), ("p50", "50th percentile (median)"), ("p75", "75th percentile"), ("p90", "90th percentile"))


def import_wages(db: Session, data: bytes, filename: str) -> dict:
    from src.services.life_plans.importers import _now, upsert_source

    title, rows = _rows(data)
    year = re.search(r"(20\d{2})", title)
    if not year:
        raise OregonProblem("We couldn't find the wage year in the file's title (like 2026 Oregon Wage Information).")
    year = int(year.group(1))
    src = upsert_source(
        db,
        key=f"oed-wages-{year}",
        publisher="Oregon Employment Department",
        title=f"Oregon Occupational Wage Information, {year}",
        dataset="Pay by occupation at the 10th to 90th percentiles, for Oregon and its areas",
        url=QUALITYINFO_URL,
        released=f"{year} wages",
        license=LICENSE,
    )
    src.notes = (f"OED ages the BLS OEWS survey wages to {year} and adds Oregon areas. OED says these extensions are not official BLS series. "
                 "Most jobs are hourly; jobs OED publishes only by the year (such as teachers) are yearly.")
    db.add(src)
    db.exec(delete(EstimateFact).where(EstimateFact.source_id == src.id))
    now, unmatched, n = _now(), set(), 0
    for r in rows:
        soc = _detailed(r)
        place = _place(str(r.get("area name") or ""), unmatched) if soc else None
        if not soc or not place:
            continue
        pct = {name: _num(r.get(column)) for name, column in PCTS}
        if pct["p50"] is None:
            continue
        period = "yr" if pct["p50"] >= 1000 else "hr"
        dims = {"soc": soc}
        db.add(EstimateFact(metric="wage", place=place, dims=dims, dims_key=dims_key(dims), label=str(r.get("occupation title") or "").strip(),
                            value=pct["p50"], percentiles={k: v for k, v in pct.items() if v is not None}, period=period, stat="median",
                            dollar_year=year, source_id=src.id, status="draft", creation_date=now))
        n += 1
    if not n:
        raise OregonProblem("No detailed occupations with pay found on the All Areas sheet.")
    db.commit()
    return {"kind": "oed_wages", "year": year, "source": src.key, "facts": n, "unmatched": sorted(unmatched)}
