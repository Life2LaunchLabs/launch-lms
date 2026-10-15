from datetime import date

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine, select

from src.db.goals import (
    Goal,
    GoalAssignment,
    GoalAssignmentCreate,
    GoalCreate,
    GoalSource,
    GoalStage,
    GoalStep,
    GoalStory,
    GoalTemplate,
    GoalTemplateVersion,
    StageCreate,
    StepCreate,
    StepEntry,
    StepEntryCreate,
    StepProgress,
    StepStatus,
    StepStatusChange,
    StepSubmission,
)
from src.db.learning import BadgeIssuerLearnerLink, LearningActivity, LearningResponseAttempt, LearningBadge, LearningBadgeAward, LearningBadgeVersion, LearningPage, LearningPageProgress, LearningRun, LearningRunStatus
from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.portfolio import Portfolio
from src.db.planning import OrganizationPlanRole, Plan, PlanActivity, PlanCollaborator, PlanRole
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.goals import assignments, goals, issue, structure, templates
from src.services.goals.completion import on_badge_awarded

NOW = "2026-10-15T12:00:00"
ADMIN, LEARNER, OTHER = 1, 2, 3


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, User.__table__, Role.__table__, UserOrganization.__table__, UserGroup.__table__, UserGroupUser.__table__,
        LearningActivity.__table__, LearningPage.__table__, LearningPageProgress.__table__, LearningRun.__table__, LearningResponseAttempt.__table__,
        LearningBadge.__table__, LearningBadgeVersion.__table__, LearningBadgeAward.__table__, BadgeIssuerLearnerLink.__table__, MediaAsset.__table__,
        PlanRole.__table__, PlanCollaborator.__table__, PlanActivity.__table__, OrganizationPlanRole.__table__,
        GoalTemplate.__table__, GoalTemplateVersion.__table__, GoalAssignment.__table__, Goal.__table__, GoalStage.__table__,
        GoalStep.__table__, StepProgress.__table__, StepEntry.__table__, GoalStory.__table__, Portfolio.__table__, Plan.__table__,
    ])
    db = Session(engine)
    db.add(Organization(id=1, org_uuid="org_1", name="Studio", slug="studio", email="studio@example.com", creation_date=NOW, update_date=NOW))
    db.add_all([
        User(id=ADMIN, user_uuid="user_1", username="teacher", email="t@example.com", first_name="Tea", last_name="Cher", is_superadmin=True, creation_date=NOW, update_date=NOW),
        User(id=LEARNER, user_uuid="user_2", username="lee", email="l@example.com", first_name="Lee", last_name="Arner", creation_date=NOW, update_date=NOW),
        User(id=OTHER, user_uuid="user_3", username="sam", email="s@example.com", first_name="Sam", last_name="Other", creation_date=NOW, update_date=NOW),
    ])
    db.add_all([
        UserOrganization(user_id=ADMIN, org_id=1, role_id=1, creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=LEARNER, org_id=1, role_id=4, creation_date=NOW, update_date=NOW),
        UserOrganization(user_id=OTHER, org_id=1, role_id=4, creation_date=NOW, update_date=NOW),
        UserGroup(id=1, org_id=1, usergroup_uuid="usergroup_1", name="Fall", description="", creation_date=NOW, update_date=NOW),
        UserGroupUser(usergroup_id=1, user_id=LEARNER, org_id=1, creation_date=NOW, update_date=NOW),
        UserGroupUser(usergroup_id=1, user_id=OTHER, org_id=1, creation_date=NOW, update_date=NOW),
    ])
    db.commit()
    return db


def _user(user_id: int) -> PublicUser:
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com", first_name="U", last_name=str(user_id), is_superadmin=user_id == ADMIN)


def _document(*steps: dict, step_order: str = "any") -> dict:
    return {
        "template": {"title": "College ready", "step_order": step_order},
        "stages": [{"key": "apply", "title": "Apply", "duration_weeks": 4, "steps": list(steps)}],
    }


def _published(db: Session, *steps: dict, step_order: str = "any") -> GoalTemplate:
    created = templates.create_template(db, _user(ADMIN), 1, _document(*steps, step_order=step_order))
    templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
    return templates.template_or_404(db, 1, created["template_uuid"])


def _issue(db: Session, template: GoalTemplate, **kwargs) -> Goal:
    goal = issue.issue_goal(db, template, templates.published_version(db, template), subject_user_id=LEARNER, owner_user_id=ADMIN, **kwargs)
    db.commit()
    return goal


def _step(view: dict, title: str) -> dict:
    return next(step for stage in view["stages"] for step in stage["steps"] if step["title"] == title)


def _status(db, user, goal, step, status, note=None):
    return goals.change_status(db, _user(user), goal.goal_uuid, step["step_uuid"], StepStatusChange(status=status, note=note))


# Templates ----------------------------------------------------------------------------

def test_template_document_is_validated_by_the_step_registry():
    with _session() as db:
        with pytest.raises(HTTPException, match="Unknown step type"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "quiz", "title": "Quiz"}))
        with pytest.raises(HTTPException, match="slots"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "upload", "title": "Resume", "config": {"slots": []}}))
        with pytest.raises(HTTPException, match="aren't reviewed"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Meet", "completed_by": "staff", "review_required": True}))
        with pytest.raises(HTTPException, match="waits on a step"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Meet", "after": ["nope"]}))
        with pytest.raises(HTTPException, match="finish on their own"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "activity", "title": "Quiz", "completed_by": "staff"}))

        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "write", "title": "Essay", "config": {"prompt": "Why?"}}))
        step = created["document"]["stages"][0]["steps"][0]
        assert step["key"].startswith("step_") and step["config"] == {"prompt": "Why?"}
        assert created["has_unpublished_changes"] and created["published_version"] is None


def test_saving_with_a_stale_etag_is_refused():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Visit"}))
        stale = created["etag"]
        document = created["document"]
        document["template"]["title"] = "Renamed"
        templates.save_template(db, _user(ADMIN), 1, created["template_uuid"], document, stale)
        with pytest.raises(HTTPException) as refused:
            templates.save_template(db, _user(ADMIN), 1, created["template_uuid"], document, stale)
        assert refused.value.status_code == 409


def test_publishing_freezes_activities_and_restoring_publishes_an_earlier_version():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "activity", "title": "Interest quiz"}))
        working_uuid = created["document"]["stages"][0]["steps"][0]["config"]["activity_uuid"]
        published = templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
        assert published["published_version"] == 1 and not published["has_unpublished_changes"]
        template = templates.template_or_404(db, 1, created["template_uuid"])
        version_uuid = templates.published_version(db, template).document["stages"][0]["steps"][0]["config"]["activity_uuid"]
        frozen = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == version_uuid)).one()
        assert version_uuid != working_uuid and frozen.frozen_from_id is not None

        working = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == working_uuid)).one()
        working.title = "Interest quiz v2"
        db.add(working)
        db.commit()
        assert templates.get_template(db, _user(ADMIN), 1, created["template_uuid"])["has_unpublished_changes"]
        templates.publish(db, _user(ADMIN), 1, created["template_uuid"])

        restored = templates.restore(db, _user(ADMIN), 1, created["template_uuid"], 1)
        assert restored["published_version"] == 3
        assert restored["versions"][0]["restored_from_number"] == 1
        assert not restored["has_unpublished_changes"]


# Issuing and assignments --------------------------------------------------------------

def test_assigning_to_a_group_issues_pending_goals_that_learners_accept():
    with _session() as db:
        template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"}, {"type": "write", "title": "Essay", "after": ["visit"], "due_week": 2})
        result = assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN], start_date=date(2026, 11, 2)))
        assert len(result["goal_uuids"]) == 2
        mine = goals.list_my_goals(db, _user(LEARNER))
        assert [item["status"] for item in mine] == ["pending"]

        view = goals.respond(db, _user(LEARNER), mine[0]["goal_uuid"], True)
        assert view["status"] == "active" and view["source"] == "assignment" and view["ownership"] == "external"
        stage = view["stages"][0]
        assert (stage["start_date"], stage["due_date"]) == (date(2026, 11, 2), date(2026, 11, 29))
        essay = _step(view, "Essay")
        assert essay["due_date"] == date(2026, 11, 15)
        assert essay["after_step_uuids"] == [_step(view, "Visit a campus")["step_uuid"]]
        assert essay["locked"] and essay["state"] == "locked"

        # Syncing again issues nothing new; a new group member gets theirs.
        assignment = db.exec(select(GoalAssignment)).one()
        assert assignments.sync_assignment(db, assignment) == []


def test_unpublished_or_archived_templates_cannot_be_handed_out():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Visit"}))
        with pytest.raises(HTTPException, match="Publish"):
            assignments.assign(db, _user(ADMIN), 1, created["template_uuid"], GoalAssignmentCreate(user_id=LEARNER))


# Working through steps --------------------------------------------------------------------

def test_learner_finishes_steps_by_their_type_rules():
    with _session() as db:
        template = _published(
            db,
            {"type": "upload", "title": "Documents", "config": {"slots": [{"key": "resume", "label": "Resume"}, {"key": "site", "label": "Portfolio", "kinds": ["link"]}]}},
            {"type": "write", "title": "Essay"},
            {"type": "task", "title": "Three schools", "config": {"list": {"label": "School", "target": 3}}},
        )
        goal = _issue(db, template)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        documents = _step(view, "Documents")

        with pytest.raises(HTTPException, match="Add Resume first"):
            _status(db, LEARNER, goal, documents, StepStatus.COMPLETED)
        db.add(MediaAsset(asset_uuid="asset_1", owner_user_id=LEARNER, owner_type="user", media_type="document", source_type="upload", filename="resume.pdf", url="https://files.example.com/resume.pdf", creation_date=NOW, update_date=NOW))
        db.commit()
        goals.add_entry(db, _user(LEARNER), goal.goal_uuid, documents["step_uuid"], StepEntryCreate(kind="file", slot="resume", asset_uuid="asset_1", title="resume.pdf"))
        with pytest.raises(HTTPException, match="takes files"):
            goals.add_entry(db, _user(LEARNER), goal.goal_uuid, documents["step_uuid"], StepEntryCreate(kind="link", slot="resume", url="https://x.dev"))
        view = goals.add_entry(db, _user(LEARNER), goal.goal_uuid, documents["step_uuid"], StepEntryCreate(kind="link", slot="site", url="https://lee.dev"))
        documents = _step(view, "Documents")
        assert documents["state"] == "started" and documents["fraction"] == 1.0
        assert len(documents["result"]["files"]) == 2
        assert _step(_status(db, LEARNER, goal, documents, StepStatus.COMPLETED), "Documents")["state"] == "done"

        essay = _step(view, "Essay")
        with pytest.raises(HTTPException, match="Write something"):
            _status(db, LEARNER, goal, essay, StepStatus.COMPLETED)
        with pytest.raises(HTTPException):
            goals.save_submission(db, _user(LEARNER), goal.goal_uuid, essay["step_uuid"], StepSubmission(submission={"words": "no"}))
        goals.save_submission(db, _user(LEARNER), goal.goal_uuid, essay["step_uuid"], StepSubmission(submission={"text": "Because."}))
        view = _status(db, LEARNER, goal, essay, StepStatus.COMPLETED)
        assert _step(view, "Essay")["result"] == {"kind": "text", "text": "Because."}

        schools = _step(view, "Three schools")
        for name in ("A", "B"):
            goals.add_entry(db, _user(LEARNER), goal.goal_uuid, schools["step_uuid"], StepEntryCreate(kind="item", title=name))
        with pytest.raises(HTTPException, match="Add 3 items"):
            _status(db, LEARNER, goal, schools, StepStatus.COMPLETED)
        goals.add_entry(db, _user(LEARNER), goal.goal_uuid, schools["step_uuid"], StepEntryCreate(kind="item", title="C"))
        view = _status(db, LEARNER, goal, schools, StepStatus.COMPLETED)

        # Every step done: an external goal finishes on its own.
        assert view["status"] == "finished" and view["progress"] == {"done": 3, "total": 3}


def test_reviewed_steps_go_to_staff_who_can_send_them_back():
    with _session() as db:
        template = _published(db, {"type": "write", "title": "Essay", "review_required": True}, {"type": "task", "title": "Interview", "completed_by": "staff"})
        goal = _issue(db, template)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        essay, interview = _step(view, "Essay"), _step(view, "Interview")
        assert "complete_restricted_objectives" not in view["capabilities"]

        goals.save_submission(db, _user(LEARNER), goal.goal_uuid, essay["step_uuid"], StepSubmission(submission={"text": "Draft"}))
        view = _status(db, LEARNER, goal, essay, StepStatus.COMPLETED)
        assert _step(view, "Essay")["state"] == "waiting"
        with pytest.raises(HTTPException) as staff_only:
            _status(db, LEARNER, goal, interview, StepStatus.COMPLETED)
        assert staff_only.value.status_code == 403

        view = _status(db, ADMIN, goal, essay, StepStatus.CHANGES_REQUESTED, "Add an example")
        sent_back = _step(view, "Essay")
        assert sent_back["state"] == "retry" and sent_back["feedback_history"][0]["message"] == "Add an example"
        _status(db, LEARNER, goal, essay, StepStatus.SUBMITTED)
        view = _status(db, ADMIN, goal, essay, StepStatus.COMPLETED)
        approved = _step(view, "Essay")
        assert approved["state"] == "done" and approved["completion_method"] == "staff"

        view = _status(db, ADMIN, goal, interview, StepStatus.COMPLETED)
        assert view["status"] == "finished"


def test_in_order_goals_lock_later_steps_until_earlier_ones_are_done_or_waiting():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "First"}, {"type": "write", "title": "Second", "review_required": True}, {"type": "task", "title": "Third"}, step_order="in_order")
        goal = _issue(db, template)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert [step["state"] for step in view["stages"][0]["steps"]] == ["open", "locked", "locked"]
        with pytest.raises(HTTPException) as locked:
            _status(db, LEARNER, goal, _step(view, "Third"), StepStatus.COMPLETED)
        assert locked.value.status_code == 409
        _status(db, LEARNER, goal, _step(view, "First"), StepStatus.COMPLETED)
        goals.save_submission(db, _user(LEARNER), goal.goal_uuid, _step(view, "Second")["step_uuid"], StepSubmission(submission={"text": "Done"}))
        view = _status(db, LEARNER, goal, _step(view, "Second"), StepStatus.COMPLETED)
        # Waiting on review unlocks what follows.
        assert [step["state"] for step in view["stages"][0]["steps"]] == ["done", "waiting", "open"]


def test_staff_can_excuse_and_reopen_steps_but_learners_cannot():
    with _session() as db:
        goal = _issue(db, _published(db, {"type": "task", "title": "Visit"}, {"type": "task", "title": "Tour"}))
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        with pytest.raises(HTTPException):
            _status(db, LEARNER, goal, _step(view, "Visit"), StepStatus.EXCUSED)
        _status(db, ADMIN, goal, _step(view, "Visit"), StepStatus.EXCUSED)
        view = _status(db, LEARNER, goal, _step(view, "Tour"), StepStatus.COMPLETED)
        assert view["status"] == "finished"
        with pytest.raises(HTTPException):
            _status(db, LEARNER, goal, _step(view, "Tour"), StepStatus.NOT_STARTED)
        reopened = _status(db, ADMIN, goal, _step(view, "Tour"), StepStatus.NOT_STARTED)
        assert _step(reopened, "Tour")["state"] == "open"


# Personal goals ----------------------------------------------------------------------------

def test_personal_goals_are_private_learner_owned_and_never_wait_on_staff():
    with _session() as db:
        created = goals.create_personal_goal(db, _user(LEARNER), GoalCreate(title="Pick a major"))
        assert created["ownership"] == "personal" and len(created["stages"]) == 1
        with pytest.raises(HTTPException) as hidden:
            goals.get_goal(db, _user(OTHER), created["goal_uuid"])
        assert hidden.value.status_code == 404
        view = structure.add_stage(db, _user(LEARNER), created["goal_uuid"], StageCreate(title="Research", timing="this fall"))
        research = view["stages"][1]["stage_uuid"]
        with pytest.raises(HTTPException, match="never wait on staff"):
            structure.add_step(db, _user(LEARNER), created["goal_uuid"], StepCreate(stage_uuid=research, type="task", title="Ask", completed_by="staff"))
        view = structure.add_step(db, _user(LEARNER), created["goal_uuid"], StepCreate(stage_uuid=research, type="decision", title="Choose", config={"options": [{"key": "bio", "label": "Biology"}, {"key": "art", "label": "Art"}]}))
        choose = _step(view, "Choose")
        goal = db.exec(select(Goal).where(Goal.goal_uuid == created["goal_uuid"])).one()
        with pytest.raises(HTTPException, match="Make a choice"):
            _status(db, LEARNER, goal, choose, StepStatus.COMPLETED)
        goals.save_submission(db, _user(LEARNER), goal.goal_uuid, choose["step_uuid"], StepSubmission(submission={"choices": ["bio"], "reason": "I like labs"}))
        view = _status(db, LEARNER, goal, choose, StepStatus.COMPLETED)
        assert _step(view, "Choose")["result"] == {"kind": "choice", "choices": ["Biology"], "reason": "I like labs"}
        # Personal goals finish only when the learner says so.
        assert view["status"] == "active"


# Automatic completion ----------------------------------------------------------------------

def test_badge_goals_award_their_badge_and_badge_steps_follow_awards():
    with _session() as db:
        db.add(LearningBadge(id=1, org_id=1, badge_uuid="badge_first_aid", name="First Aid", creation_date=NOW, update_date=NOW))
        db.commit()
        route = _published(db, {"type": "task", "title": "Take the class"})
        badge_goal = _issue(db, route, source=GoalSource.BADGE, badge_id=1)
        badge_goal.owner_user_id = LEARNER
        db.add(badge_goal)
        db.commit()
        uses_badge = _issue(db, _published(db, {"type": "badge", "title": "Earn First Aid", "config": {"badge_uuid": "badge_first_aid"}}, {"type": "task", "title": "Volunteer"}))

        view = goals.get_goal(db, _user(LEARNER), badge_goal.goal_uuid)
        assert "complete_restricted_objectives" not in view["capabilities"]
        _status(db, LEARNER, badge_goal, _step(view, "Take the class"), StepStatus.COMPLETED)
        assert db.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == LEARNER)).one().badge_id == 1
        other = goals.get_goal(db, _user(LEARNER), uses_badge.goal_uuid)
        assert _step(other, "Earn First Aid")["state"] == "done"
        assert _step(other, "Earn First Aid")["completion_method"] == "auto"

        # Awards from elsewhere complete badge steps too, once.
        on_badge_awarded(db, LEARNER, 1)
        assert db.exec(select(StepProgress).where(StepProgress.status == "completed")).all()


def test_activity_steps_finish_from_the_learners_run():
    from src.services.plan_activities import sync_objective_from_run

    with _session() as db:
        goal = _issue(db, _published(db, {"type": "activity", "title": "Interest quiz"}))
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        quiz = _step(view, "Interest quiz")
        assert quiz["reference"]["activity_uuid"] == quiz["config"]["activity_uuid"] and quiz["reference"]["page_count"] >= 0
        with pytest.raises(HTTPException, match="finish on their own"):
            _status(db, LEARNER, goal, quiz, StepStatus.COMPLETED)
        started = goals.start_activity(db, _user(LEARNER), goal.goal_uuid, quiz["step_uuid"])
        assert started["run"]["goal_step_id"] is not None
        run = db.exec(select(LearningRun)).one()
        run.status = LearningRunStatus.COMPLETED
        db.add(run)
        db.commit()
        sync_objective_from_run(db, run)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert _step(view, "Interest quiz")["state"] == "done" and view["status"] == "finished"


def test_completed_steps_credit_their_requirements_and_reopening_withdraws_it():
    from src.db.requirements import (
        RequirementAssignmentBatch,
        RequirementAttainmentSource,
        RequirementEnrollment,
        RequirementFramework,
        RequirementFrameworkVersion,
        RequirementNode,
    )

    with _session() as db:
        for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode, RequirementAssignmentBatch, RequirementEnrollment, RequirementAttainmentSource):
            model.__table__.create(db.get_bind(), checkfirst=True)
        db.add(RequirementFramework(id=1, framework_uuid="framework_1", org_id=1, name="Readiness", creation_date=NOW, update_date=NOW))
        db.add(RequirementFrameworkVersion(id=1, version_uuid="fv_1", framework_id=1, version_number=1, creation_date=NOW, update_date=NOW))
        db.add(RequirementNode(node_version_uuid="nv_1", node_uuid="node_essay", version_id=1, title="Writes an essay", creation_date=NOW, update_date=NOW))
        db.add(RequirementAssignmentBatch(id=1, batch_uuid="batch_1", org_id=1, framework_id=1, version_id=1, user_id=LEARNER, creation_date=NOW, update_date=NOW))
        db.add(RequirementEnrollment(id=1, enrollment_uuid="enrollment_1", batch_id=1, org_id=1, framework_id=1, version_id=1, user_id=LEARNER,
                                     framework_snapshot={"leaf_node_uuids": ["node_essay"]}, creation_date=NOW, update_date=NOW))
        db.commit()
        with pytest.raises(HTTPException, match="unknown requirement"):
            templates.create_template(db, _user(ADMIN), 1, _document({"type": "task", "title": "Essay", "requirement_node_uuids": ["node_other"]}))
        goal = _issue(db, _published(db, {"type": "task", "title": "Essay", "requirement_node_uuids": ["node_essay"]}))
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert _step(view, "Essay")["requirement_links"] == [{"framework_id": 1, "framework_uuid": "framework_1", "node_uuid": "node_essay"}]

        _status(db, LEARNER, goal, _step(view, "Essay"), StepStatus.COMPLETED)
        source = db.exec(select(RequirementAttainmentSource)).one()
        assert source.step_progress_id is not None and source.revoked_at is None
        assert db.get(RequirementEnrollment, 1).status == "completed"

        _status(db, ADMIN, goal, _step(view, "Essay"), StepStatus.NOT_STARTED)
        db.refresh(source)
        assert source.revoked_at is not None and db.get(RequirementEnrollment, 1).status == "active"
