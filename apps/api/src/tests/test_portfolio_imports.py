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


def _pdf(lines: list[str]) -> bytes:
    """A one-page PDF with these lines of text, enough for the résumé reader."""
    escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    stream = ("BT /F1 10 Tf 12 TL 40 760 Td " + " ".join(f"({line}) Tj T*" for line in escaped) + " ET").encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    return out + f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()


RESUME = [
    "Maya Rivera", "Salem, OR | maya@example.com", "Experience", "Barista", "Main Street Cafe", "Jun 2025 - Present",
    "- Made coffee for the morning rush", "- Trained two new hires", "Volunteer Tutor, Salem Library   Sept 2024 - May 2025",
    "- Helped kids with reading", "Education", "Salem High School", "High School Diploma", "Sep 2022 - Jun 2026",
    "Skills", "Photoshop, Spanish, Customer service", "Certifications", "Food Handler Card", "References",
    "Ms. Lopez", "Art Teacher, Salem High School", "lopez@example.com",
]
LINKEDIN = ["Contact", "maya@example.com", "Top Skills", "Photoshop", "Experience", "Main Street Cafe", "Barista",
            "June 2025 - Present (1 year 5 months)", "Salem, Oregon", "Made coffee", "Page 1 of 1"]


def test_a_resume_pdf_is_read_by_its_headings_and_dates():
    export = read_export("resume", _pdf(RESUME), "Maya resume.pdf")
    by_title = {item["title"]: item for item in export["items"]}

    barista = by_title["Barista"]["record"]
    assert (barista["organization"], barista["start_date"], barista["is_current"], barista["entry_type"]) == ("Main Street Cafe", "2025-06", True, "work_career")
    assert barista["summary"] == "Made coffee for the morning rush\nTrained two new hires"
    tutor = by_title["Volunteer Tutor"]["record"]
    assert (tutor["organization"], tutor["start_date"], tutor["end_date"]) == ("Salem Library", "2024-09", "2025-05")
    school = by_title["High School Diploma"]["record"]
    assert (school["organization"], school["entry_type"], school["end_date"]) == ("Salem High School", "education", "2026-06")
    assert {"Photoshop", "Spanish", "Customer service"} <= set(by_title)
    assert by_title["Food Handler Card"]["record"]["kind"] == "card"
    reference = by_title["Ms. Lopez"]["record"]
    assert (reference["role_label"], reference["email"], reference["is_reference"]) == ("Art Teacher, Salem High School", "lopez@example.com", True)
    assert by_title["Résumé (Maya resume)"]["record"]["kind"] == "resume"


def test_a_linkedin_profile_pdf_puts_the_company_first():
    export = read_export("linkedin", _pdf(LINKEDIN), "Profile.pdf")
    job = next(item for item in export["items"] if item["kind"] == "timeline")["record"]

    assert (job["title"], job["organization"], job["location_label"], job["summary"], job["start_date"]) == ("Barista", "Main Street Cafe", "Salem, Oregon", "Made coffee", "2025-06")
    assert any(item["title"] == "Photoshop" for item in export["items"])
    assert any(item["title"] == "LinkedIn profile" for item in export["items"])


async def test_a_resume_import_keeps_the_pdf_as_a_private_document(monkeypatch):
    monkeypatch.setattr(media_service, "upload_file", _fake_upload_file)
    content = _pdf(RESUME)
    with _session() as db:
        actor = _learner(db)
        preview = await imports.preview_import("resume", _upload(content, "resume.pdf"), actor, db)

        result = await imports.run_import("resume", _upload(content, "resume.pdf"), [item["key"] for item in preview["items"]], actor, db)

        assert result["added"]["documents"] == 1 and result["added"]["experience"] == 3
        document = db.exec(select(PortfolioDocument)).one()
        assert (document.kind, document.source, document.visibility) == ("resume", "resume", "private")
        with pytest.raises(HTTPException):
            await imports.preview_import("resume", _upload(b"%PDF-1.4 broken", "x.pdf"), actor, db)
