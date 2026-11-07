"""Everyday spending: BLS spending by household size, USDA food plans and BEA price levels.

The files are made-up miniatures with the publishers' layouts; they test parsing and the
resolver's arithmetic, not real figures.
"""

import io

from openpyxl import Workbook

from src.services.life_plans import estimates, importers
from src.tests.test_life_public_data import _review_all, _session


def _xlsx(sheets: list[list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for i, rows in enumerate(sheets):
        ws = wb.create_sheet(f"S{i}")
        for r in rows:
            ws.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _ce() -> bytes:
    rows = [["Table 1400. Size of consumer unit: Annual expenditure means, shares, standard errors, and relative standard errors, Consumer Expenditure Surveys, 2025"],
            [None], ["Item", "All", "One person", "Two or more", "Two", "Three", "Four", "Five or more"]]
    for name, base in (("Food away from home", 1200), ("Fees and admissions", 600), ("Apparel and services", 1200), ("Cellular phone service", 600),
                       ("Gasoline and other fuels", 1200), ("Other vehicle expenses", 2400), ("Public and other transportation", 600), ("Personal care products and services", 600)):
        rows += [[name], ["Mean", base * 2, base, base * 3, base * 2, base * 3, base * 4, base * 5], ["SE", 1, 1, 1, 1, 1, 1, 1]]
    return _xlsx([rows])


def _usda(plan: str) -> bytes:
    readme = [[f"{plan} Food Plan Costs, September 2007 to Present"]]
    data = [["geographic_area", "fam_indv", "group", "age", "year", "month", "food_plan", "frequency", "cost"]]
    for month, bump in (("August", 0), ("September", 10)):
        for group, age, cost in (("Child", "4-5 years", 200), ("Female", "12-13 years", 300), ("Male", "12-13 years", 340), ("Female", "19-50 years", 300), ("Male", "19-50 years", 400)):
            data.append(["Mainland U.S.", "Individual", group, age, 2026, month, plan, "Monthly", cost + bump])
    data.append(["Mainland U.S.", "Family", "Couple", "19-50 years", 2026, "September", plan, "Monthly", 999])
    return _xlsx([readme, data])


RPP_HEAD = "GeoFIPS,GeoName,Region,TableName,LineCode,IndustryClassification,Description,Unit,2023,2024\n"
MARPP = RPP_HEAD + "".join(f' "13460","Bend, OR (Metropolitan Statistical Area)", ,MARPP,{line},"...","x","Index",90,{v}\n' for line, v in (("1", 104), ("2", 110), ("5", 95))) + '"Note: footnote"\n'
PARPP = RPP_HEAD + ' "41999","Oregon (Nonmetropolitan Portion)",8,PARPP,2,"...","Goods","Index",90,105\n'
SARPP = RPP_HEAD + ' "41000","Oregon",8,SARPP,2,"...","Goods","Index",90,108\n'


def _loaded():
    db = _session()
    for name, data in (("cu-size-2025.xlsx", _ce()), ("usda-moderatecostplan.xlsx", _usda("Moderate-Cost")), ("usda-thriftyplan.xlsx", _usda("Thrifty")),
                       ("MARPP_MSA_2008_2024.csv", MARPP.encode()), ("PARPP_PORT_2008_2024.csv", PARPP.encode()), ("SARPP_STATE_2008_2024.csv", SARPP.encode())):
        importers.import_file(db, data, name)
    db.commit()
    _review_all(db)
    return db


def _get(db, metric, place, **dims):
    return estimates.resolve_many(db, [estimates.EstimateQuery(id="x", metric=metric, place=place, dims=dims)])["x"]


def test_spending_by_household_size_at_local_prices():
    db = _loaded()
    one = _get(db, "going_out", "city:OR:bend", size=1)
    # (1200 + 600) a year for one person, at Bend's 95 for other services.
    assert one["value"] == 1710.0 and one["period"] == "yr" and one["level"] == "area"
    assert one["scaled_by"]["value"] == 95 and "Bend area prices" in one["label"]
    assert _get(db, "going_out", "city:OR:bend", size=3)["value"] == 5130.0
    # No household size: the figure for all households.
    assert _get(db, "clothes", None)["value"] == 2400.0 and _get(db, "clothes", None)["level"] == "us"
    # Phone isn't scaled: the national figure.
    assert _get(db, "phone", "city:OR:bend", size=1)["level"] == "us"


def test_price_levels_reach_nonmetro_areas_and_states():
    db = _loaded()
    # Harney County is in BLS's Eastern Oregon nonmetro area: Oregon's nonmetro goods level.
    assert _get(db, "clothes", "county:OR:harney", size=1)["value"] == 1260.0
    assert _get(db, "clothes", "state:OR", size=1)["value"] == 1296.0


def test_groceries_add_up_the_household_with_usdas_size_adjustment():
    db = _loaded()
    # Newest month only: adult (310 + 410) / 2 = 360, +20% alone, at Bend's 110 for goods.
    alone = _get(db, "groceries", "city:OR:bend", plan="moderate", adults=1)
    assert alone["value"] == round(360 * 1.2 * 1.1, 2) and alone["metric"] == "groceries"
    # Two adults, a 4-year-old and a 13-year-old: 360 + 360 + 210 + (310 + 350) / 2, no adjustment at four.
    fam = _get(db, "groceries", None, plan="thrifty", adults=2, kids=[4, 13])
    assert fam["value"] == 360 + 360 + 210 + 330
    # A plan that isn't loaded gives no estimate.
    assert _get(db, "groceries", None, plan="liberal", adults=1) is None
    assert "groceries" in estimates.available_metrics(db, "city:OR:bend")


def test_unknown_spending_files_are_refused():
    db = _session()
    try:
        importers.import_file(db, _xlsx([[["Table 9999. Something else"]]]), "other.xlsx")
    except importers.ImportProblem:
        pass
    else:
        raise AssertionError("expected a refusal")
