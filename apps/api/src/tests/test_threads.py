"""Threads: what staff see around a learner's, a group's, the staff room's and the organization's messages, the list's kinds, and reactions."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ConversationMember
from src.db.goals import StepStatus, StepSubmission
from src.db.organization_invitations import OrganizationInvitation
from src.db.usergroup_user import UserGroupUser
from src.services.connect import chats, reactions
from src.services.goals import goals
from src.services.school import chats as school_chats, feed, threads
from src.tests.test_cohort_chat import PRINCIPAL, _session
from src.tests.test_goal_assignments_admin import COACH, ESSAY, VISIT, _assign, _goal, _goal_step
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _user


def _denied(call, *args) -> int:
    with pytest.raises(HTTPException) as error:
        call(*args)
    return error.value.status_code


def test_a_learners_thread_lists_their_plans_and_what_waits_on_staff_in_each():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)

        chat = school_chats.find(db, 1, LEARNER)
        chats.send(db, _user(LEARNER), chat.conversation_uuid, "Is the essay one page or two?", {"goal_uuid": mine.goal_uuid, "step_uuid": essay.step_uuid})
        chats.send(db, _user(LEARNER), chat.conversation_uuid, "Thanks for the welcome")
        chats.send(db, _user(ADMIN), chat.conversation_uuid, "Keep an eye on Lee", {"goal_uuid": mine.goal_uuid, "step_uuid": essay.step_uuid}, staff_only=True)

        thread = threads.person_thread(db, _user(ADMIN), 1, LEARNER)
        assert thread["kind"] == "learner" and thread["chat_uuid"] == chat.conversation_uuid
        # Viewer first, then the plan's other staff.
        assert [person["id"] for person in thread["with"]][:2] == [ADMIN, COACH]
        plan = next(item for item in thread["plans"] if item["goal_uuid"] == mine.goal_uuid)
        assert plan["assignment_uuid"] == uuid and plan["status"] == "active" and plan["cover"]["template_uuid"]
        # The turn-in and the question about this plan (not the message about no plan, which nobody answered either).
        assert plan["needs"] == 2
        assert thread["counts"]["review"] == 1 and thread["counts"]["questions"] == 2 and thread["counts"]["staff_only"] == 1
        assert [(item["step_uuid"], item["assignment_uuid"]) for item in thread["review"]] == [(essay.step_uuid, uuid)]

        # A staff reply about the step answers the question about it; staff-only notes don't answer.
        chats.send(db, _user(COACH), chat.conversation_uuid, "One page is fine", {"goal_uuid": mine.goal_uuid, "step_uuid": essay.step_uuid})
        focused = threads.person_thread(db, _user(ADMIN), 1, LEARNER, mine.goal_uuid)
        assert focused["focus"] == mine.goal_uuid and focused["counts"]["questions"] == 0 and focused["counts"]["staff_only"] == 1
        steps = {step["step_key"]: step for step in focused["steps"]}
        assert list(steps) == ["visit", "essay"]
        assert steps["essay"]["state"] == "review" and steps["essay"]["updates"] == 4 and steps["visit"]["state"] == "open"
        # The turn-in's progress card, the question and its answer; learners never count staff-only notes.
        assert threads.plan_steps(db, mine, chat, LEARNER)[1]["updates"] == 3

        assert _denied(threads.person_thread, db, _user(ADMIN), 1, LEARNER, "goal_nope") == 404
        assert _denied(threads.person_thread, db, _user(OTHER), 1, LEARNER) == 403


def test_a_staff_members_thread_is_your_direct_chat_with_them():
    with _session() as db:
        thread = threads.person_thread(db, _user(ADMIN), 1, COACH)
        assert thread["kind"] == "staff" and thread["plans"] == [] and thread["chat_uuid"]
        assert threads.person_thread(db, _user(COACH), 1, ADMIN)["chat_uuid"] == thread["chat_uuid"]
        assert _denied(threads.person_thread, db, _user(ADMIN), 1, ADMIN) == 404


def test_a_groups_thread_lists_its_assignments_and_who_asked_about_each_step():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        chat = school_chats.find(db, 1, LEARNER)
        chats.send(db, _user(LEARNER), chat.conversation_uuid, "How long is the essay?", {"goal_uuid": mine.goal_uuid, "step_uuid": essay.step_uuid})

        thread = threads.group_thread(db, _user(ADMIN), 1, 1)
        assert thread["kind"] == "group" and thread["group"] == {"id": 1, "name": "Fall", "learner_count": len(_group_learners(db))}
        assert [(plan["assignment_uuid"], plan["status"]) for plan in thread["plans"]] == [(uuid, "active")] and thread["plans"][0]["chat_uuid"]
        focused = threads.group_thread(db, _user(ADMIN), 1, 1, uuid)
        assert focused["asked"] == [{"step_key": "essay", "title": "Essay", "learners": [focused["asked"][0]["learners"][0]]}]
        assert focused["asked"][0]["learners"][0]["id"] == LEARNER and focused["counts"]["questions"] == 1
        assert {person["id"] for person in focused["with"]} == {ADMIN, COACH}
        assert _denied(threads.group_thread, db, _user(ADMIN), 1, 1, "assignment_nope") == 404
        assert _denied(threads.group_thread, db, _user(LEARNER), 1, 1) == 403


def _group_learners(db) -> list[int]:
    return list(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == 1)).all())


def test_all_staff_share_one_room_that_follows_who_is_staff():
    with _session() as db:
        room = threads.staff_room_thread(db, _user(COACH), 1)
        conversation = threads.staff_room(db, 1)
        members = set(db.exec(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation.id)).all())
        assert room["chat_uuid"] == conversation.conversation_uuid and members == {ADMIN, COACH, PRINCIPAL}
        assert {person["id"] for person in room["with"]} == {ADMIN, COACH, PRINCIPAL} and room["with"][0]["id"] == COACH
        chats.send(db, _user(COACH), room["chat_uuid"], "Staff meeting at 3")
        assert [message["body"] for message in chats.get_chat(db, _user(PRINCIPAL), room["chat_uuid"])["messages"]] == ["Staff meeting at 3"]
        assert _denied(threads.staff_room_thread, db, _user(LEARNER), 1) == 403
        assert _denied(chats.get_chat, db, _user(LEARNER), room["chat_uuid"]) == 404


def test_the_organizations_thread_is_a_log_of_who_joined_and_who_was_invited():
    from datetime import datetime, timedelta

    with _session() as db:
        db.add(OrganizationInvitation(invitation_uuid="invite_1", org_id=1, email="new@example.com", email_normalized="new@example.com", role_id=4,
                                      created_by_user_id=ADMIN, expires_at=datetime.utcnow() + timedelta(days=7)))
        db.commit()
        thread = threads.org_thread(db, _user(COACH), 1)
        assert thread["can_post"] is False and thread["org"]["name"] == "Studio"
        kinds = [entry["kind"] for entry in thread["entries"]]
        assert kinds[0] == "org_created" and "staff_joined" in kinds and "learners_joined" in kinds and kinds[-1] == "invited"
        invited = thread["entries"][-1]
        assert (invited["count"], invited["role"], invited["pending"], invited["by"]["id"]) == (1, "learner", 1, ADMIN)
        assert _denied(threads.org_thread, db, _user(LEARNER), 1) == 403


def test_the_list_keeps_one_kind_and_pins_the_staff_room_and_the_organization():
    with _session() as db:
        listed = feed.people_feed(db, _user(ADMIN), 1)
        assert [row["kind"] for row in listed["pinned"]] == [threads.STAFF_ROOM, threads.ORG]
        assert listed["pinned"][1]["preview"]

        def everyone(kind: str) -> set[str]:
            found = feed.people_feed(db, _user(ADMIN), 1, kind=kind)
            return {row["key"] for row in [*found["active"], *found["rest"]]}

        assert everyone("staff") == {f"person:{COACH}", f"person:{PRINCIPAL}"}
        assert everyone("learners") >= {f"person:{LEARNER}", f"person:{OTHER}"} and not everyone("learners") & everyone("staff")
        assert everyone("groups") == ({"group:1"} if listed["groups_enabled"] or listed["groups_read_only"] else set())
        assert feed.people_feed(db, _user(ADMIN), 1, kind="learners")["pinned"] == []
        assert feed.people_feed(db, _user(ADMIN), 1, query="lee")["pinned"] == []


def test_anyone_who_reads_a_message_can_cheer_it_but_not_a_staff_only_one_they_cannot_see():
    with _session() as db:
        uuid = _assign(db, VISIT, staff=(ADMIN, COACH))["assignment_uuid"]
        chat = school_chats.find(db, 1, LEARNER)
        assert uuid
        message = chats.send(db, _user(LEARNER), chat.conversation_uuid, "I finished my visit!")
        note = chats.send(db, _user(ADMIN), chat.conversation_uuid, "Nice progress", staff_only=True)

        cheered = reactions.toggle(db, _user(ADMIN), chat.conversation_uuid, message["message_uuid"], "👏")
        assert cheered["reactions"] == [{"emoji": "👏", "count": 1, "mine": True}]
        mine = chats.get_chat(db, _user(LEARNER), chat.conversation_uuid)["messages"]
        assert next(item for item in mine if item["message_uuid"] == message["message_uuid"])["reactions"] == [{"emoji": "👏", "count": 1, "mine": False}]
        # Again takes it back.
        assert reactions.toggle(db, _user(ADMIN), chat.conversation_uuid, message["message_uuid"], "👏")["reactions"] == []
        assert _denied(reactions.toggle, db, _user(LEARNER), chat.conversation_uuid, note["message_uuid"], "👏") == 404
        assert reactions.toggle(db, _user(ADMIN), chat.conversation_uuid, note["message_uuid"], "👏")["reactions"][0]["count"] == 1
