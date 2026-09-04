import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.organizations import Organization
from src.db.learning import LearningBadgeAward, LearningRun
from src.db.roles import Role
from src.db.planning import PlanStatus
from src.db.programs import (
    Objective,
    ObjectiveCreate,
    ObjectiveKind,
    ObjectiveProgress,
    ObjectiveProgressStatus,
    ObjectiveReviewDecision,
    LearnerProgramDetailView,
    Program,
    ProgramAssignment,
    ProgramAssignmentCreate,
    ProgramAssignmentObjectiveUpdate,
    ProgramCreate,
    ProgramObjective,
    ProgramPhase,
    ProgramPhaseCreate,
    ProgramPhaseUpdate,
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
    _badge_award_keys,
    add_program_objective,
    assign_program,
    assignment_matrix,
    assignment_reviews,
    cohort_overview,
    change_assignment_status,
    create_program_phase,
    create_program,
    delete_assignment,
    ensure_group_participants,
    get_program,
    list_program_assignments,
    list_objectives,
    mark_my_program_invitations_viewed,
    my_enrollment_detail,
    my_program_detail,
    my_programs_all,
    my_program_summaries,
    reorder_program,
    respond_to_invitation,
    review_objective_submission,
    update_my_progress,
    update_assignment_objective,
    update_progress,
    update_program_objective_schedule,
    update_program_objective,
    update_program_phase,
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
        LearningRun,
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


def test_badge_objective_can_accept_an_earlier_major_award():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        _setup(session)
        session.add(LearningBadgeAward(
            award_uuid="award_v1", badge_id=12, major_version=1,
            org_id=1, user_id=2, creation_date=NOW, update_date=NOW,
        ))
        session.commit()
        objective = {
            "id": 7,
            "badge_id": 12,
            "badge_major_version": 2,
            "accept_previous_major_versions": True,
        }
        assert _badge_award_keys(session, [2], [objective]) == {(2, 7)}
        objective["accept_previous_major_versions"] = False
        assert _badge_award_keys(session, [2], [objective]) == set()


def test_learner_submission_can_be_flagged_resubmitted_and_confirmed():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            ObjectiveCreate(
                title="Portfolio",
                allow_learner_confirmation=True,
                custom_fields=[{
                    "field_uuid": "work",
                    "title": "Work",
                    "type": "media",
                    "allow_student_upload": True,
                    "allowed_types": ["link"],
                }],
            ),
        )
        objective_uuid = program["objectives"][0]["objective_uuid"]
        assignment = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]),
        )
        participant = session.exec(select(ProgramParticipant)).one()
        participant.status = "active"
        session.add(participant)
        session.commit()

        submitted = update_my_progress(
            session, learner, 1, objective_uuid, ObjectiveProgressStatus.COMPLETED,
            "First draft", [{"type": "link", "url": "https://example.com/one"}],
        )
        assert submitted["status"] == "submitted"
        queue = assignment_reviews(session, admin, 1, assignment["assignment_uuid"])
        assert queue["objective_reviews"][0]["learner_note"] == "First draft"

        flagged = review_objective_submission(
            session, admin, 1, assignment["assignment_uuid"],
            ObjectiveReviewDecision(objective_uuid=objective_uuid, user_id=2, action="flag", message="Add a reflection."),
        )
        assert flagged["status"] == "flagged"
        assert flagged["feedback_history"][0]["message"] == "Add a reflection."

        update_my_progress(
            session, learner, 1, objective_uuid, ObjectiveProgressStatus.SUBMITTED,
            "Second draft", [{"type": "link", "url": "https://example.com/two"}],
        )
        confirmed = review_objective_submission(
            session, admin, 1, assignment["assignment_uuid"],
            ObjectiveReviewDecision(objective_uuid=objective_uuid, user_id=2, action="confirm"),
        )
        assert confirmed["status"] == "completed"
        progress = session.exec(select(ObjectiveProgress)).one()
        assert progress.feedback_history[0]["message"] == "Add a reflection."


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


def test_all_my_programs_include_programs_from_each_organization():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        session.add(Organization(id=2, org_uuid="org_2", name="Academy", slug="academy", email="academy@example.com", creation_date=NOW, update_date=NOW))
        session.add(UserOrganization(user_id=1, org_id=2, role_id=1, creation_date=NOW, update_date=NOW))
        session.add(UserOrganization(user_id=2, org_id=2, role_id=4, creation_date=NOW, update_date=NOW))
        session.commit()
        first = create_program(session, admin, ProgramCreate(org_id=1, name="Studio Program"))
        second = create_program(session, admin, ProgramCreate(org_id=2, name="Studio Program"))
        assign_program(session, admin, 1, first["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))
        assign_program(session, admin, 2, second["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))

        programs = my_programs_all(session, learner)

        assert len(programs) == 2
        assert {item["program"]["slug"] for item in programs} == {"studio-program", "studio-program-2"}
        assert {item["organization"]["slug"] for item in programs} == {"studio", "academy"}


def test_program_detail_prioritizes_current_enrollment_and_keeps_run_history():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        learner = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        first_run = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))
        second_run = assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))
        assignments = session.exec(select(ProgramAssignment)).all()
        assignment_by_uuid = {item.assignment_uuid: item for item in assignments}
        enrollments = session.exec(select(ProgramParticipant)).all()
        enrollment_by_assignment = {item.assignment_id: item for item in enrollments}
        active = enrollment_by_assignment[assignment_by_uuid[first_run["assignment_uuid"]].id]
        declined = enrollment_by_assignment[assignment_by_uuid[second_run["assignment_uuid"]].id]
        active.status = "active"
        declined.status = "declined"
        session.add_all([active, declined])
        session.commit()

        detail = my_program_detail(session, learner, program["slug"])
        programs = my_programs_all(session, learner)
        validated = LearnerProgramDetailView.model_validate(detail)

        assert validated.program["slug"] == "creative-futures"
        assert detail["current_enrollment"]["participant_uuid"] == active.participant_uuid
        assert [item["status"] for item in detail["enrollments"]] == ["active", "declined"]
        assert detail["current_enrollment"]["run"]["assignment_uuid"] == first_run["assignment_uuid"]
        assert detail["current_enrollment"]["enrollment"]["status"] == "active"
        assert len(programs) == 1
        assert programs[0]["enrollment_count"] == 2

        legacy_detail = my_enrollment_detail(session, learner, declined.participant_uuid)
        assert legacy_detail["current_enrollment"]["participant_uuid"] == declined.participant_uuid

        assignment_by_uuid[first_run["assignment_uuid"]].active = False
        session.add(assignment_by_uuid[first_run["assignment_uuid"]])
        session.commit()
        completed_detail = my_program_detail(session, learner, program["slug"])
        assert completed_detail["current_enrollment"]["status"] == "completed"


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


def test_group_assignment_definition_is_versioned_and_template_stays_independent():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        program = add_program_objective(
            session,
            admin,
            1,
            program["program_uuid"],
            ObjectiveCreate(
                title="Portfolio",
                custom_fields=[{
                    "field_uuid": "artifact",
                    "title": "Artifact",
                    "type": "media",
                    "allowed_types": ["pdf"],
                }],
            ),
        )
        objective_uuid = program["objectives"][0]["objective_uuid"]
        assignment = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(
                usergroup_id=1,
                collaborators=[{"user_id": 1, "role_key": "reviewer"}],
            ),
        )
        assert assignment["collaborators"] == [{"user_id": 1, "role_key": "plan_admin"}]

        changed = update_assignment_objective(
            session,
            admin,
            1,
            assignment["assignment_uuid"],
            objective_uuid,
            ProgramAssignmentObjectiveUpdate(
                definition_version=1,
                title="Final portfolio",
                fields=[{"field_uuid": "artifact", "title": "Artifact", "type": "media", "allowed_types": ["document"]}],
            ),
        )
        assert changed["definition_version"] == 2
        stored = session.exec(select(ProgramAssignment)).one()
        assert stored.objective_snapshot[0]["title"] == "Final portfolio"
        assert get_program(session, admin, 1, program["program_uuid"])["objectives"][0]["title"] == "Portfolio"

        with pytest.raises(HTTPException) as conflict:
            update_assignment_objective(
                session,
                admin,
                1,
                assignment["assignment_uuid"],
                objective_uuid,
                ProgramAssignmentObjectiveUpdate(definition_version=1, title="Stale edit"),
            )
        assert conflict.value.status_code == 409


def test_group_assignment_can_be_completed_reopened_and_deleted_as_one_target():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Creative Futures"))
        assignment = assign_program(
            session,
            admin,
            1,
            program["program_uuid"],
            ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]),
        )

        completed = change_assignment_status(
            session, admin, 1, assignment["assignment_uuid"], PlanStatus.COMPLETED
        )
        assert completed["status"] == "completed"
        assert session.exec(select(ProgramAssignment)).one().active is False

        reopened = change_assignment_status(
            session, admin, 1, assignment["assignment_uuid"], PlanStatus.ACTIVE
        )
        assert reopened["status"] == "active"
        assert session.exec(select(ProgramAssignment)).one().active is True

        deleted = delete_assignment(session, admin, 1, assignment["assignment_uuid"])
        assert deleted == {
            "deleted": True,
            "assignment_uuid": assignment["assignment_uuid"],
            "affected_plan_count": 0,
        }
        assert session.exec(select(ProgramAssignment)).first() is None
        assert session.exec(select(ProgramParticipant)).first() is None


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
