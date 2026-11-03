"""Comments on a portfolio are Connect messages: the portfolio is a topic in the owner's direct chat with each of its people."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel

from src.db.conversations import ConversationMessageRef, ConversationReaction
from src.db.portfolio import PortfolioVisibility, ProjectItemCreate, TimelineEntryCreate
from src.db.portfolio_people import PortfolioPersonCreate
from src.services import portfolio as portfolio_service, portfolio_people
from src.services.connect import chats, legacy_portfolio_comments, portfolio_talk
from src.services.connect.portfolio_talk import PortfolioChatOpen
from src.tests.test_goals import LEARNER, NOW, OTHER, _user
from src.tests.test_portfolio_people import _session as _portfolio_session


def _session():
    db = _portfolio_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[ConversationMessageRef.__table__, ConversationReaction.__table__], checkfirst=True)  # type: ignore[attr-defined]
    return db


def _portfolio(db) -> dict:
    """Lee's portfolio with an experience, a project, and a private project, shared with Sam."""
    portfolio = portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
    entry = portfolio_service.create_timeline(TimelineEntryCreate(title="Barista at Grounds"), _user(LEARNER), db)
    project = portfolio_service.create_project(ProjectItemCreate(title="Barn rebuild"), _user(LEARNER), db)
    portfolio_service.create_project(ProjectItemCreate(title="Diary", visibility=PortfolioVisibility.PRIVATE), _user(LEARNER), db)
    portfolio_people.add_person(db, _user(LEARNER), PortfolioPersonCreate(handle="sam", role="commenter"))
    return {"portfolio_uuid": portfolio.portfolio_uuid, "experience": entry["timeline_uuid"], "project": project["project_uuid"]}


def test_someone_with_access_comments_on_a_project_in_their_chat_with_the_owner():
    with _session() as db:
        made = _portfolio(db)
        opened = portfolio_talk.open_chat(db, _user(OTHER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"], item_uuid=made["project"]))
        assert (opened["goal_uuid"], opened["step_uuid"]) == (made["portfolio_uuid"], made["project"])
        uuid = opened["conversation_uuid"]
        chats.send(db, _user(OTHER), uuid, "The barn photos are great", {"goal_uuid": made["portfolio_uuid"], "step_uuid": made["project"]})
        chats.send(db, _user(LEARNER), uuid, "Thanks! Want to come see it?")

        page = chats.get_chat(db, _user(LEARNER), uuid, goal_uuid=made["portfolio_uuid"], step_uuid=made["project"])
        assert [item["body"] for item in page["messages"]] == ["The barn photos are great"]
        assert [(ref["kind"], ref["title"], ref.get("scope")) for ref in page["messages"][0]["refs"]] == [("step", "Barn rebuild", True)]
        # The owner's portfolio is the chat's topic, its shared items its steps; the private one isn't there.
        [topic] = page["topics"]
        assert (topic["title"], topic["source"], topic["count"], topic["portfolio"]["mine"]) == ("Your portfolio", "portfolio", 1, True)
        assert [(step["title"], step["item_kind"], step["count"]) for step in topic["steps"]] == [("Barista at Grounds", "experience", 0), ("Barn rebuild", "project", 1)]
        assert len(chats.get_chat(db, _user(OTHER), uuid)["messages"]) >= 2

        # The owner sees who can talk about it, and how much each chat says about this project.
        listed = portfolio_talk.portfolio_chats(db, _user(LEARNER), made["portfolio_uuid"], made["project"])
        assert [(row["person"]["username"], row["conversation_uuid"], row["count"]) for row in listed["people"]] == [("sam", uuid, 1)]
        # Sam, who can see it, gets the owner; nobody else gets anything.
        theirs = portfolio_talk.portfolio_chats(db, _user(OTHER), made["portfolio_uuid"])
        assert (theirs["mine"], [(row["person"]["username"], row["count"]) for row in theirs["people"]]) == (False, [("lee", 1)])
        with pytest.raises(HTTPException):
            portfolio_talk.portfolio_chats(db, _user(1), made["portfolio_uuid"])


def test_the_owner_starts_a_chat_about_an_experience_and_only_shared_items_count():
    with _session() as db:
        made = _portfolio(db)
        opened = portfolio_talk.open_chat(db, _user(LEARNER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"], user_uuid="user_3", item_uuid=made["experience"]))
        chats.send(db, _user(LEARNER), opened["conversation_uuid"], "What should I add here?", {"goal_uuid": made["portfolio_uuid"], "step_uuid": made["experience"]})
        whole = chats.get_chat(db, _user(OTHER), opened["conversation_uuid"], goal_uuid=made["portfolio_uuid"])
        # Like a plan and its steps: the whole portfolio's filter shows what's said about each item too.
        assert [item["body"] for item in whole["messages"]] == ["What should I add here?"]
        on_it = chats.get_chat(db, _user(OTHER), opened["conversation_uuid"], goal_uuid=made["portfolio_uuid"], step_uuid=made["experience"])
        assert [item["body"] for item in on_it["messages"]] == ["What should I add here?"]
        assert on_it["topics"][0]["portfolio"]["mine"] is False
        with pytest.raises(HTTPException):
            portfolio_talk.open_chat(db, _user(LEARNER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"], user_uuid="user_1"))


def test_without_access_the_portfolio_leaves_the_chat():
    with _session() as db:
        made = _portfolio(db)
        uuid = portfolio_talk.open_chat(db, _user(OTHER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"]))["conversation_uuid"]
        portfolio_people.remove_person(db, _user(LEARNER), "user_3")
        assert chats.get_chat(db, _user(OTHER), uuid)["topics"] == []
        with pytest.raises(HTTPException):
            chats.get_chat(db, _user(OTHER), uuid, goal_uuid=made["portfolio_uuid"])
        with pytest.raises(HTTPException):
            portfolio_talk.open_chat(db, _user(OTHER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"]))


def test_the_migration_moves_old_portfolio_comments_into_the_chat_on_their_item():
    with _session() as db:
        made = _portfolio(db)
        portfolio_id = portfolio_service.get_or_create_portfolio(_user(LEARNER), db).id
        legacy_portfolio_comments.PORTFOLIOCOMMENT.create(db.connection())
        row = {"portfolio_id": portfolio_id, "item_kind": "project", "creation_date": NOW, "update_date": NOW}
        db.connection().execute(legacy_portfolio_comments.PORTFOLIOCOMMENT.insert(), [
            {**row, "id": 1, "comment_uuid": "c1", "item_uuid": made["project"], "parent_id": None, "author_user_id": OTHER, "body": "Love the barn"},
            {**row, "id": 2, "comment_uuid": "c2", "item_uuid": None, "parent_id": 1, "author_user_id": LEARNER, "body": "Thank you"},
            {**row, "id": 3, "comment_uuid": "c3", "item_kind": "portfolio", "item_uuid": None, "parent_id": None, "author_user_id": LEARNER, "body": "Note to self"},
        ])
        assert legacy_portfolio_comments.move_all(db) == 2
        db.commit()
        uuid = portfolio_talk.open_chat(db, _user(OTHER), PortfolioChatOpen(portfolio_uuid=made["portfolio_uuid"]))["conversation_uuid"]
        on_project = chats.get_chat(db, _user(OTHER), uuid, goal_uuid=made["portfolio_uuid"], step_uuid=made["project"])["messages"]
        assert [(item["sender"]["username"], item["preview"]) for item in on_project] == [("sam", "Barn rebuild Love the barn"), ("lee", "Barn rebuild Thank you")]
