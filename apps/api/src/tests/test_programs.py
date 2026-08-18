from sqlmodel import Session, create_engine, select

from src.db.organizations import Organization
from src.db.learning import LearningBadgeAward
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
    ProgramParticipant,
)
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.programs import (
    add_program_objective,
    assign_program,
    assignment_matrix,
    create_program,
    ensure_group_participants,
    update_progress,
)


NOW = "2026-08-18T12:00:00+00:00"


def _tables(engine):
    for model in (
        Organization,
        User,
        UserGroup,
        UserOrganization,
        UserGroupUser,
        Program,
        Objective,
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
    session.add_all([org, admin_row, learner, group])
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
        first_assignment = assign_program(session, admin, 1, first["program_uuid"], ProgramAssignmentCreate(usergroup_id=1))
        second_assignment = assign_program(session, admin, 1, second["program_uuid"], ProgramAssignmentCreate(usergroup_id=1))

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
        assignment = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1))
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
        first = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1))
        add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Final reflection"))
        second = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2))

        first_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == first["assignment_uuid"])).first()
        second_row = session.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == second["assignment_uuid"])).first()
        assert len(first_row.objective_snapshot) == 1
        assert len(second_row.objective_snapshot) == 2
