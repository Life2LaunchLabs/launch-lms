from datetime import date, timedelta

from sqlmodel import SQLModel, Session, create_engine

from src.db.guest_sessions import GuestSession
from src.db.learning import LearningBadge
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.planning import Plan, PlanCollaborator, PlanObjective, PlanObjectiveProgress, PlanPhase, PlanRole
from src.db.programs import Objective, ObjectiveProgress, Program, ProgramAssignment, ProgramParticipant
from src.db.users import User
from src.services.hub_next_actions import next_actions

TODAY = date(2026, 10, 7)
NOW = "2026-10-07T12:00:00+00:00"


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Organization.__table__, OrganizationConfig.__table__, User.__table__, Program.__table__, ProgramAssignment.__table__, ProgramParticipant.__table__,
        Objective.__table__, ObjectiveProgress.__table__, GuestSession.__table__, LearningBadge.__table__,
        Plan.__table__, PlanRole.__table__, PlanCollaborator.__table__, PlanPhase.__table__, PlanObjective.__table__, PlanObjectiveProgress.__table__,
    ])
    return Session(engine)


def _plan(db, plan_id, name="Plan", owner=1, subject=1, assignment=None, status="active", member=1, **extra):
    db.add(Plan(id=plan_id, plan_uuid=f"plan_{plan_id}", slug=f"plan-{plan_id}", name=name, owner_user_id=owner, subject_user_id=subject,
                source_assignment_id=assignment, status=status, creation_date=NOW, update_date=NOW, **extra))
    db.add(PlanCollaborator(plan_id=plan_id, user_id=member, role_id=1, collaborator_uuid=f"c_{plan_id}", active=True, creation_date=NOW, update_date=NOW))


def _obj(db, obj_id, plan_id, title, position=0, status=None, due=None, blocked=False):
    db.add(PlanObjective(id=obj_id, objective_uuid=f"obj_{obj_id}", plan_id=plan_id, title=title, position=position, due_date=due, blocked=blocked, creation_date=NOW, update_date=NOW))
    if status:
        db.add(PlanObjectiveProgress(progress_uuid=f"p_{obj_id}", plan_objective_id=obj_id, status=status, creation_date=NOW, update_date=NOW))


def test_undated_unstarted_objective_is_suggested():
    db = _db()
    _plan(db, 1, "My start")
    _obj(db, 1, 1, "Take the interest quiz")
    db.commit()
    result = next_actions(db, 1, TODAY)
    assert [item["title"] for item in result] == ["Take the interest quiz"]
    assert result[0]["route"] == "/plans/plan-1" and result[0]["tier"] == 3 and result[0]["reason"]


def test_ranking_caps_and_one_assigned_item():
    db = _db()
    _plan(db, 1, "Assigned A", owner=9, assignment=5)
    _plan(db, 2, "Assigned B", owner=9, assignment=5)
    _plan(db, 3, "Mine in progress")
    _plan(db, 4, "Mine fresh")
    _plan(db, 5, "Mine extra")
    _obj(db, 1, 1, "Due soon A", status="not_started", due=TODAY + timedelta(days=2))
    _obj(db, 2, 2, "Due soon B", status="not_started", due=TODAY + timedelta(days=1))
    _obj(db, 3, 3, "Keep going", status="in_progress")
    _obj(db, 4, 4, "Try something")
    _obj(db, 5, 5, "Another")
    db.commit()
    result = next_actions(db, 1, TODAY)
    assert [item["title"] for item in result] == ["Due soon B", "Keep going", "Try something"]
    assert [item["tier"] for item in result] == [1, 2, 3]


def test_excludes_done_blocked_submitted_and_other_people_or_inactive_plans():
    db = _db()
    _plan(db, 1, "Mine")
    _plan(db, 2, "Archived", status="archived")
    _plan(db, 3, "Someone else's", owner=2, subject=2)
    _obj(db, 1, 1, "Done", status="completed", position=0)
    _obj(db, 2, 1, "Canceled", status="canceled", position=1)
    _obj(db, 3, 1, "Blocked", blocked=True, position=2)
    _obj(db, 4, 1, "Waiting on review", status="submitted", position=3)
    _obj(db, 5, 2, "Archived step")
    _obj(db, 6, 3, "Not mine")
    db.commit()
    result = next_actions(db, 1, TODAY)
    assert [item["kind"] for item in result] == ["discover"]


def test_overdue_own_objective_reads_gently_and_feedback_is_surfaced():
    db = _db()
    _plan(db, 1, "Mine")
    _plan(db, 2, "Other")
    _obj(db, 1, 1, "Late one", due=TODAY - timedelta(days=3))
    _obj(db, 2, 2, "Revise this", status="changes_requested")
    db.commit()
    result = {item["title"]: item["reason"] for item in next_actions(db, 1, TODAY)}
    assert "Easy to pick back up" in result["Late one"]
    assert "feedback" in result["Revise this"]


def test_never_empty():
    db = _db()
    db.commit()
    result = next_actions(db, 1, TODAY)
    assert len(result) == 1 and result[0]["route"] == "/resources"
