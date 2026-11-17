"""PL-7: a learner's Education Plan and Profile as an Insights learner dashboard, captured like any other (DEV-154)."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.insights import InsightCapture, InsightDashboard
from src.db.organization_config import OrganizationConfig
from src.db.users import User
from src.services.insights import captures, dashboards, engine, library
from src.services.orgs import school_records
from src.tests.test_epp_report import _heavy, _session as _epp_session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user


def _session():
    db = _epp_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[InsightDashboard.__table__, InsightCapture.__table__, OrganizationConfig.__table__])  # type: ignore[attr-defined]
    return db


def _uuid(db, user_id: int) -> str:
    return db.get(User, user_id).user_uuid


def _epp_dashboard(db) -> dict:
    listed = dashboards.list_dashboards(db, _user(ADMIN), 1, "learner")
    return next(item for item in listed if item["source_template"] == "starter:learner.epp")


def test_the_epp_starter_shows_a_supported_learners_report_and_a_capture_keeps_it():
    with _session() as db:
        _heavy(db)
        board = _epp_dashboard(db)
        assert board["title"] == "Education Plan and Profile"
        cards = library.template("learner.epp")["cards"]
        result = engine.run_cards(engine.context(db, _user(ADMIN), 1, "learner", _uuid(db, LEARNER)), cards)["epp"]
        assert result["shape"] == "document" and result["document"]["learner"]["student_id"] == "400123"
        assert result["headline"].endswith("parts complete") and "staff_notes" not in str(result)

        made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], key=_uuid(db, LEARNER))
        frozen = captures.get_capture(db, _user(ADMIN), 1, made["capture_uuid"])
        assert frozen["results"]["epp"]["document"]["learner"]["name"] == result["document"]["learner"]["name"]
        # A read-only link never carries the record.
        assert captures.shield(frozen["results"]["epp"])["document"] is None


def test_a_learner_the_school_doesnt_support_shows_locked_not_their_record():
    with _session() as db:
        cards = library.template("learner.epp")["cards"]
        result = engine.run_cards(engine.context(db, _user(ADMIN), 1, "learner", _uuid(db, OTHER)), cards)["epp"]
        assert result["error"] == "locked" and "doesn't support" in result["errors"][0]["message"]
        with pytest.raises(HTTPException):
            engine.drill(engine.context(db, _user(ADMIN), 1, "learner", _uuid(db, OTHER)), engine.CardSpec(measure="epp_report"), "all")


def test_the_epp_card_only_fits_a_learner_dashboard_without_breakdowns():
    from src.services.insights.spec import CardSpec, check

    assert check(CardSpec(measure="epp_report"), "learner", see_reports=False) == []
    assert check(CardSpec(measure="epp_report"), "org", see_reports=True)
    assert check(CardSpec(measure="epp_report", by="plan"), "learner", see_reports=True)


def test_with_school_records_off_the_epp_dashboard_question_and_captures_are_gone():
    with _session() as db:
        _heavy(db)
        board = _epp_dashboard(db)
        made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], key=_uuid(db, LEARNER))
        school_records.set_enabled(db, 1, False)
        assert all(item["source_template"] != "starter:learner.epp" for item in dashboards.list_dashboards(db, _user(ADMIN), 1, "learner"))
        with pytest.raises(HTTPException):
            dashboards.get_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"])
        assert captures.list_captures(db, _user(ADMIN), 1) == []
        with pytest.raises(HTTPException):
            captures.get_capture(db, _user(ADMIN), 1, made["capture_uuid"])
        shown = dashboards.library_for(db, _user(ADMIN), 1, "learner")
        assert "learner.epp" not in [item["key"] for item in shown["templates"]] and "epp" not in [item["key"] for item in shown["questions"]]
        ctx = engine.context(db, _user(ADMIN), 1, "learner", _uuid(db, LEARNER))
        assert "epp_report" not in [item["key"] for item in engine.registry(ctx)["measures"]]
        assert engine.run_cards(ctx, library.template("learner.epp")["cards"])["epp"]["error"] == "invalid"


def test_a_new_non_school_space_never_gets_the_epp_starter_until_it_turns_school_records_on():
    with _session() as db:
        db.add(OrganizationConfig(org_id=1, config={"setup": {"role": "training"}}))
        db.commit()
        assert all(item["source_template"] != "starter:learner.epp" for item in dashboards.list_dashboards(db, _user(ADMIN), 1, "learner"))
        school_records.set_enabled(db, 1, True)
        assert _epp_dashboard(db)
        assert len(db.exec(select(InsightDashboard).where(InsightDashboard.source_template == "starter:learner.epp")).all()) == 1
