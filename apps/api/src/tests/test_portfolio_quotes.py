import pytest
from fastapi import HTTPException

from src.db.portfolio import TimelineEntryCreate
from src.db.portfolio_records import QuoteAnswer, QuoteAsk
from src.services import portfolio as service, portfolio_quotes as quotes
from src.tests.test_portfolio_records import _learner
from src.tests.test_portfolio import _session


def _ask(monkeypatch, db, actor, **over):
    sent = []
    monkeypatch.setattr(quotes, "send_email", lambda **mail: sent.append(mail))
    entry = service.create_timeline(TimelineEntryCreate(title="Kennel helper", entry_type="work_career", organization="Lane County Shelter"), actor, db)
    payload = {"name": "Dana Lee", "role_label": "Shift lead", "email": "dana@example.com", "timeline_uuid": entry["timeline_uuid"], "note": "Could you say a line?"} | over
    quote = quotes.ask(QuoteAsk(**payload), actor, db)
    token = sent[0]["body"].split("/quote/")[1].split('"')[0]
    return quote, token, sent


def test_an_ask_emails_a_link_that_answers_once_and_confirms_the_quote(monkeypatch):
    with _session() as db:
        actor = _learner(db, published=True)
        quote, token, sent = _ask(monkeypatch, db, actor)

        assert quote["status"] == "requested" and sent[0]["to"] == "dana@example.com"
        view = quotes.request_view(token, db)
        assert (view["item"]["title"], view["name"], view["role_label"], view["note"]) == ("Kennel helper", "Dana Lee", "Shift lead", "Could you say a line?")
        # Nobody but the person asked sees an unanswered ask.
        assert service.get_public_shell(1, "maya", db)["quotes"] == []

        quotes.answer(token, QuoteAnswer(name="Dana Lee", role_label="Shift lead, Lane County Shelter", body="Maya is the one the dogs wait for.", reference=True), db)

        public = service.get_public_shell(1, "maya", db)["quotes"]
        assert [(item["body"], item["role_label"], item["confirmed"]) for item in public] == [("Maya is the one the dogs wait for.", "Shift lead, Lane County Shelter", True)]
        with pytest.raises(HTTPException):
            quotes.request_view(token, db)


def test_an_ask_needs_an_email_and_one_item(monkeypatch):
    with _session() as db:
        actor = _learner(db)
        with pytest.raises(HTTPException):
            _ask(monkeypatch, db, actor, email="")
        with pytest.raises(HTTPException):
            quotes.ask(QuoteAsk(name="Dana"), actor, db)


def test_a_learner_can_take_back_an_ask_and_its_link_stops_working(monkeypatch):
    with _session() as db:
        actor = _learner(db)
        quote, token, _ = _ask(monkeypatch, db, actor)
        quotes.take_back(quote["quote_uuid"], actor, db)
        with pytest.raises(HTTPException):
            quotes.answer(token, QuoteAnswer(name="Dana", body="Great"), db)
