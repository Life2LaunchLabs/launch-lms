"""A plan step's progress row: read without writing, created on first write."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from src.db.planning import PlanObjective, PlanObjectiveProgress


def stored_progress(db: Session, objective: PlanObjective) -> PlanObjectiveProgress | None:
    return db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()


def new_progress(objective: PlanObjective) -> PlanObjectiveProgress:
    now = datetime.now(timezone.utc).isoformat()
    return PlanObjectiveProgress(
        progress_uuid=f"plan_progress_{uuid4()}", plan_objective_id=int(objective.id),
        creation_date=now, update_date=now,
    )


def progress_view(db: Session, objective: PlanObjective) -> PlanObjectiveProgress:
    """A step's progress for reading. Never writes: a step without a stored row reads as not started.

    Reads used to insert the missing row. Those inserts were never committed, but they
    held row locks until the request ended, so concurrent page loads that serialized
    the same steps in different orders (the plans list, a plan, the weekly home)
    deadlocked on each other.
    """
    return stored_progress(db, objective) or new_progress(objective)


def progress_for(db: Session, objective: PlanObjective) -> PlanObjectiveProgress:
    """A step's stored progress row, for changing it; created on first write.

    Two writers creating the same row race on its unique objective id. The loser's
    insert rolls back to a savepoint and it takes the winner's row instead.
    """
    progress = stored_progress(db, objective)
    if progress:
        return progress
    progress = new_progress(objective)
    try:
        with db.begin_nested():
            db.add(progress)
    except IntegrityError:
        progress = stored_progress(db, objective)
        if progress is None:
            raise
    return progress
