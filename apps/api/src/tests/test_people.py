"""People and the org messaging policy: who can message whom, helpers kept to their plan, group chats, and leaving an organization."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ConversationMember, DirectChatOpen
from src.db.goals import GoalAssignmentCreate, StepStatus
from src.db.organization_config import MessagingPolicy, OrganizationConfig
from src.db.goal_sharing import PlanCollaborator, PlanCollaboratorRequestCreate, PlanInvitation, PlanInvitationCreate, PlanRole
from src.db.roles import Role
from src.db.school import GroupStaffSet, UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.connect import chats, people, workspace
from src.services.goals import assignments, goals, helper_requests, sharing
from src.services.orgs.membership import assigned_user_ids, cleanup_after_removal
from src.services.school import chats as school_chats, directory, feed, group_chats, messaging, profile, staff
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _status, _step, _user
from src.tests.test_school import TEACHER, _goal, _session as _school_session

HELPER = 5
HELPER_EMAIL = "parent@example.com"
STAFF_ROLE = 5


def _session(tier: str = "full", **policy):
    """The school session, with the teacher on a custom staff role (not a maintainer, so not an admin) and a parent to invite."""
    db = _school_session()
    db.add(Role(id=STAFF_ROLE, org_id=1, name="Counselor", role_uuid="role_counselor", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.exec(select(UserOrganization).where(UserOrganization.user_id == TEACHER)).one().role_id = STAFF_ROLE
    db.add(User(id=HELPER, user_uuid="user_5", username="parent", email=HELPER_EMAIL, first_name="Pat", last_name="Parent", creation_date=NOW, update_date=NOW))
    db.add(OrganizationConfig(org_id=1, config={"config_version": "3.0", "tier": tier, "messaging": MessagingPolicy(**policy).model_dump()}))
    db.commit()
    return db


def _assigned(db) -> str:
    template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
    return assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))["assignment_uuid"]


def _add_helper(db, goal) -> None:
    """The learner asks for their parent on the plan, plan staff approve, and the parent accepts."""
    request = sharing.create_collaborator_request(db, _user(LEARNER), goal.goal_uuid, PlanCollaboratorRequestCreate(email=HELPER_EMAIL, role_key="commenter"))
    sharing.respond_to_collaborator_request(db, _user(ADMIN), goal.goal_uuid, request["request_uuid"], True)
    invitation = db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id)).first()
    if invitation.status == "pending":
        sharing.respond_to_invitation(db, _user(HELPER), invitation.invitation_uuid, True)


def _open(db, by: int, to: str) -> dict:
    return chats.open_direct(db, _user(by), DirectChatOpen(handle=to))


def test_the_policy_lives_in_the_org_config_and_only_admins_change_it():
    with _session() as db:
        assert messaging.get_policy(db, _user(TEACHER), 1) == {"staff_dm_learners": True, "min_two_staff_on_feeds": False, "helper_approval": False}
        with pytest.raises(HTTPException) as learner:
            messaging.get_policy(db, _user(LEARNER), 1)
        assert learner.value.status_code == 403
        with pytest.raises(HTTPException):
            messaging.update_policy(db, _user(TEACHER), 1, MessagingPolicy(staff_dm_learners=True))
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=False, helper_approval=True))
        stored = db.exec(select(OrganizationConfig)).one().config
        assert stored["tier"] == "full" and stored["messaging"]["staff_dm_learners"] is False and stored["messaging"]["helper_approval"]


def test_a_fresh_org_lets_staff_message_learners_directly():
    with _session() as db:
        # An organization whose config has no messaging block yet keeps today's behaviour.
        row = db.exec(select(OrganizationConfig)).one()
        row.config = {key: value for key, value in row.config.items() if key != "messaging"}
        db.add(row)
        db.commit()
        assert messaging.policy(db, 1) == MessagingPolicy(staff_dm_learners=True, min_two_staff_on_feeds=False, helper_approval=False)
        people.update_settings(db, _user(LEARNER), True)
        direct = _open(db, TEACHER, "lee")
        assert direct["kind"] == "direct" and direct["policy_block"] is None
        chats.send(db, _user(TEACHER), direct["conversation_uuid"], "Hi Lee")


def test_staff_message_learners_directly_only_when_the_org_allows_it():
    with _session(staff_dm_learners=False) as db:
        people.update_settings(db, _user(LEARNER), True)
        with pytest.raises(HTTPException) as kept_in_feeds:
            _open(db, TEACHER, "lee")
        assert kept_in_feeds.value.status_code == 403 and "plan feeds" in kept_in_feeds.value.detail
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=True))
        direct = _open(db, TEACHER, "lee")
        assert direct["kind"] == "direct" and direct["policy_block"] is None
        chats.send(db, _user(TEACHER), direct["conversation_uuid"], "Hi Lee")
        # Turning it off again stops the chat that's already there.
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=False))
        assert not chats.get_chat(db, _user(TEACHER), direct["conversation_uuid"])["can_post"]
        with pytest.raises(HTTPException) as stopped:
            chats.send(db, _user(TEACHER), direct["conversation_uuid"], "Still there?")
        assert stopped.value.status_code == 403
        # Staff of the learner's group always talk with them in the learner's chat with the organization, whatever the policy.
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert _open(db, TEACHER, "lee")["kind"] == "school"
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=True))
        assert _open(db, TEACHER, "lee")["kind"] == "school"
        # Learners still talk among themselves.
        people.update_settings(db, _user(OTHER), True)
        assert _open(db, LEARNER, "sam")["kind"] == "direct"


def test_helpers_see_only_their_plan_and_are_never_messaged_directly():
    with _session() as db:
        first = _goal(db, LEARNER, _assigned(db))
        second = _goal(db, LEARNER, _assigned(db))
        _add_helper(db, first)
        assert db.exec(select(PlanCollaborator).where(PlanCollaborator.user_id == HELPER, PlanCollaborator.active == True)).first()  # noqa: E712
        org_chat = school_chats.find(db, 1, LEARNER)
        members = {row.user_id for row in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == org_chat.id)).all()}
        assert HELPER not in members and {LEARNER, ADMIN} <= members
        # The helper's chat is that plan's own, with the learner and its staff, about that plan alone.
        found = workspace.goal_chat(db, _user(HELPER), first.goal_uuid)
        assert found["conversation_uuid"] and found["conversation_uuid"] != org_chat.conversation_uuid and found["can_post"]
        chat = chats.get_chat(db, _user(HELPER), found["conversation_uuid"])
        assert [topic["goal_uuid"] for topic in chat["topics"]] == [first.goal_uuid]
        assert {person["username"] for person in chat["people"]} >= {"lee", "teacher"}
        with pytest.raises(HTTPException):
            workspace.goal_chat(db, _user(HELPER), second.goal_uuid)
        # Staff never message them one to one, whatever the policy.
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=True))
        with pytest.raises(HTTPException) as helper_dm:
            _open(db, ADMIN, "parent")
        assert helper_dm.value.status_code == 403 and helper_dm.value.detail == messaging.HELPER_DM
        assert _open(db, HELPER, "lee")["kind"] == "direct"


def test_helpers_wait_for_an_admin_when_the_org_asks_for_approval():
    with _session(helper_approval=True) as db:
        goal = _goal(db, LEARNER, _assigned(db))
        # This organization lets learners invite people onto their plans themselves.
        subject = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == "subject")).one()
        subject.capabilities = [*subject.capabilities, "manage_collaborators"]
        subject.grantable_role_keys = ["commenter"]
        db.add(subject)
        db.commit()
        held = sharing.create_invitation(db, _user(LEARNER), goal.goal_uuid, PlanInvitationCreate(email=HELPER_EMAIL, role_key="commenter"))
        assert held["status"] == "awaiting_approval"
        invitation = db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id)).one()
        assert invitation.status == "awaiting_approval"
        assert not sharing.list_my_invitations(db, _user(HELPER))
        with pytest.raises(HTTPException):
            helper_requests.list_requests(db, _user(TEACHER), 1)
        waiting = helper_requests.list_requests(db, _user(ADMIN), 1)
        assert waiting["total"] == 1 and waiting["requests"][0]["learner"]["username"] == "lee" and waiting["requests"][0]["goal"]["goal_uuid"] == goal.goal_uuid
        approved = helper_requests.decide(db, _user(ADMIN), 1, invitation.invitation_uuid, approve=True)
        assert approved["status"] == "pending" and db.get(PlanInvitation, invitation.id).reviewed_by_user_id == ADMIN
        assert [item["goal"]["goal_uuid"] for item in sharing.list_my_invitations(db, _user(HELPER))] == [goal.goal_uuid]
        with pytest.raises(HTTPException) as twice:
            helper_requests.decide(db, _user(ADMIN), 1, invitation.invitation_uuid, approve=False)
        assert twice.value.status_code == 409
        # Staff inviting someone themselves don't wait.
        assert not helper_requests.needs_approval(db, goal, ADMIN)


def test_a_plan_feed_takes_messages_once_two_staff_are_on_it_when_the_org_asks():
    with _session(min_two_staff_on_feeds=True) as db:
        _assigned(db)
        uuid = school_chats.school_chat(db, 1, LEARNER).conversation_uuid
        db.commit()
        chat = chats.get_chat(db, _user(LEARNER), uuid)
        assert chat["policy_block"] and not chat["can_post"]
        with pytest.raises(HTTPException) as one_staff:
            chats.send(db, _user(ADMIN), uuid, "Welcome")
        assert one_staff.value.status_code == 403
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert chats.send(db, _user(ADMIN), uuid, "Welcome")["body"] == "Welcome"


def test_group_chats_come_with_the_full_tier(monkeypatch):
    # Not the owner org, which has every feature.
    monkeypatch.setattr("src.security.access.access.owner_org_id", lambda *_args: None)
    with _session("free") as db:
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert directory.chat_list(db, _user(TEACHER), 1)["groups_enabled"] is False
        with pytest.raises(HTTPException) as no_package:
            group_chats.open_group_chat(db, _user(TEACHER), 1, 1)
        assert no_package.value.status_code == 403
    with _session() as db:
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        listed = directory.chat_list(db, _user(TEACHER), 1)
        group = next(chat for chat in listed["chats"] if chat["kind"] == "group")
        assert group["title"] == "Fall" and group["group_id"] == 1 and {person["username"] for person in group["people"]} == {"lee", "sam"}
        chats.send(db, _user(TEACHER), group["conversation_uuid"], "Field trip Friday")
        assert chats.list_chats(db, _user(LEARNER))["chats"][0]["kind"] == "group"
        # Someone outside the group can't open it, and members leaving drop out.
        with pytest.raises(HTTPException):
            group_chats.open_group_chat(db, _user(ADMIN), 1, 1)
        db.delete(db.exec(select(UserGroupUser).where(UserGroupUser.user_id == OTHER)).one())
        db.flush()
        group_chats.members_left(db, db.get(UserGroup, 1), [str(OTHER)])
        assert {person["username"] for person in chats.get_chat(db, _user(TEACHER), group["conversation_uuid"])["people"]} == {"lee"}


def test_the_directory_labels_everyone_and_profiles_follow_the_policy():
    with _session(staff_dm_learners=False) as db:
        goal = _goal(db, LEARNER, _assigned(db))
        _add_helper(db, goal)
        listed = directory.directory(db, _user(TEACHER), 1)
        assert {(item["user"]["username"], item["role"]) for item in listed["people"]} == {("teacher", "admin"), ("teach", "staff"), ("lee", "learner"), ("sam", "learner")}
        found = directory.directory(db, _user(TEACHER), 1, "pat")["people"]
        assert [(item["user"]["username"], item["role"], [plan["title"] for plan in item["helping_on"]]) for item in found] == [("parent", "helper", [goal.title])]
        with pytest.raises(HTTPException):
            directory.directory(db, _user(LEARNER), 1)
        lee = profile.profile(db, _user(ADMIN), 1, "lee")
        assert lee["role"] == "learner" and [plan["goal_uuid"] for plan in lee["plans"]] == [goal.goal_uuid]
        assert [helper["user"]["username"] for helper in lee["helpers"]] == ["parent"]
        assert not lee["can_message"] and "plan feeds" in lee["note"] and lee["manage"]["remove"]
        # Staff see the plans they're on; a staff member outside the learner's group and plans sees none.
        assert profile.profile(db, _user(TEACHER), 1, "lee")["plans"] == []
        parent = profile.profile(db, _user(ADMIN), 1, "parent")
        assert parent["role"] == "helper" and parent["note"] == messaging.HELPER_DM and parent["helping_on"][0]["goal_uuid"] == goal.goal_uuid
        assert profile.profile(db, _user(ADMIN), 1, "teach")["can_message"]


def test_leaving_the_org_takes_someone_off_its_groups_chats_and_plans():
    with _session() as db:
        goal = _goal(db, LEARNER, _assigned(db))
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        group_chats.open_group_chat(db, _user(TEACHER), 1, 1)
        org_chat = school_chats.find(db, 1, LEARNER)
        assert TEACHER in {row.user_id for row in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == org_chat.id)).all()}
        assert assigned_user_ids(db, 1) == {LEARNER, OTHER} and assigned_user_ids(db, 1, TEACHER) == {LEARNER, OTHER}
        db.delete(db.exec(select(UserOrganization).where(UserOrganization.user_id == TEACHER)).one())
        db.flush()
        cleanup_after_removal(db, 1, TEACHER)
        db.commit()
        assert not db.exec(select(UserGroupStaff).where(UserGroupStaff.user_id == TEACHER)).all()
        assert not db.exec(select(ConversationMember).where(ConversationMember.user_id == TEACHER)).all()
        assert not db.exec(select(PlanCollaborator).where(PlanCollaborator.user_id == TEACHER, PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True)).all()  # noqa: E712
        # A learner leaving comes off its groups.
        db.delete(db.exec(select(UserOrganization).where(UserOrganization.user_id == OTHER)).one())
        db.flush()
        cleanup_after_removal(db, 1, OTHER)
        assert not db.exec(select(UserGroupUser).where(UserGroupUser.user_id == OTHER)).all()


ESSAY = {"key": "essay", "type": "task", "title": "Write an essay", "review_required": True}


def _awaiting_helper(db, goal) -> PlanInvitation:
    """The learner invites their parent onto an organization's plan, and it waits for an admin."""
    subject = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == "subject")).one()
    subject.capabilities = [*subject.capabilities, "manage_collaborators"]
    subject.grantable_role_keys = ["commenter"]
    db.add(subject)
    db.commit()
    sharing.create_invitation(db, _user(LEARNER), goal.goal_uuid, PlanInvitationCreate(email=HELPER_EMAIL, role_key="commenter"))
    return db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id)).one()


def _turn_in(db, goal) -> str:
    goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
    step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), ESSAY["title"])
    _status(db, LEARNER, goal, step, StepStatus.COMPLETED)
    return step["step_uuid"]


def _essay(db) -> str:
    template = _published(db, ESSAY)
    return assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))["assignment_uuid"]


def test_the_people_feed_puts_whoever_has_something_new_on_top_and_everyone_else_a_to_z():
    with _session(["advanced_user_management"], helper_approval=True) as db:
        goal = _goal(db, LEARNER, _essay(db))
        _awaiting_helper(db, goal)
        _turn_in(db, goal)
        people.update_settings(db, _user(ADMIN), True)
        direct = _open(db, TEACHER, "teacher")
        chats.send(db, _user(TEACHER), direct["conversation_uuid"], "Can we talk about Lee?")

        listed = feed.people_feed(db, _user(ADMIN), 1)
        top = {row["key"]: row for row in listed["active"]}
        lee = top[f"person:{LEARNER}"]
        assert lee["counts"] == {"messages": 0, "turn_ins": 1, "approvals": 1} and lee["total"] == 2 and lee["role"] == "learner"
        assert lee["preview"] == "Turned in “Write an essay” · Pat Parent asks to help on “College ready”"
        teach = top[f"person:{TEACHER}"]
        assert teach["counts"]["messages"] == 1 and teach["preview"] == "Can we talk about Lee?" and teach["chat_uuid"] == direct["conversation_uuid"]
        assert all(row["total"] for row in listed["active"])
        # Everyone else, people and groups mixed A to Z, without the viewer or anyone already on top.
        assert [(row["kind"], (row["person"] or row["group"])["id"]) for row in listed["rest"]] == [("group", 1), ("person", OTHER)]
        assert listed["rest"][0]["group"]["member_count"] == 2 and listed["rest"][1]["role"] == "learner"
        assert listed["total"] == 2 and listed["groups_enabled"] and listed["is_admin"]
        # Paged: the top stays put and later pages skip it.
        second = feed.people_feed(db, _user(ADMIN), 1, offset=1, limit=1)
        assert second["active"] == [] and [row["key"] for row in second["rest"]] == [f"person:{OTHER}"]
        # Search covers both halves; helpers turn up when searched for.
        assert [row["key"] for row in feed.people_feed(db, _user(ADMIN), 1, "lee")["active"]] == [f"person:{LEARNER}"]
        assert feed.people_feed(db, _user(ADMIN), 1, "fal")["rest"][0]["key"] == "group:1"
        # Answering and reading the chat clears its count; it stays near the top as a recent conversation.
        chats.accept(db, _user(ADMIN), direct["conversation_uuid"])
        chats.mark_read(db, _user(ADMIN), direct["conversation_uuid"])
        again = {row["key"]: row for row in feed.people_feed(db, _user(ADMIN), 1)["active"]}
        assert again[f"person:{TEACHER}"]["total"] == 0 and list(again)[0] == f"person:{LEARNER}"
        # Staff who don't review the plan or approve helpers see none of it; learners can't open People.
        assert f"person:{LEARNER}" not in {row["key"] for row in feed.people_feed(db, _user(TEACHER), 1)["active"]}
        with pytest.raises(HTTPException) as learner:
            feed.people_feed(db, _user(LEARNER), 1)
        assert learner.value.status_code == 403


def test_group_staff_see_their_students_new_messages_in_the_feed():
    with _session() as db:
        _assigned(db)
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        school = _open(db, TEACHER, "lee")
        assert school["kind"] == "school" and profile.profile(db, _user(TEACHER), 1, "lee")["chat_uuid"] == school["conversation_uuid"]
        chats.send(db, _user(LEARNER), school["conversation_uuid"], "Is my essay ok?")
        row = next(row for row in feed.people_feed(db, _user(TEACHER), 1)["active"] if row["key"] == f"person:{LEARNER}")
        assert row["counts"]["messages"] == 1 and row["chat_uuid"] == school["conversation_uuid"] and row["preview"] == "Lee Arner: Is my essay ok?"


def test_a_persons_activity_cards_are_their_helper_requests_and_steps_waiting_on_you():
    with _session(helper_approval=True) as db:
        goal = _goal(db, LEARNER, _essay(db))
        invitation = _awaiting_helper(db, goal)
        step_uuid = _turn_in(db, goal)
        cards = feed.person_activity(db, _user(ADMIN), 1, "lee")
        assert cards["can_approve"] and [item["invitation_uuid"] for item in cards["approvals"]] == [invitation.invitation_uuid]
        assert [(item["step_uuid"], item["step_key"], item["plan_title"]) for item in cards["turn_ins"]] == [(step_uuid, "essay", goal.title)]
        assert cards["turn_ins"][0]["assignment_uuid"]
        # Staff who don't review it see no cards; learners can't ask.
        assert feed.person_activity(db, _user(TEACHER), 1, "lee") == {"approvals": [], "turn_ins": [], "can_approve": False}
        with pytest.raises(HTTPException) as learner:
            feed.person_activity(db, _user(OTHER), 1, "lee")
        assert learner.value.status_code == 403
        # Approving through the existing endpoint clears the card.
        helper_requests.decide(db, _user(ADMIN), 1, invitation.invitation_uuid, approve=True)
        assert feed.person_activity(db, _user(ADMIN), 1, "lee")["approvals"] == []


def test_a_groups_header_lists_its_staff_first_for_admins_and_its_own_people():
    with _session(["advanced_user_management"]) as db:
        with pytest.raises(HTTPException) as outside:
            feed.group_detail(db, _user(TEACHER), 1, 1)
        assert outside.value.status_code == 404
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        group = feed.group_detail(db, _user(TEACHER), 1, 1)
        assert [(item["user"]["username"], item["as"]) for item in group["people"]] == [("teach", "staff"), ("lee", "member"), ("sam", "member")]
        assert (group["learner_count"], group["staff_count"], group["can_manage"], group["in_chat"]) == (2, 1, False, True)
        assert feed.group_detail(db, _user(ADMIN), 1, 1)["can_manage"]
        with pytest.raises(HTTPException):
            feed.group_detail(db, _user(LEARNER), 1, 1)


def test_a_new_groups_chat_opens_with_who_created_it_and_it_lands_on_top(monkeypatch):
    import asyncio

    from src.db.conversations import ConversationMessage
    from src.db.usergroups import UserGroupCreate
    from src.services.users import usergroups

    async def allowed(*_args, **_kwargs):
        return True

    monkeypatch.setattr(usergroups, "rbac_check", allowed)
    with _session() as db:
        created = asyncio.run(usergroups.create_usergroup(None, db, _user(ADMIN), UserGroupCreate(name="Spring", description="", org_id=1)))  # type: ignore[arg-type]
        # Posted once, from its creator, even if asked again.
        group_chats.announce_created(db, db.get(UserGroup, created.id), ADMIN)
        lines = db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == group_chats.find(db, created.id).id)).all()
        assert [(line.body, line.sender_user_id, line.card["type"]) for line in lines] == [("Tea Cher created this group", ADMIN, "event")]
        # The creator isn't in it, yet it's on top for them rather than in A to Z.
        listed = feed.people_feed(db, _user(ADMIN), 1)
        mine = next(row for row in listed["active"] if row["key"] == f"group:{created.id}")
        assert mine["preview"] == "You created this group" and mine["total"] == 0 and mine["group"]["name"] == "Spring"
        assert f"group:{created.id}" not in {row["key"] for row in listed["rest"]}
        # Someone added afterwards sees it as new, with who created it.
        staff.set_staff(db, _user(ADMIN), 1, created.id, GroupStaffSet(user_id=TEACHER))
        theirs = next(row for row in feed.people_feed(db, _user(TEACHER), 1)["active"] if row["key"] == f"group:{created.id}")
        assert theirs["counts"]["messages"] == 1 and theirs["preview"] == "Tea Cher created this group"
        assert chats.get_chat(db, _user(TEACHER), theirs["chat_uuid"])["messages"][0]["card"]["verb"] == "created this group"
