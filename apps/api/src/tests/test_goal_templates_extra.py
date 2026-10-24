"""Goal template extras: the library, template activities, the badge a plan earns and assigning with a full schedule."""

from datetime import date

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goal_templates import AssignmentCollaborator, AssignmentSchedule, GoalAssignmentRequest, StageSchedule, StepSchedule
from src.db.goals import Goal, GoalStep, GoalTemplate, StepStatus, StepStatusChange, TemplateStatus
from src.db.learning import LearningActivity, LearningPage
from src.db.messages import InboxMessage
from src.db.organizations import Organization
from src.db.goal_sharing import PlanCollaborator, PlanInvitation, PlanRole
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.goals import assignments, goals, library, plan_issuers, templates
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _document, _published, _session as _goal_session, _user


def _session() -> Session:
    db = _goal_session()
    for model in (PlanInvitation, InboxMessage):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _two_stages() -> dict:
    return {
        "template": {"title": "Career launch"},
        "stages": [
            {"key": "explore", "title": "Explore", "steps": [{"key": "visit", "type": "task", "title": "Visit"}]},
            {"key": "apply", "title": "Apply", "steps": [{"key": "essay", "type": "write", "title": "Essay"}]},
        ],
    }


def _marketplace_tables(db) -> None:
    from src.db.template_marketplace import GoalTemplateAuthorization, GoalTemplateListing

    for model in (GoalTemplateListing, GoalTemplateAuthorization):
        model.__table__.create(db.get_bind(), checkfirst=True)


# The library -------------------------------------------------------------------------------

def test_owner_publishes_to_the_library_and_other_orgs_get_independent_copies_with_their_own_activities():
    with _session() as db:
        _marketplace_tables(db)
        source = templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Build a portfolio"}, {"type": "activity", "title": "Quiz"}))
        source["document"]["template"]["description"] = "A shared starting point"
        templates.save_template(db, _user(ADMIN), 1, source["template_uuid"], source["document"])
        assert library.list_library(db, _user(ADMIN), 2) == []
        published = library.publish_to_library(db, _user(ADMIN), 1, source["template_uuid"])
        assert published["published_to_library"] is True

        listed = library.list_library(db, _user(ADMIN), 2, "shared")
        assert [(item["title"], item["step_count"]) for item in listed] == [("College ready", 2)]
        assert library.list_library(db, _user(ADMIN), 2, "nothing like it") == []

        copied = library.copy_from_library(db, _user(ADMIN), 2, source["template_uuid"])
        assert copied["org_id"] == 2 and copied["source_template_uuid"] == source["template_uuid"]
        assert copied["template_uuid"] != source["template_uuid"] and copied["published_version"] is None
        quiz = copied["document"]["stages"][0]["steps"][1]
        original = source["document"]["stages"][0]["steps"][1]["config"]["activity_uuid"]
        assert quiz["config"]["activity_uuid"] != original
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == quiz["config"]["activity_uuid"])).one()
        copy_template = templates.template_or_404(db, 2, copied["template_uuid"])
        assert activity.goal_template_id == copy_template.id and activity.org_id == 2 and activity.frozen_from_id is None

        # Editing the copy leaves the source alone.
        copied["document"]["stages"][0]["steps"][0]["title"] = "Partner portfolio"
        templates.save_template(db, _user(ADMIN), 2, copied["template_uuid"], copied["document"])
        assert templates.get_template(db, _user(ADMIN), 1, source["template_uuid"])["document"]["stages"][0]["steps"][0]["title"] == "Build a portfolio"
        # Sharing again keeps it listed.
        assert library.publish_to_library(db, _user(ADMIN), 1, source["template_uuid"])["published_to_library"]


def test_only_the_owner_org_publishes_to_the_library():
    with _session() as db:
        template = templates.create_template(db, _user(ADMIN), 2, _document({"type": "task", "title": "Private"}))
        with pytest.raises(HTTPException) as refused:
            library.publish_to_library(db, _user(ADMIN), 2, template["template_uuid"])
        assert refused.value.status_code == 403
        with pytest.raises(HTTPException) as missing:
            library.copy_from_library(db, _user(ADMIN), 2, template["template_uuid"])
        assert missing.value.status_code == 404


def test_template_activity_is_fetched_for_the_editor_only_from_its_own_template():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "activity", "title": "Quiz"}))
        activity_uuid = created["document"]["stages"][0]["steps"][0]["config"]["activity_uuid"]
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).one()
        db.add(LearningPage(page_uuid="page_1", page_type="standard", title="Start", content={}, design={}, activity_id=activity.id, org_id=1, creation_date=NOW))
        db.commit()
        fetched = templates.template_activity(db, _user(ADMIN), 1, created["template_uuid"], activity_uuid)
        assert fetched["template"] == {"template_uuid": created["template_uuid"], "title": "College ready", "org_id": 1}
        assert fetched["activity"]["activity_uuid"] == activity_uuid
        other = templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Visit"}))
        with pytest.raises(HTTPException) as elsewhere:
            templates.template_activity(db, _user(ADMIN), 1, other["template_uuid"], activity_uuid)
        assert elsewhere.value.status_code == 404
        with pytest.raises(HTTPException):
            templates.template_activity(db, _user(LEARNER), 1, created["template_uuid"], activity_uuid)


# The badge a plan earns ---------------------------------------------------------------------

def test_the_badge_is_part_of_the_plan_and_released_with_it():
    from src.services.badges.definition import badge_summary

    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, {**_document({"type": "task", "title": "Practice"}), "badge": {"kind": "Competency", "skills": ["CPR"]}})
        template = templates.template_or_404(db, 1, created["template_uuid"])
        draft = templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["badge"]
        # Name and criteria come from the plan.
        assert (draft["name"], draft["kind"], draft["skills"]) == ("College ready", "Competency", ["CPR"]) and "Practice" in draft["criteria_narrative"]
        assert badge_summary(db, template) is None  # nothing live yet
        templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
        assert badge_summary(db, template)["kind"] == "Competency"
        # Changing the badge is a draft change, live once published.
        document = templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["document"]
        templates.save_template(db, _user(ADMIN), 1, created["template_uuid"], {**document, "badge": {"kind": "Certification", "name": "CPR certified"}})
        assert badge_summary(db, template)["kind"] == "Competency"
        assert templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["badge"]["name"] == "CPR certified"
        # Taking it out means the plan earns none.
        templates.save_template(db, _user(ADMIN), 1, created["template_uuid"], {key: value for key, value in document.items() if key != "badge"})
        assert templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["badge"] is None
        with pytest.raises(HTTPException) as invalid:
            templates.save_template(db, _user(ADMIN), 1, created["template_uuid"], {**document, "badge": {"kind": "Trophy"}})
        assert invalid.value.status_code == 422


# Assigning ---------------------------------------------------------------------------------

def _publish(db: Session, document: dict) -> GoalTemplate:
    created = templates.create_template(db, _user(ADMIN), 1, document)
    templates.publish(db, _user(ADMIN), 1, created["template_uuid"])
    return templates.template_or_404(db, 1, created["template_uuid"])


def test_assigning_by_email_without_an_account_issues_a_goal_waiting_for_its_learner():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Visit"})
        result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(subject_email=" New@Example.com "))
        assert result["assignment_type"] == "external" and result["subject_email"] == "new@example.com" and result["learner_count"] == 1
        goal = db.exec(select(Goal).where(Goal.goal_uuid == result["goal_uuids"][0])).one()
        assert goal.subject_user_id is None and goal.owner_user_id == ADMIN and goal.status == "pending"
        invitation = db.exec(select(PlanInvitation)).one()
        assert (invitation.goal_id, invitation.kind, invitation.email_normalized) == (goal.id, "subject", "new@example.com")
        assert db.get(PlanRole, invitation.role_id).key == "subject"
        assert db.exec(select(InboxMessage)).one().action_kind == "goal_invitation"
        # Syncing again issues nothing more.
        assignment = db.exec(select(assignments.GoalAssignment)).one()
        assert assignments.sync_assignment(db, assignment) == []
        # Staff can send it again; every resend is a new message.
        from src.services.goals import assignment_invites
        assert assignment_invites.resend(db, _user(ADMIN), 1, result["assignment_uuid"]) == {"sent": 1}
        assert len(db.exec(select(InboxMessage)).all()) == 2


def test_assigning_by_email_to_someone_with_an_account_issues_their_goal():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Visit"})
        result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(subject_email="L@example.com"))
        goal = db.exec(select(Goal).where(Goal.goal_uuid == result["goal_uuids"][0])).one()
        assert goal.subject_user_id == LEARNER and db.exec(select(PlanInvitation)).all() == []


def test_one_target_and_valid_people_are_required():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Visit"})
        for payload, status in (
            (GoalAssignmentRequest(user_id=LEARNER, subject_email="x@example.com"), 422),
            (GoalAssignmentRequest(subject_email="not-an-email"), 422),
            (GoalAssignmentRequest(user_id=99), 404),
            (GoalAssignmentRequest(user_id=LEARNER, collaborators=[AssignmentCollaborator(user_id=OTHER)]), 422),
            (GoalAssignmentRequest(user_id=LEARNER, owner_user_id=99), 422),
        ):
            with pytest.raises(HTTPException) as refused:
                assignments.assign(db, _user(ADMIN), 1, template.template_uuid, payload)
            assert refused.value.status_code == status


def test_assignment_schedule_staff_roles_and_progress_summary():
    with _session() as db:
        membership = db.exec(select(assignments.UserOrganization).where(assignments.UserOrganization.user_id == OTHER, assignments.UserOrganization.role_id == 4)).one()
        membership.role_id = 2  # a maintainer can be staff
        db.add(membership)
        db.commit()
        template = _publish(db, _two_stages())
        with pytest.raises(HTTPException, match="follow stage order"):
            assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(usergroup_id=1, schedule=AssignmentSchedule(stages=[
                StageSchedule(stage_key="explore", start_date=date(2026, 12, 1)), StageSchedule(stage_key="apply", start_date=date(2026, 11, 1))])))

        result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(
            usergroup_id=1, due_date=date(2026, 12, 20), collaborators=[AssignmentCollaborator(user_id=OTHER, role_key="comment")],
            schedule=AssignmentSchedule(
                stages=[StageSchedule(stage_key="explore", start_date=date(2026, 10, 1)), StageSchedule(stage_key="apply", start_date=date(2026, 11, 16))],
                steps=[StepSchedule(step_key="essay", due_date=date(2026, 12, 10))],
            ),
        ))
        assert result["due_date"] == date(2026, 12, 20) and result["learner_count"] == 2
        # With nobody else leading, the person assigning leads.
        assert result["collaborators"] == [{"user_id": ADMIN, "role_key": "lead"}, {"user_id": OTHER, "role_key": "comment"}]
        assert result["schedule"]["steps"] == [{"step_key": "essay", "start_date": None, "due_date": "2026-12-10", "open_early": True, "allow_late": True}]
        assert {item["stage_key"] for item in result["schedule"]["stages"]} == {"explore", "apply"}

        goal = db.exec(select(Goal).where(Goal.subject_user_id == LEARNER)).one()
        view = goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
        assert [(stage["start_date"], stage["end_date"]) for stage in view["stages"]] == [(date(2026, 10, 1), date(2026, 11, 15)), (date(2026, 11, 16), date(2026, 12, 20))]
        essay = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == "essay")).one()
        assert essay.due_date == date(2026, 12, 10)
        member = db.exec(select(PlanCollaborator, PlanRole).join(PlanRole, PlanRole.id == PlanCollaborator.role_id).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == OTHER)).one()
        assert member[1].key == "commenter"

        visit = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == "visit")).one()
        goals.change_status(db, _user(LEARNER), goal.goal_uuid, visit.step_uuid, StepStatusChange(status=StepStatus.COMPLETED))
        summary = assignments.list_assignments(db, _user(ADMIN), 1, template.template_uuid)[0]
        assert (summary["completed_count"], summary["progress_percent"], summary["min_progress_percent"], summary["max_progress_percent"]) == (1, 25, 0, 50)
        assert summary["lifecycle_counts"] == {"pending": 1, "active": 1, "finished": 0, "archived": 0}
        assert summary["step_count"] == 2 and summary["ready_for_review_count"] == 0
        assert [item["assignment_uuid"] for item in assignments.list_org_assignments(db, _user(OTHER), 1)] == [summary["assignment_uuid"]]
        assert assignments.list_org_assignments(db, _user(LEARNER), 1) == []


# Staff read templates (Plans › Templates); only admins change them ------------------------------

STAFF, STAFF_ROLE = 7, 7


def _add_staff(db: Session, org_id: int = 1) -> None:
    """A staff member through a custom role (dashboard access + activity updates), not an admin or maintainer."""
    if not db.get(Role, STAFF_ROLE):
        db.add(Role(id=STAFF_ROLE, role_uuid="role_teacher", name="Teacher", org_id=None,
                    rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    if not db.get(User, STAFF):
        db.add(User(id=STAFF, user_uuid="user_7", username="morgan", email="m@example.com", first_name="Morgan", last_name="Lee", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=STAFF, org_id=org_id, role_id=STAFF_ROLE, creation_date=NOW, update_date=NOW))
    db.commit()


def _refused(call) -> int:
    with pytest.raises(HTTPException) as refused:
        call()
    return refused.value.status_code


def test_staff_read_templates_read_only_and_learners_are_refused():
    with _session() as db:
        _add_staff(db)
        created = templates.create_template(db, _user(ADMIN), 1, _two_stages())

        listed = templates.list_templates(db, _user(STAFF), 1)
        assert [(item["title"], item["read_only"], item["stage_count"], item["step_count"], item["badge"], item["frameworks"]) for item in listed] == [
            ("Career launch", True, 2, 2, None, [])]
        assert templates.list_templates(db, _user(ADMIN), 1)[0]["read_only"] is False

        detail = templates.get_template(db, _user(STAFF), 1, created["template_uuid"])
        assert detail["read_only"] is True and [stage["title"] for stage in detail["document"]["stages"]] == ["Explore", "Apply"]
        assert templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["read_only"] is False
        # Staff see a template's assignments, but only the ones they staff.
        templates.publish(db, _user(ADMIN), 1, created["template_uuid"])
        assignments.assign(db, _user(ADMIN), 1, created["template_uuid"], GoalAssignmentRequest(user_id=LEARNER))
        assert len(assignments.list_assignments(db, _user(ADMIN), 1, created["template_uuid"])) == 1
        assert assignments.list_assignments(db, _user(STAFF), 1, created["template_uuid"]) == []

        # Writes stay with admins.
        assert _refused(lambda: templates.save_template(db, _user(STAFF), 1, created["template_uuid"], detail["document"])) == 403
        assert _refused(lambda: templates.publish(db, _user(STAFF), 1, created["template_uuid"])) == 403
        assert _refused(lambda: templates.create_template(db, _user(STAFF), 1, title="Mine")) == 403
        assert _refused(lambda: templates.set_status(db, _user(STAFF), 1, created["template_uuid"], TemplateStatus.ARCHIVED)) == 403

        # Learners read nothing.
        assert _refused(lambda: templates.list_templates(db, _user(LEARNER), 1)) == 403
        assert _refused(lambda: templates.get_template(db, _user(LEARNER), 1, created["template_uuid"])) == 403
        assert _refused(lambda: assignments.list_assignments(db, _user(LEARNER), 1, created["template_uuid"])) == 403


def test_staff_see_another_orgs_template_read_only_and_the_list_shows_what_each_template_earns():
    from src.tests.plan_world import PARTNER, _world

    db, routes = _world()
    with db:
        _add_staff(db, PARTNER)
        # The owner's list names the badge each template earns.
        assert [item["badge"]["name"] for item in templates.list_templates(db, _user(ADMIN), 1)] == ["Adaptability", "Adaptability"]

        view = plan_issuers.template_view(db, _user(STAFF), PARTNER, routes[0].template_uuid)
        assert view["read_only"] is True and view["owner_org"]["name"] == "Studio" and view["badge"]["name"] == "Adaptability"
        assert _refused(lambda: plan_issuers.template_view(db, _user(LEARNER), PARTNER, routes[0].template_uuid)) == 403
