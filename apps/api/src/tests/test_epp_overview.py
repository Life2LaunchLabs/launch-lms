"""PL-7: every learner's EPP in Insights, by group and complete or not (DEV-155), and exporting a chosen set (DEV-156)."""

import io
import zipfile

import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from src.db.school import UserGroupStaff
from src.db.usergroups import UserGroup
from src.services.epp import caseload
from src.tests.test_epp_records import _session
from src.tests.test_epp_report import _heavy
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _user
from src.tests.test_learner_support import TEACHER


def _text(body: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(body)).pages)


def _group(db, staff: int | None = None) -> None:
    db.add(UserGroup(id=2, org_id=1, usergroup_uuid="usergroup_2", name="Spring", description="", creation_date=NOW, update_date=NOW))
    if staff:
        db.add(UserGroupStaff(org_id=1, usergroup_id=1, user_id=staff, creation_date=NOW, update_date=NOW))
    db.commit()


def test_see_reports_staff_see_every_supported_learner_by_group_and_completeness():
    with _session() as db:
        _heavy(db)
        _group(db)
        listed = caseload.overview(db, _user(ADMIN), 1)
        assert listed["see_reports"] and [item["name"] for item in listed["groups"]] == ["Fall", "Spring"]
        row = next(item for item in listed["learners"] if item["user_id"] == LEARNER)
        assert row["complete"] is False and row["groups"] == ["Fall"] and row["user_uuid"]
        assert listed["counts"]["incomplete"] >= 1
        assert [item["user_id"] for item in caseload.overview(db, _user(ADMIN), 1, "usergroup_1")["learners"]] == [LEARNER]
        assert caseload.overview(db, _user(ADMIN), 1, "usergroup_2")["learners"] == []
        assert caseload.overview(db, _user(ADMIN), 1, state="complete")["learners"] == []
        assert LEARNER in [item["user_id"] for item in caseload.overview(db, _user(ADMIN), 1, state="incomplete")["learners"]]


def test_staff_without_see_reports_see_only_their_own_groups_learners():
    with _session() as db:
        _heavy(db)
        _group(db)
        # Not staff on any group: nothing, though the school supports the learner.
        alone = caseload.overview(db, _user(TEACHER), 1)
        assert not alone["see_reports"] and alone["learners"] == [] and alone["groups"] == []
        with pytest.raises(HTTPException) as other_group:
            caseload.overview(db, _user(TEACHER), 1, "usergroup_1")
        assert other_group.value.status_code == 404
        db.add(UserGroupStaff(org_id=1, usergroup_id=1, user_id=TEACHER, creation_date=NOW, update_date=NOW))
        db.commit()
        mine = caseload.overview(db, _user(TEACHER), 1)
        assert [item["user_id"] for item in mine["learners"]] == [LEARNER] and [item["name"] for item in mine["groups"]] == ["Fall"]
        with pytest.raises(HTTPException):
            caseload.overview(db, _user(TEACHER), 1, "usergroup_2")
        with pytest.raises(HTTPException):
            caseload.overview(db, _user(LEARNER), 1)


def test_export_gives_each_chosen_learner_a_pdf_with_the_legal_name_and_no_staff_notes():
    with _session() as db:
        _heavy(db)
        name, body = caseload.export_selected(db, _user(ADMIN), 1, [LEARNER, OTHER])
        files = zipfile.ZipFile(io.BytesIO(body))
        assert name.startswith("EPP_") and name.endswith("_1_learners.zip")
        assert len(files.namelist()) == 1 and files.namelist()[0].endswith("_400123_EPP_" + caseload.report.school_year() + ".pdf")
        text = _text(files.read(files.namelist()[0]))
        learner = db.get(caseload.User, LEARNER)
        assert f"{learner.first_name} {learner.last_name}" in text
        for leaked in ("STAFF-ONLY", "REVIEWER-ONLY"):
            assert leaked not in text
        # Staff without See reports can't export a learner outside their groups.
        with pytest.raises(HTTPException) as refused:
            caseload.export_selected(db, _user(TEACHER), 1, [LEARNER])
        assert refused.value.status_code == 404
        with pytest.raises(HTTPException):
            caseload.export_selected(db, _user(ADMIN), 1, [])
