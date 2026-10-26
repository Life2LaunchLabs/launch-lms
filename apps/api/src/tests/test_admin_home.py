"""Home: which sections a viewer gets, the data behind each, and their own Home state."""

from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.goal_admin import HomeLayout
from src.db.goals import StepStatus, StepSubmission
from src.db.insights import InsightDashboard
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.requirements import RequirementFramework
from src.db.resources import ResourceChannel
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.services.goals import admin_home, goals
from src.tests.test_goal_assignments_admin import COACH, ESSAY, VISIT, _assign, _goal, _goal_step
from src.tests.test_goal_assignments_admin import _session as _base_session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _user

TODAY = date.today()


def _session():
    db = _base_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[model.__table__ for model in (  # type: ignore[attr-defined]
        OrganizationConfig, OrganizationInvitation, UserGroup, RequirementFramework, ResourceChannel, InsightDashboard)], checkfirst=True)
    return db


def _membership(db, user_id: int) -> UserOrganization:
    return db.exec(select(UserOrganization).where(UserOrganization.user_id == user_id, UserOrganization.org_id == 1)).one()


def _handed_in(db, uuid: str) -> None:
    mine = _goal(db, LEARNER, uuid)
    essay = _goal_step(db, mine, "essay")
    goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
    _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)


def test_staff_home_is_built_from_their_permissions_and_assignments():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, COACH), start_date=TODAY)["assignment_uuid"]
        _handed_in(db, uuid)

        home = admin_home.home(db, _user(COACH), 1)
        # Coaches run assignments and review work by default; they don't build plans.
        assert home["viewer"] == {"admin": False, "permissions": ["review_work", "run_assignments"], "staff": True}
        assert home["sections"] == ["needs", "assignments", "week", "glance"] and home["hidden"] == []

        mine = home["assignments"]["mine"]
        assert [(row["assignment_uuid"], row["my_role"]) for row in mine] == [(uuid, "review")] and home["assignments"]["all"] is None
        assert mine[0]["target"]["name"] == "Fall" and mine[0]["needs"]["review"] == 1

        # The stage opens today; the visit closes at the end of week one, with nobody done yet.
        items = home["week"]["items"]
        assert [(item["kind"], item["title"]) for item in items] == [("stage_opens", "Apply"), ("step_closes", "Visit a campus")]
        assert items[1]["date"] == TODAY + timedelta(days=6) and items[1]["counts"]["learners"] == 2

        # The hand-in waits in the learner's thread.
        assert any(row["kind"] == "person" and row["counts"]["turn_ins"] == 1 for row in home["needs"]["rows"])

        steps = home["first_steps"]
        assert steps["kind"] == "staff" and [step["key"] for step in steps["steps"]] == ["profile", "brief", "try", "hello", "review"]
        assert steps["steps"][0]["done"] and steps["focus"]["assignment_uuid"] == uuid and steps["focus"]["count"] == 1

        admin = admin_home.home(db, _user(ADMIN), 1)
        assert admin["viewer"]["admin"] and [row["assignment_uuid"] for row in admin["assignments"]["all"]] == [uuid]
        assert admin["sections"] == ["needs", "assignments", "continue", "week", "glance"]

        learner = admin_home.home(db, _user(LEARNER), 1)
        assert learner["sections"] == [] and learner["first_steps"] is None and "needs" not in learner


def test_builders_get_continue_with_what_the_org_edited_last():
    with _session() as db:
        _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)
        membership = _membership(db, COACH)
        membership.permissions = ["build_plans"]
        db.add(membership)
        db.add(ResourceChannel(org_id=1, channel_uuid="channel_1", name="Interview practice", creation_date="2026-01-01", update_date="2026-01-01"))
        db.commit()
        home = admin_home.home(db, _user(COACH), 1)
        # Not on any assignment and no review or run permission: no assignments section or week.
        assert home["sections"] == ["needs", "continue", "glance"]
        kinds = [(item["kind"], item["state"]) for item in home["continue"]]
        assert kinds[0] == ("plan", "live") and ("channel", "live") in kinds
        assert [step["key"] for step in home["first_steps"]["steps"]] == ["profile", "hello", "plans", "preview"]


def test_hidden_sections_are_kept_per_member_and_not_built():
    with _session() as db:
        _assign(db, VISIT, staff=(ADMIN, COACH), start_date=TODAY)
        assert admin_home.save_layout(db, _user(COACH), 1, HomeLayout(hidden=["week", "week"])) == {"hidden": ["week"]}
        assert _membership(db, COACH).preferences["home"]["hidden"] == ["week"]
        home = admin_home.home(db, _user(COACH), 1)
        assert home["hidden"] == ["week"] and "week" in home["sections"] and "week" not in home and "needs" in home
        # Another member's Home is their own.
        assert admin_home.home(db, _user(ADMIN), 1)["hidden"] == []

        with pytest.raises(HTTPException) as unknown:
            admin_home.save_layout(db, _user(COACH), 1, HomeLayout(hidden=["weather"]))
        assert unknown.value.status_code == 422
        with pytest.raises(HTTPException) as outsider:
            admin_home.save_layout(db, _user(LEARNER), 2, HomeLayout())
        assert outsider.value.status_code == 403


def test_first_steps_tick_when_opened_and_stay_until_dismissed():
    with _session() as db:
        _assign(db, VISIT, staff=(ADMIN, COACH), start_date=TODAY)
        assert admin_home.tick(db, _user(COACH), 1, "brief") == {"ticks": ["brief"]}
        admin_home.tick(db, _user(COACH), 1, "brief")
        done = {step["key"]: step["done"] for step in admin_home.home(db, _user(COACH), 1)["first_steps"]["steps"]}
        assert done["brief"] and not done["try"]
        with pytest.raises(HTTPException) as data_step:
            admin_home.tick(db, _user(COACH), 1, "hello")  # done when they post, not when clicked
        assert data_step.value.status_code == 422

        assert admin_home.dismiss(db, _user(COACH), 1, "first_steps") == {"dismissed": ["first_steps"]}
        assert admin_home.home(db, _user(COACH), 1)["first_steps"] is None
        assert admin_home.pins(db, _user(COACH), 1) == {"pins": []}
        with pytest.raises(HTTPException) as unknown:
            admin_home.dismiss(db, _user(COACH), 1, "everything")
        assert unknown.value.status_code == 422


def test_a_new_member_sees_the_note_from_their_invitation_until_they_dismiss_it():
    with _session() as db:
        membership = _membership(db, COACH)
        membership.creation_date = datetime.now().isoformat()
        db.add(membership)
        db.add(OrganizationInvitation(invitation_uuid="inv_coach", org_id=1, email="coach@example.com", email_normalized="coach@example.com", role_id=2,
                                      created_by_user_id=ADMIN, target_user_id=COACH, status="accepted", accepted_at=datetime.utcnow(),
                                      note="Welcome aboard!", expires_at=datetime.utcnow() + timedelta(days=7)))
        db.commit()
        home = admin_home.home(db, _user(COACH), 1)
        assert home["welcome"]["invitation"]["note"] == "Welcome aboard!" and home["welcome"]["invitation"]["from"]["id"] == ADMIN
        assert home["needs"]["intro"] is True
        admin_home.dismiss(db, _user(COACH), 1, "welcome")
        admin_home.dismiss(db, _user(COACH), 1, "needs_intro")
        home = admin_home.home(db, _user(COACH), 1)
        assert home["welcome"] is None and home["needs"]["intro"] is False


def test_plans_summary_counts_what_the_plans_tabs_show():
    with _session() as db:
        assert admin_home.plans_summary(db, _user(COACH), 1) == {"plans": 0, "assignments": 0, "frameworks": 0}
        _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)
        assert admin_home.plans_summary(db, _user(COACH), 1) == {"plans": 1, "assignments": 1, "frameworks": 0}
        with pytest.raises(HTTPException) as outsider:
            admin_home.plans_summary(db, _user(LEARNER), 2)
        assert outsider.value.status_code == 403


def test_admins_get_the_setup_checklist_as_first_steps_until_they_dismiss_it():
    with _session() as db:
        start = admin_home.home(db, _user(ADMIN), 1)["first_steps"]
        done = {step["key"]: step["done"] for step in start["steps"]}
        assert start["kind"] == "admin" and list(done) == ["plan", "organization", "staff", "groups", "requirements", "learners", "assign"]
        assert done["plan"] is False and done["assign"] is False and done["learners"] is True and done["staff"] is True
        assert [step["key"] for step in start["steps"] if step["optional"]] == ["staff", "requirements"]

        # Handing out a plan ticks off the plan and the assignment; with a description too, every required step is done.
        _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)
        org = db.get(Organization, 1)
        org.description = "A small learning co-op"
        db.add(org)
        db.commit()
        start = admin_home.home(db, _user(ADMIN), 1)["first_steps"]
        assert start["complete"] is True
        admin_home.dismiss(db, _user(ADMIN), 1, "first_steps")
        assert admin_home.home(db, _user(ADMIN), 1)["first_steps"] is None


def test_the_admin_checklist_picks_up_what_setup_already_did():
    with _session() as db:
        row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first() or OrganizationConfig(org_id=1, config={})
        row.config = {**(row.config or {}), "setup": {"role": "teacher", "created_by_user_id": ADMIN}}
        db.add(row)
        db.add(OrganizationInvitation(invitation_uuid="inv_1", org_id=1, email="new@example.org", email_normalized="new@example.org", role_id=4, expires_at=datetime.utcnow() + timedelta(days=7)))
        db.add(UserGroup(org_id=1, name="Class of 2027", description="", usergroup_uuid="ug_1"))
        db.commit()
        start = admin_home.home(db, _user(ADMIN), 1)["first_steps"]
        steps = {step["key"]: step for step in start["steps"]}
        assert start["from_setup"] is True and steps["organization"]["optional"] is True
        assert steps["groups"]["done"] and steps["groups"]["note"] == f"{len(db.exec(select(UserGroup.id).where(UserGroup.org_id == 1)).all())} groups"


def test_requirements_show_progress_on_each_framework_to_those_who_see_reports():
    from src.db.requirements import RequirementAssignmentBatch, RequirementAttainmentSource, RequirementEnrollment, RequirementFrameworkVersion

    with _session() as db:
        SQLModel.metadata.create_all(db.get_bind(), tables=[model.__table__ for model in (RequirementFrameworkVersion, RequirementAssignmentBatch, RequirementEnrollment, RequirementAttainmentSource)])  # type: ignore[attr-defined]
        assert "requirements" not in admin_home.home(db, _user(ADMIN), 1)["sections"]
        db.add(RequirementFramework(id=1, framework_uuid="fw_grad", org_id=1, name="Graduation"))
        db.add(RequirementFrameworkVersion(id=1, version_uuid="fwv_1", framework_id=1, version_number=1))
        db.add(RequirementAssignmentBatch(id=1, batch_uuid="batch_1", org_id=1, framework_id=1, version_id=1))
        snapshot = {"leaf_node_uuids": ["a", "b"]}
        db.add(RequirementEnrollment(id=1, enrollment_uuid="enr_1", batch_id=1, org_id=1, framework_id=1, version_id=1, user_id=LEARNER, framework_snapshot=snapshot, status="completed"))
        db.add(RequirementEnrollment(id=2, enrollment_uuid="enr_2", batch_id=1, org_id=1, framework_id=1, version_id=1, user_id=OTHER, framework_snapshot=snapshot))
        db.add_all([RequirementAttainmentSource(source_uuid=f"src_{node}", enrollment_id=1, node_uuid=node) for node in ("a", "b")])
        db.commit()

        home = admin_home.home(db, _user(ADMIN), 1)
        assert home["sections"][-1] == "requirements"
        assert home["requirements"] == {"frameworks": [{"framework_uuid": "fw_grad", "name": "Graduation", "learners": 2, "progress": 0.5, "completed": 1}], "total": 1}
        # Staff without the reports permission don't get it.
        assert "requirements" not in admin_home.home(db, _user(COACH), 1)["sections"]
