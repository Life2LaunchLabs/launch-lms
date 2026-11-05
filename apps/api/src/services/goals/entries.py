"""What a step collects: files, links, resources, notes, list items and routine logs."""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, select

from src.db.goals import DONE_STEP_STATUSES, GoalStep, StepEntry, StepEntryCreate, StepEntryUpdate, StepResourceVisit, StepStatus
from src.db.resources import Resource
from src.db.media import MediaAsset
from src.db.users import PublicUser
from src.services.goals import access, completion
from src.services.goals.goals import _mark_started, _now, _require_contribute, _require_open, _value, goal_dict, step_or_404
from src.services.goals.types import step_type
from src.services.goals.types.routine import check_update


def add_entry(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, payload: StepEntryCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    _require_contribute(db, goal, step, current_user.id)
    _require_open(db, goal, step)
    kind = step_type(step.type)
    entry_kind = _value(payload.kind)
    if entry_kind not in kind.entry_kinds:
        raise HTTPException(status_code=422, detail=f"{kind.label} steps don't collect {entry_kind} entries")
    extra = kind.prepare_entry(db, step, _value(completion.progress_view(db, step).status) in DONE_STEP_STATUSES, entry_kind, payload)
    asset = None
    if payload.asset_uuid:
        asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == payload.asset_uuid)).first()
        if not asset or asset.owner_user_id not in {current_user.id, None}:
            raise HTTPException(status_code=404, detail="File not found")
    if entry_kind == "file" and not asset:
        raise HTTPException(status_code=422, detail="Upload the file first")
    last = db.exec(select(func.max(StepEntry.position)).where(StepEntry.step_id == step.id)).one()
    position = 0 if last is None else last + 1
    now = _now()
    fields = {
        "title": payload.title.strip(), "url": payload.url.strip(), "resource_uuid": payload.resource_uuid, "note": payload.note, "data": payload.data,
    }
    entry = StepEntry(
        entry_uuid=f"step_entry_{uuid4()}", step_id=int(step.id), kind=entry_kind, slot=payload.slot,  # type: ignore[arg-type]
        asset_id=asset.id if asset else None, position=position, created_by_user_id=current_user.id, creation_date=now, update_date=now,
        **{**fields, **extra},
    )
    db.add(entry)
    db.commit()
    _mark_started(db, goal, step, current_user.id)
    return goal_dict(db, goal, current_user.id)


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
    changes = payload.model_dump(exclude_unset=True)
    if step.type == "routine":
        check_update(changes)
    if "data" in changes:
        # Data merges, so a pin and a rating set back to back don't undo each other.
        changes["data"] = {**(entry.data or {}), **(changes["data"] or {})}
    for key, value in changes.items():
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


def visit_resource(db: Session, current_user: PublicUser, goal_uuid: str, step_uuid: str, resource_uuid: str, payload: StepResourceVisit) -> dict:
    """A Resources step: the learner opened one of its resources, or wrote their note on it.

    Only the learner's own opens count; staff opening a link to check it change nothing. A learner
    step finishes once enough of its resources are opened. Notes are theirs to change, even on a
    step staff finish and after it's done.
    """
    from src.services.goals.types.resources import needed, opened

    goal = access.goal_or_404(db, goal_uuid)
    step = step_or_404(db, goal, step_uuid)
    if step.type != "resources":
        raise HTTPException(status_code=409, detail="Only Resources steps track opened resources")
    access.require(db, goal, current_user.id, "contribute_fields")
    if current_user.id != goal.subject_user_id:
        raise HTTPException(status_code=403, detail="Only the learner's opens and notes are kept on this step")
    picked = {item["resource_uuid"]: item for item in (step.config or {}).get("resources") or []}
    if resource_uuid not in picked:
        raise HTTPException(status_code=404, detail="That resource isn't on this step")
    status = _value(completion.progress_view(db, step).status)
    if payload.opened and status not in DONE_STEP_STATUSES:
        _require_open(db, goal, step)
    entry = db.exec(select(StepEntry).where(StepEntry.step_id == step.id, StepEntry.kind == "resource", StepEntry.resource_uuid == resource_uuid)).first()
    now = _now()
    if not entry:
        resource = db.exec(select(Resource).where(Resource.resource_uuid == resource_uuid)).first()
        last = db.exec(select(func.max(StepEntry.position)).where(StepEntry.step_id == step.id)).one()
        entry = StepEntry(
            entry_uuid=f"step_entry_{uuid4()}", step_id=int(step.id), kind="resource", resource_uuid=resource_uuid,  # type: ignore[arg-type]
            title=((resource.title if resource else "") or picked[resource_uuid].get("title") or "Resource")[:500],
            url=(resource.external_url or resource.provider_url or "") if resource else "",
            position=0 if last is None else last + 1, data={}, created_by_user_id=current_user.id, creation_date=now,
        )
    data = dict(entry.data or {})
    if payload.opened:
        data["opens"] = int(data.get("opens") or 0) + 1
        data["first_opened_at"] = data.get("first_opened_at") or now
        data["last_opened_at"] = now
    entry.data = data
    if payload.note is not None:
        entry.note = payload.note.strip()
    entry.update_date = now
    db.add(entry)
    db.commit()
    if payload.opened and status not in DONE_STEP_STATUSES:
        _mark_started(db, goal, step, current_user.id)
        state = completion.state_of(db, step)
        if _value(step.completed_by) == "learner" and len(opened(state)) >= needed(step.config or {}):
            completion._auto(db, step, StepStatus.COMPLETED)
    return goal_dict(db, goal, current_user.id)
