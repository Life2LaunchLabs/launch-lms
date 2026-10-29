import io
import zipfile
from datetime import datetime

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook
from sqlmodel import select

from src.db.portfolio import PortfolioLink, ProjectItem, TimelineEntry
from src.db.portfolio_records import Credential, PortfolioContact, PortfolioDocument, PortfolioImport, PortfolioQuote, PortfolioResult
from src.services import media as media_service, portfolio_imports as imports
from src.services.portfolio_import_sources import read_export
from src.tests.test_portfolio_records import _learner
from src.tests.test_portfolio import _session

# The Interest Profiler Short Form asks its 60 questions in pairs of R, I, A, S, E, C.
ANSWERS = {"R": "Like", "I": "Dislike", "A": "Like", "S": "Unsure", "E": "Strongly Dislike", "C": "Strongly Like"}


def _sheet(workbook, title, header, *rows):
    sheet = workbook.create_sheet(title)
    sheet.append(header)
    for row in rows:
        sheet.append(row)


def _cis_zip() -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    _sheet(workbook, "Profile", ["Last name", "First name", "Gender", "Race"], ["Rivera", "Maya", "F", "Prefer not to say"])
    _sheet(workbook, "Links", ["Name", "Web address"], ["My art", "https://example.com/art"], ["Not a link", "example"])
    _sheet(workbook, "Assessments", ["Assessment", "Set #", "Date saved", "Scores"], ["Interest Profiler Short Form", 1, datetime(2026, 10, 1), ""], ["Occupation Sort", 1, datetime(2026, 10, 2), ""])
    _sheet(workbook, "Interest Profiler Short Form", ["Set #", "Date saved", *[f"Q{n}" for n in range(60)]], [1, datetime(2026, 10, 1), *[ANSWERS["RIASEC"[(n // 2) % 6]] for n in range(60)]])
    _sheet(workbook, "Career Plan Reflections", ["Prompt", "My answer"], ["My goals...", "Join the art club"])
    # Raw Excel serial dates, as some CIS exports write them.
    _sheet(workbook, "Career Bio - Work & Volunteer", ["Type", "Employer or organization", "Title", "Start", "End", "Duties"], ["Job", "Pet Store", "Animal Care Helper", 46188, "Present", "Feed animals"], ["Volunteer", "Shelter", None, datetime(2026, 1, 10), datetime(2026, 5, 1), "Walk dogs"])
    # CIS puts the activity's organization under "Contact role" and the skill under "Category".
    _sheet(workbook, "Career Bio - Activities", ["Type", "Category", "Title", "From", "Start", "End", "Description", "Contact name", "Contact role"], ["Activity", "Club", "Member", None, datetime(2025, 9, 15), "Present", "Posters", None, "Art Club"])
    _sheet(workbook, "Career Bio - Skills & Certs", ["Category", "Name", "Description", "Expires"], ["Drawing", None, "Sketch to scale", None], ["Food Handler Card", None, None, datetime(2028, 3, 1)])
    _sheet(workbook, "Career Bio - Test Scores", ["Test", "Date", "Location", "Results"], ["PSAT", datetime(2025, 10, 15), "High School", "Total 1010"])
    _sheet(workbook, "Career Bio - References", ["Name", "Relationship", "Employer", "Title", "Work phone", "E-mail"], ["Ms. Lopez", "Teacher", "High School", "Art Teacher", "541-555-0100", "lopez@example.com"])
    book = io.BytesIO()
    workbook.save(book)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("Oregon CIS data - Maya Rivera.xlsx", book.getvalue())
        bundle.writestr("PEP Report.pdf", b"%PDF-1.4 pep")
        bundle.writestr("files/My Files/notes.txt", b"hello")
    return archive.getvalue()


def _upload(content: bytes, name: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=name)


async def _fake_upload_file(**_kwargs):
    return "stored.pdf"


def test_the_cis_reader_rescores_the_profiler_and_handles_the_export_bugs():
    export = read_export("cis", _cis_zip(), "cis.zip")
    by_title = {item["title"]: item for item in export["items"]}

    profiler = by_title["Interest Profiler Short Form (Oregon CIS)"]["record"]
    assert profiler["data"]["scores"] == {"R": 30, "I": 10, "A": 30, "S": 20, "E": 0, "C": 40}
    assert profiler["summary"] == "Conventional · Realistic · Artistic"
    assert by_title["Animal Care Helper"]["record"]["start_date"] == "2026-06" and by_title["Animal Care Helper"]["record"]["is_current"]
    assert by_title["Volunteer"]["record"]["entry_type"] == "leadership_service"
    assert by_title["Member"]["record"]["organization"] == "Art Club"
    assert by_title["Drawing"]["kind"] == "result"
    assert by_title["Food Handler Card"]["record"]["kind"] == "card"
    assert by_title["PSAT"]["record"]["visibility"] == "private"
    assert by_title["Ms. Lopez"]["record"]["is_reference"]
    assert [item["title"] for item in export["items"] if item["kind"] == "link"] == ["My art"]
    assert by_title["Oregon CIS Education Plan and Profile"]["record"]["kind"] == "archive"
    assert export["skipped"] == ["notes.txt"]
    # Plan sheets are kept as rows; the profile's demographics are not kept at all.
    assert set(export["kept"]) == {"Assessments", "Interest Profiler Short Form", "Career Plan Reflections"}


async def test_a_cis_import_adds_what_was_picked_once_and_keeps_the_plan_rows(monkeypatch):
    monkeypatch.setattr(media_service, "upload_file", _fake_upload_file)
    content = _cis_zip()
    with _session() as db:
        actor = _learner(db)
        preview = await imports.preview_import("cis", _upload(content, "cis.zip"), actor, db)
        keys = [item["key"] for item in preview["items"] if item["title"] != "Volunteer"]
        assert preview["kept"]["Career Plan Reflections"] == 1 and not any(item["already"] for item in preview["items"])

        result = await imports.run_import("cis", _upload(content, "cis.zip"), keys, actor, db)

        assert result["added"] == {"experience": 2, "results": 2, "credentials": 2, "people": 1, "links": 1, "documents": 1}
        assert {row.title for row in db.exec(select(TimelineEntry)).all()} == {"Animal Care Helper", "Member"}
        assert all(row.source == "cis" for row in db.exec(select(TimelineEntry)).all())
        assert db.exec(select(Credential).where(Credential.kind == "test_score")).one().visibility == "private"
        assert db.exec(select(PortfolioContact)).one().is_reference
        assert db.exec(select(PortfolioResult).where(PortfolioResult.kind == "interests")).one().source == "cis"
        assert db.exec(select(PortfolioDocument)).one().kind == "archive"
        assert db.exec(select(PortfolioLink)).one().url == "https://example.com/art"
        kept = db.exec(select(PortfolioImport)).one().kept
        assert kept["Career Plan Reflections"] == [{"Prompt": "My goals...", "My answer": "Join the art club"}]

        again = await imports.preview_import("cis", _upload(content, "cis.zip"), actor, db)
        assert [item["title"] for item in again["items"] if not item["already"]] == ["Volunteer"]
        assert (await imports.run_import("cis", _upload(content, "cis.zip"), [item["key"] for item in again["items"]], actor, db))["added"] == {"experience": 1}
        assert len(imports.list_imports(actor, db)) == 2


async def test_a_linkedin_export_brings_jobs_projects_skills_and_recommendations():
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("Positions.csv", "Company Name,Title,Description,Location,Started On,Finished On\nCafe,Barista,Made coffee,Salem,Jun 2025,\n")
        bundle.writestr("Projects.csv", "Title,Description,Url,Started On,Finished On\nMural,Painted the hall,,Mar 2026,Apr 2026\n")
        bundle.writestr("Skills.csv", "Name\nPhotoshop\n")
        bundle.writestr("Recommendations_Received.csv", "First Name,Last Name,Company,Job Title,Text,Creation Date,Status\nSam,Lee,Cafe,Manager,Always on time.,06/01/26,VISIBLE\n")
    with _session() as db:
        actor = _learner(db)
        preview = await imports.preview_import("linkedin", _upload(archive.getvalue(), "linkedin.zip"), actor, db)

        result = await imports.run_import("linkedin", _upload(archive.getvalue(), "linkedin.zip"), [item["key"] for item in preview["items"]], actor, db)

        assert result["added"] == {"experience": 1, "projects": 1, "results": 1, "people": 1}
        job = db.exec(select(TimelineEntry)).one()
        assert (job.title, job.start_date, job.is_current, job.source) == ("Barista", "2025-06", True, "linkedin")
        assert db.exec(select(ProjectItem)).one().end_date == "2026-04"
        assert db.exec(select(PortfolioQuote)).one().body == "Always on time."


async def test_imports_refuse_files_that_are_not_exports():
    with _session() as db:
        actor = _learner(db)
        with pytest.raises(HTTPException):
            await imports.preview_import("cis", _upload(b"not a workbook", "data.xlsx"), actor, db)
        with pytest.raises(HTTPException):
            await imports.preview_import("linkedin", _upload(b"plain text", "data.csv"), actor, db)
        with pytest.raises(HTTPException):
            await imports.preview_import("myspace", _upload(b"x", "x.zip"), actor, db)


def test_a_tie_for_third_interest_shows_both():
    from src.services.portfolio_import_sources import _interest_result

    record = _interest_result("k", "Interest Profiler", {"R": 18, "I": 10, "A": 30, "S": 20, "E": 20, "C": 40}, None)["record"]
    assert (record["summary"], record["data"]["code"]) == ("Conventional · Artistic · Social / Enterprising", "CAS/E")
