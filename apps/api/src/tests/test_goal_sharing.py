"""Sharing and lifecycle of goals, ported from test_planning.py and test_plan_invitation_organization.py."""

from datetime import date

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, select

from src.db.goals import Goal, GoalAssignmentCreate, GoalCreate
from src.db.media import MediaAsset, MediaOwnerType, MediaSourceType, MediaType
from src.db.messages import InboxMessage
from src.db.planning import (
    OrganizationPlanRoleCreate,
    OrganizationPlanRoleUpdate,
    PlanAttachment,
    PlanAttachmentCreate,
    PlanCollaboratorRequest,
    PlanCollaboratorRequestCreate,
    PlanCollaboratorUpdate,
    PlanCommentCreate,
    PlanInvitation,
    PlanInvitationCreate,
    PlanOwnershipTransfer,
    PlanRole,
    PlanRoleUpdate,
)
from src.services.goals import assignments, goals, lifecycle, sharing, sharing_log, sharing_roles
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _issue, _published, _session as _goal_session, _user

LEARNER_EMAIL, OTHER_EMAIL = "l@example.com", "s@example.com"


def _session() -> Session:
    db = _goal_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[
        PlanInvitation.__table__, PlanCollaboratorRequest.__table__, PlanAttachment.__table__, InboxMessage.__table__,  # type: ignore[attr-defined]
    ])
    return db


def _personal(db: Session, user_id: int = LEARNER, title: str = "Earn a nursing degree") -> dict:
    return goals.create_personal_goal(db, _user(user_id), GoalCreate(title=title, target_date=date(2027, 12, 31)))


def _invite(db: Session, goal_uuid: str, email: str, role_key: str, by: int = LEARNER) -> dict:
    return sharing.create_invitation(db, _user(by), goal_uuid, PlanInvitationCreate(email=email, role_key=role_key))


def _join(db: Session, goal_uuid: str, user_id: int, email: str, role_key: str, by: int = LEARNER) -> None:
    invitation = _invite(db, goal_uuid, email, role_key, by)
    sharing.respond_to_invitation(db, _user(user_id), invitation["invitation_uuid"], True)


def _issued(db: Session) -> Goal:
    return _issue(db, _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"}))


def test_personal_goal_is_private_and_owner_controlled():
    with _session() as db:
        created = _personal(db)
        assert {"delete_plan", "transfer_ownership", "manage_roles"} <= set(created["capabilities"])
        assert goals.list_my_goals(db, _user(OTHER)) == []
        with pytest.raises(HTTPException) as denied:
            sharing_roles.people(db, _user(OTHER), created["goal_uuid"])
        assert denied.value.status_code == 404
        people = sharing_roles.people(db, _user(LEARNER), created["goal_uuid"])
        assert people["is_owner"] and [item["user"]["id"] for item in people["collaborators"]] == [LEARNER]
        owner = people["collaborators"][0]
        assert owner["is_owner"] and owner["is_subject"] and owner["role"]["key"] == "plan_admin"
        assert {"subject", "reviewer", "plan_admin", "viewer"} <= {role["key"] for role in people["roles"]}
        assert next(role for role in people["roles"] if role["key"] == "plan_admin")["locked"]


def test_recipient_bound_invitation_grants_goal_access():
    with _session() as db:
        created = _personal(db)
        invitation = _invite(db, created["goal_uuid"], OTHER_EMAIL, "reviewer")
        message = db.exec(select(InboxMessage).where(InboxMessage.action_kind == "goal_invitation")).one()
        assert message.recipient_user_id == OTHER and message.action_status == "pending"
        assert message.action_data["goal_uuid"] == created["goal_uuid"]
        inbox = sharing.list_my_invitations(db, _user(OTHER))
        assert [item["invitation_uuid"] for item in inbox] == [invitation["invitation_uuid"]]
        assert inbox[0]["goal"]["title"] == "Earn a nursing degree" and inbox[0]["unread"]
        sharing.respond_to_invitation(db, _user(OTHER), invitation["invitation_uuid"], True)
        db.refresh(message)
        assert message.action_status == "accepted"
        helper = goals.get_goal(db, _user(OTHER), created["goal_uuid"])
        assert "complete_restricted_objectives" in helper["capabilities"] and helper["subject"]["id"] == LEARNER
        people = sharing_roles.people(db, _user(LEARNER), created["goal_uuid"])
        assert {item["user"]["id"]: item["role"]["key"] for item in people["collaborators"]} == {LEARNER: "plan_admin", OTHER: "reviewer"}
        assert people["invitations"][0]["status"] == "accepted"
        assert [item["goal_uuid"] for item in goals.list_my_goals(db, _user(OTHER))] == [created["goal_uuid"]]


def test_owner_can_take_back_an_unanswered_invitation():
    with _session() as db:
        created = _personal(db)
        invitation = _invite(db, created["goal_uuid"], OTHER_EMAIL, "viewer")
        with pytest.raises(HTTPException) as twice:
            _invite(db, created["goal_uuid"], OTHER_EMAIL, "viewer")
        assert twice.value.status_code == 409
        with pytest.raises(HTTPException) as not_owner:
            sharing.revoke_invitation(db, _user(OTHER), created["goal_uuid"], invitation["invitation_uuid"])
        assert not_owner.value.status_code in {403, 404}
        sharing.revoke_invitation(db, _user(LEARNER), created["goal_uuid"], invitation["invitation_uuid"])
        assert sharing.list_my_invitations(db, _user(OTHER)) == []
        assert db.exec(select(InboxMessage).where(InboxMessage.action_kind == "goal_invitation")).one().action_status == "revoked"
        with pytest.raises(HTTPException) as accept_late:
            sharing.respond_to_invitation(db, _user(OTHER), invitation["invitation_uuid"], True)
        assert accept_late.value.status_code in {404, 409}
        _invite(db, created["goal_uuid"], OTHER_EMAIL, "viewer")


def test_members_can_leave_but_the_owner_cannot():
    with _session() as db:
        created = _personal(db)
        _join(db, created["goal_uuid"], OTHER, OTHER_EMAIL, "viewer")
        assert sharing.leave(db, _user(OTHER), created["goal_uuid"])["left"] is True
        with pytest.raises(HTTPException) as hidden:
            goals.get_goal(db, _user(OTHER), created["goal_uuid"])
        assert hidden.value.status_code == 404
        with pytest.raises(HTTPException) as owner_cannot_leave:
            sharing.leave(db, _user(LEARNER), created["goal_uuid"])
        assert owner_cannot_leave.value.status_code == 422


def test_comments_activity_and_goal_scoped_attachments():
    with _session() as db:
        created = _personal(db)
        db.add(MediaAsset(
            asset_uuid="asset_evidence", owner_type=MediaOwnerType.user, owner_user_id=LEARNER, created_by_user_id=LEARNER,
            source_type=MediaSourceType.upload, media_type=MediaType.image, title="Evidence", url="/evidence.png",
            filename="evidence.png", mime_type="image/png", creation_date=NOW, update_date=NOW,
        ))
        db.add(MediaAsset(
            asset_uuid="asset_other", owner_type=MediaOwnerType.user, owner_user_id=OTHER, created_by_user_id=OTHER,
            source_type=MediaSourceType.upload, media_type=MediaType.image, title="Other", url="/other.png",
            filename="other.png", mime_type="image/png", creation_date=NOW, update_date=NOW,
        ))
        db.commit()
        uuid = created["goal_uuid"]
        comment = sharing_log.add_comment(db, _user(LEARNER), uuid, PlanCommentCreate(body="  Useful context  "))
        assert comment["action"] == "comment.added" and comment["payload"]["body"] == "Useful context"
        assert sharing_log.add_attachment(db, _user(LEARNER), uuid, PlanAttachmentCreate(asset_uuid="asset_evidence"))["mime_type"] == "image/png"
        with pytest.raises(HTTPException) as foreign:
            sharing_log.add_attachment(db, _user(LEARNER), uuid, PlanAttachmentCreate(asset_uuid="asset_other"))
        assert foreign.value.status_code == 403
        assert [item["asset_uuid"] for item in sharing_log.list_attachments(db, _user(LEARNER), uuid)] == ["asset_evidence"]
        assert sharing_log.remove_attachment(db, _user(LEARNER), uuid, "asset_evidence")["removed"] is True
        actions = {item["action"] for item in sharing_log.list_activity(db, _user(LEARNER), uuid)}
        assert {"goal.created", "comment.added", "attachment.added", "attachment.removed"} <= actions


def test_learner_role_can_request_but_not_directly_invite_a_collaborator():
    with _session() as db:
        created = _personal(db)
        _join(db, created["goal_uuid"], OTHER, OTHER_EMAIL, "subject")
        with pytest.raises(HTTPException) as denied:
            _invite(db, created["goal_uuid"], "reviewer@example.com", "reviewer", by=OTHER)
        assert denied.value.status_code == 403
        request = sharing.create_collaborator_request(db, _user(OTHER), created["goal_uuid"], PlanCollaboratorRequestCreate(
            email="reviewer@example.com", role_key="reviewer", message="Please review my work",
        ))
        assert request["status"] == "pending"
        assert [item["request_uuid"] for item in sharing.list_collaborator_requests(db, _user(OTHER), created["goal_uuid"])] == [request["request_uuid"]]
        resolved = sharing.respond_to_collaborator_request(db, _user(LEARNER), created["goal_uuid"], request["request_uuid"], True)
        assert resolved["status"] == "approved" and resolved["invitation"]["email"] == "reviewer@example.com"


def test_learner_is_fixed_but_their_role_can_change_and_goal_admin_is_locked():
    with _session() as db:
        goal = _issued(db)
        people = sharing_roles.people(db, _user(ADMIN), goal.goal_uuid)
        learner = next(item for item in people["collaborators"] if item["user"]["id"] == LEARNER)
        assert learner["is_subject"] and learner["role"]["key"] == "subject"
        updated = sharing.update_collaborator(db, _user(ADMIN), goal.goal_uuid, learner["collaborator_uuid"], PlanCollaboratorUpdate(role_key="reviewer"))
        assert next(item for item in updated["collaborators"] if item["user"]["id"] == LEARNER)["role"]["key"] == "reviewer"
        with pytest.raises(HTTPException) as cannot_remove:
            sharing.remove_collaborator(db, _user(ADMIN), goal.goal_uuid, learner["collaborator_uuid"])
        assert cannot_remove.value.status_code == 422
        admin_role = next(role for role in people["roles"] if role["key"] == "plan_admin")
        with pytest.raises(HTTPException) as locked:
            sharing_roles.update_role(db, _user(ADMIN), goal.goal_uuid, admin_role["role_uuid"], PlanRoleUpdate(name="Restricted", capabilities=["view_plan"]))
        assert locked.value.status_code == 422
        viewer = next(role for role in people["roles"] if role["key"] == "viewer")
        with pytest.raises(HTTPException) as unknown:
            sharing_roles.update_role(db, _user(ADMIN), goal.goal_uuid, viewer["role_uuid"], PlanRoleUpdate(capabilities=["fly"]))
        assert unknown.value.status_code == 422
        renamed = sharing_roles.update_role(db, _user(ADMIN), goal.goal_uuid, viewer["role_uuid"], PlanRoleUpdate(name="Watcher", capabilities=["view_plan", "comment"]))
        assert renamed["name"] == "Watcher" and renamed["capabilities"] == ["view_plan", "comment"]
        with pytest.raises(HTTPException) as subject_fixed:
            sharing.create_invitation(db, _user(ADMIN), goal.goal_uuid, PlanInvitationCreate(email=OTHER_EMAIL, role_key="subject", kind="subject"))
        assert subject_fixed.value.status_code == 409


def test_group_goals_refuse_individual_sharing_changes_and_staff_see_a_group_row():
    with _session() as db:
        template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
        result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
        goal = db.exec(select(Goal).where(Goal.subject_user_id == LEARNER)).one()
        learner = next(item for item in sharing_roles.people(db, _user(ADMIN), goal.goal_uuid)["collaborators"] if item["user"]["id"] == LEARNER)
        with pytest.raises(HTTPException) as shared:
            sharing.update_collaborator(db, _user(ADMIN), goal.goal_uuid, learner["collaborator_uuid"], PlanCollaboratorUpdate(role_key="reviewer"))
        assert shared.value.status_code == 409 and shared.value.detail["assignment_uuid"] == result["assignment_uuid"]

        staff_rows = goals.list_my_goals(db, _user(ADMIN))
        assert [row["target_kind"] for row in staff_rows] == ["group"]
        assert staff_rows[0]["learner_count"] == 2 and staff_rows[0]["group"]["name"] == "Fall"
        assert (staff_rows[0]["min_progress_percent"], staff_rows[0]["max_progress_percent"]) == (0, 0)
        mine = goals.list_my_goals(db, _user(LEARNER))
        assert len(mine) == 1 and mine[0]["target_kind"] == "individual"
        assert mine[0]["organization"]["slug"] == "studio" and mine[0]["subject"]["id"] == LEARNER and mine[0]["is_subject"]
        assert mine[0]["progress"] == {"done": 0, "total": 1} and mine[0]["source_badge"] is None


def test_custom_organization_roles_are_reused_across_organization_goals():
    with _session() as db:
        template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
        first, second = _issue(db, template), _issue(db, template)
        with pytest.raises(HTTPException):
            sharing_roles.create_organization_role(db, _user(LEARNER), first.goal_uuid, OrganizationPlanRoleCreate(name="Field coach", capabilities=["view_plan"]))
        created = sharing_roles.create_organization_role(db, _user(ADMIN), first.goal_uuid, OrganizationPlanRoleCreate(name="Field coach", capabilities=["view_plan", "comment"]))
        assert created["key"] == "field_coach"
        local = db.exec(select(PlanRole).where(PlanRole.key == "field_coach")).all()
        assert {role.goal_id for role in local} == {first.id, second.id}
        people = sharing_roles.people(db, _user(ADMIN), second.goal_uuid)
        assert people["can_manage_organization_roles"]
        assert next(role for role in people["roles"] if role["key"] == "field_coach")["organization_role_uuid"] == created["role_uuid"]

        sharing_roles.update_organization_role(db, _user(ADMIN), first.goal_uuid, created["role_uuid"], OrganizationPlanRoleUpdate(name="Lead coach", capabilities=["view_plan"]))
        assert all(role.name == "Lead coach" and role.capabilities == ["view_plan"] for role in db.exec(select(PlanRole).where(PlanRole.key == "field_coach")).all())

        _join(db, second.goal_uuid, OTHER, OTHER_EMAIL, "field_coach", by=ADMIN)
        with pytest.raises(HTTPException) as in_use:
            sharing_roles.delete_organization_role(db, _user(ADMIN), first.goal_uuid, created["role_uuid"])
        assert in_use.value.status_code == 409
        member = next(item for item in sharing_roles.people(db, _user(ADMIN), second.goal_uuid)["collaborators"] if item["user"]["id"] == OTHER)
        sharing.remove_collaborator(db, _user(ADMIN), second.goal_uuid, member["collaborator_uuid"])
        assert sharing_roles.delete_organization_role(db, _user(ADMIN), first.goal_uuid, created["role_uuid"])["deleted"]
        assert db.exec(select(PlanRole).where(PlanRole.key == "field_coach")).all() == []


def test_invitation_identifies_source_organization_and_personal_inviter():
    with _session() as db:
        created = _personal(db)
        _invite(db, created["goal_uuid"], OTHER_EMAIL, "viewer")
        personal = sharing.list_my_invitations(db, _user(OTHER))[0]
        assert personal["organization"] is None and personal["invited_by"]["name"] == "Lee Arner"
        assert sharing.list_my_invitations(db, _user(LEARNER)) == []
        goal = _issued(db)
        _invite(db, goal.goal_uuid, OTHER_EMAIL, "viewer", by=ADMIN)
        managed = next(item for item in sharing.list_my_invitations(db, _user(OTHER)) if item["goal"]["goal_uuid"] == goal.goal_uuid)
        assert managed["organization"]["name"] == "Studio" and managed["organization"]["slug"] == "studio"
        assert managed["role"] == personal["role"]


def test_transfer_ownership_keeps_the_previous_owner_as_goal_admin():
    with _session() as db:
        created = _personal(db)
        with pytest.raises(HTTPException) as not_member:
            sharing.transfer_ownership(db, _user(LEARNER), created["goal_uuid"], PlanOwnershipTransfer(user_id=OTHER))
        assert not_member.value.status_code == 422
        _join(db, created["goal_uuid"], OTHER, OTHER_EMAIL, "viewer")
        people = sharing.transfer_ownership(db, _user(LEARNER), created["goal_uuid"], PlanOwnershipTransfer(user_id=OTHER))
        assert not people["is_owner"]
        roles = {item["user"]["id"]: (item["role"]["key"], item["is_owner"]) for item in people["collaborators"]}
        assert roles == {LEARNER: ("plan_admin", False), OTHER: ("viewer", True)}
        assert "transfer_ownership" in goals.get_goal(db, _user(OTHER), created["goal_uuid"])["capabilities"]


def test_org_page_lists_goals_waiting_for_the_learner_and_remembers_viewing():
    with _session() as db:
        template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
        assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, welcome_message="Welcome!"))
        waiting = lifecycle.org_invitations(db, _user(LEARNER))
        assert len(waiting) == 1 and waiting[0]["status"] == "pending" and waiting[0]["unread"]
        assert waiting[0]["organization"]["slug"] == "studio" and waiting[0]["group"]["name"] == "Fall"
        assert waiting[0]["template"]["title"] == "College ready" and waiting[0]["assignment"]["welcome_message"] == "Welcome!"
        assert lifecycle.mark_org_invitations_viewed(db, _user(LEARNER))["updated"] == 1
        seen = lifecycle.org_invitations(db, _user(LEARNER))[0]
        assert not seen["unread"] and seen["viewed_at"]
        goals.respond(db, _user(LEARNER), seen["goal_uuid"], True)
        assert lifecycle.org_invitations(db, _user(LEARNER))[0]["status"] == "active"
        assert lifecycle.org_invitations(db, _user(ADMIN)) == []


def test_goal_lifecycle_archive_finish_reopen_celebrate_and_delete():
    with _session() as db:
        created = _personal(db)
        uuid = created["goal_uuid"]
        with pytest.raises(HTTPException):
            lifecycle.finish(db, _user(OTHER), uuid)
        assert lifecycle.finish(db, _user(LEARNER), uuid)["status"] == "finished"
        assert lifecycle.mark_celebrated(db, _user(LEARNER), uuid)["celebrated_at"] is not None
        reopened = lifecycle.reopen(db, _user(LEARNER), uuid)
        assert reopened["status"] == "active" and reopened["finished_at"] is None
        assert lifecycle.archive(db, _user(LEARNER), uuid)["status"] == "archived"
        assert goals.list_my_goals(db, _user(LEARNER)) == []
        actions = {item["action"] for item in sharing_log.list_activity(db, _user(LEARNER), uuid)}
        assert {"goal.finished", "goal.reopened", "goal.archived"} <= actions

        issued = _issued(db)
        with pytest.raises(HTTPException) as external:
            lifecycle.delete(db, _user(ADMIN), issued.goal_uuid)
        assert external.value.status_code == 409
        with pytest.raises(HTTPException) as finishes_itself:
            lifecycle.finish(db, _user(ADMIN), issued.goal_uuid)
        assert finishes_itself.value.status_code == 409

        _join(db, uuid, OTHER, OTHER_EMAIL, "plan_admin")
        with pytest.raises(HTTPException) as not_owner:
            lifecycle.delete(db, _user(OTHER), uuid)
        assert not_owner.value.status_code == 403
        assert lifecycle.delete(db, _user(LEARNER), uuid)["deleted"]
        assert db.exec(select(Goal).where(Goal.goal_uuid == uuid)).first() is None
