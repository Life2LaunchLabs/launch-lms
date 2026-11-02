"""Life plans: saving the document, and estimates that only ever come from reviewed, sourced facts.

The files below are made-up miniatures with the publishers' column layouts; they test
the importers' parsing, not real figures.
"""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.life_plans import EstimateFact, EstimateSource, LifePlan
from src.db.users import PublicUser, User
from src.services.life_plans import estimates, importers, places
from src.services.life_plans import plans as plan_service

FMR_CSV = b"""stusps,countyname,fmr_0,fmr_1,fmr_2,fmr_3,fmr_4
OR,Lane County,100,110,120,130,140
OR,Multnomah County,200,210,220,230,240
WA,Clark County,300,310,320,330,340
"""

OEWS_CSV = b"""AREA,AREA_TITLE,AREA_TYPE,PRIM_STATE,OCC_CODE,OCC_TITLE,O_GROUP,H_MEAN,A_MEAN,H_PCT10,H_PCT25,H_MEDIAN,H_PCT75,H_PCT90,A_PCT10,A_PCT25,A_MEDIAN,A_PCT75,A_PCT90
99,U.S.,1,US,29-2056,Veterinary Technologists and Technicians,detailed,1,2,10,11,12,13,14,20,21,22,23,24
41,Oregon,2,OR,29-2056,Veterinary Technologists and Technicians,detailed,1,2,15,16,17,18,19,30,31,32,33,34
21660,Eugene-Springfield OR,4,OR,29-2056,Veterinary Technologists and Technicians,detailed,1,2,20,21,22,23,24,40,41,42,43,44
41,Oregon,2,OR,25-2021,Elementary School Teachers,detailed,*,9,*,*,*,*,*,50,51,52,53,54
41,Oregon,2,OR,29-0000,Healthcare Practitioners,major,1,2,1,1,1,1,1,1,1,1,1,1
12345,Elsewhere,4,ZZ,29-2056,Veterinary Technologists and Technicians,detailed,1,2,1,1,1,1,1,1,1,1,1,1
"""


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, LifePlan.__table__, EstimateSource.__table__, EstimateFact.__table__])
    db = Session(engine)
    db.add(User(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1"))
    db.commit()
    return db


def _user() -> PublicUser:
    return PublicUser(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1")


def _q(**kw) -> estimates.EstimateQuery:
    return estimates.EstimateQuery(id="x", **kw)


def _loaded(db: Session, review: bool = True) -> None:
    importers.import_hud_fmr(db, FMR_CSV, "fmr.csv", fiscal_year=2026, url="https://example.com/fmr")
    importers.import_bls_oews(db, OEWS_CSV, "oews.csv", year=2024, url="https://example.com/oews")
    if review:
        for src in db.exec(select(EstimateSource)).all():
            importers.review_source(db, src.key, 1)


def test_place_ladder_climbs_from_town_to_the_us():
    assert places.ladder("city:OR:eugene") == ["city:OR:eugene", "county:OR:lane", "area:0021660", "state:OR", "us"]
    assert places.ladder("county:OR:lincoln") == ["county:OR:lincoln", "area:4100006", "state:OR", "us"]
    assert places.ladder("state:NV") == ["state:NV", "us"]
    assert places.ladder(None) == ["us"]
    assert places.label("city:OR:eugene") == "Eugene, OR" and places.label("state:NV") == "Nevada"
    assert places.search("eug")[0]["key"] == "city:OR:eugene"


def test_no_facts_means_no_estimate():
    with _session() as db:
        assert estimates.resolve_many(db, [_q(metric="rent", place="city:OR:eugene", dims={"bedrooms": 2})]) == {"x": None}


def test_available_metrics_only_lists_reviewed_facts_on_the_ladder():
    with _session() as db:
        assert estimates.available_metrics(db, "city:OR:eugene") == []
        _loaded(db, review=False)
        assert estimates.available_metrics(db, "city:OR:eugene") == []
    with _session() as db:
        _loaded(db)
        assert "rent" in estimates.available_metrics(db, "city:OR:eugene")
        assert "rent" not in estimates.available_metrics(db, "county:OR:baker")


def test_draft_facts_are_never_used():
    with _session() as db:
        _loaded(db, review=False)
        assert estimates.resolve_many(db, [_q(metric="rent", place="city:OR:eugene", dims={"bedrooms": 2})]) == {"x": None}


def test_rent_resolves_at_the_county_with_its_source():
    with _session() as db:
        _loaded(db)
        got = estimates.resolve_many(db, [_q(metric="rent", place="city:OR:eugene", dims={"bedrooms": 2})])["x"]
        assert got["value"] == 120 and got["period"] == "mo" and got["level"] == "county"
        assert got["place_label"] == "Lane County, OR" and got["fallback"] is True
        assert got["source"]["publisher"].startswith("U.S. Department of Housing") and got["dims"] == {"bedrooms": 2}
        # A county outside the file falls back to nothing: there is no state or US rent fact.
        assert estimates.resolve_many(db, [_q(metric="rent", place="county:OR:baker", dims={"bedrooms": 2})])["x"] is None


def test_wage_uses_the_most_specific_area_and_needs_a_job():
    with _session() as db:
        _loaded(db)
        soc = {"soc": "29-2056"}
        eugene = estimates.resolve_many(db, [_q(metric="wage", place="city:OR:eugene", dims=soc)])["x"]
        assert eugene["value"] == 22 and eugene["level"] == "area" and eugene["percentiles"]["p90"] == 24 and eugene["period"] == "hr"
        bend = estimates.resolve_many(db, [_q(metric="wage", place="city:OR:bend", dims=soc)])["x"]
        assert bend["value"] == 17 and bend["level"] == "state"
        reno = estimates.resolve_many(db, [_q(metric="wage", place="state:NV", dims=soc)])["x"]
        assert reno["value"] == 12 and reno["level"] == "us"
        # Pay needs a job; there is no "any job" figure to fall back on.
        assert estimates.resolve_many(db, [_q(metric="wage", place="state:OR", dims={})])["x"] is None


def test_yearly_only_jobs_keep_their_yearly_figures():
    with _session() as db:
        _loaded(db)
        got = estimates.resolve_many(db, [_q(metric="wage", place="state:OR", dims={"soc": "25-2021"})])["x"]
        assert got["period"] == "yr" and got["value"] == 52


def test_importers_skip_other_states_groups_and_areas():
    with _session() as db:
        _loaded(db)
        places_seen = {f.place for f in db.exec(select(EstimateFact)).all()}
        assert "county:OR:lane" in places_seen and not any("WA" in p or "12345" in p for p in places_seen)
        assert not db.exec(select(EstimateFact).where(EstimateFact.label == "Healthcare Practitioners")).first()
        assert [o["soc"] for o in estimates.occupations(db, "vet")] == ["29-2056"]


def test_all_data_file_keeps_only_cross_industry_all_ownership_rows():
    head = "AREA,AREA_TITLE,AREA_TYPE,PRIM_STATE,NAICS,I_GROUP,OWN_CODE,OCC_CODE,OCC_TITLE,O_GROUP,H_PCT10,H_PCT25,H_MEDIAN,H_PCT75,H_PCT90,A_PCT10,A_PCT25,A_MEDIAN,A_PCT75,A_PCT90"
    rows = [
        "99,U.S.,1,US,000000,cross-industry,1235,29-2056,Vet Techs,detailed,10,11,12,13,14,20,21,22,23,24",
        "99,U.S.,1,US,000000,cross-industry,5,29-2056,Vet Techs,detailed,1,1,99,1,1,1,1,1,1,1",
        "99,U.S.,1,US,541900,4-digit,5,29-2056,Vet Techs,detailed,1,1,98,1,1,1,1,1,1,1",
    ]
    data = ("\n".join([head, *rows]) + "\n").encode()
    with _session() as db:
        importers.import_bls_oews(db, data, "all_data.csv", year=2024, url="")
        facts = db.exec(select(EstimateFact)).all()
        assert [(f.place, f.value) for f in facts] == [("us", 12)]


def test_workbook_with_a_malformed_document_date_still_reads():
    # HUD's FY2026 FMR workbook says "2026- 2-19T18:17:31Z" in docProps/core.xml.
    import io
    import re
    import zipfile

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["stusps", "countyname", "fmr_0", "fmr_1", "fmr_2", "fmr_3", "fmr_4"])
    ws.append(["OR", "Lane County", 100, 110, 120, 130, 140])
    good = io.BytesIO()
    wb.save(good)
    bad = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(good.getvalue())) as zin, zipfile.ZipFile(bad, "w") as zout:
        for item in zin.infolist():
            body = zin.read(item.filename)
            if item.filename == "docProps/core.xml":
                body = re.sub(rb"(<dcterms:created[^>]*>)[^<]*", rb"\g<1>2026- 2-19T18:17:31Z", body)
            zout.writestr(item, body)
    rows = list(importers.read_table(bad.getvalue(), "FY26_FMRs_revised.xlsx"))
    assert rows == [{"stusps": "OR", "countyname": "Lane County", "fmr_0": "100", "fmr_1": "110", "fmr_2": "120", "fmr_3": "130", "fmr_4": "140"}]


def test_reimporting_replaces_a_sources_facts():
    with _session() as db:
        _loaded(db)
        n = db.exec(select(EstimateFact)).all()
        importers.import_hud_fmr(db, FMR_CSV, "fmr.csv", fiscal_year=2026, url="https://example.com/fmr")
        assert len(db.exec(select(EstimateFact)).all()) == len(n)


def test_bad_files_are_refused():
    with _session() as db:
        with pytest.raises(importers.ImportProblem):
            importers.import_hud_fmr(db, b"a,b\n1,2\n", "x.csv", fiscal_year=2026, url="")
        with pytest.raises(importers.ImportProblem):
            importers.import_bls_oews(db, b"a,b\n1,2\n", "x.csv", year=2024, url="")
        with pytest.raises(importers.ImportProblem):
            importers.import_hud_fmr(db, b"x", "x.pdf", fiscal_year=2026, url="")


def _doc(**extra) -> plan_service.LifePlanDocument:
    return plan_service.LifePlanDocument.model_validate({
        "start": "2026-11",
        "phases": [{"id": "p1", "title": "High school", "place": "city:OR:eugene", "months": 20, "lines": [
            {"id": "l1", "cat": "work", "item": "job", "title": "Summer job", "side": "in", "own": {"unit": "hr", "value": 16.5, "hours": 10}},
            {"id": "l2", "cat": "home", "item": "rent", "title": "Rent", "side": "out", "settings": {"bedrooms": 1}},
        ]}],
        **extra,
    })


def test_plan_saves_and_refuses_a_stale_revision():
    with _session() as db:
        assert plan_service.get_plan(db, _user()) is None
        first = plan_service.save_plan(db, _user(), plan_service.SavePlan(document=_doc()))
        assert first["revision"] == 1 and first["document"]["phases"][0]["lines"][0]["own"]["hours"] == 10
        second = plan_service.save_plan(db, _user(), plan_service.SavePlan(document=_doc(), revision=1))
        assert second["revision"] == 2
        with pytest.raises(HTTPException) as err:
            plan_service.save_plan(db, _user(), plan_service.SavePlan(document=_doc(), revision=1))
        assert err.value.status_code == 409
        plan_service.delete_plan(db, _user())
        assert plan_service.get_plan(db, _user()) is None


def test_plan_document_rejects_bad_values():
    with pytest.raises(ValueError):
        plan_service.LifePlanDocument.model_validate({"start": "Nov 2026"})
    with pytest.raises(ValueError):
        _doc(debts=[{"id": "d", "title": "Loan", "balance": -5}])
