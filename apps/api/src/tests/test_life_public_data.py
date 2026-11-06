"""The public catalog: O*NET careers and College Scorecard schools.

The files below are made-up miniatures with the publishers' layouts (tab-separated O*NET
text files in a zip, the Scorecard's CSV columns); they test parsing, not real figures.
"""

import io
import zipfile

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource, ProgramEntry, SchoolEntry
from src.db.users import User
from src.services.life_plans import estimates, importers, public_data

OCCUPATIONS = "O*NET-SOC Code\tTitle\tDescription\n15-1252.00\tSoftware Developers\tResearch, design, and develop computer software.\n29-2056.00\tVeterinary Technologists and Technicians\tPerform medical tests in a veterinary setting.\n27-1024.00\tGraphic Designers\tDesign or create graphics.\n"
INTERESTS = "O*NET-SOC Code\tElement ID\tElement Name\tScale ID\tData Value\tDate\tDomain Source\n" + "".join(
    f"{code}\t1.B.1.{i}\t{name}\tOI\t{v}\t08/2023\tAnalyst\n"
    for code, values in (("15-1252.00", (3.0, 6.5, 2.0, 1.5, 2.5, 4.5)), ("29-2056.00", (5.0, 5.5, 1.0, 4.0, 1.5, 3.0)), ("27-1024.00", (2.0, 2.5, 7.0, 2.0, 3.0, 1.5)))
    for i, (name, v) in enumerate(zip(("Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"), values))
) + "15-1252.00\t1.B.1.g\tFirst Interest High-Point\tIH\t2.00\t08/2023\tAnalyst\n"
ZONES = "O*NET-SOC Code\tJob Zone\tDate\tDomain Source\n15-1252.00\t4\t08/2023\tAnalyst\n29-2056.00\t3\t08/2023\tAnalyst\n"
ALTS = "O*NET-SOC Code\tTitle\tAlternate Title\tShort Title\tSource(s)\n15-1252.00\tSoftware Developers\tApplication Programmer\t\t04\n15-1252.00\tSoftware Developers\tCoder\t\t04\n29-2056.00\tVeterinary Technologists and Technicians\tVet Tech\t\t04\n"

SCORECARD = b"""UNITID,INSTNM,CITY,STABBR,INSTURL,CONTROL,PREDDEG,CURROPER,UGDS,ADM_RATE,C150_4,C150_L4,MD_EARN_WNE_P10,TUITIONFEE_IN,TUITIONFEE_OUT
209551,University of Oregon,Eugene,OR,www.uoregon.edu/,1,3,1,19000,0.86,0.73,NULL,56000,15000,42000
208646,Lane Community College,Eugene,OR,https://www.lanecc.edu/ OR main campus,1,2,1,8000,NULL,NULL,0.31,PrivacySuppressed,6000,13000
999999,Closed College,Nowhere,OR,www.closed.edu/ OR school of nursing,3,1,0,10,NULL,NULL,NULL,NULL,1,1
"""


# Release 31.0 renamed Interests.txt and Alternate Titles.txt, and added reported titles.
JOB_TITLES = "O*NET-SOC Code\tJob Title\tShort Title\tSource(s)\n15-1252.00\tApplication Programmer\tn/a\t04\n15-1252.00\tCoder\tn/a\t04\n29-2056.00\tVet Tech\tn/a\t04\n"
TASKS = ("O*NET-SOC Code\tTitle\tTask ID\tTask\tTask Type\tIncumbents Responding\tDate\tDomain Source\n"
         "15-1252.00\tSoftware Developers\t1\tWrite code.\tCore\t\t08/2023\tAnalyst\n"
         "15-1252.00\tSoftware Developers\t2\tFix bugs.\tCore\t\t08/2023\tAnalyst\n"
         "15-1252.00\tSoftware Developers\t3\tGo to meetings.\tSupplemental\t\t08/2023\tAnalyst\n")
RATINGS = ("O*NET-SOC Code\tTitle\tTask ID\tTask\tScale ID\tCategory\tData Value\n"
           "15-1252.00\tSoftware Developers\t1\tWrite code.\tIM\tn/a\t4.1\n"
           "15-1252.00\tSoftware Developers\t2\tFix bugs.\tIM\tn/a\t4.6\n"
           "15-1252.00\tSoftware Developers\t3\tGo to meetings.\tIM\tn/a\t4.9\n")
EDUCATION = ("O*NET-SOC Code\tElement ID\tElement Name\tScale ID\tCategory\tData Value\tN\n"
             "15-1252.00\t2.D.1\tRequired Level of Education\tRL\t1\t0.00\t28\n"
             "15-1252.00\t2.D.1\tRequired Level of Education\tRL\t6\t71.40\t28\n"
             "15-1252.00\t2.D.1\tRequired Level of Education\tRL\t5\t8.30\t28\n"
             "15-1252.00\t2.D.1\tRequired Level of Education\tRL\t8\t20.30\t28\n"
             "15-1252.00\t2.D.3\tRelated Work Experience\tRW\t2\t40.00\t28\n")
RELATED = ("O*NET-SOC Code\tRelated O*NET-SOC Code\tRelatedness Tier\tIndex\n"
           "15-1252.00\t27-1024.00\tPrimary-Long\t2\n15-1252.00\t29-2056.00\tPrimary-Short\t1\n")
REPORTED = "O*NET-SOC Code\tReported Job Title\tShown in My Next Move\n15-1252.00\tSoftware Engineer\tN\n15-1252.00\tDeveloper\tY\n15-1252.00\tCoder\tN\n"


def _onet_zip(name: str = "db_30_0_text.zip", layout: str = "old") -> tuple[bytes, str]:
    if layout == "old":
        files = (("Occupation Data.txt", OCCUPATIONS), ("Interests.txt", INTERESTS), ("Job Zones.txt", ZONES), ("Alternate Titles.txt", ALTS))
    else:
        files = (("Occupation Data.txt", OCCUPATIONS), ("Career Interest Types.txt", INTERESTS), ("Job Zones.txt", ZONES), ("Job Titles.txt", JOB_TITLES), ("Sample of Reported Titles.txt", REPORTED),
                 ("Task Statements.txt", TASKS), ("Task Ratings.txt", RATINGS), ("Education, Training, and Experience.txt", EDUCATION), ("Related Occupations.txt", RELATED))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        for fname, text in (*files, ("Read Me.txt", "readme")):
            zf.writestr(f"db_31_0_text/{fname}", text)
    return out.getvalue(), name


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, EstimateSource.__table__, EstimateFact.__table__, CareerEntry.__table__, SchoolEntry.__table__, ProgramEntry.__table__])
    db = Session(engine)
    db.add(User(id=1, user_uuid="user_1", username="u1", email="u1@example.com", first_name="U", last_name="1"))
    db.commit()
    return db


def _review_all(db: Session) -> None:
    for src in db.exec(select(EstimateSource)).all():
        importers.review_source(db, src.key, 1)


def test_onet_zip_loads_careers_as_drafts_with_interests_zones_and_other_titles():
    db = _session()
    data, name = _onet_zip()
    result = importers.import_file(db, data, name)
    assert result["kind"] == "onet" and result["careers"] == 3 and result["with_interests"] == 3
    src = db.exec(select(EstimateSource)).one()
    assert src.key == "onet-30-0" and "CC BY 4.0" in src.license and "USDOL/ETA" in src.license
    dev = db.exec(select(CareerEntry).where(CareerEntry.code == "15-1252.00")).one()
    assert dev.soc == "15-1252" and dev.job_zone == 4 and dev.status == "draft"
    assert dev.interests == {"R": 3.0, "I": 6.5, "A": 2.0, "S": 1.5, "E": 2.5, "C": 4.5}
    assert dev.alt_titles == ["Application Programmer", "Coder"]
    # Nothing shows before the source is reviewed.
    assert public_data.search_careers(db, "soft") == []
    _review_all(db)
    assert [c["code"] for c in public_data.search_careers(db, "soft")] == ["15-1252.00"]


def test_onet_31_layout_loads_career_interest_types_and_job_titles():
    db = _session()
    result = importers.import_file(db, *_onet_zip("db_31_0_text.zip", layout="new"))
    assert result["careers"] == 3 and result["with_interests"] == 3
    dev = db.exec(select(CareerEntry).where(CareerEntry.code == "15-1252.00")).one()
    assert dev.interests["I"] == 6.5
    # Reported titles shown in My Next Move come first, then the rest, then job titles.
    assert dev.alt_titles == ["Developer", "Software Engineer", "Coder", "Application Programmer"]
    # Core tasks first, the most important first; supplemental ones after.
    assert dev.tasks == ["Fix bugs.", "Write code.", "Go to meetings."]
    # What workers say it takes (levels nobody picked left out), and O*NET's related careers in its order.
    assert dev.education == [{"level": 5, "pct": 8.3}, {"level": 6, "pct": 71.4}, {"level": 8, "pct": 20.3}]
    assert dev.related == ["29-2056.00", "27-1024.00"]


def test_onet_zip_without_interests_is_refused():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("db_31_0_text/Occupation Data.txt", OCCUPATIONS)
    with pytest.raises(Exception, match="Career Interest Types"):
        importers.import_file(_session(), out.getvalue(), "db_31_0_text.zip")


def test_career_search_finds_other_titles_and_detail_names_the_license():
    db = _session()
    importers.import_file(db, *_onet_zip())
    _review_all(db)
    assert [c["title"] for c in public_data.search_careers(db, "vet tech")] == ["Veterinary Technologists and Technicians"]
    career = public_data.get_career(db, "15-1252.00")
    assert career["top_interests"] == "ICR" and career["source"]["title"] == "O*NET 30.0 Database"
    assert public_data.get_career(db, "00-0000.00") is None


def test_interest_match_ranks_careers_by_the_shape_of_the_profile_on_any_scale():
    db = _session()
    importers.import_file(db, *_onet_zip())
    _review_all(db)
    # An artistic learner, scored 0 to 40 like the CIS import.
    ranked = public_data.match_careers(db, {"R": 8, "I": 10, "A": 38, "S": 9, "E": 14, "C": 4})
    assert ranked[0]["code"] == "27-1024.00" and ranked[0]["match"] > 0.9
    assert [c["code"] for c in public_data.match_careers(db, {"R": 8, "I": 10, "A": 38, "S": 9, "E": 14, "C": 4}, job_zones=[3])] == ["29-2056.00"]
    with pytest.raises(public_data.CatalogProblem):
        public_data.match_careers(db, {"R": 1, "I": 2})


def test_a_newer_onet_release_sits_beside_the_older_one_until_it_is_approved():
    db = _session()
    importers.import_file(db, *_onet_zip("db_30_0_text.zip"))
    importers.review_source(db, "onet-30-0", 1)
    importers.import_file(db, *_onet_zip("db_31_0_text.zip", layout="new"))
    rows = db.exec(select(CareerEntry)).all()
    assert len(rows) == 6 and {db.get(EstimateSource, r.source_id).key for r in rows} == {"onet-30-0", "onet-31-0"}
    # Importing hides nothing: learners keep the reviewed 30.0 careers while 31.0 waits as drafts.
    dev = public_data.get_career(db, "15-1252.00")
    assert dev["source"]["title"] == "O*NET 30.0 Database" and dev["tasks"] == []
    assert len(public_data.search_careers(db, "")) == 3
    importers.review_source(db, "onet-31-0", 1)
    dev = public_data.get_career(db, "15-1252.00")
    assert dev["source"]["title"] == "O*NET 31.0 Database" and dev["tasks"] == ["Fix bugs.", "Write code.", "Go to meetings."]
    assert len(public_data.search_careers(db, "")) == 3, "each career once, from the newest reviewed release"
    # Loading the same release again replaces only that release's rows, as drafts.
    importers.import_file(db, *_onet_zip("db_31_0_text.zip", layout="new"))
    assert len(db.exec(select(CareerEntry)).all()) == 6
    assert public_data.get_career(db, "15-1252.00")["source"]["title"] == "O*NET 30.0 Database"


def test_a_newer_scorecard_release_keeps_the_reviewed_schools_until_approved():
    db = _session()
    importers.import_file(db, SCORECARD, "Most-Recent-Cohorts-Institution_10032025.csv")
    _review_all(db)
    before = public_data.search_schools(db, "", limit=50)
    assert before
    importers.import_file(db, SCORECARD, "Most-Recent-Cohorts-Institution_11022026.csv")
    assert len(db.exec(select(SchoolEntry)).all()) == 2 * len(before)
    assert public_data.search_schools(db, "", limit=50) == before
    _review_all(db)
    assert len(public_data.search_schools(db, "", limit=50)) == len(before)


def test_onet_zip_without_a_version_in_its_name_is_refused():
    db = _session()
    data, _ = _onet_zip()
    with pytest.raises(importers.ImportProblem, match="version"):
        importers.import_file(db, data, "onet.zip")


def test_scorecard_loads_operating_schools_and_tuition_facts():
    db = _session()
    result = importers.import_file(db, SCORECARD, "Most-Recent-Cohorts-Institution_10032025.csv")
    assert result == {"kind": "scorecard", "source": "college-scorecard-institutions-2025-10-03", "schools": 2, "facts": 4}
    uo = db.exec(select(SchoolEntry).where(SchoolEntry.unitid == "209551")).one()
    assert uo.url == "https://www.uoregon.edu/" and uo.control == "Public" and uo.degree == "Bachelor's degrees"
    assert db.exec(select(SchoolEntry).where(SchoolEntry.unitid == "208646")).one().url == "https://www.lanecc.edu/"
    assert uo.completion_rate == 0.73 and uo.median_earnings == 56000 and uo.students == 19000
    lane = db.exec(select(SchoolEntry).where(SchoolEntry.unitid == "208646")).one()
    assert lane.completion_rate == 0.31 and lane.median_earnings is None and lane.admission_rate is None
    assert public_data.search_schools(db, "eugene") == []
    _review_all(db)
    assert [s["unitid"] for s in public_data.search_schools(db, "", state="or")] == ["209551", "208646"]
    assert public_data.get_school(db, "209551")["tuition"] == {"in": 15000.0, "out": 42000.0}
    hit = estimates.resolve_many(db, [estimates.EstimateQuery(id="t", metric="tuition", dims={"school": "208646", "residency": "out"})])["t"]
    assert hit["value"] == 13000 and hit["period"] == "yr"


def test_scorecard_zip_uses_the_most_recent_institution_file():
    db = _session()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("Most-Recent-Cohorts-Field-of-Study.csv", "UNITID,CIPCODE\n1,0101\n" * 50)
        zf.writestr("Most-Recent-Cohorts-Institution.csv", SCORECARD)
    result = importers.import_file(db, out.getvalue(), "College_Scorecard_Raw_Data_10032025.zip")
    assert result["schools"] == 2


def test_reviewing_counts_entries_and_coverage_lists_them():
    db = _session()
    importers.import_file(db, *_onet_zip())
    assert importers.review_source(db, "onet-30-0", 1) == 3
    row = next(s for s in estimates.coverage(db) if s["key"] == "onet-30-0")
    assert row["entries"] == 3 and row["by_status"] == {"reviewed": 3}
    importers.review_source(db, "onet-30-0", 1, "retired")
    assert public_data.search_careers(db, "") == []
