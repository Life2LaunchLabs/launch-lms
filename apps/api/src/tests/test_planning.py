from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, Session, create_engine, select

from src.db.learning import LearningBadge, LearningBadgeAward, LearningRun
from src.db.guest_sessions import GuestSession
from src.db.organizations import Organization
from src.db.planning import (
    Plan,
    PlanActivity,
    PlanCollaborator,
    PlanCreate,
    PlanInvitation,
    PlanInvitationCreate,
    PlanInvitationKind,
    PlanObjective,
    PlanObjectiveCreate,
    PlanObjectiveProgress,
    PlanObjectiveProgressUpdate,
    PlanObjectiveStatus,
    PlanPhase,
    PlanRole,
)
# Register compatibility backing tables referenced by Plan foreign keys.
from src.db.programs import Objective, Program, ProgramAssignment
from src.db.users import PublicUser, User
from src.services import planning


NOW = "2026-08-27T12:00:00+00:00"


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, User.__table__, Program.__table__, ProgramAssignment.__table__,
        Objective.__table__, GuestSession.__table__, LearningBadge.__table__, LearningBadgeAward.__table__, LearningRun.__table__,
        Plan.__table__, PlanRole.__table__, PlanCollaborator.__table__, PlanPhase.__table__,
        PlanObjective.__table__, PlanObjectiveProgress.__table__, PlanInvitation.__table__, PlanActivity.__table__,
    ])
    session = Session(engine)
    session.add_all([
        User(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="Plan", last_name="Owner", creation_date=NOW, update_date=NOW),
        User(id=2, user_uuid="user_2", username="helper", email="helper@example.com", first_name="Helpful", last_name="Reviewer", creation_date=NOW, update_date=NOW),
    ])
    session.commit()
    return session


def _user(user_id: int) -> PublicUser:
    row = {1: ("owner", "owner@example.com"), 2: ("helper", "helper@example.com")}[user_id]
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=row[0], email=row[1], first_name=row[0], last_name="User")


def test_personal_plan_is_free_private_and_owner_controlled():
    with _session() as db:
        created = planning.create_plan(db, _user(1), PlanCreate(name="Earn a nursing degree"))
        assert created["subject"]["id"] == 1
        assert created["owner"]["id"] == 1
        assert {"delete_plan", "transfer_ownership", "manage_roles"} <= set(created["capabilities"])
        assert planning.list_plans(db, _user(2)) == []
        with pytest.raises(HTTPException) as denied:
            planning.get_plan(db, _user(2), created["slug"])
        assert denied.value.status_code == 404


def test_recipient_bound_invitation_grants_plan_access_without_org_membership():
    with _session() as db:
        created = planning.create_plan(db, _user(1), PlanCreate(name="Personal discovery"))
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="reviewer", kind=PlanInvitationKind.COLLABORATOR,
        ))
        assert len(planning.list_my_invitations(db, _user(2))) == 1
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        helper_plan = planning.get_plan(db, _user(2), created["slug"])
        assert "review_objectives" in helper_plan["capabilities"]
        assert helper_plan["subject"]["id"] == 1


def test_feed_urgency_explore_and_reviewer_field_permissions():
    with _session() as db:
        created = planning.create_plan(db, _user(1), PlanCreate(name="College path"))
        due = planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(
            title="Submit application", due_date=date.today() + timedelta(days=7),
            fields=[{"field_uuid": "student_note", "access": "contributor"}, {"field_uuid": "review", "access": "reviewer"}],
        ))["objectives"][0]
        planning.create_objective(db, _user(1), created["slug"], PlanObjectiveCreate(title="Explore nursing programs"))
        result = planning.feed(db, _user(1))
        assert [item["title"] for item in result["coming_up"]] == ["Submit application"]
        assert [item["title"] for item in result["explore"]] == ["Explore nursing programs"]
        invitation = planning.create_invitation(db, _user(1), created["slug"], PlanInvitationCreate(
            email="helper@example.com", role_key="subject", kind=PlanInvitationKind.COLLABORATOR,
        ))
        planning.respond_to_invitation(db, _user(2), invitation["invitation_uuid"], True)
        with pytest.raises(HTTPException) as denied:
            planning.update_objective_progress(db, _user(2), created["slug"], due["objective_uuid"], PlanObjectiveProgressUpdate(
                status=PlanObjectiveStatus.IN_PROGRESS, field_values={"review": "approved"},
            ))
        assert denied.value.status_code == 403
        updated = planning.update_objective_progress(db, _user(2), created["slug"], due["objective_uuid"], PlanObjectiveProgressUpdate(
            status=PlanObjectiveStatus.IN_PROGRESS, field_values={"student_note": "Drafted"},
        ))
        assert updated["progress"]["field_values"] == {"student_note": "Drafted"}
