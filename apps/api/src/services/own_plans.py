"""A learner's own plan made from a plan template.

Badge plans and the Launch Ready starter plan are both the learner's own plan
from a template, offered by an organization the same way an assignment is:
the learner administers it and the offering organization's staff review it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from src.db.planning import Plan
from src.db.programs import ParticipantStatus, Program, ProgramAssignment, ProgramParticipant


def create_own_plan(db: Session, program: Program, user_id: int, org_id: int, staff_ids: list[int] | None = None) -> Plan:
    """Materialize the learner's plan from ``program``, offered by ``org_id`` (flushed, not committed)."""
    from src.services.planning import materialize_assignment_plans
    from src.services.programs import _snapshot

    staff_ids = [staff_id for staff_id in dict.fromkeys(staff_ids or []) if staff_id != user_id]
    staff_role = program.default_staff_role_key or "reviewer"
    now = datetime.now().isoformat()
    assignment = ProgramAssignment(
        assignment_uuid=f"assignment_{uuid4()}", org_id=org_id, program_id=program.id, user_id=user_id,
        program_version=program.version, definition_version=1, objective_snapshot=_snapshot(db, program),
        initiate_date=datetime.now(), staff_user_ids=[user_id, *staff_ids],
        collaborators=[{"user_id": user_id, "role_key": "plan_admin"}, *({"user_id": staff_id, "role_key": staff_role} for staff_id in staff_ids)],
        schedule={}, created_by_user_id=user_id, owner_user_id=user_id, creation_date=now, update_date=now,
    )
    db.add(assignment)
    db.flush()
    db.add(ProgramParticipant(
        participant_uuid=f"participant_{uuid4()}", assignment_id=assignment.id, org_id=org_id,
        user_id=user_id, status=ParticipantStatus.ACTIVE, creation_date=now, update_date=now,
    ))
    db.flush()
    materialize_assignment_plans(db, int(assignment.id))  # type: ignore[arg-type]
    return db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id, Plan.subject_user_id == user_id)).one()


def plan_from_template(db: Session, program: Program, user_id: int) -> Plan | None:
    """The learner's existing plan made from ``program``, if any."""
    return db.exec(
        select(Plan).join(ProgramAssignment, ProgramAssignment.id == Plan.source_assignment_id)
        .where(ProgramAssignment.program_id == program.id, Plan.subject_user_id == user_id)
        .order_by(Plan.id)
    ).first()
