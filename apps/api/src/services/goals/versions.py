"""Comparing two template versions, and moving one live goal from one to the other.

Issued goals keep the version they got. Moving a goal to another version
(only when an admin applies it to an assignment, see ``assignment_versions``)
rewrites just the steps nobody has started, matched by ``template_key``:

- a step the new version changed, or moved to another stage, is rewritten in place
  (same step, so links to it keep working);
- a step the new version removed is deleted;
- a step the new version added is built;
- a step that has been started (any status but not started, an entry, an
  activity run) is left exactly as it is, answers and all, even when the new
  version changed or removed it. So are steps the template never had.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalStage, GoalStep, GoalTemplateVersion, StepEntry, StepProgress, StepStatus
from src.db.learning import LearningRun
from src.services.goals import access
from src.services.goals.document import upgrade_document
from src.services.goals.issue import build_step, step_fields

STAGE_FIELDS = ("title", "description", "timing", "milestone", "duration_weeks")


def _now() -> str:
    return datetime.now().isoformat()


def _steps_by_key(document: dict) -> dict[str, tuple[dict, dict]]:
    return {step["key"]: (stage, step) for stage in document.get("stages") or [] for step in stage.get("steps") or []}


def _changed_fields(before: dict, after: dict) -> list[str]:
    return sorted(key for key in set(before) | set(after) if key != "key" and before.get(key) != after.get(key))


def _step_ref(spec: dict, change: str, **extra) -> dict:
    return {"step_key": spec["key"], "title": spec.get("title") or "", "type": spec.get("type") or "", "change": change, **extra}


def changes(old_document: dict, new_document: dict) -> list[dict]:
    """What a new version changes, stage by stage: steps added, removed, changed or moved here.

    Each stage is {stage_key, title, change: added|removed|changed|same, fields, steps};
    unchanged steps are left out.
    """
    old_doc, new_doc = upgrade_document(old_document or {}), upgrade_document(new_document or {})
    old_steps, new_steps = _steps_by_key(old_doc), _steps_by_key(new_doc)
    old_stages = {stage["key"]: stage for stage in old_doc.get("stages") or []}
    new_keys = {stage["key"] for stage in new_doc.get("stages") or []}
    result = []
    for stage in new_doc.get("stages") or []:
        steps = []
        for spec in stage.get("steps") or []:
            before = old_steps.get(spec["key"])
            if before is None:
                steps.append(_step_ref(spec, "added"))
            elif before[0]["key"] != stage["key"]:
                steps.append(_step_ref(spec, "moved", moved_from=before[0].get("title") or "", fields=_changed_fields(before[1], spec)))
            elif before[1] != spec:
                steps.append(_step_ref(spec, "changed", fields=_changed_fields(before[1], spec)))
        here = {spec["key"] for spec in stage.get("steps") or []}
        steps += [_step_ref(spec, "removed") for spec in (old_stages.get(stage["key"]) or {}).get("steps") or []
                  if spec["key"] not in here and spec["key"] not in new_steps]
        previous = old_stages.get(stage["key"])
        fields = [field for field in STAGE_FIELDS if previous and previous.get(field) != stage.get(field)]
        change = "added" if previous is None else "changed" if steps or fields else "same"
        result.append({"stage_key": stage["key"], "title": stage.get("title") or "", "change": change, "fields": fields, "steps": steps})
    for key, stage in old_stages.items():
        if key not in new_keys:
            gone = [_step_ref(spec, "removed") for spec in stage.get("steps") or [] if spec["key"] not in new_steps]
            result.append({"stage_key": key, "title": stage.get("title") or "", "change": "removed", "fields": [], "steps": gone})
    return result


def started_step_ids(db: Session, step_ids: list[int]) -> set[int]:
    """Steps someone has started: moved off not started, written in, or played."""
    if not step_ids:
        return set()
    started = {int(row.step_id) for row in db.exec(select(StepProgress).where(col(StepProgress.step_id).in_(step_ids))).all()
               if getattr(row.status, "value", row.status) != StepStatus.NOT_STARTED.value}
    started |= {int(step_id) for step_id in db.exec(select(StepEntry.step_id).where(col(StepEntry.step_id).in_(step_ids))).all()}
    started |= {int(step_id) for step_id in db.exec(select(LearningRun.goal_step_id).where(col(LearningRun.goal_step_id).in_(step_ids))).all() if step_id}
    return started


def _delete_step(db: Session, step: GoalStep) -> None:
    for progress in db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).all():
        db.delete(progress)
    db.delete(step)


def apply_to_goal(db: Session, goal: Goal, old: GoalTemplateVersion | None, new: GoalTemplateVersion, planned: dict, actor_user_id: int | None) -> dict:
    """Move one goal to ``new`` (flushed, not committed).

    Returns counts: steps rewritten, added and removed, and ``kept_started``, the
    started steps the new version changed or removed (left as they are).

    ``planned`` holds the assignment's dates for the new version ({"stages": {key: start}, "steps": {key: due}}).
    """
    old_doc, new_doc = upgrade_document((old.document if old else None) or {}), upgrade_document(new.document or {})
    old_specs = _steps_by_key(old_doc)
    steps = list(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all())
    started = started_step_ids(db, [int(step.id) for step in steps])  # type: ignore[arg-type]
    by_key = {step.template_key: step for step in steps if step.template_key}
    new_specs = _steps_by_key(new_doc)
    counts = {"rewritten": 0, "added": 0, "removed": 0, "kept_started": 0}
    for step in steps:
        if step.template_key and step.template_key not in new_specs:
            if step.id in started:
                counts["kept_started"] += 1
            else:
                _delete_step(db, step)
                counts["removed"] += 1
    stages = {stage.template_key: stage for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}
    now = _now()
    touched: list[tuple[GoalStep, dict]] = []
    for stage_position, stage_spec in enumerate(new_doc.get("stages") or []):
        stage = stages.get(stage_spec["key"])
        if stage is None:
            stage = GoalStage(stage_uuid=f"goal_stage_{uuid4()}", goal_id=int(goal.id), template_key=stage_spec["key"],  # type: ignore[arg-type]
                              start_date=planned["stages"].get(stage_spec["key"]), creation_date=now, title="")
            stages[stage_spec["key"]] = stage
        stage.position, stage.title, stage.update_date = stage_position, stage_spec["title"], now
        stage.description, stage.timing, stage.milestone = stage_spec.get("description") or "", stage_spec.get("timing") or "", stage_spec.get("milestone") or ""
        db.add(stage)
        db.flush()
        for position, spec in enumerate(stage_spec.get("steps") or []):
            step = by_key.get(spec["key"])
            due = planned["steps"].get(spec["key"])
            if step is None:
                step = build_step(db, goal, stage, spec, position, due_date=due)
                counts["added"] += 1
                touched.append((step, spec))
            elif step.id in started:
                counts["kept_started"] += spec != (old_specs.get(spec["key"]) or ({}, {}))[1]
                if step.stage_id == stage.id:
                    step.position = position
                    db.add(step)
            else:
                before = old_specs.get(spec["key"])
                if before is None or before[1] != spec or step.stage_id != stage.id:
                    for field, value in step_fields(db, goal, spec).items():
                        setattr(step, field, value)
                    step.stage_id, step.due_date, step.update_date = stage.id, due, now
                    counts["rewritten"] += 1
                    touched.append((step, spec))
                step.position = position
                db.add(step)
    db.flush()
    _relink(db, goal, touched)
    _drop_empty_stages(db, goal, {stage["key"] for stage in new_doc.get("stages") or []})
    goal.version_id, goal.update_date = new.id, now
    db.add(goal)
    access.log(db, goal, actor_user_id, "goal.version_applied", {"from": old.number if old else None, "to": new.number, **counts})
    return counts


def _relink(db: Session, goal: Goal, touched: list[tuple[GoalStep, dict]]) -> None:
    """Rewritten and new steps follow the new version's step order links."""
    if not touched:
        return
    uuids = {step.template_key: step.step_uuid for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all() if step.template_key}
    for step, spec in touched:
        step.after_step_uuids = [uuids[key] for key in spec.get("after") or [] if key in uuids]
        db.add(step)
    db.flush()


def _drop_empty_stages(db: Session, goal: Goal, keep: set[str]) -> None:
    for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all():
        if stage.template_key and stage.template_key not in keep and not db.exec(select(GoalStep.id).where(GoalStep.stage_id == stage.id)).first():
            db.delete(stage)
    db.flush()
