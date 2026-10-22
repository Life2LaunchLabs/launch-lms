"""Live plans as goals.

Plan becomes goal, PlanPhase goal_stage, each PlanObjective one or more typed
goal_steps (the rules in ``migration.objectives``), and PlanObjectiveProgress a
step_progress per step, with field values as step entries or a typed
submission. Uuids carry over (an objective's first step keeps its uuid), so
This week's focus lists, links and activity logs keep pointing at the same
things. Roles, collaborators, invitations, requests, attachments and the
activity log are re-keyed to the goal in place; activity runs and requirement
sources are re-pointed to the step that took them over.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from sqlalchemy import update
from sqlmodel import Session, select

from src.db.goals import (
    CompletionMethod,
    Goal,
    GoalOwnership,
    GoalSource,
    GoalStage,
    GoalStatus,
    GoalStep,
    StepEntry,
    StepEntryKind,
    StepProgress,
    StepStatus,
)
from src.db.learning import LearningBadge
from src.db.media import MediaAsset
from src.services.goals.migration.legacy_tables import (
    LEARNING_RUN,
    REKEYED,
    REQUIREMENT_SOURCE,
    Objective,
    Plan,
    PlanObjective,
    PlanObjectiveProgress,
    PlanPhase,
    Program,
)
from src.services.goals.migration.objectives import STATUS_MAP, StepSpec, convert_objective, objective_from_plan
from src.services.goals.migration.documents import badge_exists, step_key
from src.services.goals.migration.templates import TemplateMaps
from src.services.goals.types import step_type

PLAN_STATUS = {"pending": GoalStatus.PENDING, "active": GoalStatus.ACTIVE, "completed": GoalStatus.FINISHED, "archived": GoalStatus.ARCHIVED}
# Statuses that belonged to the whole objective, so every step it split into takes them.
WHOLE_OBJECTIVE = {"completed", "excused", "submitted", "changes_requested"}
# Where the plan code kept which plans had already greeted their learner.
CELEBRATED_PLANS_KEY = "celebrated_plans"


@dataclass
class GoalCounts:
    goals: int = 0
    steps: int = 0
    progress: int = 0
    entries: int = 0
    runs: int = 0
    requirement_sources: int = 0
    warnings: list[str] = field(default_factory=list)


def _value(item) -> str:
    return getattr(item, "value", item)


def _celebrated_at(db: Session, plan: Plan):
    """Finished plans that already greeted their learner stay greeted."""
    from src.db.users import User

    user = db.get(User, plan.subject_user_id) if plan.subject_user_id else None
    seen = ((user.details or {}).get(CELEBRATED_PLANS_KEY) or []) if user else []
    return (plan.completed_at or datetime.now()) if plan.plan_uuid in seen else None


def _source(db: Session, plan: Plan) -> tuple[GoalSource, GoalOwnership]:
    if plan.source_assignment_id:
        return GoalSource.ASSIGNMENT, GoalOwnership.EXTERNAL
    if plan.source_badge_id:
        return GoalSource.BADGE, GoalOwnership.EXTERNAL
    program = db.get(Program, plan.source_program_id) if plan.source_program_id else None
    if program and program.system_type == "starter":
        return GoalSource.STARTER, GoalOwnership.EXTERNAL
    if program:
        return GoalSource.TEMPLATE, GoalOwnership.PERSONAL
    return GoalSource.NONE, GoalOwnership.PERSONAL


def _goal(db: Session, plan: Plan, maps: TemplateMaps) -> Goal:
    source, ownership = _source(db, plan)
    template = maps.templates.get(plan.source_program_id) if plan.source_program_id else None
    assignment = maps.assignments.get(plan.source_assignment_id) if plan.source_assignment_id else None
    version_id = assignment.version_id if assignment else (template.published_version_id if template else None)
    goal = Goal(
        goal_uuid=plan.plan_uuid, org_id=plan.source_org_id, owner_user_id=plan.owner_user_id, subject_user_id=plan.subject_user_id,
        ownership=ownership, source=source, template_id=template.id if template else None, version_id=version_id,
        assignment_id=assignment.id if assignment else None, badge_id=plan.source_badge_id, title=plan.name, description=plan.description or "",
        status=PLAN_STATUS.get(_value(plan.status), GoalStatus.ACTIVE),
        priority=plan.priority or 1, celebrated_at=_celebrated_at(db, plan), start_date=plan.start_date, target_date=plan.due_date, finished_at=plan.completed_at,
        creation_date=plan.creation_date, update_date=plan.update_date,
    )
    db.add(goal)
    db.flush()
    return goal


def _stages(db: Session, plan: Plan, goal: Goal) -> dict[int, GoalStage]:
    stages = {}
    phases = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id).order_by(PlanPhase.position, PlanPhase.id)).all()  # type: ignore[arg-type]
    for position, phase in enumerate(phases):
        stage = GoalStage(
            stage_uuid=phase.phase_uuid, goal_id=int(goal.id), position=position, title=phase.name, description=phase.description or "",  # type: ignore[arg-type]
            start_date=phase.start_date, due_date=phase.due_date, creation_date=phase.creation_date, update_date=phase.update_date,
        )
        db.add(stage)
        stages[int(phase.id)] = stage  # type: ignore[arg-type]
    db.flush()
    return stages


def _resolved(db: Session, spec: StepSpec, goal: Goal, counts: GoalCounts, title: str) -> tuple[str, dict, dict]:
    """The step's type, validated config and references; anything unresolvable becomes a task."""
    kind, config = spec.type, dict(spec.config)
    if kind == "activity":
        from src.db.learning import LearningActivity

        uuid = db.exec(select(LearningActivity.activity_uuid).where(LearningActivity.id == config.get("activity_id"))).first()
        config = {"activity_uuid": uuid} if uuid else {}
    if kind == "badge" and not badge_exists(db, config.get("badge_uuid")):
        config = {}
    if kind in {"activity", "badge"} and not any(config.values()):
        counts.warnings.append(f"{title}: {kind} missing, kept as a task")
        kind, config = "task", {}
    handler = step_type(kind)
    config = handler.validate_config(config)
    return kind, config, handler.resolve(db, config, goal.org_id)


def _asset(db: Session, value: dict) -> MediaAsset | None:
    if value.get("asset_uuid"):
        return db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == value["asset_uuid"])).first()
    if isinstance(value.get("id"), int):
        return db.get(MediaAsset, value["id"])
    return None


def _entries(db: Session, step: GoalStep, spec: StepSpec, values: dict, user_id: int | None, now: str) -> list[StepEntry]:
    entries = []

    def add(kind: StepEntryKind, slot: str | None, title: str, url: str = "", asset_id: int | None = None, done: bool = False) -> None:
        entries.append(StepEntry(
            entry_uuid=f"step_entry_{uuid4()}", step_id=int(step.id), kind=kind, slot=slot, title=title[:500], url=url, asset_id=asset_id,  # type: ignore[arg-type]
            done=done, position=len(entries), created_by_user_id=user_id, creation_date=now, update_date=now,
        ))

    for field_uuid in spec.source_field_uuids:
        value = values.get(field_uuid)
        items = value if isinstance(value, list) else [value] if value not in (None, "", {}) else []
        for item in items:
            if step.type == "upload":
                if isinstance(item, dict):
                    asset = _asset(db, item)
                    url = str(item.get("url") or item.get("file_url") or "")
                    title = str(item.get("name") or item.get("title") or item.get("filename") or "File")
                    add(StepEntryKind.FILE if asset else StepEntryKind.LINK, field_uuid, title, url, asset.id if asset else None)
                elif isinstance(item, str):
                    add(StepEntryKind.LINK, field_uuid, item, item)
            elif step.type == "task" and (step.config.get("list") or {}).get("item_kind") == "link":
                url = item if isinstance(item, str) else str((item or {}).get("url") or "")
                if url:
                    add(StepEntryKind.ITEM, None, url, url, done=True)
    for entry in entries:
        db.add(entry)
    return entries


def _submission(step: GoalStep, spec: StepSpec, values: dict) -> dict:
    if step.type != "write":
        return {}
    text = "\n\n".join(str(values[uuid]) for uuid in spec.source_field_uuids if values.get(uuid) not in (None, ""))
    return {"text": text} if text else {}


def _step_status(legacy_status: str, index: int, has_values: bool, total: int) -> str:
    status = STATUS_MAP.get(legacy_status, "not_started")
    if total == 1 or status in WHOLE_OBJECTIVE:
        return status
    if status == "in_progress":
        return "in_progress" if has_values or index == 0 else "not_started"
    return status


def _method(step: GoalStep, user_id: int | None, subject_id: int | None) -> CompletionMethod:
    if step.type in {"activity", "badge", "portfolio"}:
        return CompletionMethod.AUTO
    return CompletionMethod.STAFF if user_id and user_id != subject_id else CompletionMethod.LEARNER


def _progress(db: Session, goal: Goal, steps: list[tuple[GoalStep, StepSpec]], legacy: PlanObjectiveProgress, counts: GoalCounts) -> list[StepProgress]:
    values = dict(legacy.field_values or {})
    legacy_status = _value(legacy.status)
    rows = []
    for index, (step, spec) in enumerate(steps):
        has_values = any(values.get(uuid) not in (None, "", [], {}, False) for uuid in spec.source_field_uuids)
        status = _step_status(legacy_status, index, has_values, len(steps))
        done = status == StepStatus.COMPLETED.value
        progress = StepProgress(
            progress_uuid=legacy.progress_uuid if index == 0 else f"step_progress_{uuid4()}", step_id=int(step.id),  # type: ignore[arg-type]
            status=StepStatus(status), submission=_submission(step, spec, values),
            learner_note=(legacy.subject_note or "") if index == 0 else "", reviewer_note=(legacy.reviewer_note or "") if index == 0 else "",
            feedback_history=list(legacy.feedback_history or []) if index == 0 else [], staff_notes=list(legacy.staff_notes or []) if index == 0 else [],
            completed_at=legacy.completed_at if done else None, completed_by_user_id=legacy.updated_by_user_id if done else None,
            completion_method=_method(step, legacy.updated_by_user_id, goal.subject_user_id) if done else None,
            updated_by_user_id=legacy.updated_by_user_id, creation_date=legacy.creation_date, update_date=legacy.update_date,
        )
        db.add(progress)
        counts.entries += len(_entries(db, step, spec, values, legacy.updated_by_user_id or goal.subject_user_id, legacy.update_date or legacy.creation_date))
        rows.append(progress)
    db.flush()
    counts.progress += len(rows)
    return rows


def _objective_steps(db: Session, goal: Goal, objective: PlanObjective, stage: GoalStage | None, position: int,
                     template_keys: dict[int, str], counts: GoalCounts) -> list[tuple[GoalStep, StepSpec]]:
    badge_uuid = db.exec(select(LearningBadge.badge_uuid).where(LearningBadge.id == objective.badge_id)).first() if objective.badge_id else None
    conversion = convert_objective(objective_from_plan(objective), badge_uuid)
    counts.warnings.extend(f"{goal.title} / {objective.title}: {warning}" for warning in conversion.warnings)
    template_uuid = template_keys.get(objective.source_objective_id) if objective.source_objective_id else None
    built = []
    for index, spec in enumerate(conversion.steps):
        kind, config, references = _resolved(db, spec, goal, counts, objective.title)
        last = index == len(conversion.steps) - 1
        step = GoalStep(
            step_uuid=objective.objective_uuid if index == 0 else f"goal_step_{uuid4()}", goal_id=int(goal.id),  # type: ignore[arg-type]
            stage_id=stage.id if stage else None, position=position + index, type=kind, title=spec.title,
            description=(objective.description or "") if index == 0 else "", config=config,
            completed_by="learner" if kind in {"activity", "badge"} else spec.completed_by,
            review_required=spec.review_required and spec.completed_by == "learner", reviewer_guidance=objective.reviewer_guidance or "",
            start_date=objective.start_date, due_date=objective.due_date, held=objective.blocked,
            requirement_links=list(objective.requirement_mappings or []) if last else [],
            activity_id=references.get("activity_id"), badge_id=references.get("badge_id"),
            template_key=step_key(template_uuid, index) if template_uuid else None,
            creation_date=objective.creation_date, update_date=objective.update_date,
        )
        db.add(step)
        built.append((step, spec))
    db.flush()
    counts.steps += len(built)
    return built


def migrate_plan(db: Session, plan: Plan, maps: TemplateMaps, template_keys: dict[int, str], counts: GoalCounts) -> Goal:
    goal = _goal(db, plan, maps)
    stages = _stages(db, plan, goal)
    objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position, PlanObjective.id)).all()  # type: ignore[arg-type]
    positions: dict[int | None, int] = {}
    present = {objective.objective_uuid for objective in objectives}
    for objective in objectives:
        stage = stages.get(objective.phase_id) if objective.phase_id else None
        stage_id = stage.id if stage else None
        steps = _objective_steps(db, goal, objective, stage, positions.get(stage_id, 0), template_keys, counts)
        positions[stage_id] = positions.get(stage_id, 0) + len(steps)
        steps[0][0].after_step_uuids = [uuid for uuid in objective.after_objective_uuids or [] if uuid in present and uuid != objective.objective_uuid]
        legacy = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
        if legacy:
            progress = _progress(db, goal, steps, legacy, counts)
            counts.requirement_sources += db.execute(
                update(REQUIREMENT_SOURCE).where(REQUIREMENT_SOURCE.c.plan_objective_progress_id == legacy.id).values(step_progress_id=progress[-1].id)
            ).rowcount or 0
        activity_step = next((step for step, _ in steps if step.type == "activity"), None)
        if activity_step:
            counts.runs += db.execute(
                update(LEARNING_RUN).where(LEARNING_RUN.c.plan_objective_id == objective.id).values(goal_id=goal.id, goal_step_id=activity_step.id)
            ).rowcount or 0
    for table in REKEYED:
        db.execute(update(table).where(table.c.plan_id == plan.id).values(goal_id=goal.id))
    db.flush()
    counts.goals += 1
    return goal


def migrate_plans(db: Session, maps: TemplateMaps) -> GoalCounts:
    counts = GoalCounts()
    template_keys = {int(row[0]): row[1] for row in db.exec(select(Objective.id, Objective.objective_uuid)).all()}
    for plan in db.exec(select(Plan).order_by(Plan.id)).all():  # type: ignore[arg-type]
        migrate_plan(db, plan, maps, template_keys, counts)
    return counts

