"""Oregon Employment Department workbooks: projections and wages for Oregon and its areas, as facts."""

import io

from openpyxl import Workbook
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, LifePlan, ProgramEntry, SchoolEntry
from src.db.users import User
from src.services.life_plans import estimates, importers, places


def _book(first_title: str, title: str, header: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    state = wb.active
    state.title = "Oregon"
    state.append([first_title])
    areas = wb.create_sheet("All Areas")
    areas.append([title])
    areas.append(["Oregon Employment Department, Workforce and Economic Research Division"])
    areas.append([])
    areas.append(header)
    for row in rows:
        areas.append(row)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


PROJ_HEADER = ["Row", "Area Name", "SOC Level", "Occupation Code", "Occupation Title", "Employment  2024", "Projected Employment  2034", "Percent Change",
               "Employment Change", "Replacement Openings", "Total Openings", "Typical Entry-Level Education", "Competitive Education"]
PROJECTIONS = _book("Oregon Occupational Employment Projections, 2024-2034", "Occupational Employment Projections for All Areas, 2024-2034", PROJ_HEADER, [
    [1, "Oregon", 1, "00-0000", "Total, All Occupations", 2196147, 2336540, 0.064, 140393, 2435027, 2575420, None, None],
    [2, "Oregon", 4, "29-1141", "Registered Nurses", 46378, 50592, 0.091, 4214, 24068, 28282, "Bachelor's degree", "Bachelor's degree"],
    [3, "Southwestern", 4, "29-1141", "Registered Nurses", 2500, 2740, 0.096, 240, 750, 990, "Bachelor's degree", "Bachelor's degree"],
    [4, "Southwestern", 4, "47-2111", "Electricians", "-s-", "-s-", "-s-", "-s-", "-s-", 330, "High school diploma or equivalent", "Postsecondary training (non-degree)"],
    [5, "Somewhere Else", 4, "29-1141", "Registered Nurses", 1, 2, 0.5, 1, 1, 2, "", ""],
])
WAGE_HEADER = ["Row", "Area Name", "SOC Level", "Occupation Code", "Occupation Title", "2025 Employment¹", "Employment RSE⁶", "10th Percentile",
               "25th Percentile", "50th Percentile (Median)", "75th Percentile", "90th Percentile", "Mean (Average)", "2026 Annual Mean (Average)²", "Mean Wage RSE⁶"]
WAGES = _book("2026 Oregon Wage Information, Statewide", "2026 Oregon Wage Information, All Areas", WAGE_HEADER, [
    [1, "Oregon", 4, "29-1141", "Registered Nurses", 39730, 0.01, 47.09, 52.99, 63.76, 66.44, 76.61, 62.5, 130000, 0.01],
    [2, "Douglas", 4, "29-1141", "Registered Nurses", 900, 0.05, 45.62, 50.65, 52.68, 66.04, 67.91, 55.0, 114400, 0.03],
    [3, "Southwestern Oregon", 4, "29-1141", "Registered Nurses", 2400, 0.04, 45.62, 50.68, 52.68, 64.91, 66.04, 54.0, 112320, 0.03],
    [4, "Douglas", 4, "25-2021", "Elementary School Teachers, Except Special Education", 700, 0.06, 50000, 58000, 66456, 74000, 80000, 66000, 66000, 0.04],
])


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, LifePlan.__table__, EstimateSource.__table__, EstimateFact.__table__, CareerEntry.__table__, SchoolEntry.__table__, ProgramEntry.__table__])
    db = Session(engine)
    db.add(User(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1"))
    db.commit()
    return db


def test_a_county_climbs_through_its_oed_areas_smallest_first():
    assert places.ladder("city:OR:roseburg") == ["city:OR:roseburg", "county:OR:douglas", "region:OR:douglas", "region:OR:southwestern", "area:4100006", "state:OR", "us"]
    assert places.ladder("county:OR:linn")[1:4] == ["region:OR:linn-benton", "region:OR:mid-valley", "area:0010540"]
    assert places.label("region:OR:southwestern") == "Southwestern Oregon"
    assert places.region_key("Mid Valley") == places.region_key("Mid-Valley") == "region:OR:mid-valley"
    assert places.region_key("Southwestern Oregon") == "region:OR:southwestern" and places.region_key("Nowhere") is None


def test_projections_load_openings_growth_and_jobs_for_the_state_and_its_areas():
    db = _session()
    result = importers.import_file(db, PROJECTIONS, "Oregon Occupational Employment Projections 2024-2034.xlsx")
    assert result["kind"] == "oed_projections" and result["source"] == "oed-projections-2024-2034"
    assert result["unmatched"] == ["Somewhere Else"]
    facts = db.exec(select(EstimateFact)).all()
    by = {(f.metric, f.place, f.dims["soc"]): f for f in facts}
    nurses = by[("openings", "region:OR:southwestern", "29-1141")]
    assert nurses.value == 99.0 and nurses.period == "yr" and "typical entry: Bachelor's degree" in nurses.note
    assert by[("growth", "state:OR", "29-1141")].value == 0.091 and by[("employment_projected", "state:OR", "29-1141")].value == 50592
    # Suppressed values are left out; the total row and other SOC levels are skipped.
    assert ("growth", "region:OR:southwestern", "47-2111") not in by and by[("openings", "region:OR:southwestern", "47-2111")].value == 33.0
    assert not any(f.dims["soc"] == "00-0000" for f in facts)
    importers.review_source(db, "oed-projections-2024-2034", 1)
    found = estimates.resolve_many(db, [estimates.EstimateQuery(id="o", metric="openings", place="city:OR:roseburg", dims={"soc": "29-1141"})])["o"]
    assert found["place"] == "region:OR:southwestern" and found["value"] == 99.0


def test_wages_load_percentiles_hourly_or_yearly_and_resolve_to_the_learners_county():
    db = _session()
    result = importers.import_file(db, WAGES, "Oregon Occupational Wage Information.xlsx")
    assert result["kind"] == "oed_wages" and result["year"] == 2026 and result["facts"] == 4 and result["unmatched"] == []
    importers.review_source(db, "oed-wages-2026", 1)
    found = estimates.resolve_many(db, [estimates.EstimateQuery(id="w", metric="wage", place="city:OR:roseburg", dims={"soc": "29-1141"})])["w"]
    assert found["place"] == "region:OR:douglas" and found["value"] == 52.68 and found["percentiles"]["p90"] == 67.91 and found["period"] == "hr"
    teachers = db.exec(select(EstimateFact).where(EstimateFact.dims_key == estimates.dims_key({"soc": "25-2021"}))).one()
    assert teachers.period == "yr" and teachers.value == 66456


def test_other_workbooks_are_not_mistaken_for_oed_files():
    from src.services.life_plans import oregon

    plain = Workbook()
    plain.active.append(["Something else"])
    out = io.BytesIO()
    plain.save(out)
    assert oregon.kind_of(out.getvalue(), "x.xlsx") is None and oregon.kind_of(b"a,b\n", "x.csv") is None


def test_career_pay_takes_the_newest_wages_and_credits_who_published_them():
    from src.services.life_plans import careers
    db = _session()
    bls = EstimateSource(key="bls-oews-2025", publisher="U.S. Bureau of Labor Statistics", title="OEWS May 2025")
    db.add(bls)
    db.commit()
    db.add(EstimateFact(metric="wage", place="state:OR", dims={"soc": "29-1141"}, dims_key=estimates.dims_key({"soc": "29-1141"}), value=60.0, period="hr",
                        dollar_year=2025, status=estimates.REVIEWED, source_id=bls.id))
    db.commit()
    assert careers.pay(db, "29-1141")["source"] == "BLS Occupational Employment and Wage Statistics, May 2025"
    importers.import_file(db, WAGES, "Oregon Occupational Wage Information.xlsx")
    importers.review_source(db, "oed-wages-2026", 1)
    money = careers.pay(db, "29-1141")
    assert money["overall"]["year"] == 2026 and money["overall"]["median"] == round(63.76 * careers.HOURS_A_YEAR, -2)
    assert money["source"].startswith("Oregon Employment Department")
    assert careers.median_pay(db, ["29-1141"])["29-1141"] == money["overall"]["median"]
