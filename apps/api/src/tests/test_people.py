"""People and the org messaging policy: who can message whom, helpers kept to their plan, group chats, and leaving an organization."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ConversationMember, DirectChatOpen
from src.db.goals import GoalAssignmentCreate
from src.db.organization_config import MessagingPolicy, OrganizationConfig
from src.db.planning import PlanCollaborator, PlanCollaboratorRequestCreate, PlanInvitation, PlanInvitationCreate, PlanRole
from src.db.roles import Role
from src.db.school import GroupStaffSet, UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.connect import chats, people, workspace
from src.services.goals import assignments, helper_requests, sharing
from src.services.orgs.membership import assigned_user_ids, cleanup_after_removal
from src.services.school import chats as school_chats, directory, group_chats, messaging, profile, staff
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _user
from src.tests.test_school import TEACHER, _goal, _session as _school_session

HELPER = 5
HELPER_EMAIL = "parent@example.com"
STAFF_ROLE = 5


def _session(packages: list[str] | None = None, **policy):
    """The school session, with the teacher on a custom staff role (not a maintainer, so not an admin) and a parent to invite."""
    db = _school_session()
    db.add(Role(id=STAFF_ROLE, org_id=1, name="Counselor", role_uuid="role_counselor", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.exec(select(UserOrganization).where(UserOrganization.user_id == TEACHER)).one().role_id = STAFF_ROLE
    db.add(User(id=HELPER, user_uuid="user_5", username="parent", email=HELPER_EMAIL, first_name="Pat", last_name="Parent", creation_date=NOW, update_date=NOW))
    db.add(OrganizationConfig(org_id=1, config={"config_version": "2.0", "plan": "full", "packages": packages or [], "messaging": MessagingPolicy(**policy).model_dump()}))
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
        assert messaging.get_policy(db, _user(TEACHER), 1) == {"staff_dm_learners": False, "min_two_staff_on_feeds": False, "helper_approval": False}
        with pytest.raises(HTTPException) as learner:
            messaging.get_policy(db, _user(LEARNER), 1)
        assert learner.value.status_code == 403
        with pytest.raises(HTTPException):
            messaging.update_policy(db, _user(TEACHER), 1, MessagingPolicy(staff_dm_learners=True))
        messaging.update_policy(db, _user(ADMIN), 1, MessagingPolicy(staff_dm_learners=True, helper_approval=True))
        stored = db.exec(select(OrganizationConfig)).one().config
        assert stored["plan"] == "full" and stored["messaging"]["staff_dm_learners"] and stored["messaging"]["helper_approval"]


def test_staff_message_learners_directly_only_when_the_org_allows_it():
    with _session() as db:
        people.update_settings(db, _user(LEARNER), True)
        with pytest.raises(HTTPException) as kept_in_feeds:
            _open(db, TEACHER, "lee")
        assert kept_in_feeds.value.status_code == 403 and "plan feeds" in kept_in_feeds.value.detail
        # Staff of the learner's group are pointed at the learner's chat with the organization instead.
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert _open(db, TEACHER, "lee")["kind"] == "school"
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


def test_group_chats_come_with_the_groups_package():
    with _session() as db:
        staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert directory.chat_list(db, _user(TEACHER), 1)["groups_enabled"] is False
        with pytest.raises(HTTPException) as no_package:
            group_chats.open_group_chat(db, _user(TEACHER), 1, 1)
        assert no_package.value.status_code == 403
    with _session(["advanced_user_management"]) as db:
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
    with _session() as db:
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
    with _session(["advanced_user_management"]) as db:
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
