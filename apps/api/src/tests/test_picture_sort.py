"""The picture sort: our own photo cards on the six interest types, saved like the quiz and used by Career swipe."""

import pytest
from fastapi import HTTPException
from sqlmodel import select
from src.db.portfolio_records import PortfolioResult

from src.services import interest_quiz as quiz, picture_sort as sort
from src.services.life_plans import careers
from src.services.picture_sort_cards import CARDS
from src.tests.test_interest_quiz import ARTSY, _catalog
from src.tests.test_portfolio import _session
from src.tests.test_portfolio_records import _learner


def _answers(liked: str) -> dict[str, int]:
    """Yes to every card of the liked types, no to the rest."""
    return {card["key"]: 2 if card["type"] in liked else 0 for card in CARDS}


def test_six_cards_a_type_mixed_so_no_type_comes_in_a_run():
    cards = sort.deck()["cards"]
    assert len(cards) == 36 and all(sum(1 for card in cards if card["type"] == key) == 6 for key in "RIASEC")
    assert all(a["type"] != b["type"] for a, b in zip(cards, cards[1:]))
    assert all(card["photo"].startswith("/images/picture-sort/") for card in cards if card["credit"]) and sort.deck()["max"] == 12


def test_every_card_needs_an_answer_from_0_to_2():
    assert sort.score(_answers("A")) == {"R": 0, "I": 0, "A": 12, "S": 0, "E": 0, "C": 0}
    for bad in ({**_answers("A"), "car": 3}, {key: value for key, value in _answers("A").items() if key != "car"}, {**_answers("A"), "extra": 1}):
        with pytest.raises(HTTPException):
            sort.score(bad)


def test_quiz_and_sort_share_one_result_and_career_swipe_uses_the_latest():
    with _session() as db:
        _catalog(db)
        actor = _learner(db)
        taken = sort.take(_answers("AS"), actor, db)
        assert taken["code"].startswith("A") and taken["careers"][0]["title"] == "Graphic Designers"
        assert taken["result"]["name"] == "Interests (RIASEC)" and taken["result"]["data"]["max"] == 12 and taken["way"] == "picture_sort"
        assert sort.latest(actor, db)["taken"]["code"] == taken["code"]
        assert careers.quiz_scores(db, actor.id)["A"] == 12
        again = quiz.take(ARTSY, actor, db)  # the quiz after it: the quiz's scores now lead, in the same result
        assert careers.quiz_scores(db, actor.id)["A"] == 20
        assert again["result"]["result_uuid"] == taken["result"]["result_uuid"]
        # Either page shows the one result, with the scale it was taken on.
        shown = sort.latest(actor, db)["taken"]
        assert shown["way"] == "interest_quiz" and shown["max"] == 20 and shown["scores"]["A"] == 20
        assert quiz.latest(actor, db)["taken"]["result"]["result_uuid"] == taken["result"]["result_uuid"]
        assert len(db.exec(select(PortfolioResult).where(PortfolioResult.kind == "interests")).all()) == 1
