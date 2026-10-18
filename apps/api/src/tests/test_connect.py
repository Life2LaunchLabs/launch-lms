"""Connect: chats, requests from strangers, findable search, block and report, and comment cards."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ChatReportCreate, ConversationReport, DirectChatOpen
from src.db.goal_comments import GoalCommentCreate
from src.db.users import User
from src.services.connect import chats, people
from src.services.goals import comments
from src.tests.test_goal_sharing import OTHER_EMAIL, _join, _personal, _session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user


def _open(db, user_id: int, handle: str) -> dict:
    return chats.open_direct(db, _user(user_id), DirectChatOpen(handle=handle))


def _send(db, user_id: int, chat: dict, body: str) -> dict:
    return chats.send(db, _user(user_id), chat["conversation_uuid"], body)


def _findable(db, user_id: int) -> None:
    people.update_settings(db, _user(user_id), True)


def _chat_with(db, user_id: int) -> dict:
    return chats.list_chats(db, _user(user_id))["chats"][0]


def test_nobody_is_findable_until_they_turn_it_on():
    with _session() as db:
        assert people.search(db, _user(LEARNER), "@sam") == []
        with pytest.raises(HTTPException) as hidden:
            _open(db, LEARNER, "@sam")
        assert hidden.value.status_code == 404
        _findable(db, OTHER)
        assert [(item["username"], item["known"]) for item in people.search(db, _user(LEARNER), "sa")] == [("sam", False)]
        assert "email" not in people.search(db, _user(LEARNER), "sa")[0]
        assert people.search(db, _user(LEARNER), "s") == []


def test_people_who_share_a_goal_chat_freely_and_unread_counts_follow_reads():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "viewer")
        assert [item["username"] for item in people.search(db, _user(LEARNER), "Sam O")] == ["sam"]
        chat = _open(db, LEARNER, "sam")
        assert chat["accepted"] and chat["messages"] == []
        # An empty chat doesn't show up for either of them.
        assert chats.list_chats(db, _user(OTHER))["chats"] == []
        _send(db, LEARNER, chat, "Hi! Can you look at my plan?")
        _send(db, LEARNER, chat, "No rush")
        listed = chats.list_chats(db, _user(OTHER))
        assert listed["unread"] == 2 and listed["chats"][0]["status"] == "active" and listed["chats"][0]["title"] == "Lee Arner"
        assert chats.mark_read(db, _user(OTHER), chat["conversation_uuid"]) == {"unread": 0, "requests": 0}
        reply = _send(db, OTHER, chat, "Sure thing")
        assert reply["mine"] and chats.counts(db, _user(LEARNER))["unread"] == 1
        assert _open(db, OTHER, "@lee")["conversation_uuid"] == chat["conversation_uuid"]


def test_a_stranger_first_message_is_a_request_with_one_message_until_accepted():
    with _session() as db:
        _findable(db, OTHER)
        chat = _open(db, LEARNER, "sam")
        _send(db, LEARNER, chat, "hey, saw your portfolio https://example.com")
        with pytest.raises(HTTPException) as waiting:
            _send(db, LEARNER, chat, "hello??")
        assert waiting.value.status_code == 409
        request = _chat_with(db, OTHER)
        assert request["status"] == "request" and not request["accepted"]
        assert chats.counts(db, _user(OTHER)) == {"unread": 0, "requests": 1}
        assert chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["waiting_for_them"]
        with pytest.raises(HTTPException) as must_accept:
            _send(db, OTHER, chat, "who is this")
        assert must_accept.value.status_code == 409
        accepted = chats.accept(db, _user(OTHER), chat["conversation_uuid"])
        assert accepted["accepted"] and accepted["status"] == "active"
        _send(db, LEARNER, chat, "Thanks for accepting")


def test_deleting_a_request_hides_it_without_telling_the_sender():
    with _session() as db:
        _findable(db, OTHER)
        chat = _open(db, LEARNER, "sam")
        _send(db, LEARNER, chat, "hi")
        chats.decline(db, _user(OTHER), chat["conversation_uuid"])
        assert chats.list_chats(db, _user(OTHER))["chats"] == []
        sender_view = chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])
        assert sender_view["waiting_for_them"] and not sender_view["unavailable"]
        with pytest.raises(HTTPException):
            _send(db, LEARNER, chat, "hello?")


def test_blocking_stops_messages_both_ways_and_hides_them_from_search():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "viewer")
        chat = _open(db, LEARNER, "sam")
        _send(db, OTHER, chat, "hi")
        chats.block(db, _user(LEARNER), chat["conversation_uuid"])
        assert chats.list_chats(db, _user(LEARNER))["chats"] == []
        for user_id in (LEARNER, OTHER):
            with pytest.raises(HTTPException) as stopped:
                _send(db, user_id, chat, "still there?")
            assert stopped.value.status_code == 403
        assert people.search(db, _user(LEARNER), "sam") == []
        with pytest.raises(HTTPException) as unblock_first:
            _open(db, LEARNER, "sam")
        assert unblock_first.value.status_code == 409
        with pytest.raises(HTTPException) as hidden:
            _open(db, OTHER, "lee")
        assert hidden.value.status_code == 404
        assert [item["username"] for item in chats.list_blocked(db, _user(LEARNER))] == ["sam"]
        chats.unblock(db, _user(LEARNER), "user_3")
        _send(db, LEARNER, chat, "Sorry, wrong button")


def test_reports_keep_a_copy_of_the_message_and_block_by_default():
    with _session() as db:
        _findable(db, LEARNER)
        chat = _open(db, OTHER, "lee")
        message = _send(db, OTHER, chat, "something unkind")
        result = chats.report(db, _user(LEARNER), chat["conversation_uuid"], ChatReportCreate(reason="Bullying", message_uuid=message["message_uuid"]))
        assert result == {"reported": True, "blocked": True}
        saved = db.exec(select(ConversationReport)).one()
        assert (saved.reported_user_id, saved.excerpt, saved.status) == (OTHER, "something unkind", "open")
        with pytest.raises(HTTPException) as outsider:
            chats.get_chat(db, _user(ADMIN), chat["conversation_uuid"])
        assert outsider.value.status_code == 404


def test_comments_arrive_as_one_card_that_gathers_until_read():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "commenter")
        for body in ("Love this", "What about @lee's budget?", "One more idea"):
            comments.add_comment(db, _user(OTHER), uuid, GoalCommentCreate(body=body))
        chat = _chat_with(db, LEARNER)
        card = chat["last_message"]
        assert card["kind"] == "card" and card["body"] == "3 comments on Earn a nursing degree, and mentioned you"
        assert card["card"]["goal_uuid"] == uuid and card["card"]["excerpt"] == "One more idea"
        assert chat["unread"] == 1
        chats.mark_read(db, _user(LEARNER), chat["conversation_uuid"])
        comments.add_comment(db, _user(OTHER), uuid, GoalCommentCreate(body="Fresh thought"))
        messages = chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["messages"]
        assert [item["body"] for item in messages] == ["3 comments on Earn a nursing degree, and mentioned you", "Commented on Earn a nursing degree"]


def test_settings_live_on_the_user():
    with _session() as db:
        assert people.get_settings(db, _user(LEARNER)) == {"discoverable": False}
        _findable(db, LEARNER)
        assert db.get(User, LEARNER).details["connect"] == {"discoverable": True}
