"""The picture sort: a free interest check for learners who read little or not at all.

Our own 36 activity cards, six for each of the six interest types (RIASEC), each a photo of someone doing it.
The learner taps a face (no, not sure, yes) or swipes, and every card can be read aloud. Scores land on the same
six types as the interest quiz, so the result shows in "What I'm like" and drives career matches and Career swipe.
The words and the card list are ours; the photos are open-licensed (Wikimedia Commons, Flickr, StockSnap, US government), credited
on each card.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session

from src.db.portfolio_records import ResultWrite
from src.db.users import PublicUser
from src.services import interest_quiz, portfolio_results
from src.services.picture_sort_cards import CARDS

SOURCE = "picture_sort"
REFERENCE = "l2l-picture-sort"
NAME = interest_quiz.NAME
ANSWERS = ["No", "Not sure", "Yes"]
MAX = 2 * sum(1 for card in CARDS if card["type"] == "R")
PHOTO_PATH = "/images/picture-sort/"


def deck() -> dict:
    """The cards in an order that mixes the types, so no type comes in a run."""
    by_type = {key: [card for card in CARDS if card["type"] == key] for key in interest_quiz.TYPES}
    rounds = max(len(cards) for cards in by_type.values())
    ordered = [by_type[key][n] for n in range(rounds) for key in interest_quiz.TYPES if n < len(by_type[key])]
    return {
        "cards": [{"key": card["key"], "type": card["type"], "text": card["text"], "photo": f"{PHOTO_PATH}{card['key']}.jpg" if card["credit"] else None, "alt": card["alt"], "credit": card["credit"]} for card in ordered],
        "answers": [{"value": value, "label": label} for value, label in enumerate(ANSWERS)],
        "types": [{"key": key, "label": label} for key, label in interest_quiz.TYPES.items()],
        "max": MAX,
    }


def score(answers: dict[str, int]) -> dict[str, int]:
    """Each type's total, 0 to MAX. Every card needs an answer from 0 (no) to 2 (yes)."""
    keys = {card["key"]: card["type"] for card in CARDS}
    if set(answers) != set(keys) or any(not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > 2 for value in answers.values()):
        raise HTTPException(status_code=422, detail=f"Answer all {len(keys)} cards with 0, 1 or 2")
    totals = {key: 0 for key in interest_quiz.TYPES}
    for key, value in answers.items():
        totals[keys[key]] += value
    return totals


def _taken(scores: dict[str, int], db: Session, result: dict, way: str = SOURCE, top_score: int = MAX) -> dict:
    top = interest_quiz.ranked(scores)
    return {"way": way, "max": top_score, "result": result, "scores": scores, "code": "".join(top[:3]), "careers": interest_quiz.careers(db, scores)}


def latest(current_user: PublicUser, db: Session) -> dict:
    # The learner's one interest result, from this sort or the quiz.
    row = interest_quiz.mine(current_user, db)
    taken = None
    if row:
        scores = {key: int((row.data or {}).get("scores", {}).get(key, 0)) for key in interest_quiz.TYPES}
        taken = _taken(scores, db, portfolio_results.result_dto(row), row.source, int((row.data or {}).get("max") or MAX))
    return {"sort": deck(), "taken": taken}


def take(answers: dict[str, int], current_user: PublicUser, db: Session) -> dict:
    scores = score(answers)
    top = interest_quiz.ranked(scores)
    data = {"template": interest_quiz.TEMPLATE, "scores": scores, "max": MAX, "quiz": REFERENCE, "answers": answers}
    payload = ResultWrite(kind="interests", name=NAME, summary=" · ".join(interest_quiz.TYPES[key] for key in top[:3]), data=data,
                          taken_on=datetime.now(timezone.utc).strftime("%Y-%m"), visibility="public")
    result = interest_quiz.save(current_user, payload, SOURCE, db)
    return _taken(scores, db, result)
