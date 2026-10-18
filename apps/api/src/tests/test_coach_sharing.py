"""Learners share a Coach conversation with the coaching team, who see it without the learner's name."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.coach import CoachSharedConversation
from src.db.hub import HubConversation, HubConversationMessage
from src.db.organizations import Organization  # noqa: F401
from src.db.users import User  # noqa: F401
from src.services import hub_conversations
from src.services.coach import sharing

CONTEXT = {
    "who": {"headline": "Line cook", "strengths": ["Fast"], "now": [{"title": "Cook at Rosie's", "where": "Rosie's"}]},
    "doing": {"goals": [{"title": "Culinary school", "why": "Run a kitchen", "progress": "1/3 steps", "next_steps": ["Tour the college"]}]},
}


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr(hub_conversations, "require_org_membership", lambda *_args: None)
    monkeypatch.setattr(sharing.coach_policy, "runtime", lambda _db: None)
    monkeypatch.setattr(sharing, "for_policy", lambda _db, _org, _user, _policy: CONTEXT)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[HubConversation.__table__, HubConversationMessage.__table__, CoachSharedConversation.__table__])
    with Session(engine) as session:
        conversation = HubConversation(conversation_uuid="conv_1", org_id=7, user_id=11, title="Rough night")
        session.add(conversation)
        session.commit()
        for sequence, (role, kind, content) in enumerate([
            ("user", "chat", "honestly idk if school is worth it"), ("assistant", "chat", "What happened tonight?"),
            ("assistant", "search", "culinary schools"), ("user", "chat", "just slammed, chef yelled"), ("assistant", "chat", "That sounds draining."),
        ]):
            session.add(HubConversationMessage(message_uuid=f"m{sequence}", conversation_id=conversation.id, sequence=sequence, role=role, kind=kind, content=content))
        session.commit()
        yield session


def test_a_learner_shares_a_conversation_and_can_stop_sharing_it(db):
    assert sharing.status(db, 7, 11, "conv_1")["shared"] is False
    shared = sharing.share(db, 7, 11, "conv_1", note="  Coach was great here ")
    assert shared["shared"] is True and shared["note"] == "Coach was great here"
    [item] = sharing.shared_view(db)
    assert [message["content"] for message in item["messages"]] == ["honestly idk if school is worth it", "What happened tonight?", "just slammed, chef yelled", "That sounds draining."]
    assert item["learner"] == {"headline": "Line cook", "bio": "", "location": "", "strengths": ["Fast"], "values": [], "now": ["Cook at Rosie's"], "goals": [{"title": "Culinary school", "why": "Run a kitchen", "next_steps": ["Tour the college"]}]}
    # Nothing in what the team sees names the learner.
    assert "user_id" not in item and "conversation_uuid" not in item
    draft = item["draft_test"]
    assert draft["moment"] == "conversation" and draft["message"] == "honestly idk if school is worth it" and draft["turns"] == 2
    assert "just slammed, chef yelled" in draft["persona"]
    # Sharing again replaces the copy; stopping removes it.
    sharing.share(db, 7, 11, "conv_1")
    assert len(sharing.shared_view(db)) == 1
    assert sharing.unshare(db, 7, 11, "conv_1")["shared"] is False and sharing.shared_view(db) == []


def test_only_the_learner_shares_their_own_conversation(db):
    with pytest.raises(HTTPException):
        sharing.share(db, 7, 12, "conv_1")
    sharing.share(db, 7, 11, "conv_1")
    share_uuid = sharing.shared_view(db)[0]["share_uuid"]
    sharing.dismiss(db, share_uuid)
    assert sharing.status(db, 7, 11, "conv_1")["shared"] is False
