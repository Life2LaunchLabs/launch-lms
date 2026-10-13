"""Plan template versions: publish, roll back, and the version new plans are issued from.

A template's own rows (phases, objectives, their activities) are its working
draft. Publishing freezes the draft into an immutable ``ProgramTemplateVersion``:
the template's settings and an assignment snapshot of every objective, each
activity replaced by a frozen copy. New plans are issued from the published
version; plans already issued keep theirs, and their learners' runs and answers
stay on that version's frozen activities. Rolling back publishes an earlier
snapshot again as a new version. Nothing here edits or deletes a version.

System templates (the Launch Ready starter) are synced from code on every
deploy and are issued from their live rows.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, select

from src.db.learning import LearningActivity, LearningPage
from src.db.planning import PlanObjective
from src.db.programs import FrozenActivity, Program, ProgramAssignment, ProgramTemplateVersion
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.learning_documents.document import export_document
from src.services.learning_documents.references import rewrite_page_references

PHASE_FIELDS = ("phase_uuid", "name", "description", "position", "target_days", "suggested_duration_weeks")
TEMPLATE_FIELDS = ("name", "description", "instructions", "step_order", "role_definitions", "default_subject_role_key", "default_staff_role_key")


def _now() -> str:
    return datetime.now().isoformat()


def _hash(value) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _pages(db: Session, activity: LearningActivity) -> list[LearningPage]:
    return list(db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order, LearningPage.id)).all())  # type: ignore[arg-type]


def activity_hash(db: Session, activity: LearningActivity) -> str:
    """Content hash of an activity, independent of its own and its pages' uuids."""
    pages = _pages(db, activity)
    document = export_document(activity, pages)
    numbering = {page.page_uuid: f"page-{index}" for index, page in enumerate(pages)}
    document = rewrite_page_references(document, numbering)
    document["activity"].pop("activity_uuid", None)
    return _hash(document)


def is_frozen(db: Session, activity_id: int | None) -> bool:
    return bool(activity_id) and db.get(FrozenActivity, activity_id) is not None


def working_activity(db: Session, objective_id: int) -> LearningActivity | None:
    """The editable activity of a template objective (never a frozen copy)."""
    frozen = select(FrozenActivity.activity_id)
    return db.exec(select(LearningActivity).where(LearningActivity.objective_id == objective_id, LearningActivity.id.not_in(frozen)).order_by(LearningActivity.id)).first()  # type: ignore[union-attr]


def _copy_activity(db: Session, source: LearningActivity) -> LearningActivity:
    now = _now()
    pages = _pages(db, source)
    renamed = {page.page_uuid: f"learning_page_{uuid4()}" for page in pages}
    copy = LearningActivity(
        activity_uuid=f"learning_activity_{uuid4()}", objective_id=source.objective_id, org_id=source.org_id,
        title=source.title, description=source.description, thumbnail_image=source.thumbnail_image, icon=source.icon,
        settings=rewrite_page_references(deepcopy(source.settings or {}), renamed), creation_date=now, update_date=now,
    )
    db.add(copy)
    db.flush()
    for page in pages:
        db.add(LearningPage(
            activity_id=int(copy.id), org_id=page.org_id, page_uuid=renamed[page.page_uuid], page_type=page.page_type,  # type: ignore[arg-type]
            title=page.title, order=page.order, required=page.required,
            content=rewrite_page_references(deepcopy(page.content or {}), renamed), design=deepcopy(page.design or {}),
            scoring=deepcopy(page.scoring or {}), completion=deepcopy(page.completion or {}), creation_date=now, update_date=now,
        ))
    db.flush()
    return copy


def freeze_activity(db: Session, activity: LearningActivity) -> LearningActivity:
    """The frozen copy of a working activity's current content, reusing an identical earlier one."""
    content = activity_hash(db, activity)
    existing = db.exec(select(FrozenActivity).where(FrozenActivity.source_activity_id == activity.id, FrozenActivity.source_hash == content)).first()
    if existing:
        return db.get(LearningActivity, existing.activity_id)  # type: ignore[return-value]
    if db.exec(select(PlanObjective.id).where(PlanObjective.activity_id == activity.id)).first() is not None:
        # Issued before versioning: learners already play this row, so it becomes the frozen copy
        # (their runs and answers stay put) and an identical copy becomes the working draft.
        draft = _copy_activity(db, activity)
        for earlier in db.exec(select(FrozenActivity).where(FrozenActivity.source_activity_id == activity.id)).all():
            earlier.source_activity_id = draft.id
            db.add(earlier)
        db.add(FrozenActivity(activity_id=int(activity.id), source_activity_id=draft.id, source_hash=content, creation_date=_now()))  # type: ignore[arg-type]
        db.flush()
        return activity
    frozen = _copy_activity(db, activity)
    db.add(FrozenActivity(activity_id=int(frozen.id), source_activity_id=activity.id, source_hash=content, creation_date=_now()))  # type: ignore[arg-type]
    db.flush()
    return frozen


def _draft_objectives(db: Session, program: Program) -> list[dict]:
    from src.services.programs import _snapshot

    return _snapshot(db, program)


def draft_fingerprint(db: Session, program: Program) -> str:
    """Changes whenever publishing would produce a different version."""
    objectives = []
    for item in _draft_objectives(db, program):
        entry = {key: value for key, value in item.items() if key not in {"activity_id", "activity"}}
        if item.get("activity_id"):
            activity = db.get(LearningActivity, item["activity_id"])
            entry["activity_hash"] = activity_hash(db, activity) if activity else None
        objectives.append(entry)
    return _hash({"template": {key: getattr(program, key) for key in TEMPLATE_FIELDS}, "objectives": objectives})


def _versions(db: Session, program: Program) -> list[ProgramTemplateVersion]:
    return list(db.exec(select(ProgramTemplateVersion).where(ProgramTemplateVersion.program_id == program.id).order_by(ProgramTemplateVersion.number.desc())).all())  # type: ignore[union-attr]


def published_version(db: Session, program: Program) -> ProgramTemplateVersion | None:
    return db.get(ProgramTemplateVersion, program.published_version_id) if program.published_version_id else None


def _new_version(db: Session, program: Program, snapshot: dict, content_hash: str, user_id: int | None, note: str, restored_from: int | None = None) -> ProgramTemplateVersion:
    number = (db.exec(select(func.max(ProgramTemplateVersion.number)).where(ProgramTemplateVersion.program_id == program.id)).one() or 0) + 1
    version = ProgramTemplateVersion(
        version_uuid=f"template_version_{uuid4()}", program_id=int(program.id), org_id=program.org_id, number=number,  # type: ignore[arg-type]
        snapshot=snapshot, content_hash=content_hash, note=note.strip(), restored_from_number=restored_from,
        published_by_user_id=user_id, published_at=datetime.utcnow(), creation_date=_now(),
    )
    db.add(version)
    db.flush()
    program.published_version_id = version.id
    db.add(program)
    db.flush()
    return version


def publish_draft(db: Session, program: Program, user_id: int | None, note: str = "") -> ProgramTemplateVersion:
    """Freeze the draft into a new published version (flushed, not committed)."""
    if program.system_type:
        raise HTTPException(status_code=409, detail="System templates are published with each release")
    fingerprint = draft_fingerprint(db, program)
    objectives = deepcopy(_draft_objectives(db, program))
    for item in objectives:
        if not item.get("activity_id"):
            continue
        activity = db.get(LearningActivity, item["activity_id"])
        if activity is None:
            item.pop("activity_id", None)
            continue
        frozen = freeze_activity(db, activity)
        item["activity_id"] = frozen.id
        item["activity"] = {**(item.get("activity") or {}), "activity_uuid": frozen.activity_uuid}
    from src.services.programs import _program_phases

    phases = [{key: phase.get(key) for key in PHASE_FIELDS} for phase in _program_phases(db, program)]
    snapshot = {"template": {key: deepcopy(getattr(program, key)) for key in TEMPLATE_FIELDS}, "phases": phases, "objectives": objectives}
    return _new_version(db, program, snapshot, fingerprint, user_id, note)


def issuance(db: Session, program: Program, user_id: int | None) -> tuple[list[dict], ProgramTemplateVersion | None]:
    """The objective snapshot new plans are made from, and its version.

    A template that has never been published publishes its draft as version 1
    the first time a plan is issued from it.
    """
    if program.system_type:
        from src.services.programs import _snapshot

        return _snapshot(db, program), None
    version = published_version(db, program) or publish_draft(db, program, user_id, "First issued")
    return deepcopy(version.snapshot.get("objectives") or []), version


def issue(db: Session, program: Program, user_id: int | None) -> tuple[list[dict], ProgramTemplateVersion | None, list[dict], dict]:
    """Everything an assignment is made from: objectives, version, phases and template settings."""
    objectives, version = issuance(db, program, user_id)
    return objectives, version, issued_phases(db, program, version), issued_template(program, version)


def issued_template(program: Program, version: ProgramTemplateVersion | None) -> dict:
    """Template settings plans are made with: the version's, else the live template's."""
    settings = (version.snapshot.get("template") if version else None) or {}
    return {key: deepcopy(settings[key]) if key in settings else getattr(program, key) for key in TEMPLATE_FIELDS}


def issued_program(db: Session, assignment: ProgramAssignment) -> SimpleNamespace | None:
    """The assignment's template as its pinned version issues it (name, roles, step order), for making its plans."""
    program = db.get(Program, assignment.program_id)
    if program is None:
        return None
    version = db.get(ProgramTemplateVersion, assignment.template_version_id) if assignment.template_version_id else None
    return SimpleNamespace(**{**program.model_dump(), **issued_template(program, version)})


def issued_phases(db: Session, program: Program, version: ProgramTemplateVersion | None) -> list[dict]:
    """Phases with their objectives, shaped like ``programs._program_phases``, as the version issues them."""
    from src.services.programs import _program_phases

    if version is None:
        return _program_phases(db, program)
    objectives = version.snapshot.get("objectives") or []
    return [
        {**phase, "objectives": [deepcopy(item) for item in objectives if item.get("phase_uuid") == phase["phase_uuid"]]}
        for phase in version.snapshot.get("phases") or []
    ]


# Admin operations ----------------------------------------------------------------


def _program(db: Session, org_id: int, template_uuid: str) -> Program:
    from src.services.programs import _program_or_404

    return _program_or_404(db, template_uuid, org_id)


def _version_summary(version: ProgramTemplateVersion, program: Program) -> dict:
    objectives = version.snapshot.get("objectives") or []
    return {
        "version_uuid": version.version_uuid, "number": version.number, "note": version.note,
        "published_at": version.published_at.isoformat() if version.published_at else None,
        "restored_from_number": version.restored_from_number, "is_published": version.id == program.published_version_id,
        "objective_count": len(objectives), "activity_count": sum(1 for item in objectives if item.get("activity_id")),
    }


def version_status(db: Session, program: Program) -> dict:
    current = published_version(db, program)
    plans = dict(db.exec(
        select(ProgramAssignment.template_version_id, func.count(ProgramAssignment.id))  # type: ignore[arg-type]
        .where(ProgramAssignment.program_id == program.id, ProgramAssignment.template_version_id.is_not(None))  # type: ignore[union-attr]
        .group_by(ProgramAssignment.template_version_id)
    ).all())
    return {
        "versioned": not program.system_type,
        "published_version": _version_summary(current, program) if current else None,
        "has_unpublished_changes": bool(not program.system_type and (current is None or current.content_hash != draft_fingerprint(db, program))),
        "versions": [{**_version_summary(item, program), "assignment_count": plans.get(item.id, 0)} for item in _versions(db, program)],
    }


def list_versions(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program(db, org_id, template_uuid)
    return {"template_uuid": program.program_uuid, **version_status(db, program)}


def publish(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, note: str = "") -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program(db, org_id, template_uuid)
    current = published_version(db, program)
    if current is not None and current.content_hash == draft_fingerprint(db, program):
        raise HTTPException(status_code=409, detail=f"Nothing to publish: the draft matches version {current.number}")
    version = publish_draft(db, program, current_user.id, note)
    db.commit()
    db.refresh(program)
    return {"template_uuid": program.program_uuid, "published": _version_summary(version, program), **version_status(db, program)}


def restore(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, number: int, note: str = "") -> dict:
    """Roll back: publish an earlier version's snapshot again as the newest version. Issued plans are unchanged."""
    require_org_admin(current_user.id, org_id, db)
    program = _program(db, org_id, template_uuid)
    source = db.exec(select(ProgramTemplateVersion).where(ProgramTemplateVersion.program_id == program.id, ProgramTemplateVersion.number == number)).first()
    if source is None:
        raise HTTPException(status_code=404, detail=f"Version {number} not found")
    if source.id == program.published_version_id:
        raise HTTPException(status_code=409, detail=f"Version {number} is already the published version")
    version = _new_version(db, program, deepcopy(source.snapshot), source.content_hash, current_user.id, note or f"Restored version {number}", restored_from=number)
    db.commit()
    db.refresh(program)
    return {"template_uuid": program.program_uuid, "published": _version_summary(version, program), **version_status(db, program)}
