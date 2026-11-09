"""Everyday spending: what households spend (BLS), what food costs (USDA) and local price levels (BEA).

- BLS Consumer Expenditure Survey, Table 1400 (size of consumer unit): yearly means for 1, 2, 3, 4
  and 5+ person households. Kept as national facts by household size (`size`).
- USDA Food Plans (thrifty, low-cost, moderate-cost, liberal), the machine-readable history files:
  the newest monthly cost for each person group (kids by age; teens and adults by sex).
- BEA Regional Price Parities (SARPP states, MARPP metro areas, PARPP metro/nonmetro portions):
  the newest year's price level for all items, goods, rents, utilities and other services (US = 100).

Each file is read as its publisher releases it and kept as published; the resolver does the
arithmetic (household size, a national figure at local prices) and says so on every estimate.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterator

from sqlmodel import Session

from src.db.life_plans import EstimateFact
from src.services.life_plans import places
from src.services.life_plans.importers import ImportProblem, _replace_facts, upsert_source

CE_URL = "https://www.bls.gov/cex/tables.htm"
USDA_URL = "https://www.fns.usda.gov/cnpp/usda-food-plans-cost-food-monthly-reports"
BEA_URL = "https://apps.bea.gov/regional/downloadzip.htm"
PUBLIC = "U.S. government work, public domain"

# App metric -> the Table 1400 items it adds up, and what it's called on an estimate.
CE_ITEMS: dict[str, tuple[tuple[str, ...], str]] = {
    "going_out": (("Food away from home", "Fees and admissions"), "eating out, and fees and admissions"),
    "clothes": (("Apparel and services",), "apparel and services"),
    "phone": (("Cellular phone service",), "cellular phone service"),
    "transport": (("Gasoline and other fuels", "Other vehicle expenses", "Public and other transportation"), "gas, car costs (insurance, repairs, fees) and public transportation, not buying a car"),
    "personal_care": (("Personal care products and services",), "personal care products and services"),
}
# Table 1400 columns (0 is the row name): 1 all, 2 one person, 3 two or more, 4 two, 5 three, 6 four, 7 five or more.
CE_SIZES = {1: 2, 2: 4, 3: 5, 4: 6, 5: 7}

# BEA line code -> price-level metric.
RPP_LINES = {"1": "price_all", "2": "price_goods", "3": "price_rents", "4": "price_utilities", "5": "price_services"}
RPP_TITLES = {"price_all": "all items", "price_goods": "goods", "price_rents": "rents", "price_utilities": "utilities", "price_services": "other services"}

USDA_PLANS = {"thrifty": "thrifty", "low-cost": "low", "moderate-cost": "moderate", "liberal": "liberal"}


def _xlsx(data: bytes):
    from openpyxl import load_workbook

    try:
        return load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 - any unreadable workbook is the same problem to the person
        raise ImportProblem("That workbook could not be opened.") from exc


def kind_of(data: bytes, filename: str) -> str | None:
    """'ce_size', 'usda_food', 'bea_rpp' or None."""
    name = filename.lower()
    if name.endswith(".csv"):
        head = data[:400].decode("utf-8-sig", errors="replace")
        return "bea_rpp" if "GeoFIPS" in head and re.search(r"\b[SMP]ARPP\b", data[:4000].decode("utf-8", errors="replace")) else None
    if not name.endswith(".xlsx"):
        return None
    wb = _xlsx(data)
    first = next(wb.worksheets[0].iter_rows(max_row=1, values_only=True), ())
    title = str(first[0] or "") if first else ""
    if title.startswith("Table 1400.") and "Consumer Expenditure" in title:
        return "ce_size"
    if len(wb.worksheets) > 1 and re.search(r"Food Plan Costs", title):
        return "usda_food"
    return None


# --- BLS Consumer Expenditure Survey ---------------------------------------------------------

def import_ce_size(db: Session, data: bytes, filename: str) -> dict:
    ws = _xlsx(data).worksheets[0]
    rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
    title = str(rows[0][0] or "")
    year = int(m.group(1)) if (m := re.search(r"(20\d{2})\s*$", title.strip())) else None
    if not year:
        raise ImportProblem("We couldn't tell the year of this Consumer Expenditure table.")
    means: dict[str, tuple] = {}
    for i, r in enumerate(rows[:-1]):
        name = str(r[0] or "").strip()
        if name and str(rows[i + 1][0] or "").strip() == "Mean" and name not in means:
            means[name] = rows[i + 1]
    facts: list[EstimateFact] = []
    for metric, (items, what) in CE_ITEMS.items():
        missing = [n for n in items if n not in means]
        if missing:
            raise ImportProblem(f"The table has no {', '.join(missing)} row.")
        for size, col in [(None, 1), *CE_SIZES.items()]:
            vals = [means[n][col] for n in items]
            if any(not isinstance(v, int | float) for v in vals):
                continue
            who = "all households" if size is None else ("one-person households" if size == 1 else f"{size}{'+' if size == 5 else ''}-person households")
            facts.append(EstimateFact(metric=metric, place="us", dims={} if size is None else {"size": size}, value=float(sum(vals)), period="yr", stat="mean spending",
                                      dollar_year=year, label=f"What {who} spend on {what}", status="draft"))
    src = upsert_source(db, key=f"bls-ce-size-{year}", publisher="U.S. Bureau of Labor Statistics", title=f"Consumer Expenditure Surveys, {year}",
                        dataset="Table 1400: annual spending by size of household", url=CE_URL, released=str(year), license=PUBLIC,
                        notes="Means across all households of that size, buyers and non-buyers together. The survey is known to under-record some spending.")
    return {"kind": "bls_ce", "year": year, "source": src.key, "facts": _replace_facts(db, src, facts)}


# --- USDA Food Plans -------------------------------------------------------------------------

def food_group(group: str, age: str) -> str | None:
    """A USDA person group as one key: '1', '2-3' ... '9-11', '12-13f', '14-18m', 'adultf', 'adultm'."""
    a = re.sub(r"\s*years?$", "", age.strip())
    g = group.strip().lower()
    if g == "child":
        return a
    if g in ("female", "male"):
        if re.fullmatch(r"(19|20)-50", a):
            a = "adult"
        elif a not in ("12-13", "14-18"):
            return None
        return f"{a}{g[0]}"
    return None


def import_usda_food(db: Session, data: bytes, filename: str) -> dict:
    ws = _xlsx(data).worksheets[1]
    it = ws.iter_rows(values_only=True)
    header = [str(c or "").strip().lower() for c in next(it)]
    need = ["fam_indv", "group", "age", "year", "month", "food_plan", "frequency", "cost"]
    if any(c not in header for c in need):
        raise ImportProblem(f"Expected the columns {', '.join(need)}.")
    ix = {c: header.index(c) for c in need}
    months = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
    rows = []
    for r in it:
        if str(r[ix["fam_indv"]]).lower() != "individual" or str(r[ix["frequency"]]).lower() != "monthly":
            continue
        month = months.get(str(r[ix["month"]]).lower())
        key = food_group(str(r[ix["group"]]), str(r[ix["age"]]))
        if month and key and isinstance(r[ix["cost"]], int | float):
            rows.append(((int(r[ix["year"]]), month), str(r[ix["food_plan"]]).lower(), key, float(r[ix["cost"]])))
    if not rows:
        raise ImportProblem("No monthly costs for individuals in the file.")
    newest = max(r[0] for r in rows)
    plan = USDA_PLANS.get(rows[0][1])
    if not plan:
        raise ImportProblem(f"Unknown food plan {rows[0][1]}.")
    month_name = list(months)[newest[1] - 1].title()
    facts = [EstimateFact(metric="food_plan", place="us", dims={"plan": plan, "group": key}, value=cost, period="mo", stat="food plan cost", dollar_year=newest[0],
                          label=f"USDA {rows[0][1]} food plan, {month_name} {newest[0]}", status="draft") for when, _, key, cost in rows if when == newest]
    src = upsert_source(db, key=f"usda-food-{plan}", publisher="U.S. Department of Agriculture", title=f"USDA {rows[0][1].title()} Food Plan",
                        dataset="Monthly cost of food at home for one person, by age and sex", url=USDA_URL, released=f"{month_name} {newest[0]}", license=PUBLIC,
                        notes="Costs are for one person in a 4-person household cooking all meals at home. We add up the people in the household and apply USDA's household-size adjustment (+20% for one person, +10% for two, +5% for three, -5% for five or six); that sum is our calculation, not a USDA figure.")
    return {"kind": "usda_food", "plan": plan, "source": src.key, "facts": _replace_facts(db, src, facts)}


# --- BEA Regional Price Parities -------------------------------------------------------------

def _bea_rows(data: bytes) -> Iterator[dict[str, str]]:
    text = data.decode("utf-8-sig", errors="replace")
    for row in csv.DictReader(io.StringIO(text), skipinitialspace=True):
        if row.get("GeoFIPS"):
            yield {k.strip(): (v or "").strip().strip('"').strip() for k, v in row.items() if k}


def _rpp_places(table: str, fips: str, name: str) -> list[str]:
    if table == "SARPP":
        state = next((code for code, full in places.STATES.items() if full == name.rstrip(" *")), None)
        return [f"state:{state}"] if state else []
    if table == "MARPP":
        return [f"area:00{fips}"] if fips not in ("00000", "00999") else []
    if table == "PARPP" and fips == "41999":
        # Oregon's nonmetropolitan portion stands for each of BLS's three nonmetro Oregon wage areas.
        return sorted({f"area:{code}" for _, code, _ in places.OR_COUNTIES.values() if code.startswith("41")})
    return []


def import_bea_rpp(db: Session, data: bytes, filename: str) -> dict:
    rows = list(_bea_rows(data))
    if not rows:
        raise ImportProblem("The file has no rows.")
    table = rows[0].get("TableName", "")
    years = sorted(int(k) for k in rows[0] if re.fullmatch(r"20\d{2}", k))
    if table not in ("SARPP", "MARPP", "PARPP") or not years:
        raise ImportProblem("Expected BEA's SARPP, MARPP or PARPP price parities file.")
    year = years[-1]
    facts: list[EstimateFact] = []
    for r in rows:
        metric = RPP_LINES.get(r.get("LineCode", ""))
        try:
            value = float(r.get(str(year), ""))
        except ValueError:
            continue
        if not metric:
            continue
        for place in _rpp_places(table, r["GeoFIPS"], r.get("GeoName", "")):
            facts.append(EstimateFact(metric=metric, place=place, dims={}, value=value, period="index", stat="price level (US = 100)", dollar_year=year,
                                      label=f"Prices for {RPP_TITLES[metric]}, {r.get('GeoName', '').rstrip(' *')} (US = 100)", status="draft"))
    if not facts:
        raise ImportProblem("No price levels we can use in this file.")
    what = {"SARPP": "states", "MARPP": "metro areas", "PARPP": "metro and nonmetro portions of states"}[table]
    src = upsert_source(db, key=f"bea-rpp-{table.lower()}-{year}", publisher="U.S. Bureau of Economic Analysis", title=f"Regional Price Parities, {year}",
                        dataset=f"Price levels by {what}: all items, goods, rents, utilities, other services", url=BEA_URL, released=str(year), license=PUBLIC,
                        notes="Price levels relative to the US (100). BEA prices goods and other services at the state level, so within a state mostly rents and utilities differ.")
    return {"kind": "bea_rpp", "year": year, "source": src.key, "facts": _replace_facts(db, src, facts)}


def import_spending(db: Session, data: bytes, filename: str, kind: str) -> dict:
    return {"ce_size": import_ce_size, "usda_food": import_usda_food, "bea_rpp": import_bea_rpp}[kind](db, data, filename)
