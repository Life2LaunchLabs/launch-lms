from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine, select

from src.db.learning import LearningBadge, LearningBadgeAward, LearningPage, LearningPageProgress, LearningRun
from src.db.guest_sessions import GuestSession
from src.db.media import MediaAsset, MediaOwnerType, MediaSourceType, MediaType
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.planning import (
    Plan,
    PlanActivity,
    PlanAttachment,
    PlanAttachmentCreate,
    PlanCollaborator,
    PlanCollaboratorUpdate,
    PlanCollaboratorRequest,
    PlanCollaboratorRequestCreate,
    PlanCreate,
    PlanInvitation,
    PlanInvitationCreate,
    PlanInvitationKind,
    PlanCommentCreate,
    PlanObjective,
    PlanObjectiveCreate,
    PlanObjectiveProgress,
    PlanObjectiveProgressUpdate,
    PlanObjectiveStatus,
    PlanObjectiveUpdate,
    OrganizationPlanRole,
    OrganizationPlanRoleCreate,
    OrganizationPlanRoleUpdate,
    PlanPhase,
    PlanPhaseCreate,
    PlanPhaseUpdate,
    PlanRole,
    PlanRoleCreate,
    PlanRoleUpdate,
    PlanStatus,
    PlanUpdate,
)
# Register compatibility backing tables referenced by Plan foreign keys.
from src.db.programs import Objective, ObjectiveProgress, ObjectiveProgressStatus, ParticipantStatus, Program, ProgramAssignment, ProgramAssignmentCreate, ProgramCreate, ProgramParticipant
from src.db.users import PublicUser, User
from src.services import planning, programs
from src.routers import planning as planning_router, programs as programs_router
from src.routers.planning import _require_managed_plans as require_planning_managed
from src.routers.planning import _require_managed_assignment as require_planning_assignment
from src.routers.programs import _require_managed_plans as require_legacy_managed
from src.routers.programs import _require_managed_assignment as require_legacy_assignment


NOW = "2026-08-27T12:00:00+00:00"


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, OrganizationConfig.__table__, User.__table__, Program.__table__, ProgramAssignment.__table__, ProgramParticipant.__table__,
        Objective.__table__, ObjectiveProgress.__table__, GuestSession.__table__, LearningBadge.__table__, LearningBadgeAward.__table__, LearningRun.__table__, LearningPage.__table__, LearningPageProgress.__table__,
        Plan.__table__, PlanRole.__table__, PlanCollaborator.__table__, PlanPhase.__table__,
        OrganizationPlanRole.__table__,
        PlanObjective.__table__, PlanObjectiveProgress.__table__, PlanInvitation.__table__, PlanActivity.__table__,
        MediaAsset.__table__, PlanAttachment.__table__, PlanCollaboratorRequest.__table__,
    ])
    session = Session(engine)
    session.add_all([
        User(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="Plan", last_name="Owner", creation_date=NOW, update_date=NOW),
        User(id=2, user_uuid="user_2", username="helper", email="helper@example.com", first_name="Helpful", last_name="Reviewer", creation_date=NOW, update_date=NOW),
        User(id=3, user_uuid="user_3", username="staff", email="staff@example.com", first_name="Staff", last_name="Owner", creation_date=NOW, update_date=NOW),
    ])
    session.commit()
    return session


def _user(user_id: int) -> PublicUser:
    row = {1: ("owner", "owner@example.com"), 2: ("helper", "helper@example.com")}[user_id]
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=row[0], email=row[1], first_name=row[0], last_name="User")


def _plan_create(name: str, **kwargs) -> PlanCreate:
    return PlanCreate(name=name, due_date=date(2027, 12, 31), **kwargs)


def test_personal_plan_is_free_private_and_owner_controlled():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Earn a nursing degree"))
        assert created["subject"]["id"] == 1
        assert created["owner"]["id"] == 1
        assert {"delete_plan", "transfer_ownership", "manage_roles"} <= set(created["capabilities"])
        assert planning.list_plans(db, _user(2)) == []
        with pytest.raises(HTTPException) as denied:
            planning.get_plan(db, _user(2), created["slug"])
        assert denied.value.status_code == 404


def test_recipient_bound_invitation_grants_plan_access_without_org_membership():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Personal discovery"))
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="reviewer", kind=PlanInvitationKind.COLLABORATOR,
        ))
        assert len(planning.list_my_invitations(db, _user(2))) == 1
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        helper_plan = planning.get_plan(db, _user(2), created["slug"])
        assert "complete_restricted_objectives" in helper_plan["capabilities"]
        assert helper_plan["subject"]["id"] == 1


def test_plan_review_queue_is_scoped_to_one_live_plan():
    with _session() as db:
        first = planning.create_plan(db, _user(1), _plan_create("Learner requirements"))
        second = planning.create_plan(db, _user(1), _plan_create("Another learner plan"))
        first_row = db.exec(select(Plan).where(Plan.plan_uuid == first["plan_uuid"])).one()
        second_row = db.exec(select(Plan).where(Plan.plan_uuid == second["plan_uuid"])).one()
        first_row.subject_user_id = 2
        second_row.subject_user_id = 2
        db.add(first_row)
        db.add(second_row)
        db.commit()
        objective = planning.create_objective(db, _user(1), first["plan_uuid"], PlanObjectiveCreate(title="Submit fieldwork evidence"))["objectives"][0]
        planning.update_objective_progress(db, _user(1), first["plan_uuid"], objective["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.SUBMITTED))

        queue = planning.plan_reviews(db, _user(1), first["plan_uuid"])

        assert queue["plan_uuid"] == first["plan_uuid"]
        assert [item["title"] for item in queue["objective_reviews"]] == ["Submit fieldwork evidence"]


def test_feed_only_offers_helping_scope_for_active_helping_plans():
    with _session() as db:
        own = planning.create_plan(db, _user(2), _plan_create("My own plan"))
        assert planning.feed(db, _user(2))["has_helping"] is False

        helped = planning.create_plan(db, _user(1), _plan_create("Plan needing help"))
        invitation = planning.create_invitation(db, _user(1), helped["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="reviewer", kind=PlanInvitationKind.COLLABORATOR,
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        assert planning.feed(db, _user(2))["has_helping"] is True

        planning.change_plan_status(db, _user(1), helped["slug"], PlanStatus.COMPLETED)
        result = planning.feed(db, _user(2))
        assert result["has_helping"] is False
        assert result["scope"] == "all"
        assert planning.get_plan(db, _user(2), own["slug"])["is_mine"] is True


def test_feed_urgency_explore_and_reviewer_field_permissions():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("College path"))
        due = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
            title="Submit application", due_date=date.today() + timedelta(days=7),
            fields=[{"field_uuid": "student_note", "access": "contributor"}, {"field_uuid": "review", "access": "reviewer"}],
        ))["objectives"][0]
        planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="Explore nursing programs"))
        result = planning.feed(db, _user(1))
        assert [item["title"] for item in result["coming_up"]] == ["Submit application"]
        assert result["explore"] == []
        assert "Explore nursing programs" in [item["title"] for group in result["future_groups"] for item in group["items"]]
        assert result["coming_up"][0]["can_edit"] is True
        assert result["coming_up"][0]["viewer_role"]["key"] == "plan_admin"
        assert any(person["is_subject"] for person in result["coming_up"][0]["access_people"])
        assert result["coming_up"][0]["phase_uuid"]
        assert result["coming_up"][0]["phase_name"] == "Getting started"
        detail = planning.get_plan(db, _user(1), created["slug"])
        assert detail["viewer_role"]["key"] == "plan_admin"
        assert next(person for person in detail["collaborators"] if person["user"]["id"] == 1)["is_subject"] is True
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="subject", kind=PlanInvitationKind.COLLABORATOR,
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        helper_item = planning.feed(db, _user(2))["coming_up"][0]
        assert helper_item["viewer_role"]["key"] == "subject"
        assert helper_item["can_contribute_fields"] is True
        assert helper_item["can_contribute_restricted_fields"] is False
        with pytest.raises(HTTPException) as denied:
            planning.update_objective_progress(db, _user(2), created["slug"], due["objective_uuid"], PlanObjectiveProgressUpdate(
                status=PlanObjectiveStatus.IN_PROGRESS, field_values={"review": "approved"},
            ))
        assert denied.value.status_code == 403
        updated = planning.update_objective_progress(db, _user(2), created["slug"], due["objective_uuid"], PlanObjectiveProgressUpdate(
            status=PlanObjectiveStatus.IN_PROGRESS, field_values={"student_note": "Drafted"},
        ))
        assert updated["progress"]["field_values"] == {"student_note": "Drafted"}


def test_objective_position_updates_drive_plan_and_overview_order():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("College path"))
        first = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="First step"))["objectives"][0]
        second = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="Second step"))["objectives"][1]

        planning.update_objective(db, _user(1), created["slug"], first["objective_uuid"], PlanObjectiveUpdate(position=1))
        updated = planning.update_objective(db, _user(1), created["slug"], second["objective_uuid"], PlanObjectiveUpdate(position=0))

        assert [item["title"] for item in updated["objectives"]] == ["Second step", "First step"]
        feed_titles = [item["title"] for group in planning.feed(db, _user(1))["future_groups"] for item in group["items"]]
        assert feed_titles == ["Second step", "First step"]


def test_plan_and_objective_target_dates_are_required_and_bounded():
    with _session() as db:
        with pytest.raises(HTTPException) as missing_target:
            planning.create_plan(db, _user(1), PlanCreate(name="No target"))
        assert missing_target.value.status_code == 422

        created = planning.create_plan(db, _user(1), PlanCreate(
            name="Bounded plan", start_date=date(2026, 9, 1), due_date=date(2026, 12, 31),
        ))
        first_phase = created["phases"][0]
        planning.update_phase(db, _user(1), created["slug"], first_phase["phase_uuid"], PlanPhaseUpdate(
            due_date=date(2026, 10, 31),
        ))
        second_phase = planning.create_phase(db, _user(1), created["slug"], PlanPhaseCreate(
            name="Second phase", due_date=date(2026, 12, 15),
        ))["phases"][-1]

        with pytest.raises(HTTPException) as objective_outside_phase:
            planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
                title="Too late", phase_uuid=first_phase["phase_uuid"], due_date=date(2026, 11, 1),
            ))
        assert objective_outside_phase.value.status_code == 422

        with pytest.raises(HTTPException) as phase_crosses_next:
            planning.update_phase(db, _user(1), created["slug"], first_phase["phase_uuid"], PlanPhaseUpdate(
                due_date=date(2026, 12, 20),
            ))
        assert phase_crosses_next.value.status_code == 422

        with pytest.raises(HTTPException) as plan_before_phase:
            planning.update_plan(db, _user(1), created["slug"], PlanUpdate(due_date=date(2026, 12, 1)))
        assert plan_before_phase.value.status_code == 422
        assert second_phase["effective_due_date"] == date(2026, 12, 15)


def test_completed_objective_steps_require_reopening_before_definition_changes():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Reopen steps"))
        objective = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
            title="Choose a career", fields=[{"field_uuid": "decision", "type": "text", "title": "My choice"}],
        ))["objectives"][0]
        planning.update_objective_progress(db, _user(1), created["slug"], objective["objective_uuid"], PlanObjectiveProgressUpdate(
            status=PlanObjectiveStatus.COMPLETED,
        ))

        with pytest.raises(HTTPException) as completed:
            planning.update_objective(db, _user(1), created["slug"], objective["objective_uuid"], PlanObjectiveUpdate(
                fields=[{"field_uuid": "decision", "type": "text", "title": "Updated choice"}],
            ))
        assert completed.value.status_code == 409

        planning.update_objective_progress(db, _user(1), created["slug"], objective["objective_uuid"], PlanObjectiveProgressUpdate(
            status=PlanObjectiveStatus.IN_PROGRESS,
        ))
        reopened = planning.update_objective(db, _user(1), created["slug"], objective["objective_uuid"], PlanObjectiveUpdate(
            fields=[{"field_uuid": "decision", "type": "text", "title": "Updated choice"}],
        ))
        assert reopened["objectives"][0]["fields"][0]["title"] == "Updated choice"


def test_badges_are_objective_requirements_and_legacy_badge_objectives_are_rejected():
    with _session() as db:
        badge = LearningBadge(
            id=1, badge_uuid="badge_1", org_id=1, name="Clinical practice",
            thumbnail_image="/badge.png", creation_date=NOW, update_date=NOW,
        )
        second_badge = LearningBadge(
            id=2, badge_uuid="badge_2", org_id=1, name="Workplace safety",
            creation_date=NOW, update_date=NOW,
        )
        db.add_all([badge, second_badge])
        db.commit()
        created = planning.create_plan(db, _user(1), _plan_create("Placement plan"))

        updated = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
            title="Prepare for placement",
            fields=[{
                "field_uuid": "badge_requirement_1", "type": "badge",
                "title": "Clinical practice", "badge_uuid": badge.badge_uuid,
            }, {
                "field_uuid": "badge_requirement_2", "type": "badge",
                "title": "Workplace safety", "badge_uuid": second_badge.badge_uuid,
            }],
        ))

        objective = updated["objectives"][0]
        assert objective["kind"] == "custom"
        assert objective["fields"][0]["badge"]["thumbnail_image"] == "/badge.png"
        assert objective["fields"][0]["progress_percent"] == 0
        assert objective["fields"][1]["badge"]["name"] == "Workplace safety"
        assert objective["fields"][1]["progress_percent"] == 0
        stored = db.exec(select(PlanObjective).where(PlanObjective.objective_uuid == objective["objective_uuid"])).one()
        assert stored.badge_id == badge.id

        db.add(LearningBadgeAward(
            award_uuid="award_1", badge_id=badge.id, org_id=1, user_id=1,
            creation_date=NOW, update_date=NOW,
        ))
        db.commit()
        refreshed = planning.get_plan(db, _user(1), created["slug"])
        assert refreshed["objectives"][0]["fields"][0]["progress_percent"] == 100
        assert refreshed["objectives"][0]["fields"][1]["progress_percent"] == 0

        with pytest.raises(HTTPException) as legacy:
            planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
                title="Old badge objective", kind="badge", badge_uuid=badge.badge_uuid,
            ))
        assert legacy.value.status_code == 422


def test_materialized_badge_snapshots_become_badge_requirements():
    with _session() as db:
        badge = LearningBadge(
            id=1, badge_uuid="badge_1", org_id=1, name="Clinical practice",
            creation_date=NOW, update_date=NOW,
        )
        db.add(badge)
        db.flush()

        fields = planning._materialized_objective_fields(db, {
            "id": 7, "objective_uuid": "objective_7", "kind": "badge", "badge_id": badge.id,
        })

        assert fields == [{
            "field_uuid": "badge_requirement_objective_7",
            "title": "Clinical practice", "type": "badge",
            "badge_uuid": "badge_1", "restricted": False,
        }]


def test_legacy_learning_runs_link_only_to_unambiguous_badge_requirements():
    with _session() as db:
        badge = LearningBadge(
            id=1, badge_uuid="badge_1", org_id=1, name="Clinical practice",
            creation_date=NOW, update_date=NOW,
        )
        linked_plan = Plan(
            plan_uuid="plan_linked", slug="linked", name="Linked plan",
            owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW,
        )
        ambiguous_plan = Plan(
            plan_uuid="plan_ambiguous", slug="ambiguous", name="Ambiguous plan",
            owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW,
        )
        db.add_all([badge, linked_plan, ambiguous_plan])
        db.flush()
        linked_objective = PlanObjective(
            objective_uuid="objective_linked", plan_id=linked_plan.id,
            title="Complete placement", kind="custom", badge_id=badge.id,
            fields=[{"field_uuid": "badge_1", "type": "badge", "badge_uuid": badge.badge_uuid}],
            creation_date=NOW, update_date=NOW,
        )
        db.add_all([
            linked_objective,
            PlanObjective(
                objective_uuid="objective_ambiguous_1", plan_id=ambiguous_plan.id,
                title="First placement", kind="custom", badge_id=badge.id,
                fields=[{"field_uuid": "badge_1a", "type": "badge", "badge_uuid": badge.badge_uuid}],
                creation_date=NOW, update_date=NOW,
            ),
            PlanObjective(
                objective_uuid="objective_ambiguous_2", plan_id=ambiguous_plan.id,
                title="Second placement", kind="custom", badge_id=badge.id,
                fields=[{"field_uuid": "badge_1b", "type": "badge", "badge_uuid": badge.badge_uuid}],
                creation_date=NOW, update_date=NOW,
            ),
        ])
        db.flush()
        linked_run = LearningRun(
            run_uuid="run_linked", badge_id=badge.id, path_id=1, org_id=1,
            program_assignment_id=10, program_participant_id=20, user_id=2,
            creation_date=NOW, update_date=NOW,
        )
        ambiguous_run = LearningRun(
            run_uuid="run_ambiguous", badge_id=badge.id, path_id=1, org_id=1,
            program_assignment_id=11, program_participant_id=20, user_id=2,
            creation_date=NOW, update_date=NOW,
        )
        db.add_all([linked_run, ambiguous_run])
        db.flush()

        planning._link_legacy_learning_runs(db, 10, 20, 2, linked_plan)
        planning._link_legacy_learning_runs(db, 11, 20, 2, ambiguous_plan)
        db.flush()

        assert linked_run.plan_id == linked_plan.id
        assert linked_run.plan_objective_id == linked_objective.id
        assert ambiguous_run.plan_id is None
        assert ambiguous_run.plan_objective_id is None


def test_structure_schedule_role_and_leave_permissions_are_independent():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Permission lanes"))
        structure_role = planning.create_role(db, _user(1), created["slug"], PlanRoleCreate(
            key="structure_editor", name="Structure editor",
            capabilities=["view_plan", "edit_structure"],
        ))
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key=structure_role["key"],
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)

        detail = planning.get_plan(db, _user(2), created["slug"])
        phase_uuid = detail["phases"][0]["phase_uuid"]
        planning.update_phase(db, _user(2), created["slug"], phase_uuid, PlanPhaseUpdate(name="First steps"))
        with pytest.raises(HTTPException) as denied:
            planning.update_phase(db, _user(2), created["slug"], phase_uuid, PlanPhaseUpdate(due_date=date.today()))
        assert denied.value.status_code == 403

        objective = planning.create_objective(db, _user(2), created["slug"], PlanObjectiveCreate(title="Choose a direction"))["objectives"][0]
        planning.update_objective(db, _user(2), created["slug"], objective["objective_uuid"], PlanObjectiveUpdate(title="Choose the direction"))
        with pytest.raises(HTTPException) as denied:
            planning.update_objective(db, _user(2), created["slug"], objective["objective_uuid"], PlanObjectiveUpdate(due_date=date.today()))
        assert denied.value.status_code == 403
        assert planning.leave_plan(db, _user(2), created["slug"])["left"] is True
        with pytest.raises(HTTPException) as hidden:
            planning.get_plan(db, _user(2), created["slug"])
        assert hidden.value.status_code == 404
        with pytest.raises(HTTPException) as owner_cannot_leave:
            planning.leave_plan(db, _user(1), created["slug"])
        assert owner_cannot_leave.value.status_code == 422


def test_role_manager_cannot_create_a_more_powerful_role():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("No escalation"))
        manager = planning.create_role(db, _user(1), created["slug"], PlanRoleCreate(
            key="role_manager", name="Role manager",
            capabilities=["view_plan", "manage_roles"], grantable_role_keys=["viewer"],
        ))
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key=manager["key"],
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        with pytest.raises(HTTPException) as denied:
            planning.create_role(db, _user(2), created["slug"], PlanRoleCreate(
                key="admin_by_stealth", name="Admin by stealth",
                capabilities=["view_plan", "edit_structure"],
            ))
        assert denied.value.status_code == 403


def test_comments_activity_and_plan_scoped_attachments():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Evidence plan"))
        asset = MediaAsset(
            asset_uuid="asset_evidence", owner_type=MediaOwnerType.user,
            owner_user_id=1, created_by_user_id=1, source_type=MediaSourceType.upload,
            media_type=MediaType.image, title="Evidence", url="/evidence.png",
            filename="evidence.png", mime_type="image/png", creation_date=NOW, update_date=NOW,
        )
        db.add(asset)
        db.commit()

        comment = planning.add_comment(db, _user(1), created["slug"], PlanCommentCreate(body="  Useful context  "))
        assert comment["action"] == "comment.added"
        assert comment["payload"]["body"] == "Useful context"
        attachment = planning.add_attachment(db, _user(1), created["slug"], PlanAttachmentCreate(asset_uuid=asset.asset_uuid))
        assert attachment["mime_type"] == "image/png"
        assert [item["asset_uuid"] for item in planning.list_attachments(db, _user(1), created["slug"])] == [asset.asset_uuid]
        assert planning.remove_attachment(db, _user(1), created["slug"], asset.asset_uuid)["removed"] is True
        actions = [item["action"] for item in planning.list_activity(db, _user(1), created["slug"])]
        assert {"comment.added", "attachment.added", "attachment.removed"} <= set(actions)


def test_subject_can_request_but_not_directly_invite_a_collaborator():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Requested help"))
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="subject",
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        with pytest.raises(HTTPException) as denied:
            planning.create_invitation(db, _user(2), created["slug"], PlanInvitationCreate(
                email="reviewer@example.com", role_key="reviewer",
            ))
        assert denied.value.status_code == 403

        request = planning.create_collaborator_request(db, _user(2), created["slug"], PlanCollaboratorRequestCreate(
            email="reviewer@example.com", role_key="reviewer", message="Please review my work",
        ))
        assert request["status"] == "pending"
        assert [item["request_uuid"] for item in planning.list_collaborator_requests(db, _user(2), created["slug"])] == [request["request_uuid"]]
        resolved = planning.respond_to_collaborator_request(db, _user(1), created["slug"], request["request_uuid"], True)
        assert resolved["status"] == "approved"
        assert resolved["invitation"]["email"] == "reviewer@example.com"


def test_group_plan_entitlement_applies_to_planning_and_legacy_adapters():
    with _session() as db:
        db.add_all([
            OrganizationConfig(id=1, org_id=10, config={"config_version": "2.0", "plan": "free"}, creation_date=NOW, update_date=NOW),
            OrganizationConfig(id=2, org_id=20, config={"config_version": "2.0", "plan": "full"}, creation_date=NOW, update_date=NOW),
        ])
        db.commit()
        for require in (require_planning_managed, require_legacy_managed):
            with pytest.raises(HTTPException) as denied:
                require(10, db)
            assert denied.value.status_code == 403
            require(20, db)


def test_free_org_can_create_templates_through_planning_and_legacy_adapters(monkeypatch):
    with _session() as db:
        payload = ProgramCreate(org_id=10, name="Free template")
        calls = []

        def create_template(_db, _user, received):
            calls.append(received.name)
            return {"program_uuid": "program_free", "name": received.name}

        monkeypatch.setattr(programs, "create_program", create_template)
        assert planning_router.api_create_template(payload, db, _user(1))["name"] == "Free template"
        assert programs_router.api_create_program(payload, db, _user(1))["name"] == "Free template"
        assert calls == ["Free template", "Free template"]


def test_free_org_can_assign_individuals_but_not_groups(monkeypatch):
    with _session() as db:
        db.add(OrganizationConfig(id=1, org_id=10, config={"config_version": "2.0", "plan": "free"}, creation_date=NOW, update_date=NOW))
        db.commit()
        calls = []

        def assign(_db, _user, org_id, template_uuid, payload):
            calls.append((org_id, template_uuid, payload.user_id, payload.subject_email))
            return {"assignment_uuid": "assignment_direct"}

        monkeypatch.setattr(programs, "assign_program", assign)
        direct = ProgramAssignmentCreate(user_id=2)
        external = ProgramAssignmentCreate(subject_email="outside@example.com")
        group = ProgramAssignmentCreate(usergroup_id=7)
        handlers = (
            lambda payload: planning_router.api_assign_template("template_1", 10, payload, db, _user(1)),
            lambda payload: programs_router.api_assign_program("template_1", payload, 10, db, _user(1)),
        )
        for handler in handlers:
            assert handler(direct)["assignment_uuid"] == "assignment_direct"
            assert handler(external)["assignment_uuid"] == "assignment_direct"
            with pytest.raises(HTTPException) as denied:
                handler(group)
            assert denied.value.status_code == 403
        assert len(calls) == 4


def test_free_org_can_manage_direct_assignments_but_not_group_assignments():
    with _session() as db:
        db.add(OrganizationConfig(id=1, org_id=10, config={"config_version": "2.0", "plan": "free"}, creation_date=NOW, update_date=NOW))
        program = Program(program_uuid="program_access", slug="program-access", org_id=10, name="Access test", creation_date=NOW, update_date=NOW)
        db.add(program)
        db.flush()
        db.add_all([
            ProgramAssignment(assignment_uuid="assignment_direct", org_id=10, program_id=program.id, user_id=2, creation_date=NOW, update_date=NOW),
            ProgramAssignment(assignment_uuid="assignment_group", org_id=10, program_id=program.id, usergroup_id=7, creation_date=NOW, update_date=NOW),
        ])
        db.commit()
        for require in (require_planning_assignment, require_legacy_assignment):
            require(10, "assignment_direct", db)
            with pytest.raises(HTTPException) as denied:
                require(10, "assignment_group", db)
            assert denied.value.status_code == 403


def test_template_roles_are_validated_and_copied_into_live_plans():
    with _session() as db:
        definitions = [
            {"key": "subject", "name": "Learner", "capabilities": ["view_plan", "update_progress"]},
            {"key": "coach", "name": "Coach", "capabilities": ["view_plan", "review_badge_submissions"]},
            {"key": "plan_admin", "name": "Plan lead", "capabilities": ["view_plan", "manage_roles"]},
        ]
        normalized, subject_key, staff_key = programs._validated_template_roles(definitions, "subject", "coach")
        plan = Plan(plan_uuid="plan_roles", slug="roles", name="Roles", owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW)
        db.add(plan)
        db.flush()
        roles = planning._seed_roles(db, plan, normalized)
        assert (subject_key, staff_key) == ("subject", "coach")
        assert roles["subject"].name == "Learner"
        assert roles["coach"].capabilities == ["view_plan", "review_badge_submissions"]
        with pytest.raises(HTTPException):
            programs._validated_template_roles(definitions, "missing", "coach")


def test_subject_identity_is_fixed_but_subject_role_can_change():
    with _session() as db:
        plan = Plan(
            plan_uuid="plan_fixed_subject", slug="fixed-subject", name="Fixed subject",
            owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW,
        )
        db.add(plan)
        db.flush()
        roles = planning._seed_roles(db, plan)
        owner = PlanCollaborator(
            collaborator_uuid="collaborator_owner", plan_id=plan.id, user_id=1,
            role_id=roles["plan_admin"].id, creation_date=NOW, update_date=NOW,
        )
        subject = PlanCollaborator(
            collaborator_uuid="collaborator_subject", plan_id=plan.id, user_id=2,
            role_id=roles["subject"].id, creation_date=NOW, update_date=NOW,
        )
        db.add_all([owner, subject])
        db.commit()

        detail = planning.update_collaborator(
            db, _user(1), plan.plan_uuid, subject.collaborator_uuid,
            PlanCollaboratorUpdate(role_key="plan_admin"),
        )
        assert detail["subject"]["id"] == 2
        assert next(item for item in detail["collaborators"] if item["user"]["id"] == 2)["role"]["key"] == "plan_admin"
        with pytest.raises(HTTPException) as cannot_remove:
            planning.remove_collaborator(db, _user(1), plan.plan_uuid, subject.collaborator_uuid)
        assert cannot_remove.value.status_code == 422


def test_restricted_fields_and_completion_require_explicit_role_permissions():
    with _session() as db:
        plan = Plan(
            plan_uuid="plan_restricted_objective", slug="restricted-objective", name="Restricted objective",
            owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW,
        )
        db.add(plan)
        db.flush()
        roles = planning._seed_roles(db, plan)
        db.add_all([
            PlanCollaborator(collaborator_uuid="restricted_owner", plan_id=plan.id, user_id=1, role_id=roles["plan_admin"].id, creation_date=NOW, update_date=NOW),
            PlanCollaborator(collaborator_uuid="restricted_learner", plan_id=plan.id, user_id=2, role_id=roles["subject"].id, creation_date=NOW, update_date=NOW),
        ])
        db.commit()
        objective = planning.create_objective(db, _user(1), plan.plan_uuid, PlanObjectiveCreate(
            title="Reviewer confirms attendance",
            completion_restricted=True,
            fields=[
                {"field_uuid": "learner_note", "title": "Learner note", "restricted": False},
                {"field_uuid": "reviewer_confirmation", "title": "Reviewer confirmation", "restricted": True},
            ],
        ))["objectives"][0]

        planning.update_objective_progress(
            db, _user(2), plan.plan_uuid, objective["objective_uuid"],
            PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.IN_PROGRESS, field_values={"learner_note": "Attended"}),
        )
        with pytest.raises(HTTPException) as field_denied:
            planning.update_objective_progress(
                db, _user(2), plan.plan_uuid, objective["objective_uuid"],
                PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.IN_PROGRESS, field_values={"reviewer_confirmation": "Confirmed"}),
            )
        assert field_denied.value.status_code == 403
        with pytest.raises(HTTPException) as completion_denied:
            planning.update_objective_progress(
                db, _user(2), plan.plan_uuid, objective["objective_uuid"],
                PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED),
            )
        assert completion_denied.value.status_code == 403

        completed = planning.update_objective_progress(
            db, _user(1), plan.plan_uuid, objective["objective_uuid"],
            PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED, field_values={"reviewer_confirmation": "Confirmed"}),
        )
        assert completed["progress"]["status"] == "completed"


def test_plan_admin_role_is_locked_and_always_has_every_permission():
    with _session() as db:
        plan = Plan(
            plan_uuid="plan_locked_admin", slug="locked-admin", name="Locked admin",
            owner_user_id=1, subject_user_id=2, creation_date=NOW, update_date=NOW,
        )
        db.add(plan)
        db.flush()
        roles = planning._seed_roles(db, plan, [{
            "key": "plan_admin", "name": "Plan admin", "capabilities": ["view_plan"],
        }])
        admin = PlanCollaborator(
            collaborator_uuid="collaborator_admin", plan_id=plan.id, user_id=2,
            role_id=roles["plan_admin"].id, creation_date=NOW, update_date=NOW,
        )
        db.add(admin)
        db.commit()

        assert planning.capabilities_for(db, plan, 2) == planning.ALL_CAPABILITIES
        with pytest.raises(HTTPException) as locked:
            planning.update_role(
                db, _user(1), plan.plan_uuid, roles["plan_admin"].role_uuid,
                PlanRoleUpdate(name="Restricted", capabilities=["view_plan"]),
            )
        assert locked.value.status_code == 422


def test_custom_organization_roles_are_reused_across_managed_plans(monkeypatch):
    with _session() as db:
        org = Organization(id=1, org_uuid="org_roles", name="Role org", slug="role-org", email="roles@example.com", creation_date=NOW, update_date=NOW)
        db.add(org)
        first = planning.create_plan(db, _user(1), _plan_create("First managed plan"))
        second = planning.create_plan(db, _user(1), _plan_create("Second managed plan"))
        first_plan = planning._plan_or_404(db, first["plan_uuid"])
        second_plan = planning._plan_or_404(db, second["plan_uuid"])
        first_plan.source_org_id = org.id
        second_plan.source_org_id = org.id
        db.add_all([first_plan, second_plan])
        db.commit()
        monkeypatch.setattr(planning, "require_org_admin", lambda *_args: None)

        created = planning.create_organization_role(
            db, _user(1), first_plan.plan_uuid,
            OrganizationPlanRoleCreate(name="Field coach", capabilities=["view_plan", "comment"]),
        )
        local_roles = db.exec(select(PlanRole).where(PlanRole.key == created["key"])).all()
        assert {role.plan_id for role in local_roles} == {first_plan.id, second_plan.id}

        planning.update_organization_role(
            db, _user(1), first_plan.plan_uuid, created["role_uuid"],
            OrganizationPlanRoleUpdate(name="Lead coach", capabilities=["view_plan"]),
        )
        updated = db.exec(select(PlanRole).where(PlanRole.key == created["key"])).all()
        assert all(role.name == "Lead coach" and role.capabilities == ["view_plan"] for role in updated)


def test_scheduled_managed_invitation_is_hidden_until_initiation():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Scheduled plan"))
        plan = planning._plan_or_404(db, created["slug"])
        assignment = ProgramAssignment(
            id=10, assignment_uuid="assignment_future", org_id=1, program_id=1,
            initiate_date=datetime.now(timezone.utc) + timedelta(days=2),
            created_by_user_id=1, owner_user_id=1, creation_date=NOW, update_date=NOW,
        )
        db.add(assignment)
        db.flush()
        plan.source_assignment_id = assignment.id
        plan.subject_user_id = None
        db.add(plan)
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="subject", kind=PlanInvitationKind.SUBJECT,
        ))
        assert planning.list_my_invitations(db, _user(2)) == []
        with pytest.raises(HTTPException) as unavailable:
            planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        assert unavailable.value.status_code == 409


def test_feed_explore_expansion_and_active_item_boundaries():
    with _session() as db:
        created = planning.create_plan(db, _user(1), _plan_create("Feed boundaries"))
        for index in range(6):
            planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title=f"Explore {index}"))
        blocked = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="Blocked"))["objectives"][-1]
        planning.update_objective(db, _user(1), created["slug"], blocked["objective_uuid"], PlanObjectiveUpdate(blocked=True))
        future = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
            title="Beyond right now", due_date=date.today() + timedelta(days=8),
        ))["objectives"][-1]
        completed = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="Already done"))["objectives"][-1]
        planning.update_objective_progress(db, _user(1), created["slug"], completed["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED))

        collapsed = planning.feed(db, _user(1))
        expanded = planning.feed(db, _user(1), explore_all=True)
        assert collapsed["explore"] == []
        assert expanded["explore"] == []
        assert collapsed["explore_total"] == 0
        future_items = [item for group in collapsed["future_groups"] for item in group["items"]]
        assert future["objective_uuid"] in [item["objective_uuid"] for item in future_items]
        assert all(f"Explore {index}" in [item["title"] for item in future_items] for index in range(6))
        visible_titles = {item["title"] for item in collapsed["coming_up"] + future_items}
        assert "Blocked" not in visible_titles
        assert "Already done" not in visible_titles


def test_adaptive_future_groups_split_dense_months_and_merge_sparse_neighbors():
    today = date(2026, 8, 27)
    dense = [{"due_date": date(2026, 10, day), "title": str(day)} for day in range(1, 13)]
    sparse = [
        {"due_date": date(2026, 11, 2), "title": "November"},
        {"due_date": date(2026, 12, 2), "title": "December"},
    ]
    groups = planning._adaptive_future_groups(dense + sparse, today)
    assert sum(len(group["items"]) for group in groups) == 14
    assert any("Week" in group["label"] for group in groups)
    assert any("November 2026" in group["label"] and "December 2026" in group["label"] for group in groups)


def test_external_email_assignment_materializes_pending_recipient_bound_plan():
    with _session() as db:
        program = Program(
            id=1, program_uuid="program_external", slug="external", org_id=1,
            name="External pathway", created_by_user_id=1,
            role_definitions=[], creation_date=NOW, update_date=NOW,
        )
        assignment = ProgramAssignment(
            id=20, assignment_uuid="assignment_external", org_id=1, program_id=1,
            subject_email="future@example.com", owner_user_id=1, created_by_user_id=1,
            staff_user_ids=[], objective_snapshot=[{
                "id": 50, "objective_uuid": "legacy_objective", "title": "Prepare evidence",
                "kind": "custom", "phase_uuid": "phase_1", "phase_name": "Prepare",
            }], creation_date=NOW, update_date=NOW,
        )
        db.add_all([program, assignment])
        db.flush()
        planning.materialize_external_assignment_plan(db, assignment.id, assignment.subject_email)
        db.commit()

        owned = planning.list_plans(db, _user(1), "pending")
        assert len(owned) == 1
        assert owned[0]["subject"] is None
        recipient = PublicUser(id=99, user_uuid="future", username="future", email="future@example.com", first_name="Future", last_name="User")
        invitations = planning.list_my_invitations(db, recipient)
        assert len(invitations) == 1
        assert invitations[0]["kind"] == PlanInvitationKind.SUBJECT
        assert invitations[0]["plan"]["name"] == "External pathway"


def test_legacy_program_and_participant_identifiers_resolve_precise_plan():
    with _session() as db:
        program = Program(id=1, program_uuid="program_legacy", slug="legacy-path", org_id=1, name="Legacy", creation_date=NOW, update_date=NOW)
        assignment = ProgramAssignment(id=30, assignment_uuid="assignment_legacy", org_id=1, program_id=1, user_id=1, creation_date=NOW, update_date=NOW)
        participant = ProgramParticipant(id=40, participant_uuid="participant_legacy", assignment_id=30, org_id=1, user_id=1, status=ParticipantStatus.ACTIVE, creation_date=NOW, update_date=NOW)
        db.add_all([program, assignment, participant])
        created = planning.create_plan(db, _user(1), _plan_create("Migrated legacy plan"))
        plan = planning._plan_or_404(db, created["slug"])
        plan.source_program_id = program.id
        plan.source_assignment_id = assignment.id
        db.add(plan)
        db.commit()
        assert planning.resolve_legacy_plan(db, _user(1), program.slug)["slug"] == plan.slug
        assert planning.resolve_legacy_plan(db, _user(1), participant.participant_uuid)["slug"] == plan.slug


def test_assignment_materialization_is_idempotent_and_preserves_states_owner_roles_and_progress():
    with _session() as db:
        definitions = [
            {"key": "subject", "name": "Learner", "capabilities": ["view_plan", "update_progress"]},
            {"key": "coach", "name": "Coach", "capabilities": ["view_plan", "review_badge_submissions"]},
            {"key": "plan_admin", "name": "Lead", "capabilities": ["view_plan", "manage_roles"]},
        ]
        program = Program(
            id=1, program_uuid="program_batch", slug="batch", org_id=1, name="Batch plan",
            role_definitions=definitions, default_subject_role_key="subject", default_staff_role_key="coach",
            created_by_user_id=1, creation_date=NOW, update_date=NOW,
        )
        objective = Objective(id=70, objective_uuid="objective_70", org_id=1, title="Shared objective", creation_date=NOW, update_date=NOW)
        assignment = ProgramAssignment(
            id=50, assignment_uuid="assignment_batch", org_id=1, program_id=1,
            owner_user_id=3, created_by_user_id=1, staff_user_ids=[3],
            objective_snapshot=[{
                "id": 70, "objective_uuid": "objective_70", "title": "Shared objective",
                "kind": "custom", "phase_uuid": "phase_batch", "phase_name": "Batch phase",
            }], creation_date=NOW, update_date=NOW,
        )
        participants = [
            ProgramParticipant(id=51, participant_uuid="participant_invited", assignment_id=50, org_id=1, user_id=1, status=ParticipantStatus.INVITED, creation_date=NOW, update_date=NOW),
            ProgramParticipant(id=52, participant_uuid="participant_completed", assignment_id=50, org_id=1, user_id=2, status=ParticipantStatus.COMPLETED, creation_date=NOW, update_date=NOW),
        ]
        progress = ObjectiveProgress(
            progress_uuid="progress_shared", org_id=1, objective_id=70, user_id=2,
            status=ObjectiveProgressStatus.COMPLETED, learner_note="Done", evidence=[{"url": "/proof.pdf"}],
            creation_date=NOW, update_date=NOW,
        )
        db.add_all([program, objective, assignment, *participants, progress])
        db.flush()
        planning.materialize_assignment_plans(db, assignment.id)
        planning.materialize_assignment_plans(db, assignment.id)
        db.commit()

        plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id).order_by(Plan.subject_user_id)).all()
        assert len(plans) == 2
        assert {plan.owner_user_id for plan in plans} == {3}
        assert {str(plan.status.value if hasattr(plan.status, "value") else plan.status) for plan in plans} == {"pending", "completed"}
        completed_plan = next(plan for plan in plans if plan.subject_user_id == 2)
        roles = db.exec(select(PlanRole).where(PlanRole.plan_id == completed_plan.id)).all()
        assert {role.key: role.name for role in roles} == {"subject": "Learner", "coach": "Coach", "plan_admin": "Lead"}
        copied = db.exec(select(PlanObjectiveProgress).join(PlanObjective, PlanObjective.id == PlanObjectiveProgress.plan_objective_id).where(PlanObjective.plan_id == completed_plan.id)).one()
        assert copied.status == PlanObjectiveStatus.COMPLETED
        assert copied.subject_note == "Done"
        assert copied.field_values == {"legacy_evidence": [{"url": "/proof.pdf"}]}
        pending_invites = db.exec(select(PlanInvitation).where(PlanInvitation.plan_id == plans[0].id)).all()
        assert len(pending_invites) == 1
        assert pending_invites[0].status == "pending"
