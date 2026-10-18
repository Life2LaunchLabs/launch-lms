"""Learners report a Coach reply; the coaching team sees it without the learner's name and can draft a test from it."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.coach import CoachReport
from src.db.hub import HubConversation, HubConversationMessage
from src.db.organizations import Organization  # noqa: F401
from src.db.users import User  # noqa: F401
from src.services import hub_conversations
from src.services.coach import reports

CONTEXT = {
    "who": {"headline": "Line cook", "bio": "I'm Dana from Tulsa", "location": "Tulsa", "strengths": ["Fast"], "now": [{"title": "Cook at Rosie's", "where": "Rosie's"}]},
    "doing": {"goals": [{"title": "Culinary school", "why": "Run a kitchen", "progress": "1/3 steps", "next_steps": ["Tour the college"]}]},
}


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr(hub_conversations, "require_org_membership", lambda *_args: None)
    monkeypatch.setattr(reports.coach_policy, "runtime", lambda _db: None)
    monkeypatch.setattr(reports, "for_policy", lambda _db, _org, _user, _policy: CONTEXT)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[HubConversation.__table__, HubConversationMessage.__table__, CoachReport.__table__])
    with Session(engine) as session:
        conversation = HubConversation(conversation_uuid="conv_1", org_id=7, user_id=11, title="Rough night")
        session.add(conversation)
        session.commit()
        for sequence, (role, kind, content) in enumerate([
            ("user", "chat", "honestly idk if school is worth it"), ("assistant", "chat", "What happened tonight?"),
            ("assistant", "search", "culinary schools"), ("user", "chat", "just slammed, chef yelled"), ("assistant", "chat", "You should quit."),
            ("user", "chat", "wow ok"), ("assistant", "chat", "Sorry, that came out wrong."),
        ]):
            session.add(HubConversationMessage(message_uuid=f"m{sequence}", conversation_id=conversation.id, sequence=sequence, role=role, kind=kind, content=content))
        session.commit()
        yield session


def test_a_learner_reports_a_reply_and_the_team_sees_the_conversation_up_to_it_without_their_name(db):
    reports.report(db, 7, 11, "m4", "harmful", note="  told me to quit ")
    [item] = reports.reports_view(db)
    assert item["reason"] == "harmful" and item["note"] == "told me to quit" and item["status"] == "new"
    assert [message["content"] for message in item["messages"]] == ["honestly idk if school is worth it", "What happened tonight?", "just slammed, chef yelled", "You should quit."]
    assert item["learner"] == {"headline": "Line cook", "bio": "", "location": "", "strengths": ["Fast"], "values": [], "now": ["Cook at Rosie's"], "goals": [{"title": "Culinary school", "why": "Run a kitchen", "next_steps": ["Tour the college"]}]}
    assert "Dana" not in str(item) and "user_id" not in item and "conversation_uuid" not in item
    draft = item["draft_test"]
    assert draft["moment"] == "conversation" and draft["message"] == "honestly idk if school is worth it" and draft["turns"] == 2
    assert "just slammed, chef yelled" in draft["persona"] and "You should quit" not in draft["persona"]
    # Reporting the same reply again updates the report; reviewing moves it below new reports.
    reports.report(db, 7, 11, "m4", "wrong")
    assert len(reports.reports_view(db)) == 1 and reports.reports_view(db)[0]["reason"] == "wrong"
    reports.report(db, 7, 11, "m1", "unhelpful")
    first = reports.reports_view(db)[0]
    assert first["messages"][-1]["content"] == "What happened tonight?" and first["draft_test"]["moment"] == "learner_message"
    reports.mark_reviewed(db, first["report_uuid"])
    assert [item["status"] for item in reports.reports_view(db)] == ["new", "reviewed"]


def test_only_the_learner_reports_coach_replies_in_their_own_conversation(db):
    with pytest.raises(HTTPException):
        reports.report(db, 7, 12, "m4", "harmful")
    for message_uuid in ("m0", "m2", "missing"):
        with pytest.raises(HTTPException, match="Message not found"):
            reports.report(db, 7, 11, message_uuid, "harmful")
    with pytest.raises(HTTPException, match="Report not found"):
        reports.mark_reviewed(db, "nope")
    assert reports.reports_view(db) == []
