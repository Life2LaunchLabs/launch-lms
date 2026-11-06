"""Programs at schools (the College Scorecard's field-of-study file) and a career's paths through them.

The files are made-up miniatures with the Scorecard's columns; they test parsing and ranking, not real figures.
"""

import io
import zipfile

from sqlmodel import Session, SQLModel, create_engine, select

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, ProgramEntry, SchoolEntry
from src.db.users import User
from src.services.life_plans import importers, programs

SCHOOLS = b"""UNITID,INSTNM,CITY,STABBR,INSTURL,CONTROL,PREDDEG,CURROPER,UGDS,ADM_RATE,C150_4,C150_L4,MD_EARN_WNE_P10,TUITIONFEE_IN,TUITIONFEE_OUT
210076,Umpqua Community College,Roseburg,OR,www.umpqua.edu,1,2,1,2000,NULL,NULL,0.3,40000,5500,12000
209922,Southwestern Oregon Community College,Coos Bay,OR,www.socc.edu,1,2,1,1500,NULL,NULL,0.3,38000,5800,12500
208646,Lane Community College,Eugene,OR,www.lanecc.edu,1,2,1,8000,NULL,NULL,0.31,40000,6000,13000
433387,Western Governors University,Salt Lake City,UT,www.wgu.edu,2,3,1,90000,NULL,NULL,NULL,50000,8000,8000
230764,University of Utah,Salt Lake City,UT,www.utah.edu,1,3,1,25000,0.8,0.6,NULL,52000,9000,30000
"""

PROGRAMS = """UNITID,INSTNM,CONTROL,MAIN,CIPCODE,CIPDESC,CREDLEV,CREDDESC,IPEDSCOUNT1,IPEDSCOUNT2,DEBT_ALL_STGP_EVAL_MDN,EARN_MDN_1YR,EARN_MDN_5YR,EARN_IN_STATE_1YR,EARN_IN_STATE_5YR,EARN_COUNT_WNE_1YR,EARN_COUNT_WNE_5YR,DISTANCE
210076,Umpqua Community College,Public,1,5138,Registered Nursing.,2,Associate's Degree,30,32,12000,81000,90000,40,34,50,40,1
209922,Southwestern Oregon Community College,Public,1,5138,Registered Nursing.,2,Associate's Degree,20,22,PrivacySuppressed,80000,NULL,16,PS,20,PS,1
208646,Lane Community College,Public,1,5138,Registered Nursing.,2,Associate's Degree,40,45,11000,82000,91000,45,44,50,50,2
208646,Lane Community College,Public,1,5139,Practical Nursing.,1,Certificate,25,25,8000,50000,55000,20,20,25,25,1
208646,Lane Community College,Public,1,1101,Computer Science.,2,Associate's Degree,10,10,9000,40000,50000,8,8,10,10,1
433387,Western Governors University,Private nonprofit,1,5138,Registered Nursing.,3,Bachelor's Degree,500,520,20000,85000,95000,40,30,400,300,3
230764,University of Utah,Public,1,5138,Registered Nursing.,3,Bachelor's Degree,200,210,19000,84000,94000,140,140,200,200,1
"""


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, EstimateSource.__table__, EstimateFact.__table__, CareerEntry.__table__,
                                                 SchoolEntry.__table__, ProgramEntry.__table__])
    db = Session(engine)
    db.add(User(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1"))
    db.commit()
    return db


def _loaded() -> Session:
    db = _session()
    importers.import_file(db, SCHOOLS, "Most-Recent-Cohorts-Institution_10032025.csv")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("Most-Recent-Cohorts-Field-of-Study.csv", PROGRAMS)
    assert importers.import_file(db, out.getvalue(), "Most-Recent-Cohorts-Field-of-Study_10152026.zip") == {
        "kind": "scorecard_programs", "source": "scorecard-programs-2026-10-15", "programs": 7}
    return db


def test_programs_load_as_drafts_with_earnings_debt_and_fully_online():
    db = _loaded()
    rows = {(p.unitid, p.cip): p for p in db.exec(select(ProgramEntry)).all()}
    umpqua = rows[("210076", "51.38")]
    assert (umpqua.title, umpqua.credential, umpqua.graduates, umpqua.debt, umpqua.earnings_5yr, umpqua.in_state) == ("Registered Nursing", 2, 32, 12000, 90000, 0.85)
    # In-state is a count of working graduates; five years after when the Scorecard shares it, else one year after.
    assert rows[("209922", "51.38")].in_state == 0.8
    assert rows[("209922", "51.38")].debt is None and rows[("209922", "51.38")].earnings_5yr is None
    # Only DISTANCE 3 is fully online; 2 is partly online.
    assert rows[("433387", "51.38")].online and not rows[("208646", "51.38")].online
    assert {p.status for p in rows.values()} == {"draft"}
    assert programs.paths(db, "29-1141.00", "city:OR:roseburg")["has_data"] is False


def test_crosswalk_links_nursing_to_its_program_family():
    assert set(programs.program_families("29-1141.00")) == {"51.38"}
    assert programs.program_families("00-0000.00") == {}


def test_paths_rank_schools_near_home_first_and_keep_out_of_state_online_only():
    db = _loaded()
    for src in db.exec(select(EstimateSource)).all():
        importers.review_source(db, src.key, 1)
    out = programs.paths(db, "29-1141.00", "city:OR:roseburg")
    assert out["has_data"] and [f["cip"] for f in out["families"]] == ["51.38"]
    assert [(p["school"], p["near"]) for p in out["programs"]] == [
        ("Umpqua Community College", "In your town"),
        ("Southwestern Oregon Community College", "In your region"),
        ("Lane Community College", "In Oregon"),
        ("Western Governors University", "Online"),
    ]
    assert out["programs"][0]["tuition"] == 5500 and out["programs"][0]["credential_label"] == "Associate degree"
    assert out["counts"] == {"2": 3, "3": 1}
    assert "College Scorecard" in out["source"] and "CC BY 4.0" in out["credit"]
    # Without a home base, schools in Oregon still come before online ones.
    assert [p["near"] for p in programs.paths(db, "29-1141.00")["programs"]][-1] == "Online"


def test_raw_scorecard_zip_with_both_files_still_loads_schools():
    db = _session()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("Most-Recent-Cohorts-Field-of-Study.csv", PROGRAMS)
        zf.writestr("Most-Recent-Cohorts-Institution.csv", SCHOOLS)
    assert importers.import_file(db, out.getvalue(), "College_Scorecard_Raw_Data_10032025.zip")["kind"] == "scorecard"


def test_paths_follow_how_far_the_learner_would_go_and_whether_online_is_ok():
    db = _loaded()
    for src in db.exec(select(EstimateSource)).all():
        importers.review_source(db, src.key, 1)
    schools = lambda **kw: [p["school"] for p in programs.paths(db, "29-1141.00", "city:OR:roseburg", **kw)["programs"]]  # noqa: E731
    assert schools(reach=1) == ["Umpqua Community College", "Western Governors University"]
    assert schools(reach=2, online=False) == ["Umpqua Community College", "Southwestern Oregon Community College"]
    # Anywhere lists schools in other states too, after Oregon's.
    assert schools(reach=4, online=False) == ["Umpqua Community College", "Southwestern Oregon Community College", "Lane Community College", "University of Utah"]
