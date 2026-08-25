from sqlmodel import Session, create_engine, select

from src.db.organizations import Organization
from src.db.learning import LearningBadgeAward
from src.db.roles import Role
from src.db.programs import (
    Objective,
    ObjectiveCreate,
    ObjectiveKind,
    ObjectiveProgress,
    ObjectiveProgressStatus,
    Program,
    ProgramAssignment,
    ProgramAssignmentCreate,
    ProgramCreate,
    ProgramObjective,
    ProgramPhase,
    ProgramPhaseCreate,
    ProgramPhaseOrder,
    ProgramReorder,
    ProgramParticipant,
    ProgramObjectiveScheduleUpdate,
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
    create_program_phase,
    create_program,
    ensure_group_participants,
    get_program,
    list_objectives,
    reorder_program,
    update_progress,
    update_program_objective_schedule,
    update_program_objective,
)


NOW = "2026-08-18T12:00:00+00:00"


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
        ProgramParticipant,
        ObjectiveProgress,
        LearningBadgeAward,
    ):
        model.__table__.create(engine)


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


def test_objective_progress_is_shared_across_program_rollouts():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        first = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        first = add_program_objective(session, admin, 1, first["program_uuid"], ObjectiveCreate(title="Portfolio PDF", evidence_policy="learner"))
        shared_uuid = first["objectives"][0]["objective_uuid"]
        second = create_program(session, admin, ProgramCreate(org_id=1, name="Career Ready"))
        add_program_objective(session, admin, 1, second["program_uuid"], ObjectiveCreate(objective_uuid=shared_uuid))
        first_assignment = assign_program(session, admin, 1, first["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        second_assignment = assign_program(session, admin, 1, second["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))

        update_progress(session, admin, 1, shared_uuid, [2], ObjectiveProgressStatus.COMPLETED, "Great work", None, None)

        first_matrix = assignment_matrix(session, admin, 1, first_assignment["assignment_uuid"])
        second_matrix = assignment_matrix(session, admin, 1, second_assignment["assignment_uuid"])
        assert first_matrix["learners"][0]["cells"][shared_uuid]["status"] == "completed"
        assert second_matrix["learners"][0]["cells"][shared_uuid]["status"] == "completed"


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

        progress = session.exec(select(ObjectiveProgress)).first()
        matrix = assignment_matrix(session, admin, 1, assignment["assignment_uuid"])
        assert participant.status == "invited"
        assert progress.status == ObjectiveProgressStatus.COMPLETED
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
        second = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))

        first_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == first["assignment_uuid"])).first()
        second_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == second["assignment_uuid"])).first()
        assert len(first_row.objective_snapshot) == 1
        assert len(second_row.objective_snapshot) == 2
        detail = get_program(session, admin, 1, program["program_uuid"])
        assert len(detail["assignments"]) == 2
        assert detail["assignments"][0]["user"]["username"] == "learner"
        assert detail["assignments"][1]["cohort"]["name"] == "Fall Studio"


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

        session.add(Objective(
            objective_uuid="objective_badge_requirement",
            org_id=1,
            title="Badge-only requirement",
            kind=ObjectiveKind.BADGE,
            creation_date=NOW,
            update_date=NOW,
        ))
        session.commit()
        reusable = list_objectives(session, admin, 1)
        assert {item["objective_uuid"] for item in reusable} == {objective_uuid}


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
        update_program_objective_schedule(
            session,
            admin,
            1,
            program["program_uuid"],
            objective["objective_uuid"],
            ProgramObjectiveScheduleUpdate(
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
                        "start_date": "2026-09-01",
                        "end_date": "2026-10-15",
                    }],
                    "objectives": [{
                        "objective_uuid": objective["objective_uuid"],
                        "start_rule": "phase_start",
                        "start_date": None,
                        "due_rule": "specific_date",
                        "due_date": "2026-10-10",
                        "allow_late": True,
                    }],
                },
            ),
        )

        rule = result["schedule"]["objectives"][0]
        assert rule["effective_start_date"] == "2026-09-01"
        assert rule["effective_due_date"] == "2026-10-10"
        assert rule["allow_late"] is True
        assert result["schedule"]["phases"][0]["end_date"] == "2026-10-15"


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
