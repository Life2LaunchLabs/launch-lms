"""The portfolio is the profile: people added as Viewer or Commenter, and what a profile shows."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.portfolio import Portfolio, PortfolioLink, PortfolioSection, ProfileTrait, ProjectItem, ProjectItemBlock, TimelineEntry, TimelineEntryBlock, TimelineProjectLink
from src.db.portfolio_people import PortfolioPersonCreate
from src.db.portfolio_records import RECORD_TABLES
from src.services import portfolio as portfolio_service, portfolio_people
from src.services.connect import chats, people, profile
from src.tests.test_goal_sharing import OTHER_EMAIL, _join, _personal, _session as _goal_session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user


def _session():
    db = _goal_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[
        model.__table__ for model in (PortfolioSection, PortfolioLink, ProfileTrait, ProjectItem, ProjectItemBlock, TimelineEntry, TimelineEntryBlock, TimelineProjectLink, *RECORD_TABLES)  # type: ignore[attr-defined]
    ])
    return db


def _add(db, handle: str, role: str = "viewer") -> dict:
    return portfolio_people.add_person(db, _user(LEARNER), PortfolioPersonCreate(handle=handle, role=role))


def test_a_private_portfolio_opens_only_for_the_people_on_it():
    with _session() as db:
        portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
        with pytest.raises(HTTPException) as private:
            portfolio_people.shared_shell(db, _user(OTHER), 1, "lee")
        assert private.value.status_code == 404
        listed = _add(db, "@sam")
        assert [(item["user"]["username"], item["role"]) for item in listed["people"]] == [("sam", "viewer")]
        assert [choice["key"] for choice in listed["choices"]] == ["viewer", "commenter"]
        shell = portfolio_people.shared_shell(db, _user(OTHER), 1, "lee")
        assert shell["access"] == {"role": "viewer", "can_comment": False, "shared_privately": True, "plans": False}
        # They hear about it in their chat, which also means they can now message each other.
        assert chats.list_chats(db, _user(OTHER))["chats"][0]["last_message"]["card"]["type"] == "portfolio_shared"
        assert people.knows(db, OTHER, LEARNER)
        with pytest.raises(HTTPException):
            portfolio_people.shared_shell(db, _user(ADMIN), 1, "lee")
        portfolio_people.remove_person(db, _user(LEARNER), "user_3")
        with pytest.raises(HTTPException):
            portfolio_people.shared_shell(db, _user(OTHER), 1, "lee")


def test_blocking_the_owner_takes_away_access():
    with _session() as db:
        portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
        _add(db, "s@example.com", "commenter")
        chat = chats.list_chats(db, _user(LEARNER))["chats"][0]
        chats.block(db, _user(LEARNER), chat["conversation_uuid"])
        assert portfolio_people.role_for(db, db.exec(select(Portfolio)).one(), OTHER) is None
        with pytest.raises(HTTPException):
            _add(db, "@sam")


def test_a_profile_shows_the_goals_shared_with_the_viewer():
    with _session() as db:
        shared = _personal(db)["goal_uuid"]
        _personal(db, title="Private goal")
        _join(db, shared, OTHER, OTHER_EMAIL, "commenter")
        seen = profile.profile(db, _user(OTHER), "lee")
        assert [(goal["goal_uuid"], goal["can_comment"]) for goal in seen["goals"]] == [(shared, True)]
        assert seen["can_message"] and seen["chat_uuid"] is None and seen["person"]["username"] == "lee"
        assert profile.profile(db, _user(LEARNER), "lee")["goals"] == []
        assert profile.profile(db, _user(ADMIN), "lee")["can_message"] is False
