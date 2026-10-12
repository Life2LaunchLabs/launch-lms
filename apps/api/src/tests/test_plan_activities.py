import asyncio

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.guest_sessions import GuestSession  # noqa: F401
from src.db.learning import (
    LearningActivity,
    LearningActivityRun,
    LearningBadge,
    LearningBadgeVersion,
    LearningPage,
    LearningPageComplete,
    LearningPageType,
    LearningPath,
    LearningResponseAttempt,
    LearningRun,
)
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress
from src.db.portfolio import Portfolio, TimelineEntry
from src.db.programs import ObjectiveCreate, ObjectiveKind, ProgramAssignmentCreate, ProgramCreate, ProgramParticipant, ProgramUpdate
from src.db.users import PublicUser, User
from src.services import plan_activities, planning
from src.services.guest_sessions import LearningActor
from src.services.learning import runtime
from src.services.learning_documents import store
from src.services.programs import add_program_objective, assign_program, create_program, respond_to_invitation, update_program
from src.tests.test_programs import _setup, _tables

LEARNER = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    for model in (LearningBadge, LearningBadgeVersion, LearningPath, LearningActivity, LearningActivityRun, LearningResponseAttempt, Portfolio, TimelineEntry):
        model.__table__.create(engine, checkfirst=True)
    return Session(engine)


def _template_with_activities(session: Session, admin: PublicUser, step_order: str = "in_order") -> dict:
    program = create_program(session, admin, ProgramCreate(org_id=1, name="Adaptability"))
    for title in ("What just changed?", "See it coming"):
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title=title, kind=ObjectiveKind.ACTIVITY))
    update_program(session, admin, 1, program["program_uuid"], ProgramUpdate(step_order=step_order))
    for objective in program["objectives"]:
        activity = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == objective["activity"]["activity_uuid"])).one()
        session.add(LearningPage(
            activity_id=activity.id, org_id=1, page_uuid=f"learning_page_{activity.id}", page_type=LearningPageType.STANDARD,
            title=f"{objective['title']} page", order=1, required=True, content={"blocks": []},
        ))
    session.commit()
    return program


def _assigned_plan(session: Session, admin: PublicUser, program: dict) -> Plan:
    assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
    participant = session.exec(select(ProgramParticipant)).one()
    respond_to_invitation(session, LEARNER, 1, participant.participant_uuid, True)
    return session.exec(select(Plan)).one()


def test_activity_objectives_own_their_activity_and_carry_onto_live_plans():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        first = program["objectives"][0]
        assert first["kind"] == "activity"
        assert first["activity"]["title"] == "What just changed?"
        activity = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == first["activity"]["activity_uuid"])).one()
        assert activity.badge_id is None and activity.path_id is None and activity.objective_id == first["id"]

        # The Activity Document API edits template activities in place.
        user_row = session.get(User, 1)
        envelope = asyncio.run(store.get_activity_document(None, activity.activity_uuid, user_row, session))
        assert envelope["context"]["editable"] is True and envelope["context"]["badge_uuid"] is None

        plan = _assigned_plan(session, admin, program)
        live = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
        assert [item.kind for item in live] == ["activity", "activity"]
        assert live[0].activity_id == activity.id
        assert plan.step_order == "in_order"


def test_playing_an_activity_completes_its_step_and_opens_the_next():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        plan = _assigned_plan(session, admin, program)
        first, second = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()

        with pytest.raises(HTTPException) as early:
            plan_activities.start_objective_activity(session, LEARNER, plan.slug, second.objective_uuid)
        assert early.value.status_code == 409
        with pytest.raises(HTTPException) as staff:
            plan_activities.start_objective_activity(session, admin, plan.slug, first.objective_uuid)
        assert staff.value.status_code in {403, 404}

        started = plan_activities.start_objective_activity(session, LEARNER, plan.slug, first.objective_uuid)
        run = started["run"]
        assert run["activity_id"] == first.activity_id and run["badge_id"] is None
        assert [item["page_uuid"] for item in started["activity"]["pages"]] == [f"learning_page_{first.activity_id}"]
        assert started["run"]["navigation"]["activities"][0]["total"] == 1
        progress = session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == first.id)).one()
        assert progress.status == "in_progress"
        # Resuming returns the same run.
        assert plan_activities.start_objective_activity(session, LEARNER, plan.slug, first.objective_uuid)["run"]["run_uuid"] == run["run_uuid"]

        actor = LearningActor(user=LEARNER)
        asyncio.run(runtime.complete_page(None, LearningPageComplete(run_uuid=run["run_uuid"], page_uuid=f"learning_page_{first.activity_id}", data={}), actor, session))
        session.refresh(progress)
        assert progress.status == "completed" and progress.completed_at is not None
        assert session.exec(select(LearningRun).where(LearningRun.run_uuid == run["run_uuid"])).one().status == "completed"

        detail = planning.get_plan(session, LEARNER, plan.slug)
        steps = {item["title"]: item for item in detail["objectives"]}
        assert steps["See it coming"]["availability"]["state"] == "open"
        assert steps["What just changed?"]["activity_id"] == first.activity_id

        # A page from another step's activity is not part of this run.
        with pytest.raises(HTTPException) as foreign:
            asyncio.run(runtime.complete_page(None, LearningPageComplete(run_uuid=run["run_uuid"], page_uuid=f"learning_page_{second.activity_id}", data={}), actor, session))
        assert foreign.value.status_code == 409


def test_activities_that_need_sign_off_go_to_review():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin, step_order="any")
        plan = _assigned_plan(session, admin, program)
        first = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).first()
        first.completion_restricted = True
        session.add(first)
        session.commit()
        run = plan_activities.start_objective_activity(session, LEARNER, plan.slug, first.objective_uuid)["run"]
        asyncio.run(runtime.complete_page(None, LearningPageComplete(run_uuid=run["run_uuid"], page_uuid=f"learning_page_{first.activity_id}", data={}), LearningActor(user=LEARNER), session))
        progress = session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == first.id)).one()
        assert progress.status == "submitted"


def test_template_activity_pages_are_edited_in_place_without_a_draft():
    from src.db.learning import LearningPageCreate, LearningPageUpdate
    from src.services.learning import page_authoring

    with _session() as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="Reflect"))
        program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Look back", kind=ObjectiveKind.ACTIVITY))
        activity_uuid = program["objectives"][0]["activity"]["activity_uuid"]
        page = asyncio.run(page_authoring.create_page(None, LearningPageCreate(
            activity_uuid=activity_uuid, page_type=LearningPageType.STANDARD, title="Start", content={"version": 2, "blocks": []},
        ), admin, session))
        updated = asyncio.run(page_authoring.update_page(None, page.page_uuid, LearningPageUpdate(title="Start here"), admin, session))
        assert updated.title == "Start here" and updated.badge_id is None
        with pytest.raises(HTTPException):
            asyncio.run(page_authoring.create_page(None, LearningPageCreate(
                activity_uuid=activity_uuid, page_type=LearningPageType.STANDARD, title="Nope", content={"version": 2, "blocks": []},
            ), LEARNER, session))
