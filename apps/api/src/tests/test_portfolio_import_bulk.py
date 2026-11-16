"""CIS bulk exports split into one learner each (DEV-39). Synthetic files only, never real learner data."""

from datetime import datetime

import pytest
from fastapi import HTTPException

from src.services import portfolio_import_bulk as bulk
from src.services.portfolio_import_sources import read_export
from src.tests.test_portfolio_imports import ANSWERS, _cis_zip, _sheet


def _book(*sheets) -> bytes:
    import io

    from openpyxl import Workbook

    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, header, rows in sheets:
        _sheet(workbook, title, header, *rows)
    out = io.BytesIO()
    workbook.save(out)
    return out.getvalue()


ANSWER_ROW = [ANSWERS["RIASEC"[(n // 2) % 6]] for n in range(60)]


def _bulk(**extra) -> bytes:
    return _book(
        ("Profile", ["Student ID", "Last name", "First name", "E-mail", "Gender"], [
            ["S-1", "Rivera", "Maya", "maya@example.com", "F"],
            ["S-2", "Chen", "Leo", "leo@example.com", "M"],
            ["S-3", "Okafor", "Ada", None, "F"],
        ]),
        ("Career Bio - Work & Volunteer", ["Student ID", "Type", "Employer or organization", "Title", "Start", "End"], [
            ["S-1", "Job", "Pet Store", "Animal Care Helper", datetime(2026, 6, 1), "Present"],
            ["S-2", "Volunteer", "Food Bank", "Sorter", datetime(2025, 1, 1), datetime(2025, 6, 1)],
            ["S-2", "Job", "Cafe", "Barista", datetime(2026, 1, 1), "Present"],
            ["S-9", "Job", "Nobody's", "Ghost", datetime(2026, 1, 1), "Present"],
        ]),
        ("Assessments", ["Student ID", "Assessment", "Set #", "Date saved", "Scores"], [
            ["S-1", "Interest Profiler Short Form", 1, datetime(2026, 10, 1), ""],
            ["S-2", "Interest Profiler Short Form", 1, datetime(2026, 10, 3), ""],
        ]),
        ("Interest Profiler Short Form", ["Student ID", "Set #", "Date saved", *[f"Q{n}" for n in range(60)]], [
            ["S-1", 1, datetime(2026, 10, 1), *ANSWER_ROW],
            ["S-2", 1, datetime(2026, 10, 3), *ANSWER_ROW],
        ]),
        ("Course Plan", ["Student ID", "Grade level", "Course title"], [["S-1", "9th Grade", "Algebra 1"]]),
        **extra,
    )


def test_one_row_per_learner_sheets_are_the_roster_and_the_rest_split_on_the_learner_column():
    preview = bulk.preview(_bulk(), "bulk.xlsx")
    assert preview["kind"] == "bulk"
    by_name = {learner["name"]: learner for learner in preview["learners"]}
    assert set(by_name) == {"Maya Rivera", "Leo Chen", "Ada Okafor"}
    assert by_name["Maya Rivera"]["email"] == "maya@example.com"
    assert by_name["Maya Rivera"]["groups"] == {"experience": 1, "results": 1}
    assert by_name["Maya Rivera"]["kept"]["Course Plan"] == 1
    assert by_name["Leo Chen"]["items"] == 3
    assert by_name["Ada Okafor"]["items"] == 0
    # A row whose learner isn't on Profile is counted, not given to anyone.
    assert preview["unmatched"] == {"Career Bio - Work & Volunteer": 1}
    # The school's student id is never echoed back.
    assert all(learner["key"].startswith("lrn_") and "S-" not in learner["key"] for learner in preview["learners"])


def test_learners_without_a_usable_email_are_flagged_one_by_one():
    preview = bulk.preview(_bulk(), "bulk.xlsx")
    problems = {learner["name"]: learner["problem"] for learner in preview["learners"]}
    assert problems["Maya Rivera"] is None
    assert problems["Ada Okafor"].startswith("No email")


def test_each_learners_slice_reads_like_their_own_download():
    exports = {learner["name"]: learner for learner in bulk.learner_exports(_bulk(), "bulk.xlsx")}
    maya = read_export("cis", exports["Maya Rivera"]["content"], exports["Maya Rivera"]["filename"])
    by_title = {item["title"]: item for item in maya["items"]}
    assert by_title["Animal Care Helper"]["record"]["is_current"]
    assert by_title["Interest Profiler Short Form (Oregon CIS)"]["record"]["data"]["scores"] == {"R": 30, "I": 10, "A": 30, "S": 20, "E": 0, "C": 40}
    assert "Barista" not in by_title
    assert maya["kept"]["Course Plan"][0]["Course title"] == "Algebra 1"
    # Item keys come from row content, so a learner's slice and their own download give the same keys.
    leo = read_export("cis", exports["Leo Chen"]["content"], "x.xlsx")
    assert {item["title"] for item in leo["items"]} == {"Sorter", "Barista", "Interest Profiler Short Form (Oregon CIS)"}


def test_the_held_slice_leaves_out_profile_demographics():
    from openpyxl import load_workbook
    import io

    content = bulk.learner_exports(_bulk(), "bulk.xlsx")[0]["content"]
    profile = load_workbook(io.BytesIO(content), read_only=True)["Profile"]
    header = [cell for cell in next(profile.iter_rows(values_only=True))]
    assert "Gender" not in header and "E-mail" in header


def test_a_single_learners_download_is_a_bulk_export_of_one():
    # Built once: a zip records when each file was written, so two builds can differ by a second.
    download = _cis_zip()
    preview = bulk.preview(download, "cis.zip")
    assert preview["kind"] == "single"
    [learner] = preview["learners"]
    assert learner["name"] == "Maya Rivera"
    assert learner["items"] == len(read_export("cis", download, "cis.zip")["items"])
    # Their download has no email in it, so staff add one before sending.
    assert learner["problem"].startswith("No email")
    [held] = bulk.learner_exports(download, "cis.zip")
    assert held["content"] == download and held["filename"] == "cis.zip"


def test_several_learners_with_no_learner_column_is_refused_not_guessed():
    content = _book(("Profile", ["Last name", "First name"], [["Rivera", "Maya"], ["Chen", "Leo"]]))
    with pytest.raises(HTTPException) as error:
        bulk.preview(content, "bulk.xlsx")
    assert error.value.status_code == 422 and "whose row" in error.value.detail


def test_a_file_that_isnt_a_cis_export_is_refused():
    with pytest.raises(HTTPException) as error:
        bulk.preview(b"not a workbook", "notes.xlsx")
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        bulk.preview(_book(("Grades", ["Student ID", "Grade"], [["S-1", "A"]])), "grades.xlsx")


def test_duplicate_emails_in_one_file_are_flagged():
    content = _book(("Profile", ["Student ID", "First name", "E-mail"], [["S-1", "Maya", "same@example.com"], ["S-2", "Leo", "SAME@example.com"]]))
    problems = [learner["problem"] for learner in bulk.preview(content, "bulk.xlsx")["learners"]]
    assert problems[0] is None and problems[1].startswith("Another learner")
