"""Issuing: the one way a template version becomes a live goal.

Assignments, badge starts, the starter flow, learners starting a template
themselves and make-up steps all build steps here, so every step is built (and
every activity carried over) the same way.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, select

from src.db.goals import (
    Goal,
    GoalOwnership,
    GoalSource,
    GoalStage,
    GoalStatus,
    GoalStep,
    GoalTemplate,
    GoalTemplateVersion,
    StepOrder,
)
from src.services.goals import access
from src.services.goals.document import iter_steps
from src.services.goals.types import step_type


def _now() -> str:
    return datetime.now().isoformat()


def _date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def stage_schedule(document: dict, start: date | None, stage_dates: dict | None = None) -> dict[str, tuple[date | None, date | None]]:
    """Dates per stage key: the assignment's own, otherwise stages back to back from ``start`` by their length."""
    stage_dates = stage_dates or {}
    schedule: dict[str, tuple[date | None, date | None]] = {}
    cursor = start
    for stage in document.get("stages") or []:
        given = stage_dates.get(stage["key"]) or {}
        begins = _date(given.get("start_date")) or cursor
        weeks = stage.get("duration_weeks")
        ends = _date(given.get("due_date")) or (begins + timedelta(days=7 * weeks - 1) if begins and weeks else None)
        schedule[stage["key"]] = (begins, ends)
        cursor = ends + timedelta(days=1) if ends else None
    return schedule


def _step_due(step: dict, stage_start: date | None, stage_due: date | None) -> date | None:
    if step.get("due_week") and stage_start:
        due = stage_start + timedelta(days=7 * int(step["due_week"]) - 1)
        return min(due, stage_due) if stage_due else due
    return None


def build_step(db: Session, goal: Goal, stage: GoalStage | None, spec: dict, position: int, *, due_date: date | None = None) -> GoalStep:
    """A live step from a template document step (or a step a learner or Coach wrote in the same shape)."""
    from src.services.goals.credit import requirement_links

    kind = step_type(spec["type"])
    config = kind.validate_config(spec.get("config"))
    references = kind.resolve(db, config, goal.org_id)
    now = _now()
    step = GoalStep(
        step_uuid=f"goal_step_{uuid4()}", goal_id=int(goal.id), stage_id=stage.id if stage else None,  # type: ignore[arg-type]
        position=position, type=kind.key, title=spec["title"], description=spec.get("description") or "",
        config=config, materials=list(spec.get("materials") or []),
        completed_by=spec.get("completed_by") or "learner", review_required=bool(spec.get("review_required")),
        reviewer_guidance=spec.get("reviewer_guidance") or "", due_date=due_date, allow_late=bool(spec.get("allow_late")),
        requirement_links=requirement_links(db, goal.org_id, list(spec.get("requirement_node_uuids") or [])),
        activity_id=references.get("activity_id"), badge_id=references.get("badge_id"),
        template_key=spec.get("key"), creation_date=now, update_date=now,
    )
    db.add(step)
    return step


def build_stages(db: Session, goal: Goal, document: dict, schedule: dict, first_position: int = 0) -> None:
    """A template document's stages and steps on a live goal, with step order links (flushed, not committed)."""
    now = _now()
    keys_to_uuids: dict[str, str] = {}
    built: list[tuple[dict, GoalStep]] = []
    for stage_position, spec in enumerate(document["stages"], start=first_position):
        stage_start, stage_due = schedule.get(spec["key"], (None, None))
        stage = GoalStage(
            stage_uuid=f"goal_stage_{uuid4()}", goal_id=int(goal.id), position=stage_position, title=spec["title"],  # type: ignore[arg-type]
            description=spec.get("description") or "", timing=spec.get("timing") or "", milestone=spec.get("milestone") or "", start_date=stage_start,
            due_date=stage_due, template_key=spec["key"], creation_date=now, update_date=now,
        )
        db.add(stage)
        db.flush()
        for position, step_spec in enumerate(spec.get("steps") or []):
            step = build_step(db, goal, stage, step_spec, position, due_date=_step_due(step_spec, stage_start, stage_due))
            keys_to_uuids[step_spec["key"]] = step.step_uuid
            built.append((step_spec, step))
    for step_spec, step in built:
        step.after_step_uuids = [keys_to_uuids[key] for key in step_spec.get("after") or [] if key in keys_to_uuids]
        db.add(step)
    db.flush()


def _source_value(source: GoalSource) -> str:
    return getattr(source, "value", source)


def issue_goal(
    db: Session,
    template: GoalTemplate,
    version: GoalTemplateVersion,
    *,
    subject_user_id: int | None,
    owner_user_id: int | None = None,
    org_id: int | None = None,
    source: GoalSource = GoalSource.ASSIGNMENT,
    assignment_id: int | None = None,
    badge_id: int | None = None,
    title: str | None = None,
    staff_user_ids: list[int] | None = None,
    start_date: date | None = None,
    due_date: date | None = None,
    stage_dates: dict | None = None,
    status: GoalStatus = GoalStatus.ACTIVE,
    actor_user_id: int | None = None,
) -> Goal:
    """A live goal from a template version, with its roles, members, stages and steps (flushed, not committed).

    ``subject_user_id`` is None for a goal issued to someone without an account yet; it waits for them.
    """
    document = version.document or {}
    if not document.get("stages"):
        raise HTTPException(status_code=422, detail="This template version has no stages")
    meta = document.get("template") or {}
    now = _now()
    goal = Goal(
        goal_uuid=f"goal_{uuid4()}", org_id=org_id if org_id is not None else template.org_id,
        owner_user_id=owner_user_id or subject_user_id, subject_user_id=subject_user_id,
        ownership=GoalOwnership.EXTERNAL, source=source, template_id=template.id, version_id=version.id,
        assignment_id=assignment_id, badge_id=badge_id, title=title or meta.get("title") or template.title,
        description=meta.get("description") or "", status=status, step_order=meta.get("step_order") or StepOrder.ANY.value,
        start_date=start_date, target_date=due_date, creation_date=now, update_date=now,
    )
    db.add(goal)
    db.flush()

    roles = document.get("roles") or {}
    seeded = access.seed_roles(db, goal, roles)
    subject_role = seeded.get(roles.get("subject_role_key") or "subject")
    staff_role = seeded.get(roles.get("staff_role_key") or "reviewer")
    if subject_role and subject_user_id and goal.owner_user_id != subject_user_id:
        access.add_member(db, goal, subject_user_id, subject_role)
    for staff_id in dict.fromkeys(staff_user_ids or []):
        if staff_role and staff_id not in {subject_user_id, goal.owner_user_id}:
            access.add_member(db, goal, int(staff_id), staff_role)

    build_stages(db, goal, document, stage_schedule(document, start_date, stage_dates))
    access.log(db, goal, actor_user_id, "goal.issued", {"source": _source_value(source), "template_uuid": template.template_uuid, "version": version.number})
    return goal


def issue_step(db: Session, goal: Goal, version: GoalTemplateVersion, step_key: str, stage: GoalStage | None = None, actor_user_id: int | None = None) -> GoalStep:
    """Add one step of a template version to a live goal, e.g. a make-up step for a missed requirement."""
    spec = next((step for _, step in iter_steps(version.document or {}) if step.get("key") == step_key), None)
    if not spec:
        raise HTTPException(status_code=404, detail="Step not found in this template")
    last = db.exec(select(func.max(GoalStep.position)).where(GoalStep.goal_id == goal.id, GoalStep.stage_id == (stage.id if stage else None))).one()
    position = 0 if last is None else last + 1
    step = build_step(db, goal, stage, {**spec, "after": []}, position)
    db.flush()
    access.log(db, goal, actor_user_id, "step.added", {"step_uuid": step.step_uuid, "from_template_step": step_key})
    return step
