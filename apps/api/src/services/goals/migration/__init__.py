"""The one-time move from plans to goals (see ``migrations/versions/*_move_plans_to_goals.py``).

``run`` converts every template, version, assignment and live plan, then
``verify`` checks the result against the legacy rows and raises if anything is
missing, so a bad run fails the migration (and its transaction) instead of
leaving learners with half their plans.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from sqlmodel import Session, func, select

from src.db.goals import Goal, GoalAssignment, GoalStep, GoalTemplate, StepProgress
from src.services.goals.migration.goals import migrate_plans
from src.services.goals.migration.legacy_tables import REQUIREMENT_SOURCE, Plan, PlanObjective, PlanObjectiveProgress, Program, ProgramAssignment
from src.services.goals.migration.objectives import STATUS_MAP
from src.services.goals.migration.templates import migrate_templates


@dataclass
class MigrationResult:
    counts: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _count(db: Session, model, *where) -> int:
    return int(db.exec(select(func.count()).select_from(model).where(*where)).one())


def run(db: Session) -> MigrationResult:
    """Convert everything (flushed, not committed), then verify it."""
    if _count(db, Goal) or _count(db, GoalTemplate):
        raise RuntimeError("Goals already hold data; the plans-to-goals move runs once, on an empty goal model")
    maps = migrate_templates(db)
    counts = migrate_plans(db, maps)
    result = MigrationResult(
        counts={"templates": len(maps.templates), "versions": len(maps.versions), "assignments": len(maps.assignments),
                "goals": counts.goals, "steps": counts.steps, "progress": counts.progress, "entries": counts.entries,
                "activity_runs": counts.runs, "requirement_sources": counts.requirement_sources},
        warnings=maps.warnings + counts.warnings,
    )
    verify(db)
    return result


def verify(db: Session) -> None:
    """Every legacy row has its counterpart, and every objective's status carried over to its first step."""
    problems = []
    for legacy, new, label in ((Program, GoalTemplate, "templates"), (ProgramAssignment, GoalAssignment, "assignments"), (Plan, Goal, "goals")):
        if _count(db, legacy) != _count(db, new):
            problems.append(f"{label}: {_count(db, legacy)} legacy rows, {_count(db, new)} migrated")
    if _count(db, GoalStep) < _count(db, PlanObjective):
        problems.append(f"steps: fewer steps ({_count(db, GoalStep)}) than objectives ({_count(db, PlanObjective)})")
    expected = Counter(STATUS_MAP.get(getattr(status, "value", status), "not_started") for status in db.exec(select(PlanObjectiveProgress.status)).all())
    first_steps = db.exec(
        select(StepProgress.status).join(GoalStep, GoalStep.id == StepProgress.step_id)
        .join(PlanObjective, PlanObjective.objective_uuid == GoalStep.step_uuid)
    ).all()
    actual = Counter(getattr(status, "value", status) for status in first_steps)
    if expected != actual:
        problems.append(f"progress statuses: expected {dict(expected)}, got {dict(actual)}")
    stranded = _count(db, REQUIREMENT_SOURCE, REQUIREMENT_SOURCE.c.plan_objective_progress_id.is_not(None), REQUIREMENT_SOURCE.c.step_progress_id.is_(None))
    if stranded:
        problems.append(f"requirement sources: {stranded} still point only at plan progress")
    if problems:
        raise RuntimeError("Plans-to-goals check failed:\n- " + "\n- ".join(problems))
