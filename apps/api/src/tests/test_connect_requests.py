"""Asking to connect from a shared portfolio (FEED-58): off until the learner turns it on, one note, silent declines."""

import pytest
from fastapi import HTTPException

from src.db.portfolio import PortfolioVisibility
from src.services import portfolio as portfolio_service
from src.services.connect import chats
from src.services.connect import requests as connect
from sqlmodel import SQLModel

from src.db.portfolio import PortfolioSection
from src.tests.test_goal_sharing import _session as _sharing_session
from src.tests.test_goals import LEARNER, OTHER, _user


def _session():
    db = _sharing_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[PortfolioSection.__table__])  # type: ignore[attr-defined]
    return db


def _shared_portfolio(db, user_id: int) -> str:
    portfolio = portfolio_service.get_or_create_portfolio(_user(user_id), db)
    portfolio.published_at = "2026-11-06T00:00:00"
    portfolio.visibility = PortfolioVisibility.PUBLIC.value
    db.add(portfolio)
    db.commit()
    return portfolio.portfolio_uuid


def _ask(db, user_id: int, uuid: str, note: str = "Loved your bike rebuild. We hire summer interns.") -> dict:
    return connect.ask(db, _user(user_id), uuid, connect.ConnectRequestCreate(note=note))


def test_nobody_can_ask_until_the_learner_turns_it_on():
    with _session() as db:
        uuid = _shared_portfolio(db, OTHER)
        assert connect.request_state(db, _user(LEARNER), uuid) == {"open": False, "status": "none", "chat_uuid": None}
        with pytest.raises(HTTPException) as closed:
            _ask(db, LEARNER, uuid)
        assert closed.value.status_code == 403
        assert connect.request_state(db, _user(OTHER), uuid)["status"] == "self"


def test_a_request_arrives_once_with_its_note_and_a_decline_is_silent():
    with _session() as db:
        uuid = _shared_portfolio(db, OTHER)
        assert connect.set_taking_requests(db, _user(OTHER), True) == {"connect_requests": True}
        assert connect.request_state(db, _user(LEARNER), uuid)["open"]
        assert _ask(db, LEARNER, uuid)["status"] == "asked"
        request = chats.list_chats(db, _user(OTHER))["chats"][0]
        assert request["status"] == "request" and request["last_message"]["body"].startswith("Loved your bike rebuild")
        with pytest.raises(HTTPException) as again:
            _ask(db, LEARNER, uuid, "hello?")
        assert again.value.status_code == 409
        chats.decline(db, _user(OTHER), request["conversation_uuid"])
        assert connect.request_state(db, _user(LEARNER), uuid)["status"] == "asked"


def test_accepting_turns_the_button_into_their_chat():
    with _session() as db:
        uuid = _shared_portfolio(db, OTHER)
        connect.set_taking_requests(db, _user(OTHER), True)
        _ask(db, LEARNER, uuid)
        chat_uuid = chats.list_chats(db, _user(OTHER))["chats"][0]["conversation_uuid"]
        chats.accept(db, _user(OTHER), chat_uuid)
        assert connect.request_state(db, _user(LEARNER), uuid) == {"open": True, "status": "connected", "chat_uuid": chat_uuid}


def test_a_private_or_unpublished_portfolio_takes_no_requests():
    with _session() as db:
        portfolio = portfolio_service.get_or_create_portfolio(_user(OTHER), db)
        connect.set_taking_requests(db, _user(OTHER), True)
        with pytest.raises(HTTPException) as hidden:
            connect.request_state(db, _user(LEARNER), portfolio.portfolio_uuid)
        assert hidden.value.status_code == 404
