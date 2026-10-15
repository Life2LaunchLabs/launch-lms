"""Live goals: reading them, personal goals, editing stages and steps, entries and submissions.

Status changes go through ``completion.set_status``; nothing here writes a
step's status directly.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, or_, select

from src.db.goals import (
    DONE_STEP_STATUSES,
    CompletionMethod,
    Goal,
    GoalCreate,
    GoalOwnership,
    GoalSource,
    GoalStage,
    GoalStatus,
    GoalStep,
    GoalUpdate,
    StageCreate,
    StageUpdate,
    StepCompleter,
    StepCreate,
    StepEntry,
    StepEntryCreate,
    StepEntryUpdate,
    StepMove,
    StepProgress,
    StepStatus,
    StepStatusChange,
    StepSubmission,
    StepUpdate,
)
from src.db.media import MediaAsset
from src.db.planning import PlanCollaborator
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.goals import access, completion
from src.services.goals.availability import availability, node_state, ordered_steps
from src.services.goals.types import StepState, step_type

STAFF_CAPABILITY = "complete_restricted_objectives"


def _now() -> str:
    return datetime.now().isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def _personal(goal: Goal) -> bool:
    return _value(goal.ownership) == GoalOwnership.PERSONAL.value


def _user_summary(db: Session, user_id: int | None) -> dict | None:
    user = db.get(User, user_id) if user_id else None
    if not user:
        return None
    return {
        "id": user.id, "user_uuid": user.user_uuid, "username": user.username, "avatar_image": user.avatar_image,
        "name": " ".join(filter(None, [user.first_name, user.last_name])) or user.username,
    }


# Reading -------------------------------------------------------------------------

def _structure(db: Session, goal: Goal) -> tuple[list[GoalStage], list[GoalStep], dict[int, StepProgress], dict[int, list[StepEntry]]]:
    stages = sorted(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all(), key=lambda item: (item.position, item.id or 0))
    steps = list(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all())
    ids = [step.id for step in steps]
    progress = {int(row.step_id): row for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_(ids))).all()} if ids else {}  # type: ignore[union-attr]
    entries: dict[int, list[StepEntry]] = {}
    for entry in (db.exec(select(StepEntry).where(StepEntry.step_id.in_(ids)).order_by(StepEntry.position, StepEntry.id)).all() if ids else []):  # type: ignore[union-attr, arg-type]
        entries.setdefault(int(entry.step_id), []).append(entry)
    return stages, steps, progress, entries


def _entry_dict(entry: StepEntry) -> dict:
    return {
        "entry_uuid": entry.entry_uuid, "kind": _value(entry.kind), "slot": entry.slot, "title": entry.title, "url": entry.url,
        "asset_id": entry.asset_id, "resource_uuid": entry.resource_uuid, "note": entry.note, "done": entry.done,
        "period_start": entry.period_start, "follow_up_status": entry.follow_up_status, "follow_up_due": entry.follow_up_due,
        "data": entry.data or {}, "creation_date": entry.creation_date,
    }


def step_dict(step: GoalStep, progress: StepProgress, entries: list[StepEntry], stage: GoalStage | None, lock: dict, staff: bool) -> dict:
    kind = step_type(step.type)
    state = StepState(step, progress, entries)
    status = _value(progress.status)
    fraction = 1.0 if status in DONE_STEP_STATUSES else kind.fraction(state)
    result = {
        "step_uuid": step.step_uuid, "stage_uuid": stage.stage_uuid if stage else None, "position": step.position,
        "type": step.type, "title": step.title, "description": step.description, "config": step.config or {},
        "materials": step.materials or [], "completed_by": _value(step.completed_by), "review_required": step.review_required,
        "start_date": step.start_date, "due_date": step.due_date, "allow_late": step.allow_late, "held": step.held,
        "after_step_uuids": step.after_step_uuids or [], "requirement_links": step.requirement_links or [],
        "status": status, "locked": lock["locked"], "locked_reason": lock["reason"],
        "state": node_state(status, lock["locked"], fraction), "fraction": round(fraction, 3),
        "result": kind.result(state), "submission": progress.submission or {}, "answer": progress.answer,
        "learner_note": progress.learner_note, "reviewer_note": progress.reviewer_note,
        "feedback_history": progress.feedback_history or [], "completed_at": progress.completed_at,
        "completion_method": _value(progress.completion_method) if progress.completion_method else None,
        "entries": [_entry_dict(entry) for entry in entries],
    }
    if staff:
        result["reviewer_guidance"] = step.reviewer_guidance
        result["staff_notes"] = progress.staff_notes or []
    return result


def goal_dict(db: Session, goal: Goal, user_id: int, granted: set[str] | None = None) -> dict:
    granted = granted if granted is not None else access.capabilities(db, goal, user_id)
    stages, steps, progress, entries = _structure(db, goal)
    statuses = {step_id: _value(row.status) for step_id, row in progress.items()}
    locks = availability(goal, stages, steps, statuses)
    stage_by_id = {stage.id: stage for stage in stages}
    staff = STAFF_CAPABILITY in granted
    views = {
        int(step.id): step_dict(step, progress.get(int(step.id)) or completion.progress_view(db, step), entries.get(int(step.id), []),  # type: ignore[arg-type]
                                stage_by_id.get(step.stage_id), locks[int(step.id)], staff)  # type: ignore[arg-type]
        for step in steps
    }
    ordered = ordered_steps(stages, steps)
    done = sum(1 for step in steps if statuses.get(int(step.id)) in DONE_STEP_STATUSES)  # type: ignore[arg-type]
    return {
        "goal_uuid": goal.goal_uuid, "title": goal.title, "description": goal.description,
        "ownership": _value(goal.ownership), "source": _value(goal.source), "status": _value(goal.status),
        "step_order": _value(goal.step_order), "org_id": goal.org_id, "start_date": goal.start_date,
        "target_date": goal.target_date, "finished_at": goal.finished_at, "finish": goal.finish or {},
        "owner": _user_summary(db, goal.owner_user_id), "subject": _user_summary(db, goal.subject_user_id),
        "capabilities": sorted(granted), "progress": {"done": done, "total": len(steps)},
        "stages": [
            {
                "stage_uuid": stage.stage_uuid, "position": stage.position, "title": stage.title, "description": stage.description,
                "timing": stage.timing, "start_date": stage.start_date, "due_date": stage.due_date,
                "steps": [views[int(step.id)] for step in ordered if step.stage_id == stage.id],  # type: ignore[arg-type]
            }
            for stage in stages
        ],
        "unstaged_steps": [views[int(step.id)] for step in ordered if step.stage_id not in stage_by_id],  # type: ignore[arg-type]
    }


def get_goal(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    return goal_dict(db, goal, current_user.id, granted)


def list_my_goals(db: Session, current_user: PublicUser, include_finished: bool = True) -> list[dict]:
    """Goals the user is working toward, owns or is a member of."""
    member_goal_ids = select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == current_user.id, PlanCollaborator.active == True, PlanCollaborator.goal_id.is_not(None))  # type: ignore[union-attr]  # noqa: E712
    statement = select(Goal).where(
        or_(Goal.subject_user_id == current_user.id, Goal.owner_user_id == current_user.id, Goal.id.in_(member_goal_ids)),  # type: ignore[union-attr]
        Goal.status != GoalStatus.ARCHIVED,
    )
    if not include_finished:
        statement = statement.where(Goal.status != GoalStatus.FINISHED)
    goals = db.exec(statement.order_by(Goal.id)).all()  # type: ignore[arg-type]
    result = []
    for goal in goals:
        total = db.exec(select(func.count()).select_from(GoalStep).where(GoalStep.goal_id == goal.id)).one()
        done = db.exec(select(func.count()).select_from(StepProgress).join(GoalStep, GoalStep.id == StepProgress.step_id).where(
            GoalStep.goal_id == goal.id, StepProgress.status.in_(list(DONE_STEP_STATUSES)),  # type: ignore[attr-defined]
        )).one()
        result.append({
            "goal_uuid": goal.goal_uuid, "title": goal.title, "ownership": _value(goal.ownership), "source": _value(goal.source),
            "status": _value(goal.status), "target_date": goal.target_date, "progress": {"done": int(done), "total": int(total)},
            "is_subject": goal.subject_user_id == current_user.id,
        })
    return result


# Personal goals and goal details ---------------------------------------------------

def create_personal_goal(db: Session, current_user: PublicUser, payload: GoalCreate) -> dict:
    """A goal the learner writes and owns. It starts with one empty stage."""
    if payload.org_id is not None and not db.exec(select(UserOrganization.id).where(
        UserOrganization.user_id == current_user.id, UserOrganization.org_id == payload.org_id,
    )).first():
        raise HTTPException(status_code=403, detail="You're not a member of that organization")
    now = _now()
    goal = Goal(
        goal_uuid=f"goal_{uuid4()}", org_id=payload.org_id, owner_user_id=current_user.id, subject_user_id=current_user.id,
        ownership=GoalOwnership.PERSONAL, source=GoalSource.NONE, title=payload.title.strip(), description=payload.description,
        target_date=payload.target_date, creation_date=now, update_date=now,
    )
    db.add(goal)
    db.flush()
    access.seed_roles(db, goal, None)
    db.add(GoalStage(stage_uuid=f"goal_stage_{uuid4()}", goal_id=int(goal.id), position=0, title="Getting started", creation_date=now, update_date=now))  # type: ignore[arg-type]
    access.log(db, goal, current_user.id, "goal.created", {})
    db.commit()
    db.refresh(goal)
    return goal_dict(db, goal, current_user.id)


def update_goal(db: Session, current_user: PublicUser, goal_uuid: str, payload: GoalUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    changes = payload.model_dump(exclude_unset=True)
    access.require(db, goal, current_user.id, "edit_structure" if "step_order" in changes else "edit_plan_details")
    for key, value in changes.items():
        setattr(goal, key, value.strip() if isinstance(value, str) and key == "title" else value)
    goal.update_date = _now()
    db.add(goal)
    access.log(db, goal, current_user.id, "goal.updated", {"fields": sorted(changes)})
    db.commit()
    return goal_dict(db, goal, current_user.id)


def respond(db: Session, current_user: PublicUser, goal_uuid: str, accept: bool) -> dict:
    """The learner accepts or declines a goal handed to them."""
    goal = access.goal_or_404(db, goal_uuid)
    if goal.subject_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Goal not found")
    if _value(goal.status) != GoalStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="This goal isn't waiting for an answer")
    goal.status = GoalStatus.ACTIVE if accept else GoalStatus.ARCHIVED
    goal.update_date = _now()
    db.add(goal)
    access.log(db, goal, current_user.id, "goal.accepted" if accept else "goal.declined", {})
    db.commit()
    return goal_dict(db, goal, current_user.id)


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
        timing=payload.timing, creation_date=now, update_date=now,
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

def step_or_404(db: Session, goal: Goal, step_uuid: str) -> GoalStep:
    step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid == step_uuid)).first()
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


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
    db.commit()
    return goal_dict(db, goal, current_user.id)


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


# Working on a step ------------------------------------------------------------------------

def _require_contribute(db: Session, goal: Goal, step: GoalStep, user_id: int) -> set[str]:
    needed = "contribute_restricted_fields" if _value(step.completed_by) == StepCompleter.STAFF.value else "contribute_fields"
    return access.require(db, goal, user_id, needed)


def _require_open(db: Session, goal: Goal, step: GoalStep) -> None:
    stages, steps, progress, _ = _structure(db, goal)
    lock = availability(goal, stages, steps, {key: _value(row.status) for key, row in progress.items()})[int(step.id)]  # type: ignore[arg-type]
    if lock["locked"]:
        raise HTTPException(status_code=409, detail={"message": "This step isn't open yet", "reason": lock["reason"]})


def _mark_started(db: Session, goal: Goal, step: GoalStep, user_id: int) -> None:
    progress = completion.progress_view(db, step)
    if _value(progress.status) == StepStatus.NOT_STARTED.value:
        completion.set_status(db, goal, step, StepStatus.IN_PROGRESS, actor_user_id=user_id, method=CompletionMethod.LEARNER)


def save_submission(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepSubmission) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    _require_contribute(db, goal, step, current_user.id)
    progress = completion.progress_for(db, step)
    if _value(progress.status) in DONE_STEP_STATUSES:
        raise HTTPException(status_code=409, detail="This step is done; reopen it to change it")
    _require_open(db, goal, step)
    progress.submission = step_type(step.type).validate_submission(payload.submission)
    if payload.answer is not None:
        progress.answer = payload.answer.strip()
    if payload.learner_note is not None:
        progress.learner_note = payload.learner_note
    progress.updated_by_user_id = current_user.id
    progress.update_date = _now()
    db.add(progress)
    db.commit()
    _mark_started(db, goal, step, current_user.id)
    return goal_dict(db, goal, current_user.id)


def add_entry(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepEntryCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    _require_contribute(db, goal, step, current_user.id)
    _require_open(db, goal, step)
    kind = step_type(step.type)
    entry_kind = _value(payload.kind)
    if entry_kind not in kind.entry_kinds:
        raise HTTPException(status_code=422, detail=f"{kind.label} steps don't collect {entry_kind} entries")
    if step.type == "upload":
        slots = {slot["key"]: slot for slot in (step.config or {}).get("slots") or []}
        if payload.slot not in slots:
            raise HTTPException(status_code=422, detail="Pick one of the step's slots")
        if entry_kind == "link" and "link" not in slots[payload.slot]["kinds"]:
            raise HTTPException(status_code=422, detail="This slot takes files, not links")
    asset = None
    if payload.asset_uuid:
        asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == payload.asset_uuid)).first()
        if not asset or asset.owner_user_id not in {current_user.id, None}:
            raise HTTPException(status_code=404, detail="File not found")
    if entry_kind == "file" and not asset:
        raise HTTPException(status_code=422, detail="Upload the file first")
    position = (db.exec(select(func.max(StepEntry.position)).where(StepEntry.step_id == step.id)).one() or -1) + 1
    now = _now()
    entry = StepEntry(
        entry_uuid=f"step_entry_{uuid4()}", step_id=int(step.id), kind=entry_kind, slot=payload.slot,  # type: ignore[arg-type]
        title=payload.title.strip(), url=payload.url.strip(), asset_id=asset.id if asset else None,
        resource_uuid=payload.resource_uuid, note=payload.note, data=payload.data, position=position,
        period_start=_week_start(date.today()) if entry_kind == "log" else None,
        created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    db.add(entry)
    db.commit()
    _mark_started(db, goal, step, current_user.id)
    return goal_dict(db, goal, current_user.id)


def _week_start(day: date) -> date:
    from datetime import timedelta

    return day - timedelta(days=day.weekday())


def _entry(db: Session, step: GoalStep, entry_uuid: str) -> StepEntry:
    entry = db.exec(select(StepEntry).where(StepEntry.step_id == step.id, StepEntry.entry_uuid == entry_uuid)).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


def update_entry(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, entry_uuid: str, payload: StepEntryUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    _require_contribute(db, goal, step, current_user.id)
    entry = _entry(db, step, entry_uuid)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    entry.update_date = _now()
    db.add(entry)
    db.commit()
    return goal_dict(db, goal, current_user.id)


def delete_entry(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, entry_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    _require_contribute(db, goal, step, current_user.id)
    if _value(completion.progress_view(db, step).status) in DONE_STEP_STATUSES:
        raise HTTPException(status_code=409, detail="This step is done; reopen it to change it")
    db.delete(_entry(db, step, entry_uuid))
    db.commit()
    return goal_dict(db, goal, current_user.id)


def change_status(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepStatusChange) -> dict:
    """Learners start, submit and finish their steps; staff review, complete on a learner's behalf, excuse and reopen."""
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    step = step_or_404(db, goal, step_uuid)
    target = payload.status
    current = _value(completion.progress_view(db, step).status)
    staff_targets = {StepStatus.CHANGES_REQUESTED, StepStatus.EXCUSED}
    is_learner = current_user.id == goal.subject_user_id and "update_progress" in granted
    needs_staff = (
        target in staff_targets
        or (target == StepStatus.COMPLETED and (
            _value(step.completed_by) == StepCompleter.STAFF.value
            or current == StepStatus.SUBMITTED.value
            or not step_type(step.type).learner_can_complete
            or not is_learner
        ))
        or (current in DONE_STEP_STATUSES and not is_learner)
    )
    if needs_staff:
        if STAFF_CAPABILITY not in granted:
            kind = step_type(step.type)
            if target == StepStatus.COMPLETED and is_learner and not kind.learner_can_complete:
                raise HTTPException(status_code=409, detail=f"{kind.label} steps finish on their own")
            raise HTTPException(status_code=403, detail="Staff do that")
        method = CompletionMethod.STAFF
    else:
        if "update_progress" not in granted:
            raise HTTPException(status_code=403, detail="You can't update this step")
        if target in {StepStatus.IN_PROGRESS, StepStatus.SUBMITTED, StepStatus.COMPLETED}:
            _require_open(db, goal, step)
        method = CompletionMethod.LEARNER
    completion.set_status(db, goal, step, target, actor_user_id=current_user.id, method=method, note=payload.note)
    db.refresh(goal)
    return goal_dict(db, goal, current_user.id)


def start_activity(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str) -> dict:
    """Start (or resume) the learner's run of an activity step."""
    from src.db.learning import LearningActivity, LearningRun
    from src.services.learning import run_navigation

    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "update_progress")
    if goal.subject_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the person this goal is for can play its activities")
    step = step_or_404(db, goal, step_uuid)
    if step.type != "activity" or not step.activity_id:
        raise HTTPException(status_code=422, detail="This step is not an activity")
    _require_open(db, goal, step)
    activity = db.get(LearningActivity, step.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="This step's activity is no longer available")
    run = db.exec(select(LearningRun).where(LearningRun.goal_step_id == step.id, LearningRun.user_id == current_user.id)).first()
    if not run:
        now = datetime.utcnow()
        run = LearningRun(
            run_uuid=f"learning_run_{uuid4()}", activity_id=int(activity.id), org_id=activity.org_id, issuing_org_id=goal.org_id,  # type: ignore[arg-type]
            goal_id=goal.id, goal_step_id=step.id, user_id=current_user.id, started_at=now, creation_date=str(now), update_date=str(now),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
    _mark_started(db, goal, step, current_user.id)
    db.refresh(run)
    return {"goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "activity_uuid": activity.activity_uuid, "run": run_navigation._serialize_run(db, run).model_dump()}
