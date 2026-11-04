"""The interest quiz: O*NET's Mini Interest Profiler, saved to "What I'm like", with careers from the catalog."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel

from src.db.life_plans import CareerEntry, EstimateFact, EstimateSource
from src.services import interest_quiz as quiz, portfolio as service, portfolio_results as results
from src.services.life_plans.estimates import dims_key
from src.tests.test_portfolio_records import _learner
from src.tests.test_portfolio import _session

ARTSY = [0, 0, 4, 1, 0, 0] * 5  # Strongly likes the artistic items, a little social, nothing else.


def _tables(db):
    SQLModel.metadata.create_all(db.get_bind(), tables=[EstimateSource.__table__, EstimateFact.__table__, CareerEntry.__table__])


def _catalog(db):
    _tables(db)
    src = EstimateSource(key="onet-31-0", title="O*NET 31.0")
    db.add(src)
    db.commit()
    for code, title, zone, values in (
        ("27-1024.00", "Graphic Designers", 4, (2.0, 2.5, 7.0, 2.0, 3.0, 1.5)),
        ("15-1252.00", "Software Developers", 4, (3.0, 6.5, 2.0, 1.5, 2.5, 4.5)),
        ("29-2056.00", "Veterinary Technologists and Technicians", 3, (5.0, 5.5, 1.0, 4.0, 1.5, 3.0)),
    ):
        db.add(CareerEntry(code=code, soc=code[:7], title=title, job_zone=zone, interests=dict(zip("RIASEC", values)), source_id=src.id, status="reviewed"))
    for place, value, period in (("us", 30.0, "hr"), ("state:OR", 62000.0, "yr")):
        db.add(EstimateFact(metric="wage", place=place, dims={"soc": "27-1024"}, dims_key=dims_key({"soc": "27-1024"}), label="Graphic Designers", value=value, period=period, stat="median", dollar_year=2025, source_id=src.id, status="reviewed"))
    db.add(EstimateFact(metric="wage", place="us", dims={"soc": "15-1252"}, dims_key=dims_key({"soc": "15-1252"}), label="Software Developers", value=65.0, period="hr", stat="median", dollar_year=2025, source_id=src.id, status="reviewed"))
    db.commit()


def test_the_quiz_is_onets_thirty_items_in_riasec_order_with_credit():
    items = quiz.quiz()["items"]
    assert len(items) == 30 and [item["type"] for item in items[:6]] == list("RIASEC")
    assert all(sum(1 for item in items if item["type"] == key) == 5 for key in "RIASEC")
    assert items[0]["text"] == "Build kitchen cabinets" and items[-1]["text"] == "Stamp, sort, and distribute mail for an organization"
    assert "CC BY-ND 4.0" in quiz.quiz()["credit"]


def test_each_type_sums_its_five_answers_from_0_to_20():
    assert quiz.score(ARTSY) == {"R": 0, "I": 0, "A": 20, "S": 5, "E": 0, "C": 0}
    assert quiz.score([4] * 30) == {key: 20 for key in "RIASEC"}
    for bad in ([2] * 29, [5] + [2] * 29, [-1] + [2] * 29):
        with pytest.raises(HTTPException):
            quiz.score(bad)


def test_taking_it_saves_one_result_and_suggests_careers_with_pay():
    with _session() as db:
        actor = _learner(db)
        _catalog(db)

        taken = quiz.take(ARTSY, actor, db)

        assert taken["code"] == "ASR" and taken["scores"]["A"] == 20
        assert taken["result"]["data"]["template"] == "riasec" and taken["result"]["data"]["max"] == 20
        assert taken["result"]["summary"].startswith("Artistic · Social")
        assert taken["careers"][0]["title"] == "Graphic Designers"
        # Oregon's pay wins over the country's; hourly pay is turned into a year.
        assert taken["careers"][0]["pay"] == {"yearly": 62000, "place": "Oregon", "year": 2025}
        assert next(c for c in taken["careers"] if c["soc"] == "15-1252")["pay"]["yearly"] == 135200

        # Taking it again updates the same result, and keeps it hidden if the learner hid it.
        results.update_result(taken["result"]["result_uuid"], results.ResultWrite(visibility="private"), actor, db)
        again = quiz.take([4, 4, 0, 0, 0, 0] * 5, actor, db)
        assert again["result"]["result_uuid"] == taken["result"]["result_uuid"] and again["result"]["visibility"] == "private"
        assert again["code"] == "RIA"
        assert len(service.get_owner_shell(actor, db)["results"]) == 1
        assert quiz.latest(actor, db)["taken"]["code"] == "RIA"


def test_visitors_see_the_result_but_not_the_answers():
    with _session() as db:
        actor = _learner(db, published=True)
        _tables(db)
        quiz.take(ARTSY, actor, db)

        public = service.get_public_shell(1, "maya", db)["results"][0]

        assert public["data"]["scores"]["A"] == 20 and "answers" not in public["data"]


def test_no_catalog_or_a_flat_profile_means_no_careers_yet():
    with _session() as db:
        actor = _learner(db)
        assert quiz.latest(actor, db)["taken"] is None
        _tables(db)
        assert quiz.take(ARTSY, actor, db)["careers"] == []
        _catalog(db)
        assert quiz.take([2] * 30, actor, db)["careers"] == []
