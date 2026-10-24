"""A group assignment's chat: who reads it, staff-only messages, step tags and counts, and keeping
members in step with the assignment's staff and its group."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import Conversation, ConversationMember
from src.db.goal_templates import AssignmentCollaborator, GoalAssignmentRequest, GoalAssignmentUpdate
from src.db.goals import GoalAssignment
from src.db.roles import Role
from src.db.school import GroupStaffSet
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.connect import chats, cohort
from src.services.goals import access, assignments
from src.services.goals.sharing_roles import _role
from src.services.school import staff as group_staff
from src.services.users import usergroups
from src.tests.test_goal_assignments_admin import COACH, ESSAY, NEWCOMER, VISIT, _assign, _goal
from src.tests.test_goal_assignments_admin import _session as _assignments_session
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _user

# An org admin who isn't on any assignment's staff.
PRINCIPAL = 7
TEACHER_ROLE = 7


def _session():
    """COACH teaches (a custom role that can run assignments) rather than administering the org."""
    db = _assignments_session()
    db.add_all([
        Role(id=TEACHER_ROLE, role_uuid="role_teacher", name="Teacher", org_id=1,
             rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}),
        User(id=PRINCIPAL, user_uuid="user_7", username="pria", email="pria@example.com", first_name="Pria", last_name="Principal", creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=PRINCIPAL, org_id=1, role_id=1, creation_date=NOW, update_date=NOW),
    ])
    coach = db.exec(select(UserOrganization).where(UserOrganization.user_id == COACH)).one()
    coach.role_id = TEACHER_ROLE
    db.add(coach)
    db.commit()
    return db


def _chat(db, user_id: int, uuid: str, audience: str) -> dict:
    return cohort.cohort_chat(db, _user(user_id), 1, uuid, audience)


def _denied(db, user_id: int, uuid: str, audience: str) -> int:
    with pytest.raises(HTTPException) as error:
        _chat(db, user_id, uuid, audience)
    return error.value.status_code


def _members(db, conversation_uuid: str) -> set[int]:
    conversation = db.exec(select(Conversation).where(Conversation.conversation_uuid == conversation_uuid)).one()
    return set(db.exec(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation.id)).all())


def _helper(db, uuid: str) -> int:
    """NEWCOMER helps LEARNER on their own plan as a commenter, the way a parent would."""
    goal = _goal(db, LEARNER, uuid)
    access.add_member(db, goal, NEWCOMER, _role(db, goal, "commenter"))
    db.commit()
    return NEWCOMER


def test_one_chat_for_staff_and_the_group_with_staff_only_messages_learners_never_see():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        helper = _helper(db, uuid)

        group = _chat(db, LEARNER, uuid, "group")
        assert group["can_post"] and group["count"] == 0
        assert _members(db, group["conversation_uuid"]) == {ADMIN, PRINCIPAL, COACH, LEARNER, OTHER}
        assert group["topic"]["goal_uuid"] == uuid and [step["step_uuid"] for step in group["topic"]["steps"]] == ["visit", "essay"]
        # "staff" (older callers) is the same chat.
        assert _chat(db, COACH, uuid, "staff")["conversation_uuid"] == group["conversation_uuid"]

        chat_uuid = group["conversation_uuid"]
        chats.send(db, _user(COACH), chat_uuid, "Who still needs a ride?", {"goal_uuid": uuid, "step_uuid": "visit"}, staff_only=True)
        chats.send(db, _user(ADMIN), chat_uuid, "Welcome, everyone")
        # Learners can't send staff-only messages.
        with pytest.raises(HTTPException) as learner:
            chats.send(db, _user(LEARNER), chat_uuid, "Psst", staff_only=True)
        assert learner.value.status_code == 403

        staff_view = chats.get_chat(db, _user(PRINCIPAL), chat_uuid)
        assert [(m["body"], m["staff_only"]) for m in staff_view["messages"]] == [("Who still needs a ride?", True), ("Welcome, everyone", False)]
        assert staff_view["can_post_staff_only"] is True
        assert [m["body"] for m in chats.get_chat(db, _user(ADMIN), chat_uuid, audience="staff")["messages"]] == ["Who still needs a ride?"]
        assert [m["body"] for m in chats.get_chat(db, _user(ADMIN), chat_uuid, audience="learner")["messages"]] == ["Welcome, everyone"]

        # The learner never sees it: not in the chat, its counts, unread, preview or the step's count.
        mine = chats.get_chat(db, _user(LEARNER), chat_uuid)
        assert [m["body"] for m in mine["messages"]] == ["Welcome, everyone"] and mine["can_post_staff_only"] is False
        assert mine["unread"] == 1 and mine["last_message"]["body"] == "Welcome, everyone"
        assert [m["body"] for m in chats.get_chat(db, _user(LEARNER), chat_uuid, audience="staff")["messages"]] == []
        assert _chat(db, LEARNER, uuid, "group")["count"] == 1 and _chat(db, LEARNER, uuid, "group")["counts"] == {}
        assert _chat(db, COACH, uuid, "group")["counts"] == {"visit": 1}
        listed = next(item for item in chats.list_chats(db, _user(OTHER))["chats"] if item["conversation_uuid"] == chat_uuid)
        assert listed["unread"] == 1 and listed["last_message"]["body"] == "Welcome, everyone"

        # A learner's own helper reads none of it.
        assert _denied(db, helper, uuid, "group") == 403
        with pytest.raises(HTTPException) as hidden:
            chats.get_chat(db, _user(helper), chat_uuid)
        assert hidden.value.status_code == 404
        assert _denied(db, LEARNER, uuid, "everyone") == 422
        assert _denied(db, COACH, "goal_assignment_missing", "group") == 404


def test_messages_carry_their_step_and_the_chat_filters_and_counts_by_it():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, COACH))["assignment_uuid"]
        chat_uuid = _chat(db, COACH, uuid, "group")["conversation_uuid"]
        chats.send(db, _user(COACH), chat_uuid, "Who still needs a ride to the campus visit?", {"goal_uuid": uuid, "step_uuid": "visit"})
        chats.send(db, _user(ADMIN), chat_uuid, f"And the <step:{uuid}/essay> rubric is up", {"goal_uuid": uuid})
        chats.send(db, _user(ADMIN), chat_uuid, "Thanks all")

        counted = _chat(db, ADMIN, uuid, "group")
        assert counted["counts"] == {"visit": 1, "essay": 1} and counted["count"] == 3
        assert {step["step_uuid"]: step["count"] for step in counted["topic"]["steps"]} == {"visit": 1, "essay": 1}

        visit = chats.get_chat(db, _user(ADMIN), chat_uuid, goal_uuid=uuid, step_uuid="visit")
        assert [message["body"] for message in visit["messages"]] == ["Who still needs a ride to the campus visit?"]
        # Unfiltered, the message shows which step it's about.
        tag = next(ref for ref in visit["messages"][0]["refs"] if ref.get("scope"))
        assert tag == {**tag, "kind": "step", "goal_uuid": uuid, "step_uuid": "visit", "title": "Visit a campus", "plan_title": tag["plan_title"]}
        everything = chats.get_chat(db, _user(ADMIN), chat_uuid)
        assert len(everything["messages"]) == 3 and everything["topics"][0]["goal_uuid"] == uuid
        assert everything["messages"][1]["preview"] == "And the Essay rubric is up"
        assert len(chats.get_chat(db, _user(ADMIN), chat_uuid, goal_uuid=uuid)["messages"]) == 3
        with pytest.raises(HTTPException) as elsewhere:
            chats.get_chat(db, _user(ADMIN), chat_uuid, goal_uuid="goal_elsewhere")
        assert elsewhere.value.status_code == 404

        # Once the assignment ends, its chat stays to read.
        assignments.end(db, _user(ADMIN), 1, uuid)
        assert not _chat(db, COACH, uuid, "group")["can_post"]
        with pytest.raises(HTTPException) as over:
            chats.send(db, _user(COACH), chat_uuid, "One more thing")
        assert over.value.status_code == 403


def test_members_follow_the_assignments_staff_and_its_group():
    with _session() as db:
        uuid = _assign(db, VISIT, staff=(ADMIN, COACH))["assignment_uuid"]
        group_uuid = _chat(db, ADMIN, uuid, "group")["conversation_uuid"]

        # A learner who leaves the group leaves its chat; their plan stays theirs.
        import asyncio

        asyncio.run(usergroups.remove_users_from_usergroup(None, db, _user(ADMIN), 1, str(OTHER)))  # type: ignore[arg-type]
        assert _members(db, group_uuid) == {ADMIN, PRINCIPAL, COACH, LEARNER}
        assert _denied(db, OTHER, uuid, "group") == 403

        # Staff taken off the assignment leave the chat.
        assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[AssignmentCollaborator(user_id=ADMIN)]))
        assert _members(db, group_uuid) == {ADMIN, PRINCIPAL, LEARNER}

        # The group's staff who cover the assignment are its staff too.
        group_staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=COACH, role_key="commenter", assignment_uuids=[uuid]))
        assert _members(db, group_uuid) == {ADMIN, PRINCIPAL, COACH, LEARNER}
        group_staff.remove_staff(db, _user(ADMIN), 1, 1, COACH)
        assert _members(db, group_uuid) == {ADMIN, PRINCIPAL, LEARNER}


def test_a_person_assignment_talks_in_the_learners_chat_with_the_organization():
    from src.services.school import chats as school_chats

    with _session() as db:
        template = _published(db, VISIT)
        created = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(user_id=LEARNER, collaborators=[AssignmentCollaborator(user_id=COACH)]))
        uuid = created["assignment_uuid"]
        assert _denied(db, COACH, uuid, "group") == 404 and _denied(db, COACH, uuid, "staff") == 404
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == uuid)).one()
        assert cohort.channels(assignment) == ()
        # Staff-only messages there are for staff alone.
        feed = school_chats.school_chat(db, 1, LEARNER)
        db.commit()
        chats.send(db, _user(ADMIN), feed.conversation_uuid, "Mom called about the visit", staff_only=True)
        assert [m["body"] for m in chats.get_chat(db, _user(LEARNER), feed.conversation_uuid)["messages"]] == []
        assert [m["staff_only"] for m in chats.get_chat(db, _user(ADMIN), feed.conversation_uuid)["messages"]] == [True]


def test_an_org_admin_off_the_staff_reads_and_posts_in_both_chats_until_they_stop_being_admin():
    with _session() as db:
        uuid = _assign(db, VISIT, staff=(ADMIN, COACH))["assignment_uuid"]
        staff = _chat(db, PRINCIPAL, uuid, "group")
        assert staff["can_post"] and PRINCIPAL in _members(db, staff["conversation_uuid"])
        assert chats.send(db, _user(PRINCIPAL), staff["conversation_uuid"], "Field trip forms are in the office", {"goal_uuid": uuid, "step_uuid": "visit"})["mine"]
        visit = chats.get_chat(db, _user(COACH), staff["conversation_uuid"], goal_uuid=uuid, step_uuid="visit")
        assert [message["body"] for message in visit["messages"]] == ["Field trip forms are in the office"]
        assert chats.send(db, _user(PRINCIPAL), staff["conversation_uuid"], "Welcome, everyone")["mine"]

        # A former admin loses the chats as soon as their role changes, and a new one gets them.
        row = db.exec(select(UserOrganization).where(UserOrganization.user_id == PRINCIPAL)).one()
        row.role_id = 4
        db.add(row)
        db.commit()
        assert _denied(db, PRINCIPAL, uuid, "group") == 403
        with pytest.raises(HTTPException) as gone:
            chats.get_chat(db, _user(PRINCIPAL), staff["conversation_uuid"])
        assert gone.value.status_code == 404
        row.role_id = 1
        db.add(row)
        db.commit()
        assert chats.get_chat(db, _user(PRINCIPAL), staff["conversation_uuid"])["can_post"]
