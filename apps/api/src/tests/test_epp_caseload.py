"""The EPP caseload, PDF file names, and the class export of reviewed records."""

import io
import zipfile

import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from src.db.epp_records import EppRecord, EppRecordCreate
from src.db.learner_support import LearnerSupport
from src.services.epp import caseload, pdf, records, report
from src.tests.test_epp_records import _session
from src.tests.test_epp_report import _heavy
from src.tests.test_goals import LEARNER, OTHER, _user
from src.tests.test_learner_support import TEACHER


def _text(body: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(body)).pages)


def test_the_caseload_shows_where_each_plan_stands():
    with _session() as db:
        _heavy(db)
        db.add(LearnerSupport(support_uuid="support_other", org_id=1, user_id=OTHER, status="requested", request_uuid="ask_other", requested_by_user_id=TEACHER, requested_at="2026-10-01", creation_date="2026-10-01", update_date="2026-10-01"))
        db.commit()
        listed = caseload.caseload(db, _user(TEACHER), 1)
        rows = {row["user_id"]: row for row in listed["learners"]}
        assert set(rows) == {LEARNER, OTHER}
        mine = rows[LEARNER]
        assert mine["student_id"] == "400123" and mine["state"] == "missing" and mine["due"] and mine["last_review"] is None
        assert set(mine["components"]) == set(caseload.COMPONENTS) and mine["components"]["progress"] == "needs_attention"
        assert mine["open"] == report.build(db, 1, LEARNER)["to_talk_about"][0]
        assert rows[OTHER]["state"] == "waiting" and rows[OTHER]["components"] == {}
        assert listed["counts"] == {"total": 2, "reviewed": 0, "ready": 0, "missing": 1, "waiting": 1} and listed["exportable"] == 0
        # Only the learners you counsel, and only for staff.
        assert [row["user_id"] for row in caseload.caseload(db, _user(TEACHER), 1, mine=True)["learners"]] == [LEARNER]
        with pytest.raises(HTTPException):
            caseload.caseload(db, _user(LEARNER), 1)


def test_reviewed_records_export_as_named_pdfs():
    with _session() as db:
        _heavy(db)
        saved = records.review(db, _user(TEACHER), 1, LEARNER, EppRecordCreate(outcome="Drafting next.", staff_comment="Real ownership."))
        row = caseload.caseload(db, _user(TEACHER), 1)["learners"][0]
        assert row["state"] == "reviewed" and row["last_review"] == saved["reviewed_at"] and not row["due"]
        year = report.school_year()
        name, body = caseload.record_pdf(db, _user(TEACHER), 1, saved["record_uuid"])
        assert name == f"Arner_Lee_400123_EPP_{year}.pdf" and body.startswith(b"%PDF")
        text = _text(body)
        for expected in ("Education Plan and Profile", "Required plan and profile", "Drafting next.", "Real ownership.", "Oregon Diploma credits", "Signatures"):
            assert expected in text
        # Staff notes and personal goals stay out of the paper copy too.
        assert "secret" not in text.lower()
        zip_name, archive = caseload.export_reviewed(db, _user(TEACHER), 1)
        with zipfile.ZipFile(io.BytesIO(archive)) as opened:
            assert (zip_name, opened.namelist()) == (f"EPP_{year}.zip", [name])
        with pytest.raises(HTTPException):
            caseload.record_pdf(db, _user(LEARNER), 1, saved["record_uuid"])


def test_file_names_and_text_survive_a_deleted_account_and_any_name():
    with _session() as db:
        row = EppRecord(record_uuid="r", org_id=1, user_id=None, learner_name="José Nguyễn", school_year="2026-27", kind="exit", version=2, data={})
        assert caseload.file_name(db, row) == "Nguyen_Jose_EPP_2026-27_v2.pdf"
    with _session() as db:
        _heavy(db)
        live = report.build(db, 1, LEARNER)
    live["learner"]["name"] = "Nguyễn Thị Hà 🚀 <b>&"
    # Letters the font lacks lose their accent, anything else prints as "?", and markup stays text.
    assert "Nguyen Thi Hà ? <b>&" in _text(pdf.render(live))
