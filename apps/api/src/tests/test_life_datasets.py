"""Datasets: browsing and exporting the published files behind life plans, by release and table."""

import csv
import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, LifePlan, ProgramEntry, SchoolEntry
from src.db.users import User
from src.services.life_plans import datasets, importers
from src.tests.test_life_plans import FMR_CSV, OEWS_CSV, _user
from src.tests.test_life_public_data import SCORECARD, _onet_zip


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine, tables=[User.__table__, LifePlan.__table__, EstimateSource.__table__, EstimateFact.__table__, CareerEntry.__table__, SchoolEntry.__table__, ProgramEntry.__table__])
    with Session(engine) as session:
        session.add(User(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1"))
        session.commit()
        importers.import_hud_fmr(session, FMR_CSV, "fmr.csv", fiscal_year=2026, url="https://example.com/fmr")
        importers.import_hud_fmr(session, FMR_CSV, "fmr.csv", fiscal_year=2027, url="https://example.com/fmr")
        importers.import_bls_oews(session, OEWS_CSV, "oews.csv", year=2024, url="https://example.com/oews")
        importers.import_file(session, SCORECARD, "Most-Recent-Cohorts-Institution_10032025.csv")
        data, name = _onet_zip()
        importers.import_file(session, data, name)
        yield session


def test_catalog_lists_every_expected_dataset_with_releases_newest_first(db):
    found = {d["kind"]: d for d in datasets.catalog(db)}
    assert list(found) == ["hud_fmr", "bls_oews", "oed_projections", "oed_wages", "onet", "scorecard_programs", "scorecard", "majors_map"]
    assert found["majors_map"]["origin"] == "composite" and not found["majors_map"]["importable"]
    hud = found["hud_fmr"]
    assert [r["key"] for r in hud["releases"]] == ["hud-fmr-fy2027-or", "hud-fmr-fy2026-or"]
    assert hud["releases"][0]["tables"] == [{"name": "facts", "title": "Estimate facts", "rows": 10}]
    assert hud["used_for"] and hud["license"] and hud["importable"]
    scorecard = found["scorecard"]["releases"][0]
    assert {t["name"] for t in scorecard["tables"]} == {"facts", "schools"}
    assert [t["name"] for t in found["onet"]["releases"][0]["tables"]] == ["careers"]


def test_rows_page_search_and_filter(db):
    page = datasets.rows(db, "hud-fmr-fy2026-or", "facts", per_page=4)
    assert page["total"] == 10 and len(page["rows"]) == 4 and page["page"] == 1
    assert page["filters"]["metric"] == ["rent"] and page["filters"]["level"] == ["county"]
    lane = datasets.rows(db, "hud-fmr-fy2026-or", "facts", q="LANE")
    assert lane["total"] == 5 and all("Lane" in r["place"] for r in lane["rows"])
    assert datasets.rows(db, "hud-fmr-fy2026-or", "facts", filters={"status": "reviewed"})["total"] == 0
    key =next(r["key"] for d in datasets.catalog(db) if d["kind"] == "bls_oews" for r in d["releases"])
    wages = datasets.rows(db, key, "facts", filters={"level": "us"})
    assert wages["total"] == 1 and wages["rows"][0]["p50"] is not None
    schools = datasets.rows(db, next(r["key"] for d in datasets.catalog(db) if d["kind"] == "scorecard" for r in d["releases"]), "schools")
    assert schools["total"] > 0 and "state" in schools["filters"]


def test_export_is_every_matching_row_as_csv(db):
    text = datasets.export_csv(db, "hud-fmr-fy2026-or", "facts", q="lane")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:3] == ["Place", "Place key", "Metric"] and len(rows) == 1 + 5
    assert datasets.export_name("hud-fmr-fy2026-or", "facts") == "hud-fmr-fy2026-or-facts.csv"


def test_unknown_release_or_table_is_refused(db):
    with pytest.raises(datasets.DatasetProblem):
        datasets.rows(db, "nope", "facts")
    with pytest.raises(datasets.DatasetProblem):
        datasets.rows(db, "hud-fmr-fy2026-or", "secrets")


def test_admin_routes_answer_with_rows_and_csv(db):
    from src.core.events.database import get_db_session
    from src.routers import life_plans as life_router
    from src.security.superadmin import require_superadmin

    app = FastAPI()
    app.include_router(life_router.router, prefix="/life")
    app.dependency_overrides[require_superadmin] = _user
    app.dependency_overrides[get_db_session] = lambda: db
    with TestClient(app) as client:
        listed = client.get("/life/admin/datasets").json()["datasets"]
        assert listed[0]["kind"] == "hud_fmr"
        page = client.get("/life/admin/datasets/hud-fmr-fy2026-or/rows", params={"table": "facts", "metric": "rent", "per_page": 3}).json()
        assert page["total"] == 10 and len(page["rows"]) == 3
        export = client.get("/life/admin/datasets/hud-fmr-fy2026-or/export", params={"table": "facts"})
        assert export.status_code == 200 and export.headers["content-type"].startswith("text/csv")
        assert 'filename="hud-fmr-fy2026-or-facts.csv"' in export.headers["content-disposition"]
        assert client.get("/life/admin/datasets/nope/rows").status_code == 404


def test_majors_map_is_a_composite_dataset_with_one_primary_program_per_census_major(db):
    release = next(d for d in datasets.catalog(db) if d["kind"] == "majors_map")["releases"][0]
    assert release["tables"][0]["name"] == "map" and release["tables"][0]["rows"] >= 174
    everything = list(csv.DictReader(io.StringIO(datasets.export_csv(db, release["key"], "map"))))
    assert len(everything) == release["tables"][0]["rows"]
    assert datasets.rows(db, release["key"], "map", per_page=500)["per_page"] == 200
    primaries = [r for r in everything if r["role"] == "primary"]
    assert len({r["fod_code"] for r in everything}) == 174
    assert len(primaries) == 174, "each Census major has exactly one primary program"
    assert all(r["cip4"] and len(r["cip4"]) == 5 for r in everything)
    nursing = datasets.rows(db, release["key"], "map", q="nursing", filters={"role": "primary"})
    assert any(r["fod_code"] == "6107" and r["cip4"] == "51.38" for r in nursing["rows"])
    text = datasets.export_csv(db, release["key"], "map", q="nursing")
    assert text.splitlines()[0] == "fod_code,fod_title,cip4,cip_title,role,reviewed" and "51.38" in text
    with pytest.raises(datasets.DatasetProblem):
        datasets.rows(db, release["key"], "facts")
