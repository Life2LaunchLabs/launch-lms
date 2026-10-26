"""Staff invitations carry their setup: the permissions the admin picked, assignments with a role, and a note."""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goal_templates import GoalAssignmentUpdate
from src.db.goals import GoalAssignment
from src.db.organization_invitations import InviteAssignment, OrganizationInvitation
from src.db.user_organizations import UserOrganization
from src.services.goals import access, assignments
from src.services.orgs import invite_landing, staff_setup
from src.tests.test_goal_assignments_admin import COACH, VISIT, _assign, _goal, _session as _assign_session
from src.tests.test_goals import ADMIN, LEARNER, _user


def _session():
    db = _assign_session()
    OrganizationInvitation.__table__.create(db.get_bind(), checkfirst=True)
    return db


def _invitation(db, role_id: int = 2, **values) -> OrganizationInvitation:
    invitation = OrganizationInvitation(invitation_uuid="org_invitation_1", org_id=1, email="coach@example.com", email_normalized="coach@example.com",
                                        role_id=role_id, created_by_user_id=ADMIN, expires_at=datetime.utcnow() + timedelta(days=30), **values)
    db.add(invitation)
    db.commit()
    return invitation


def test_clean_keeps_staff_setup_in_order_and_refuses_what_doesnt_fit():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        permissions, picked = staff_setup.clean(db, 1, 2, ["review_work", "build_plans"], [
            InviteAssignment(assignment_uuid=uuid, role_key="comment"), InviteAssignment(assignment_uuid=uuid, role_key="lead")])
        assert permissions == ["build_plans", "review_work"]
        assert picked == [{"assignment_uuid": uuid, "role_key": "comment"}]
        # Admins can do everything; learners get neither.
        for role_id in (1, 4):
            with pytest.raises(HTTPException) as refused:
                staff_setup.clean(db, 1, role_id, ["review_work"], [])
            assert refused.value.status_code == 400
        assert staff_setup.clean(db, 1, 1, None, []) == (None, [])
        with pytest.raises(HTTPException) as refused:
            staff_setup.clean(db, 1, 2, ["fly_planes"], [])
        assert refused.value.status_code == 422
        with pytest.raises(HTTPException) as refused:
            staff_setup.clean(db, 1, 2, None, [InviteAssignment(assignment_uuid=uuid, role_key="boss")])
        assert refused.value.status_code == 422
        with pytest.raises(HTTPException) as refused:
            staff_setup.clean(db, 2, 2, None, [InviteAssignment(assignment_uuid=uuid)])
        assert refused.value.status_code == 400


def test_accepting_gives_the_permissions_and_puts_them_on_each_assignment_in_their_role():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        goal = _goal(db, LEARNER, uuid)
        invitation = _invitation(db, permissions=["build_plans"], assignments=[{"assignment_uuid": uuid, "role_key": "comment"}], note="Welcome!")
        staff_setup.apply(db, invitation, COACH)
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == COACH, UserOrganization.org_id == 1)).one()
        assert membership.permissions == ["build_plans"]
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == uuid)).one()
        assert {"user_id": COACH, "role_key": "comment"} in assignment.collaborators
        assert COACH in assignment.staff_user_ids
        assert access.capabilities(db, goal, COACH) == {"view_plan", "comment"}
        # Applying again changes nothing.
        staff_setup.apply(db, invitation, COACH)
        db.refresh(assignment)
        assert assignment.staff_user_ids.count(COACH) == 1


def test_an_assignment_that_ended_before_they_accept_is_skipped():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        invitation = _invitation(db, assignments=[{"assignment_uuid": uuid, "role_key": "lead"}])
        assignments.end(db, _user(ADMIN), 1, uuid)
        staff_setup.apply(db, invitation, COACH)
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == uuid)).one()
        assert COACH not in assignment.staff_user_ids
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == COACH, UserOrganization.org_id == 1)).one()
        assert membership.permissions is None  # the defaults


def test_the_invite_shows_the_note_permissions_and_assignments():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        _invitation(db, assignments=[{"assignment_uuid": uuid, "role_key": "lead"}], note="You'll lead this one with me.")
        card = invite_landing.preview(db, 1, invitation="org_invitation_1")
        assert card["role"] == "staff"
        assert card["note"] == "You'll lead this one with me."
        assert [row["key"] for row in card["permissions"]] == ["run_assignments", "review_work"]
        assert [(row["assignment_uuid"], row["role_label"]) for row in card["assignments"]] == [(uuid, "Lead")]
        assert card["assignments"][0]["plan"]


def test_a_staff_member_added_to_an_assignment_can_still_be_edited_off_it():
    with _session() as db:
        uuid = _assign(db, VISIT)["assignment_uuid"]
        staff_setup.apply(db, _invitation(db, assignments=[{"assignment_uuid": uuid, "role_key": "review"}]), COACH)
        updated = assignments.update(db, _user(ADMIN), 1, uuid, GoalAssignmentUpdate(collaborators=[{"user_id": ADMIN, "role_key": "lead"}]))
        assert updated["staff_user_ids"] == [ADMIN]
