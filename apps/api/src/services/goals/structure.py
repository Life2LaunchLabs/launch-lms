"""Editing a live goal's stages and steps: add, change, move, reorder and delete."""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.goals import Goal, GoalStage, GoalStep, StageCreate, StageUpdate, StepCompleter, StepCreate, StepMove, StepUpdate
from src.db.users import PublicUser
from src.services.goals import access, check_ins
from src.services.goals.goals import _now, _personal, _value, goal_dict, step_or_404
from src.services.goals.types import step_type


# Stages ------------------------------------------------------------------------------

def _stage(db: Session, goal: Goal, stage_uuid: str) -> GoalStage:
    stage = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id, GoalStage.stage_uuid == stage_uuid)).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    return stage


def _renumber(db: Session, rows: list) -> None:
    for index, row in enumerate(rows):
        if row.position != index:
            row.position = index
            db.add(row)


def add_stage(db: Session, current_user: PublicUser, goal_uuid: str, payload: StageCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    stages = sorted(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all(), key=lambda item: item.position)
    now = _now()
    stage = GoalStage(
        stage_uuid=f"goal_stage_{uuid4()}", goal_id=int(goal.id), title=payload.title.strip(), description=payload.description,  # type: ignore[arg-type]
        timing=payload.timing, milestone=payload.milestone.strip(), creation_date=now, update_date=now,
    )
    position = len(stages) if payload.position is None else min(payload.position, len(stages))
    stages.insert(position, stage)
    db.add(stage)
    _renumber(db, stages)
    access.log(db, goal, current_user.id, "stage.added", {"title": stage.title})
    db.commit()
    return goal_dict(db, goal, current_user.id)


def update_stage(db: Session, current_user: PublicUser, goal_uuid: str, stage_uuid: str, payload: StageUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    changes = payload.model_dump(exclude_unset=True)
    access.require(db, goal, current_user.id, "edit_schedule" if set(changes) <= {"start_date", "due_date"} else "edit_structure")
    stage = _stage(db, goal, stage_uuid)
    for key, value in changes.items():
        setattr(stage, key, value)
    stage.update_date = _now()
    db.add(stage)
    db.commit()
    return goal_dict(db, goal, current_user.id)


def delete_stage(db: Session, current_user: PublicUser, goal_uuid: str, stage_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    stage = _stage(db, goal, stage_uuid)
    if db.exec(select(GoalStep.id).where(GoalStep.stage_id == stage.id)).first():
        raise HTTPException(status_code=409, detail="Move or delete this stage's steps first")
    db.delete(stage)
    db.flush()
    _renumber(db, sorted(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all(), key=lambda item: item.position))
    access.log(db, goal, current_user.id, "stage.deleted", {"title": stage.title})
    db.commit()
    return goal_dict(db, goal, current_user.id)


def reorder_stages(db: Session, current_user: PublicUser, goal_uuid: str, stage_uuids: list[str]) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    stages = {stage.stage_uuid: stage for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}
    if sorted(stage_uuids) != sorted(stages):
        raise HTTPException(status_code=422, detail="List every stage of the goal once")
    _renumber(db, [stages[uuid] for uuid in stage_uuids])
    db.commit()
    return goal_dict(db, goal, current_user.id)


# Steps -------------------------------------------------------------------------------

def _prerequisites(db: Session, goal: Goal, uuids: list[str], step_uuid: str | None) -> list[str]:
    cleaned = list(dict.fromkeys(uuid for uuid in uuids if uuid and uuid != step_uuid))
    if not cleaned:
        return []
    known = set(db.exec(select(GoalStep.step_uuid).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid.in_(cleaned))).all())  # type: ignore[attr-defined]
    if len(known) != len(cleaned):
        raise HTTPException(status_code=422, detail="A step can only wait on other steps of this goal")
    return cleaned


def _check_completer(goal: Goal, completed_by: str, review_required: bool) -> None:
    if _personal(goal) and (completed_by == StepCompleter.STAFF.value or review_required):
        raise HTTPException(status_code=422, detail="Personal goals never wait on staff")
    if completed_by == StepCompleter.STAFF.value and review_required:
        raise HTTPException(status_code=422, detail="Staff steps aren't reviewed")


def _siblings(db: Session, goal: Goal, stage_id: int | None) -> list[GoalStep]:
    return sorted(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.stage_id == stage_id)).all(), key=lambda item: (item.position, item.id or 0))


def add_step(db: Session, current_user: PublicUser, goal_uuid: str, payload: StepCreate) -> dict:
    from src.services.goals.issue import build_step

    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    stage = _stage(db, goal, payload.stage_uuid) if payload.stage_uuid else None
    _check_completer(goal, _value(payload.completed_by), payload.review_required)
    siblings = _siblings(db, goal, stage.id if stage else None)
    position = len(siblings) if payload.position is None else min(payload.position, len(siblings))
    spec = payload.model_dump(exclude={"stage_uuid", "position", "after_step_uuids", "start_date", "due_date"})
    spec["completed_by"] = _value(payload.completed_by)
    step = build_step(db, goal, stage, spec, position, due_date=payload.due_date)
    step.start_date = payload.start_date
    step.after_step_uuids = _prerequisites(db, goal, payload.after_step_uuids, None)
    siblings.insert(position, step)
    _renumber(db, siblings)
    db.flush()
    access.log(db, goal, current_user.id, "step.added", {"step_uuid": step.step_uuid, "type": step.type})
    if _first_step(db, goal):
        # The goal just took shape: Coach looks it over again soon rather than at the next weekly check-in.
        check_ins.due_soon(db, goal, check_ins.FIRST_CHECK_IN)
    db.commit()
    return goal_dict(db, goal, current_user.id)


def _first_step(db: Session, goal: Goal) -> bool:
    return db.exec(select(func.count()).select_from(GoalStep).where(GoalStep.goal_id == goal.id)).one() == 1


def update_step(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    changes = payload.model_dump(exclude_unset=True)
    schedule_only = set(changes) <= {"start_date", "due_date", "allow_late", "held"}
    access.require(db, goal, current_user.id, "edit_schedule" if schedule_only else "edit_structure")
    step = step_or_404(db, goal, step_uuid)
    kind = step_type(step.type)
    if "config" in changes:
        changes["config"] = kind.validate_config(changes["config"])
        for key, value in kind.resolve(db, changes["config"], goal.org_id).items():
            setattr(step, key, value)
    if "after_step_uuids" in changes:
        changes["after_step_uuids"] = _prerequisites(db, goal, changes["after_step_uuids"], step.step_uuid)
    completed_by = _value(changes.get("completed_by", step.completed_by))
    _check_completer(goal, completed_by, bool(changes.get("review_required", step.review_required)))
    for key, value in changes.items():
        setattr(step, key, _value(value) if key == "completed_by" else value)
    step.update_date = _now()
    db.add(step)
    access.log(db, goal, current_user.id, "step.updated", {"step_uuid": step_uuid, "fields": sorted(changes)})
    db.commit()
    return goal_dict(db, goal, current_user.id)


def move_step(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepMove) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    step = step_or_404(db, goal, step_uuid)
    stage = _stage(db, goal, payload.stage_uuid) if payload.stage_uuid else None
    old = [item for item in _siblings(db, goal, step.stage_id) if item.id != step.id]
    _renumber(db, old)
    step.stage_id = stage.id if stage else None
    target = [item for item in _siblings(db, goal, step.stage_id) if item.id != step.id]
    target.insert(min(payload.position, len(target)), step)
    _renumber(db, target)
    db.add(step)
    db.commit()
    return goal_dict(db, goal, current_user.id)


def delete_step(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_structure")
    step = step_or_404(db, goal, step_uuid)
    for other in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        if step.step_uuid in (other.after_step_uuids or []):
            other.after_step_uuids = [uuid for uuid in other.after_step_uuids if uuid != step.step_uuid]
            db.add(other)
    stage_id = step.stage_id
    db.delete(step)
    db.flush()
    _renumber(db, _siblings(db, goal, stage_id))
    access.log(db, goal, current_user.id, "step.deleted", {"step_uuid": step_uuid, "title": step.title})
    db.commit()
    return goal_dict(db, goal, current_user.id)
