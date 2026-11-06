"""Organization and outside text is translated once per text and language, then reused."""

import asyncio
import json

from sqlmodel import SQLModel, select

from src.db.content_translations import ContentTranslation
from src.services.hub_advisor import AdvisorResult
from src.services.translation import content
from src.tests.test_goal_sharing import _session as _base_session
from src.tests.test_goals import LEARNER


class FakeModel:
    def __init__(self, reply=None):
        self.calls: list[list[str]] = []
        self.reply = reply

    async def respond(self, messages, safety_identifier):
        texts = json.loads(messages[-1].content)["texts"]
        self.calls.append(texts)
        if self.reply is not None:
            return AdvisorResult(text=self.reply, model="fake")
        return AdvisorResult(text=json.dumps({"translations": [f"ES:{text}" for text in texts]}), model="fake")


def _session():
    db = _base_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[ContentTranslation.__table__])  # type: ignore[attr-defined]
    return db


def _run(db, texts, provider, language="es"):
    return asyncio.run(content.translate(db, LEARNER, texts, language, provider=provider))


def test_text_is_translated_once_and_reused():
    with _session() as db:
        model = FakeModel()
        first = _run(db, ["Find a summer job", "Find a summer job", "  ", "42", "https://example.com", "Apply"], model)
        assert first["translations"] == {"Find a summer job": "ES:Find a summer job", "Apply": "ES:Apply"}
        assert model.calls == [["Find a summer job", "Apply"]]
        again = _run(db, ["Apply", "Visit a college"], model)
        assert again["translations"] == {"Apply": "ES:Apply", "Visit a college": "ES:Visit a college"}
        assert model.calls[-1] == ["Visit a college"]
        assert len(db.exec(select(ContentTranslation)).all()) == 3


def test_english_and_unready_languages_are_left_alone():
    with _session() as db:
        model = FakeModel()
        assert _run(db, ["Apply"], model, "en")["translations"] == {}
        assert _run(db, ["Apply"], model, "fr")["translations"] == {}
        assert model.calls == []


def test_a_bad_reply_is_not_saved():
    with _session() as db:
        result = _run(db, ["Apply", "Save"], FakeModel(reply='{"translations": ["Solicitar"]}'))
        assert result["partial"] is True and result["translations"] == {}
        assert db.exec(select(ContentTranslation)).all() == []


def test_without_a_model_nothing_is_translated(monkeypatch):
    with _session() as db:
        monkeypatch.setattr(content, "_provider", lambda db, language: None)
        result = asyncio.run(content.translate(db, LEARNER, ["Apply"], "es"))
        assert result["available"] is False and result["translations"] == {}


def test_the_daily_allowance_stops_new_translations(monkeypatch):
    with _session() as db:
        monkeypatch.setattr(content, "DAILY_CHARS", 10)
        monkeypatch.setattr(content._Budget, "__init__", lambda self, user_id: (setattr(self, "redis", None), setattr(self, "used", 0), setattr(self, "key", ""))[0])
        model = FakeModel()
        result = _run(db, ["A long sentence to translate"], model)
        assert result["partial"] is True and model.calls == []
