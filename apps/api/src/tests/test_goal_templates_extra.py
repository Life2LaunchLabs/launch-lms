"""Goal template extras: the library, template activities, badge versions and assigning with a full schedule."""

from datetime import date

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goal_templates import AssignmentCollaborator, AssignmentSchedule, GoalAssignmentRequest, StageSchedule, StepSchedule
from src.db.goals import Goal, GoalStep, GoalTemplate, StepStatus, StepStatusChange
from src.db.learning import LearningActivity, LearningBadge, LearningBadgeAward, LearningBadgeVersion, LearningPage
from src.db.messages import InboxMessage
from src.db.organizations import Organization
from src.db.planning import PlanCollaborator, PlanInvitation, PlanRole
from src.services.goals import assignments, badge_versions, goals, library, templates
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


# The library -------------------------------------------------------------------------------

def test_owner_publishes_to_the_library_and_other_orgs_get_independent_copies_with_their_own_activities():
    with _session() as db:
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
        # Republishing replaces the library copy.
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


# Badge versions ----------------------------------------------------------------------------

def test_badge_steps_move_to_the_latest_major_version():
    with _session() as db:
        db.add(LearningBadge(id=1, org_id=1, badge_uuid="badge_cpr", name="CPR", creation_date=NOW, update_date=NOW))
        db.add(LearningBadgeVersion(version_uuid="v1", badge_id=1, org_id=1, state="published", semantic_version="1.0.0", title="First", creation_date=NOW, update_date=NOW))
        db.commit()
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "badge", "title": "Earn CPR", "config": {"badge_uuid": "badge_cpr", "major_version": 1}}))
        template = templates.template_or_404(db, 1, created["template_uuid"])
        assert badge_versions.outdated_badge_steps(db, template) == []

        db.add(LearningBadgeVersion(version_uuid="v2", badge_id=1, org_id=1, state="published", semantic_version="2.0.0", title="Second", creation_date=NOW, update_date=NOW))
        db.add(LearningBadgeAward(award_uuid="award_1", badge_id=1, user_id=LEARNER, major_version=1, creation_date=NOW, update_date=NOW))
        db.commit()
        outdated = badge_versions.outdated_badge_steps(db, template)
        assert [(item["title"], item["major_version"], item["latest_major_version"], item["earlier_version_holder_count"]) for item in outdated] == [("Earn CPR", 1, 2, 1)]
        assert outdated[0]["version_comparison"]["latest"]["title"] == "Second"

        updated = badge_versions.update_badge_versions(db, _user(ADMIN), 1, created["template_uuid"], accept_previous_major_versions=True)
        assert updated["outdated_badge_steps"] == []
        assert updated["document"]["stages"][0]["steps"][0]["config"] == {"badge_uuid": "badge_cpr", "major_version": 2, "accept_previous_major_versions": True}
        assert updated["has_unpublished_changes"]


def test_badge_version_bump_without_badge_steps_changes_nothing():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Visit"}))
        updated = badge_versions.update_badge_versions(db, _user(ADMIN), 1, created["template_uuid"])
        assert updated["etag"] == created["etag"] and updated["outdated_badge_steps"] == []


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
            usergroup_id=1, due_date=date(2026, 12, 20), collaborators=[AssignmentCollaborator(user_id=OTHER, role_key="viewer")],
            schedule=AssignmentSchedule(
                stages=[StageSchedule(stage_key="explore", start_date=date(2026, 10, 1)), StageSchedule(stage_key="apply", start_date=date(2026, 11, 16))],
                steps=[StepSchedule(step_key="essay", due_date=date(2026, 12, 10))],
            ),
        ))
        assert result["due_date"] == date(2026, 12, 20) and result["learner_count"] == 2
        assert result["collaborators"] == [{"user_id": ADMIN, "role_key": "plan_admin"}, {"user_id": OTHER, "role_key": "viewer"}]
        assert result["schedule"]["steps"] == [{"step_key": "essay", "due_date": "2026-12-10"}]
        assert {item["stage_key"] for item in result["schedule"]["stages"]} == {"explore", "apply"}

        goal = db.exec(select(Goal).where(Goal.subject_user_id == LEARNER)).one()
        view = goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
        assert [(stage["start_date"], stage["end_date"]) for stage in view["stages"]] == [(date(2026, 10, 1), date(2026, 11, 15)), (date(2026, 11, 16), date(2026, 12, 20))]
        essay = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == "essay")).one()
        assert essay.due_date == date(2026, 12, 10)
        member = db.exec(select(PlanCollaborator, PlanRole).join(PlanRole, PlanRole.id == PlanCollaborator.role_id).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.user_id == OTHER)).one()
        assert member[1].key == "viewer"

        visit = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == "visit")).one()
        goals.change_status(db, _user(LEARNER), goal.goal_uuid, visit.step_uuid, StepStatusChange(status=StepStatus.COMPLETED))
        summary = assignments.list_assignments(db, _user(ADMIN), 1, template.template_uuid)[0]
        assert (summary["completed_count"], summary["progress_percent"], summary["min_progress_percent"], summary["max_progress_percent"]) == (1, 25, 0, 50)
        assert summary["lifecycle_counts"] == {"pending": 1, "active": 1, "finished": 0, "archived": 0}
        assert summary["step_count"] == 2 and summary["ready_for_review_count"] == 0
        assert [item["assignment_uuid"] for item in assignments.list_org_assignments(db, _user(OTHER), 1)] == [summary["assignment_uuid"]]
        assert assignments.list_org_assignments(db, _user(LEARNER), 1) == []
