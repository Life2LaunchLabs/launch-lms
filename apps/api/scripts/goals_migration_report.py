#!/usr/bin/env python3
"""Read-only counts and a dry run of the plans -> goals conversion.

Prints what the goals migration would have to move and what each objective
would become, without writing anything. Run it against production (or a copy)
before the migration is written:

    uv run python scripts/goals_migration_report.py            # text report
    uv run python scripts/goals_migration_report.py --json     # machine-readable
    uv run python scripts/goals_migration_report.py --org-id 3
    uv run python scripts/goals_migration_report.py --try-move  # run the real move, then roll it back

``--try-move`` runs the plans-to-goals move itself (with its checks) inside a
transaction and rolls it back, so a copy of production can be tried before the
cutover release. It needs an empty goal model, which every release before the
cutover has.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from sqlmodel import Session, func, select  # noqa: E402

from src.core.events.database import engine  # noqa: E402
from src.db.learning import LearningBadge  # noqa: E402
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanPhase  # noqa: E402
from src.db.programs import (  # noqa: E402
    FrozenActivity,
    Objective,
    ObjectiveProgress,
    Program,
    ProgramAssignment,
    ProgramObjective,
    ProgramParticipant,
    ProgramTemplateVersion,
)
from src.db.requirements import RequirementAttainmentSource  # noqa: E402
from src.services.template_versions import working_activity  # noqa: E402
from src.services.goals.legacy import (  # noqa: E402
    STATUS_MAP,
    convert_objective,
    objective_from_plan,
    objective_from_template,
    step_mix,
    value_shape,
)

TOP = 15


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _count(db: Session, model, *where) -> int:
    return int(db.exec(select(func.count()).select_from(model).where(*where)).one())


def _plan_source(plan: Plan, starter_ids: set[int]) -> str:
    if plan.source_assignment_id:
        return "assignment"
    if plan.source_badge_id:
        return "badge"
    if plan.source_program_id in starter_ids:
        return "starter"
    if plan.source_program_id:
        return "template (self-started)"
    return "personal"


def _top(counter: Counter, limit: int = TOP) -> dict:
    return dict(counter.most_common(limit))


def _snapshot_objectives(snapshot) -> list[dict]:
    if isinstance(snapshot, dict):
        return list(snapshot.get("objectives") or [])
    return list(snapshot or [])


def _comparable(objectives: list[dict]) -> list[tuple]:
    return [
        (item.get("objective_uuid"), item.get("title"), json.dumps(item.get("custom_fields") or item.get("fields") or [], sort_keys=True), item.get("activity_id"))
        for item in objectives
    ]


def report(db: Session, org_id: int | None = None) -> dict:
    def scoped(model, column="org_id"):
        return (getattr(model, column) == org_id,) if org_id else ()

    badge_uuids = {int(badge_id): badge_uuid for badge_id, badge_uuid in db.exec(select(LearningBadge.id, LearningBadge.badge_uuid)).all()}
    programs = list(db.exec(select(Program).where(*scoped(Program))).all())
    starter_ids = {int(program.id) for program in programs if program.system_type == "starter"}  # type: ignore[arg-type]
    program_ids = {int(program.id) for program in programs}  # type: ignore[arg-type]

    out: dict = {"scope": {"org_id": org_id}}

    # Templates
    out["templates"] = {
        "templates": len(programs),
        "by_status": dict(Counter(_value(program.status) for program in programs)),
        "system": dict(Counter(program.system_type for program in programs if program.system_type)),
        "step_order": dict(Counter(program.step_order for program in programs)),
        "published": sum(1 for program in programs if program.published_version_id),
        "versions": _count(db, ProgramTemplateVersion, *scoped(ProgramTemplateVersion)),
        "frozen_activities": _count(db, FrozenActivity) if not org_id else None,
    }
    template_objectives = list(db.exec(
        select(Objective, ProgramObjective).join(ProgramObjective, ProgramObjective.objective_id == Objective.id).where(ProgramObjective.program_id.in_(program_ids))  # type: ignore[union-attr]
    ).all()) if program_ids else []
    orphan_objectives = _count(db, Objective, *scoped(Objective)) - len({objective.id for objective, _ in template_objectives})

    # Assignments
    assignments = list(db.exec(select(ProgramAssignment).where(*scoped(ProgramAssignment))).all())
    versions = {int(version.id): version for version in db.exec(select(ProgramTemplateVersion).where(*scoped(ProgramTemplateVersion))).all()}  # type: ignore[arg-type]
    edited = 0
    unversioned = 0
    for assignment in assignments:
        version = versions.get(int(assignment.template_version_id)) if assignment.template_version_id else None
        if not version:
            unversioned += 1
            continue
        if _comparable(_snapshot_objectives(assignment.objective_snapshot)) != _comparable(_snapshot_objectives(version.snapshot)):
            edited += 1
    out["assignments"] = {
        "assignments": len(assignments),
        "active": sum(1 for assignment in assignments if assignment.active),
        "to_group": sum(1 for assignment in assignments if assignment.usergroup_id),
        "to_person": sum(1 for assignment in assignments if assignment.user_id or assignment.subject_email),
        "without_version": unversioned,
        "snapshot_differs_from_version": edited,
        "participants": _count(db, ProgramParticipant, *scoped(ProgramParticipant)),
        "participants_by_status": dict(Counter(_value(status) for status in db.exec(select(ProgramParticipant.status).where(*scoped(ProgramParticipant))).all())),
    }

    # Live plans
    plan_filter = (Plan.source_org_id == org_id,) if org_id else ()
    plans = list(db.exec(select(Plan).where(*plan_filter)).all())
    plan_ids = [int(plan.id) for plan in plans]  # type: ignore[arg-type]
    sources = {int(plan.id): _plan_source(plan, starter_ids) for plan in plans}  # type: ignore[arg-type]
    out["plans"] = {
        "plans": len(plans),
        "by_status": dict(Counter(_value(plan.status) for plan in plans)),
        "by_source": dict(Counter(sources.values())),
        "by_source_and_status": dict(Counter(f"{sources[int(plan.id)]} / {_value(plan.status)}" for plan in plans)),  # type: ignore[arg-type]
        "step_order": dict(Counter(plan.step_order for plan in plans)),
        "with_due_date": sum(1 for plan in plans if plan.due_date),
        "phases": _count(db, PlanPhase, PlanPhase.plan_id.in_(plan_ids)) if plan_ids else 0,  # type: ignore[union-attr]
    }

    # Live objectives and their conversion
    objectives = list(db.exec(select(PlanObjective).where(PlanObjective.plan_id.in_(plan_ids))).all()) if plan_ids else []  # type: ignore[union-attr]
    progress_rows = {
        row.plan_objective_id: row
        for row in (db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id.in_([o.id for o in objectives]))).all() if objectives else [])  # type: ignore[union-attr]
    }
    by_kind: Counter = Counter()
    mixes: Counter = Counter()
    mixes_by_source: dict[str, Counter] = {}
    step_types: Counter = Counter()
    who: Counter = Counter()
    warnings: Counter = Counter()
    split_objectives = 0
    split_in_progress = 0
    steps_total = 0
    field_restricted = 0
    with_after = 0
    with_dates = 0
    with_requirements = 0
    statuses: Counter = Counter()
    new_statuses: Counter = Counter()
    value_shapes: Counter = Counter()
    unknown_values = 0
    for row in objectives:
        legacy = objective_from_plan(row)
        conversion = convert_objective(legacy)
        source = sources[int(row.plan_id)]
        by_kind[row.kind] += 1
        mix = step_mix(legacy)
        mixes[mix] += 1
        mixes_by_source.setdefault(source, Counter())[mix] += 1
        steps_total += len(conversion.steps)
        for step in conversion.steps:
            step_types[step.type] += 1
            who[f"{step.completed_by}{' + review' if step.review_required else ''}"] += 1
        for warning in conversion.warnings:
            warnings[warning] += 1
        field_restricted += any(raw.get("restricted") for raw in row.fields or [])
        with_after += bool(row.after_objective_uuids)
        with_dates += bool(row.start_date or row.due_date)
        with_requirements += bool(row.requirement_mappings)
        progress = progress_rows.get(row.id)
        status = _value(progress.status) if progress else "not_started"
        statuses[status] += 1
        new_statuses[STATUS_MAP.get(status, f"UNMAPPED:{status}")] += 1
        if conversion.split:
            split_objectives += 1
            split_in_progress += status not in {"not_started", "completed", "canceled"}
        if progress:
            types = {str(raw.get("field_uuid")): str(raw.get("type") or "text") for raw in row.fields or []}
            for key, value in (progress.field_values or {}).items():
                if key not in types:
                    unknown_values += 1
                    continue
                value_shapes[f"{types[key]}: {value_shape(value)}"] += 1

    out["objectives"] = {
        "objectives": len(objectives),
        "by_kind": dict(by_kind),
        "by_step_mix": _top(mixes, 30),
        "by_step_mix_and_source": {source: _top(counter) for source, counter in mixes_by_source.items()},
        "staff_only": sum(1 for row in objectives if row.completion_restricted),
        "learner_confirmable": sum(1 for row in objectives if not row.completion_restricted),
        "with_staff_only_fields": field_restricted,
        "with_order_constraints": with_after,
        "with_dates": with_dates,
        "with_requirement_links": with_requirements,
        "blocked": sum(1 for row in objectives if row.blocked),
    }
    out["conversion"] = {
        "steps_after": steps_total,
        "objectives_split": split_objectives,
        "split_and_mid_progress": split_in_progress,
        "step_types": dict(step_types),
        "completed_by": dict(who),
        "warnings": dict(warnings),
    }
    out["progress"] = {
        "rows": len(progress_rows),
        "objectives_without_progress_row": len(objectives) - len(progress_rows),
        "by_status": dict(statuses),
        "by_new_status": dict(new_statuses),
        "field_value_shapes": _top(value_shapes, 30),
        "values_for_unknown_fields": unknown_values,
    }

    # Template objectives (what goal_template documents are built from)
    template_mixes: Counter = Counter()
    template_types: Counter = Counter()
    template_split = 0
    template_warnings: Counter = Counter()
    for objective, relation in template_objectives:
        snapshot = {
            "title": objective.title, "kind": _value(objective.kind), "custom_fields": objective.custom_fields or [],
            "allow_learner_confirmation": objective.allow_learner_confirmation,
        }
        if _value(objective.kind) == "activity":
            activity = working_activity(db, int(objective.id))  # type: ignore[arg-type]
            snapshot["activity_id"] = activity.id if activity else None
        legacy = objective_from_template(snapshot)
        conversion = convert_objective(legacy, badge_uuids.get(int(objective.badge_id)) if objective.badge_id else None)
        template_mixes[step_mix(legacy)] += 1
        template_split += conversion.split
        for step in conversion.steps:
            template_types[step.type] += 1
        for warning in conversion.warnings:
            template_warnings[warning] += 1
    out["template_objectives"] = {
        "objectives": len(template_objectives),
        "not_in_any_template": orphan_objectives,
        "by_kind": dict(Counter(_value(objective.kind) for objective, _ in template_objectives)),
        "by_step_mix": _top(template_mixes, 30),
        "learner_confirmable": sum(1 for objective, _ in template_objectives if objective.allow_learner_confirmation),
        "with_badge_id": sum(1 for objective, _ in template_objectives if objective.badge_id),
        "with_order_constraints": sum(1 for _, relation in template_objectives if relation.after_objective_uuids),
        "split": template_split,
        "step_types_after": dict(template_types),
        "warnings": dict(template_warnings),
    }

    # Legacy per-objective progress that requirements may still read
    legacy_progress = _count(db, ObjectiveProgress, *scoped(ObjectiveProgress))
    out["legacy_progress"] = {
        "objective_progress_rows": legacy_progress,
        "by_status": dict(Counter(_value(status) for status in db.exec(select(ObjectiveProgress.status).where(*scoped(ObjectiveProgress))).all())),
        "attainment_sources_on_legacy_progress": _count(db, RequirementAttainmentSource, RequirementAttainmentSource.objective_progress_id.is_not(None)),  # type: ignore[union-attr]
        "attainment_sources_on_plan_progress": _count(db, RequirementAttainmentSource, RequirementAttainmentSource.plan_objective_progress_id.is_not(None)),  # type: ignore[union-attr]
    }
    return out


def _print(data: dict, indent: int = 0) -> None:
    pad = "  " * indent
    for key, value in data.items():
        if isinstance(value, dict):
            if not value:
                print(f"{pad}{key}: none")
                continue
            print(f"{pad}{key}:")
            _print(value, indent + 1)
        elif value is not None:
            print(f"{pad}{key}: {value}")


def _try_move(as_json: bool) -> None:
    from src.services.goals.migration import run

    with Session(engine) as db:
        try:
            result = run(db)
            data = {"ok": True, "counts": result.counts, "warnings": result.warnings}
        except Exception as error:  # noqa: BLE001 - report whatever stopped the move
            data = {"ok": False, "error": f"{type(error).__name__}: {error}"}
        finally:
            db.rollback()
    if as_json:
        print(json.dumps(data, indent=2, sort_keys=True, default=str))
    else:
        _print({key: value for key, value in data.items() if key != "warnings"})
        for warning in data.get("warnings") or []:
            print(f"warning: {warning}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--org-id", type=int, help="Limit to one organization")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of text")
    parser.add_argument("--try-move", action="store_true", help="Run the plans-to-goals move and roll it back")
    args = parser.parse_args()
    if args.try_move:
        _try_move(args.json)
        return
    with Session(engine) as db:
        data = report(db, args.org_id)
        db.rollback()
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True, default=str))
    else:
        _print(data)


if __name__ == "__main__":
    main()
