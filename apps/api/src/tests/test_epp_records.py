"""Frozen EPP records: saved on review, corrected as new versions, and kept when the learner leaves."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.epp_records import EppRecord, EppRecordCorrection, EppRecordCreate
from src.db.learner_support import LearnerSupport
from src.db.user_organizations import UserOrganization
from src.services.epp import records, report
from src.services.orgs.membership import cleanup_after_removal
from src.services.superadmin import users as superadmin_users
from src.tests.test_epp_report import _heavy, _session as _report_session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user
from src.tests.test_learner_support import TEACHER


def _session():
    db = _report_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[EppRecord.__table__])  # type: ignore[attr-defined]
    return db


def _review(db, **values) -> dict:
    return records.review(db, _user(TEACHER), 1, LEARNER, EppRecordCreate(outcome="Moved her next step to drafting.", staff_comment="Real ownership.", **values))


def test_a_review_freezes_the_report_and_later_changes_dont_touch_it():
    with _session() as db:
        _heavy(db)
        saved = _review(db, learner_comment="I want CAD II.")
        assert (saved["kind"], saved["version"], saved["reviewed_by"], saved["school_year"]) == ("annual", 1, "Tess Teacher", report.school_year())
        assert saved["report"]["review"]["outcome"] == "Moved her next step to drafting."
        assert saved["record_id"] == f"EPP-400123-{saved['school_year']}-v1"
        frozen_tally = saved["report"]["graduation"]["tally"]
        # The live report now lists the review, and the frozen one doesn't move when courses change.
        live = report.build(db, 1, LEARNER)
        assert live["reviews"][0]["outcome"] == "Moved her next step to drafting."
        assert {item["key"]: item["status"] for item in live["components"]}["progress"] == "reviewed"
        assert {item["key"]: item["status"] for item in saved["report"]["components"]}["progress"] == "reviewed"
        from src.services.epp import courses
        from src.db.epp_courses import EppCourseWrite
        courses.staff_add(db, _user(TEACHER), 1, LEARNER, EppCourseWrite(grade=12, subject="electives", title="CAD II", credits=1, status="planned"))
        assert records.open_record(db, _user(TEACHER), 1, saved["record_uuid"])["report"]["graduation"]["tally"] == frozen_tally
        # Exit records are made by the app, never by hand.
        with pytest.raises(HTTPException):
            _review(db, kind="exit")


def test_a_correction_is_a_new_version_and_the_old_one_stays():
    with _session() as db:
        _heavy(db)
        first = _review(db)
        fixed = records.correct(db, _user(TEACHER), 1, first["record_uuid"], EppRecordCorrection(reason="Wrong student ID", student_id="400124", outcome="Drafting, and CAD II next year."))
        assert (fixed["version"], fixed["corrects"], fixed["student_id"], fixed["correction_reason"]) == (2, first["record_uuid"], "400124", "Wrong student ID")
        assert fixed["staff_comment"] == "Real ownership." and fixed["report"]["learner"]["student_id"] == "400124"
        old = records.open_record(db, _user(TEACHER), 1, first["record_uuid"])
        assert old["superseded"] and old["student_id"] == "400123" and old["outcome"] == "Moved her next step to drafting."
        assert [row["version"] for row in records.list_records(db, _user(TEACHER), 1, LEARNER)["records"]] == [2]
        assert [row["version"] for row in records.list_records(db, _user(TEACHER), 1, LEARNER, include_superseded=True)["records"]] == [2, 1]
        with pytest.raises(HTTPException) as stale:
            records.correct(db, _user(TEACHER), 1, first["record_uuid"], EppRecordCorrection(reason="again"))
        assert stale.value.status_code == 409
        assert [row["version"] for row in records.my_records(db, _user(LEARNER), 1)["records"]] == [2]
        # Only this school's staff open its records.
        for user_id in (LEARNER, OTHER):
            with pytest.raises(HTTPException):
                records.open_record(db, _user(user_id), 1, fixed["record_uuid"])


def test_leaving_the_organization_saves_an_exit_record():
    with _session() as db:
        _heavy(db)
        _review(db)
        # As every way out of an organization does (leaving, removal, batch removal).
        db.delete(db.exec(select(UserOrganization).where(UserOrganization.user_id == LEARNER, UserOrganization.org_id == 1)).one())
        db.flush()
        cleanup_after_removal(db, 1, LEARNER)
        db.commit()
        kinds = [row["kind"] for row in records.list_records(db, _user(TEACHER), 1, LEARNER)["records"]]
        assert kinds == ["exit", "annual"]
        assert db.exec(select(LearnerSupport).where(LearnerSupport.user_id == LEARNER)).one().status == "ended"
        exit_record = records.list_records(db, _user(TEACHER), 1)["records"][0]
        assert records.open_record(db, _user(TEACHER), 1, exit_record["record_uuid"])["report"]["learner"]["student_id"] == "400123"


def test_records_still_open_after_the_account_is_deleted():
    with _session() as db:
        _heavy(db)
        saved = _review(db)
        superadmin_users.delete_global_user(db, _user(ADMIN), LEARNER)
        assert not db.exec(select(UserOrganization).where(UserOrganization.user_id == LEARNER)).first()
        listed = records.list_records(db, _user(TEACHER), 1)["records"]
        assert {row["kind"] for row in listed} == {"annual", "exit"} and all(row["learner_name"] for row in listed)
        opened = records.open_record(db, _user(TEACHER), 1, saved["record_uuid"])
        assert opened["learner_name"] and opened["report"]["courses"]["grid"]
