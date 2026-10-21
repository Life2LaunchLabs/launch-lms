"""The admin Home: which widgets a viewer gets, the data behind each, and their own layout."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.goal_admin import AdminHomeLayout, PlansTabsOrder
from src.db.goals import StepStatus, StepSubmission
from src.db.organization_config import OrganizationConfig
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.organizations import Organization
from src.services.goals import admin_home, admin_home_start, goals
from src.tests.test_goal_assignments_admin import ESSAY, NEWCOMER, VISIT, _assign, _goal, _goal_step
from src.tests.test_goal_assignments_admin import _session as _base_session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _published, _status, _user

TODAY = date.today()




def _session():
    """NEWCOMER teaches: a role that runs assignments but doesn't administer the org."""
    db = _base_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[OrganizationConfig.__table__])  # type: ignore[attr-defined]
    db.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.exec(select(UserOrganization).where(UserOrganization.user_id == NEWCOMER)).one().role_id = 5
    db.commit()
    return db


def test_staff_home_shows_what_needs_them_and_a_learner_gets_only_messages():
    with _session() as db:
        uuid = _assign(db, VISIT, ESSAY, staff=(ADMIN, NEWCOMER), start_date=TODAY)["assignment_uuid"]
        mine = _goal(db, LEARNER, uuid)
        essay = _goal_step(db, mine, "essay")
        goals.save_submission(db, _user(LEARNER), mine.goal_uuid, essay.step_uuid, StepSubmission(submission={"text": "Draft"}))
        _status(db, LEARNER, mine, {"step_uuid": essay.step_uuid}, StepStatus.COMPLETED)

        home = admin_home.home(db, _user(NEWCOMER), 1)
        assert home["widgets"] == ["waiting", "today", "messages", "attention"]
        assert home["layout"]["order"][:4] == ["waiting", "today", "messages", "attention"] and home["layout"]["hidden"] == []
        assert home["waiting"]["counts"]["review"] == 1 and home["waiting"]["reports"] is None
        assert home["waiting"]["groups"][0]["step"]["title"] == "Essay"

        # The stage opens today; the visit closes at the end of week one, with nobody done yet.
        items = home["today"]["items"]
        assert [(item["kind"], item["title"]) for item in items] == [("stage_opens", "Apply"), ("step_closes", "Visit a campus")]
        visit = items[1]
        assert visit["date"] == TODAY + timedelta(days=6) and visit["assigned_to"] == "Fall" and visit["counts"]["learners"] == 2

        attention = home["attention"]["assignments"]
        assert len(attention) == 1 and attention[0]["needs_you_count"] == 1 and attention[0]["behind_count"] == 0

        # Learners' chats with the org go by the learner's name for staff.
        titles = {chat["title"] for chat in admin_home.home(db, _user(ADMIN), 1)["messages"]["chats"]}
        assert titles and titles <= {"Lee Arner", "Sam Other"}

        learner = admin_home.home(db, _user(LEARNER), 1)
        assert learner["widgets"] == ["messages"] and "waiting" not in learner and "today" not in learner


def test_attention_counts_learners_behind_once_a_step_has_closed():
    with _session() as db:
        uuid = _assign(db, VISIT, staff=(ADMIN, NEWCOMER), start_date=TODAY - timedelta(days=14))["assignment_uuid"]
        row = admin_home.home(db, _user(NEWCOMER), 1)["attention"]["assignments"][0]
        assert (row["assignment_uuid"], row["behind_count"], row["overdue_count"]) == (uuid, 2, 2)
        # Nothing closes in the coming week any more.
        assert admin_home.home(db, _user(NEWCOMER), 1)["today"]["items"] == []


def test_layout_is_kept_per_member_and_hidden_widgets_are_not_built():
    with _session() as db:
        _assign(db, VISIT, staff=(ADMIN, NEWCOMER), start_date=TODAY)
        saved = admin_home.save_layout(db, _user(NEWCOMER), 1, AdminHomeLayout(order=["attention", "today", "attention"], hidden=["messages"]))
        assert saved == {"order": ["attention", "today", "waiting", "messages", "creator"], "hidden": ["messages"]}
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == NEWCOMER)).one()
        assert membership.preferences["admin_home"] == saved

        home = admin_home.home(db, _user(NEWCOMER), 1)
        assert home["layout"] == saved and "messages" not in home and "attention" in home
        # Another member's Home is their own.
        assert admin_home.home(db, _user(ADMIN), 1)["layout"]["hidden"] == []

        with pytest.raises(HTTPException) as unknown:
            admin_home.save_layout(db, _user(NEWCOMER), 1, AdminHomeLayout(order=["weather"]))
        assert unknown.value.status_code == 422
        with pytest.raises(HTTPException) as outsider:
            admin_home.save_layout(db, _user(LEARNER), 2, AdminHomeLayout())
        assert outsider.value.status_code == 403


def test_creator_metrics_for_admins_of_an_org_that_makes_templates():
    with _session() as db:
        uuid = _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)["assignment_uuid"]
        assert "creator" not in admin_home.home(db, _user(NEWCOMER), 1)["widgets"]

        # Reporting on the org's own work is open at every tier.
        shown = admin_home.home(db, _user(ADMIN), 1)
        assert shown["widgets"][-1] == "creator" and shown["locked"] == []
        creator = shown["creator"]
        templates = creator["templates"]
        # Both learners accepted: two starts, both still going, from a template no other org copied.
        assert (templates["count"], templates["starts"], templates["recent_starts"], templates["active"], templates["completions"], templates["orgs_using"]) == (1, 2, 2, 2, 0, 0)
        assert _goal(db, OTHER, uuid).status == "active"
        assert creator["badges"] == {"count": 0, "starts": 0, "recent_starts": 0, "completions": 0, "active": 0, "awards": 0, "recent_awards": 0}
        assert creator["recent_edits"][0]["kind"] == "template" and creator["recent_edits"][0]["status"] == "published"


def test_plans_tab_order_defaults_by_what_the_org_does_and_is_kept_per_member():
    with _session() as db:
        # Nothing made yet: Assignments first.
        assert admin_home.get_plans_tabs(db, _user(NEWCOMER), 1) == {
            "order": ["assignments", "templates", "badges", "requirements", "marketplace"],
            "default": ["assignments", "templates", "badges", "requirements", "marketplace"],
            "saved": False,
        }
        # An org that makes templates but runs none itself starts on Badges, then Templates.
        _published(db, VISIT)
        creator = admin_home.get_plans_tabs(db, _user(NEWCOMER), 1)
        assert creator["order"] == creator["default"] == ["badges", "templates", "assignments", "requirements", "marketplace"]
        # Once it runs an assignment, it starts on Assignments again.
        _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)
        assert admin_home.get_plans_tabs(db, _user(NEWCOMER), 1)["default"][0] == "assignments"

        saved = admin_home.save_plans_tabs(db, _user(NEWCOMER), 1, PlansTabsOrder(order=["marketplace", "badges", "marketplace"]))
        assert saved["order"] == ["marketplace", "badges", "assignments", "templates", "requirements"] and saved["saved"] is True
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == NEWCOMER)).one()
        assert membership.preferences["plans_tabs"] == ["marketplace", "badges"]
        assert admin_home.get_plans_tabs(db, _user(NEWCOMER), 1)["order"] == saved["order"]
        # Another member's order is their own, and saving the Home layout on the same row keeps it.
        assert admin_home.get_plans_tabs(db, _user(ADMIN), 1)["saved"] is False
        admin_home.save_layout(db, _user(NEWCOMER), 1, AdminHomeLayout(hidden=["messages"]))
        assert admin_home.get_plans_tabs(db, _user(NEWCOMER), 1)["order"][0] == "marketplace"

        # Reset: an empty order drops the saved one and leaves the rest of the preferences alone.
        reset = admin_home.save_plans_tabs(db, _user(NEWCOMER), 1, PlansTabsOrder(order=[]))
        assert reset["order"] == reset["default"] and reset["saved"] is False
        db.refresh(membership)
        assert "plans_tabs" not in membership.preferences and membership.preferences["admin_home"]["hidden"] == ["messages"]

        with pytest.raises(HTTPException) as unknown:
            admin_home.save_plans_tabs(db, _user(NEWCOMER), 1, PlansTabsOrder(order=["weather"]))
        assert unknown.value.status_code == 422
        with pytest.raises(HTTPException) as outsider:
            admin_home.get_plans_tabs(db, _user(LEARNER), 2)
        assert outsider.value.status_code == 403


def test_getting_started_ticks_off_from_the_orgs_own_data_for_admins_only():
    with _session() as db:
        start = admin_home.home(db, _user(ADMIN), 1)["getting_started"]
        done = {step["key"]: step["done"] for step in start["steps"]}
        assert list(done) == ["plan", "organization", "learners", "staff", "assign"]
        assert done["plan"] is False and done["assign"] is False and done["learners"] is True
        assert [step["key"] for step in start["steps"] if step["optional"]] == ["staff"]
        # Staff and learners never see it.
        assert admin_home.home(db, _user(NEWCOMER), 1)["getting_started"] is None
        assert admin_home.home(db, _user(LEARNER), 1)["getting_started"] is None

        # Handing out a plan ticks off the plan and the assignment.
        _assign(db, VISIT, staff=(ADMIN,), start_date=TODAY)
        done = {step["key"]: step["done"] for step in admin_home.home(db, _user(ADMIN), 1)["getting_started"]["steps"]}
        assert done["plan"] and done["assign"]

        # With a description too, every required step is done and it goes away.
        org = db.get(Organization, 1)
        org.description = "A small learning co-op"
        db.add(org)
        db.commit()
        assert admin_home.home(db, _user(ADMIN), 1)["getting_started"] is None


def test_getting_started_can_be_dismissed_by_an_admin():
    with _session() as db:
        assert admin_home.home(db, _user(ADMIN), 1)["getting_started"] is not None
        assert admin_home_start.dismiss(db, _user(ADMIN), 1) == {"dismissed": True}
        assert admin_home.home(db, _user(ADMIN), 1)["getting_started"] is None
        with pytest.raises(HTTPException) as staff:
            admin_home_start.dismiss(db, _user(NEWCOMER), 1)
        assert staff.value.status_code == 403
