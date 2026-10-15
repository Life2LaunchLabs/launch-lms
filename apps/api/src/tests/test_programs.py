import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.organizations import Organization
from src.db.learning import LearningBadgeAward, LearningPage, LearningPageProgress, LearningRun
from src.db.media import MediaAsset
from src.db.messages import InboxMessage
from src.db.organization_config import OrganizationConfig
from src.db.planning import (
    OrganizationPlanRole,
    Plan,
    PlanActivity,
    PlanAttachment,
    PlanCollaborator,
    PlanCollaboratorRequest,
    PlanInvitation,
    PlanObjective,
    PlanObjectiveProgress,
    PlanPhase,
    PlanRole,
)
from src.db.roles import Role
from src.services import template_versions
from src.db.programs import (
    Objective,
    ObjectiveCreate,
    ObjectiveProgress,
    ObjectiveProgressStatus,
    Program,
    ProgramAssignment,
    ProgramAssignmentCreate,
    ProgramCreate,
    ProgramObjective,
    ProgramPhase,
    ProgramTemplateVersion,
    FrozenActivity,
    ProgramPhaseCreate,
    ProgramPhaseUpdate,
    ProgramPhaseOrder,
    ProgramReorder,
    ProgramParticipant,
    ProgramObjectiveUpdate,
)
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.programs import (
    add_program_objective,
    assign_program,
    assignment_matrix,
    cohort_overview,
    copy_program_from_library,
    create_program_phase,
    create_program,
    ensure_group_participants,
    get_program,
    list_program_assignments,
    list_program_library,
    mark_my_program_invitations_viewed,
    my_program_summaries,
    reorder_program,
    publish_program_to_library,
    respond_to_invitation,
    update_progress,
    update_program_objective,
    update_program_phase,
)


NOW = "2026-08-18T12:00:00+00:00"


def test_owner_can_publish_searchable_template_and_other_org_gets_independent_copy():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        session.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
        session.commit()
        source = create_program(session, admin, ProgramCreate(org_id=1, name="Career Launch", description="A shared starting point"))
        source = add_program_objective(session, admin, 1, source["program_uuid"], ObjectiveCreate(title="Build a portfolio"))
        publish_program_to_library(session, admin, 1, source["program_uuid"])

        assert [item["name"] for item in list_program_library(session, admin, 2, "career")] == ["Career Launch"]
        copied = copy_program_from_library(session, admin, 2, source["program_uuid"])
        assert copied["org_id"] == 2
        assert copied["source_program_uuid"] == source["program_uuid"]
        assert copied["objectives"][0]["title"] == "Build a portfolio"
        assert copied["objectives"][0]["objective_uuid"] != source["objectives"][0]["objective_uuid"]

        # Updating the library snapshot is safe after the first publication.
        republished = publish_program_to_library(session, admin, 1, source["program_uuid"])
        assert republished["published_to_library"] is True

        update_program_objective(
            session, admin, 2, copied["program_uuid"], copied["objectives"][0]["objective_uuid"],
            ProgramObjectiveUpdate(title="Partner portfolio", default_start_rule="any_time", default_due_rule="phase_end"),
        )
        unchanged = get_program(session, admin, 1, source["program_uuid"])
        assert unchanged["objectives"][0]["title"] == "Build a portfolio"


def test_non_owner_org_cannot_publish_plan_template_to_library():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        session.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
        session.commit()
        template = create_program(session, admin, ProgramCreate(org_id=2, name="Private template"))
        with pytest.raises(HTTPException) as exc:
            publish_program_to_library(session, admin, 2, template["program_uuid"])
        assert exc.value.status_code == 403


def _tables(engine):
    for model in (
        Organization,
        User,
        Role,
        UserGroup,
        UserOrganization,
        UserGroupUser,
        Program,
        Objective,
        ProgramPhase,
        ProgramObjective,
        ProgramAssignment,
        ProgramTemplateVersion,
        FrozenActivity,
        ProgramParticipant,
        ObjectiveProgress,
        LearningBadgeAward,
        LearningRun,
        LearningPage,
        LearningPageProgress,
        OrganizationConfig,
        Plan,
        PlanRole,
        PlanCollaborator,
        PlanPhase,
        OrganizationPlanRole,
        PlanObjective,
        PlanObjectiveProgress,
        PlanInvitation,
        PlanActivity,
        MediaAsset,
        PlanAttachment,
        PlanCollaboratorRequest,
        InboxMessage,
    ):
        model.__table__.create(engine, checkfirst=True)


def _setup(session: Session):
    org = Organization(id=1, org_uuid="org_1", name="Studio", slug="studio", email="studio@example.com", creation_date=NOW, update_date=NOW)
    admin_row = User(id=1, user_uuid="user_1", username="teacher", email="teacher@example.com", first_name="T", last_name="Eacher", is_superadmin=True, creation_date=NOW, update_date=NOW)
    learner = User(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner", creation_date=NOW, update_date=NOW)
    group = UserGroup(id=1, org_id=1, usergroup_uuid="usergroup_1", name="Fall Studio", description="", creation_date=NOW, update_date=NOW)
    session.add_all([org, admin_row, learner, group, Role(id=1, name="Admin", role_uuid="role_admin")])
    session.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date=NOW, update_date=NOW))
    session.add(UserOrganization(user_id=2, org_id=1, role_id=4, creation_date=NOW, update_date=NOW))
    session.add(UserGroupUser(usergroup_id=1, user_id=2, org_id=1, creation_date=NOW, update_date=NOW))
    session.commit()
    admin = PublicUser(id=1, user_uuid="user_1", username="teacher", email="teacher@example.com", first_name="T", last_name="Eacher", is_superadmin=True)
    return admin


def test_reusing_an_objective_copies_it_so_templates_progress_independently():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        first = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        first = add_program_objective(session, admin, 1, first["program_uuid"], ObjectiveCreate(title="Portfolio PDF", evidence_policy="learner"))
        first_uuid = first["objectives"][0]["objective_uuid"]
        second = create_program(session, admin, ProgramCreate(org_id=1, name="Career Ready"))
        second = add_program_objective(session, admin, 1, second["program_uuid"], ObjectiveCreate(objective_uuid=first_uuid))
        second_uuid = second["objectives"][0]["objective_uuid"]
        assert second_uuid != first_uuid and second["objectives"][0]["title"] == "Portfolio PDF"
        first_assignment = assign_program(session, admin, 1, first["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        second_assignment = assign_program(session, admin, 1, second["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))

        update_progress(session, admin, 1, first_uuid, [2], ObjectiveProgressStatus.COMPLETED, "Great work", None, None)

        first_matrix = assignment_matrix(session, admin, 1, first_assignment["assignment_uuid"])
        second_matrix = assignment_matrix(session, admin, 1, second_assignment["assignment_uuid"])
        assert first_matrix["learners"][0]["cells"][first_uuid]["status"] == "completed"
        assert second_matrix["learners"][0]["cells"][second_uuid]["status"] == "not_started"


def test_readding_a_cohort_member_preserves_progress_and_reinvites():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Workshop"))
        objective_uuid = program["objectives"][0]["objective_uuid"]
        assignment = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        update_progress(session, admin, 1, objective_uuid, [2], ObjectiveProgressStatus.COMPLETED, "Attended", None, None)
        participant = session.exec(select(ProgramParticipant)).first()
        participant.status = "left"
        session.add(participant)
        session.commit()

        ensure_group_participants(session, 1, [2])
        session.commit()
        session.refresh(participant)

        matrix = assignment_matrix(session, admin, 1, assignment["assignment_uuid"])
        assert participant.status == "invited"
        assert len(session.exec(select(Plan)).all()) == 1
        assert session.exec(select(PlanObjectiveProgress)).one().status == "completed"
        assert matrix["learners"][0]["cells"][objective_uuid]["status"] == "completed"


def test_active_rollout_keeps_its_objective_snapshot():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Orientation"))
        first = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Final reflection"))
        # Draft edits reach new plans once published.
        row = session.exec(select(Program).where(Program.program_uuid == program["program_uuid"])).one()
        assert template_versions.version_status(session, row)["has_unpublished_changes"]
        template_versions.publish(session, admin, 1, program["program_uuid"], "Add a reflection")
        second = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))

        first_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == first["assignment_uuid"])).first()
        second_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == second["assignment_uuid"])).first()
        assert len(first_row.objective_snapshot) == 1
        assert len(second_row.objective_snapshot) == 2
        detail = get_program(session, admin, 1, program["program_uuid"])
        assert len(detail["assignments"]) == 2
        assert detail["assignments"][0]["user"]["username"] == "learner"
        assert detail["assignments"][1]["cohort"]["name"] == "Fall Studio"
        active_assignments = list_program_assignments(session, admin, 1)
        assert {item["assignment_uuid"] for item in active_assignments} == {
            first["assignment_uuid"], second["assignment_uuid"]
        }


def test_direct_and_group_program_invitations_are_available_in_learner_inbox():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        group_program = create_program(session, admin, ProgramCreate(org_id=1, name="Group Program"))
        direct_program = create_program(session, admin, ProgramCreate(org_id=1, name="Direct Program"))
        assign_program(session, admin, 1, group_program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        assign_program(session, admin, 1, direct_program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))

        invitations = my_program_summaries(session, learner)

        assert {item["program"]["name"] for item in invitations} == {"Group Program", "Direct Program"}
        assert all(item["status"] == "invited" and item["unread"] for item in invitations)
        assert {item["group"]["name"] if item["group"] else None for item in invitations} == {"Fall Studio", None}
        assert all(item["organization"]["slug"] == "studio" for item in invitations)

        result = mark_my_program_invitations_viewed(session, learner)
        assert result["updated"] == 2
        assert all(not item["unread"] for item in my_program_summaries(session, learner))


def test_learner_can_accept_program_invitation():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))
        participant = session.exec(select(ProgramParticipant)).one()

        result = respond_to_invitation(session, learner, 1, participant.participant_uuid, accept=True)

        session.refresh(participant)
        assert result == {"participant_uuid": participant.participant_uuid, "status": "active"}
        assert participant.status == "active"
        assert participant.responded_at is not None


def test_group_overview_separates_active_and_completed_programs():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        active_program = create_program(session, admin, ProgramCreate(org_id=1, name="Current Program"))
        completed_program = create_program(session, admin, ProgramCreate(org_id=1, name="Past Program"))
        assign_program(session, admin, 1, active_program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        completed = assign_program(session, admin, 1, completed_program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        completed_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == completed["assignment_uuid"])).one()
        completed_row.active = False
        session.add(completed_row)
        session.commit()

        overview = cohort_overview(session, admin, 1, 1)

        assert [item["program_name"] for item in overview["programs"]] == ["Current Program"]
        assert [item["program_name"] for item in overview["completed_programs"]] == ["Past Program"]


def test_program_phases_support_cross_phase_reordering_and_evidence_fields():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        first_phase = program["phases"][0]
        program = create_program_phase(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramPhaseCreate(name="Term 2", suggested_duration_weeks=6),
        )
        second_phase = program["phases"][1]
        assert second_phase["suggested_duration_weeks"] == 6
        program = add_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            ObjectiveCreate(
                title="Community interview",
                phase_uuid=first_phase["phase_uuid"],
                allow_learner_confirmation=True,
                custom_fields=[{
                    "field_uuid": "field_1",
                    "title": "Interview recording",
                    "type": "media",
                    "allow_student_upload": True,
                    "allowed_types": ["video"],
                }],
            ),
        )
        objective_uuid = program["objectives"][0]["objective_uuid"]

        reordered = reorder_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramReorder(phases=[
                ProgramPhaseOrder(phase_uuid=first_phase["phase_uuid"], objective_uuids=[]),
                ProgramPhaseOrder(phase_uuid=second_phase["phase_uuid"], objective_uuids=[objective_uuid]),
            ]),
        )

        assert reordered["phases"][0]["objectives"] == []
        moved = reordered["phases"][1]["objectives"][0]
        assert moved["objective_uuid"] == objective_uuid
        assert moved["allow_learner_confirmation"] is True
        assert moved["custom_fields"][0]["allowed_types"] == ["video"]



def test_assignment_snapshots_phase_dates_and_objective_schedule_rules():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(
            session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Showcase")
        )
        objective = program["objectives"][0]
        phase = program["phases"][0]
        update_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            objective["objective_uuid"],
            ProgramObjectiveUpdate(
                title="Showcase",
                default_start_rule="phase_start",
                default_due_rule="specific_date",
                default_allow_late=True,
            ),
        )

        result = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(
                usergroup_id=1,
                staff_user_ids=[1],
                schedule={
                    "phases": [{
                        "phase_uuid": phase["phase_uuid"],
                        "end_date": "2026-10-15",
                    }],
                    "objectives": [{
                        "objective_uuid": objective["objective_uuid"],
                        "due_rule": "specific_date",
                        "due_date": "2026-10-10",
                        "allow_late": True,
                    }],
                },
            ),
        )

        rule = result["schedule"]["objectives"][0]
        assert "start_date" not in result["schedule"]["phases"][0]
        assert "start_rule" not in rule
        assert "effective_start_date" not in rule
        assert rule["effective_due_date"] == "2026-10-10"
        assert rule["allow_late"] is True
        assert result["schedule"]["phases"][0]["end_date"] == "2026-10-15"


def test_objectives_inherit_phase_targets_without_materializing_override_dates():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Showcase"))
        phase = program["phases"][0]
        result = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(
                usergroup_id=1,
                staff_user_ids=[1],
                due_date="2026-10-15T00:00:00Z",
                schedule={"phases": [{
                    "phase_uuid": phase["phase_uuid"],
                    "end_date": "2026-10-15",
                }]},
            ),
        )
        rule = result["schedule"]["objectives"][0]
        assert rule["due_rule"] == "phase_end"
        assert rule["effective_due_date"] is None


def test_objective_suggested_due_week_is_bounded_clipped_and_scheduled():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        phase = program["phases"][0]
        program = update_program_phase(
            session,
            admin,
            1,
            program["program_uuid"],
            phase["phase_uuid"],
            ProgramPhaseUpdate(suggested_duration_weeks=6),
        )
        program = add_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            ObjectiveCreate(title="Showcase", suggested_due_week=5),
        )
        assert program["objectives"][0]["suggested_due_week"] == 5

        with pytest.raises(HTTPException) as invalid:
            add_program_objective(
                session,
                admin,
                1,
                program["program_uuid"],
                ObjectiveCreate(title="Too late", suggested_due_week=7),
            )
        assert invalid.value.status_code == 422

        program = update_program_phase(
            session,
            admin,
            1,
            program["program_uuid"],
            phase["phase_uuid"],
            ProgramPhaseUpdate(suggested_duration_weeks=3),
        )
        assert program["objectives"][0]["suggested_due_week"] == 3

        result = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(
                usergroup_id=1,
                staff_user_ids=[1],
                schedule={"phases": [{
                    "phase_uuid": phase["phase_uuid"],
                    "start_date": "2026-10-01",
                    "end_date": "2026-10-21",
                }]},
            ),
        )
        rule = result["schedule"]["objectives"][0]
        assert rule["due_rule"] == "specific_date"
        assert rule["due_date"] == "2026-10-21"
        assert rule["effective_due_date"] == "2026-10-21"


def test_objective_details_fields_and_timing_can_be_edited_together():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(
            session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Draft showcase")
        )
        objective_uuid = program["objectives"][0]["objective_uuid"]

        updated = update_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            objective_uuid,
            ProgramObjectiveUpdate(
                title="Final showcase",
                description="Share the final presentation.",
                custom_fields=[{
                    "field_uuid": "slides",
                    "title": "Slides",
                    "type": "media",
                    "allowed_types": ["pdf"],
                    "allow_student_upload": True,
                }],
                allow_learner_confirmation=True,
                default_start_rule="phase_start",
                default_due_rule="phase_end",
                default_allow_late=True,
            ),
        )

        objective = updated["objectives"][0]
        assert objective["title"] == "Final showcase"
        assert objective["description"] == "Share the final presentation."
        assert objective["custom_fields"][0]["title"] == "Slides"
        assert objective["allow_learner_confirmation"] is True
        assert objective["default_start_rule"] == "phase_start"
        assert objective["default_due_rule"] == "phase_end"
        assert objective["default_allow_late"] is True


def test_template_step_order_and_prerequisites_carry_onto_live_plans():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Work Ready"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Practice"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Mock interview"))
        practice, mock = (item["objective_uuid"] for item in program["objectives"])
        from src.services.programs import update_program
        from src.db.programs import ProgramUpdate
        update_program(session, admin, 1, program["program_uuid"], ProgramUpdate(step_order="in_order"))
        updated = update_program_objective(session, admin, 1, program["program_uuid"], mock, ProgramObjectiveUpdate(
            title="Mock interview", default_start_rule="any_time", default_due_rule="phase_end", after_objective_uuids=[practice],
        ))
        assert next(item for item in updated["objectives"] if item["objective_uuid"] == mock)["after_objective_uuids"] == [practice]
        with pytest.raises(HTTPException):
            update_program_objective(session, admin, 1, program["program_uuid"], mock, ProgramObjectiveUpdate(
                title="Mock interview", default_start_rule="any_time", default_due_rule="phase_end", after_objective_uuids=["nope"],
            ))

        assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        participant = session.exec(select(ProgramParticipant)).one()
        respond_to_invitation(session, learner, 1, participant.participant_uuid, True)
        plan = session.exec(select(Plan)).one()
        live = {item.title: item for item in session.exec(select(PlanObjective)).all()}
        assert plan.step_order == "in_order"
        assert live["Mock interview"].after_objective_uuids == [live["Practice"].objective_uuid]
