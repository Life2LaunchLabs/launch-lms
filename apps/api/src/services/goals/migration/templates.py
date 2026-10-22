"""Legacy templates, their versions and assignments as goal templates.

Each Program becomes a goal_template whose draft document is converted from
the template's rows, each ProgramTemplateVersion becomes a goal_template_version
with the same number, and each ProgramAssignment a goal_assignment. An
assignment whose objective snapshot was edited away from its version gets a
private version of its own, so its learners keep exactly what they were issued.
Uuids carry over, so links and references keep working.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlmodel import Session, func, select

from src.db.goals import AssignmentStatus, GoalAssignment, GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.db.learning import LearningActivity
from src.services.goals import templates as template_service
from src.services.goals.document import iter_steps
from src.services.goals.migration.documents import Converted, convert_snapshot
from src.services.goals.migration.drafts import PHASE_FIELDS, TEMPLATE_FIELDS, draft_fingerprint, program_phases
from src.services.goals.migration.legacy_tables import FrozenActivity, Program, ProgramAssignment, ProgramTemplateVersion
from src.services.learning.activity_copy import copy_activity


@dataclass
class TemplateMaps:
    templates: dict[int, GoalTemplate] = field(default_factory=dict)
    versions: dict[int, GoalTemplateVersion] = field(default_factory=dict)
    assignments: dict[int, GoalAssignment] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _value(item) -> str:
    return getattr(item, "value", item)


def _date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _claim_working_activities(db: Session, template: GoalTemplate, converted: Converted) -> None:
    """The draft's activities become this template's; one already claimed by another template is copied."""
    for _, step in iter_steps(converted.document):
        if step["type"] != "activity":
            continue
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).first()
        if activity is None:
            continue
        if activity.goal_template_id in (None, template.id):
            activity.goal_template_id = template.id
            db.add(activity)
        else:
            copy = copy_activity(db, activity, goal_template_id=template.id)
            step["config"]["activity_uuid"] = copy.activity_uuid
    db.flush()


def _claim_frozen_activities(db: Session, template: GoalTemplate, document: dict) -> None:
    for _, step in iter_steps(document):
        if step["type"] != "activity":
            continue
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).first()
        frozen = db.get(FrozenActivity, activity.id) if activity else None
        if activity is None or frozen is None:
            continue
        activity.goal_template_id = activity.goal_template_id or template.id
        activity.frozen_from_id, activity.frozen_hash = frozen.source_activity_id, frozen.source_hash
        db.add(activity)


def _draft(db: Session, program: Program) -> Converted:
    phases = program_phases(db, program)
    meta = {key: getattr(program, key) for key in TEMPLATE_FIELDS}
    return convert_snapshot(db, meta, phases, None, program.org_id)


def _library_document(db: Session, program: Program, warnings: list[str]) -> dict | None:
    snapshot = program.library_snapshot
    if not snapshot:
        return None
    try:
        return convert_snapshot(db, snapshot, list(snapshot.get("phases") or []), None, program.org_id).document
    except Exception as error:  # noqa: BLE001 - a stale library copy shouldn't stop the migration
        warnings.append(f"{program.name}: library copy not converted ({error})")
        return None


def migrate_template(db: Session, program: Program, maps: TemplateMaps) -> GoalTemplate:
    draft = _draft(db, program)
    maps.warnings.extend(f"{program.name}: {warning}" for warning in draft.warnings)
    template = GoalTemplate(
        template_uuid=program.program_uuid, org_id=program.org_id, title=draft.document["template"]["title"],
        description=program.description or "", thumbnail_image=program.thumbnail_image or "",
        status=TemplateStatus(_value(program.status)), system_type=program.system_type, document=draft.document,
        source_template_uuid=program.source_program_uuid, source_version=program.source_version,
        library_document=_library_document(db, program, maps.warnings), library_published_at=program.library_published_at,
        created_by_user_id=program.created_by_user_id, creation_date=program.creation_date, update_date=program.update_date,
    )
    db.add(template)
    db.flush()
    _claim_working_activities(db, template, draft)
    template.document = draft.document
    maps.templates[int(program.id)] = template  # type: ignore[arg-type]

    legacy_versions = db.exec(select(ProgramTemplateVersion).where(ProgramTemplateVersion.program_id == program.id).order_by(ProgramTemplateVersion.number)).all()
    draft_unchanged = bool(program.published_version_id) and any(
        item.id == program.published_version_id and item.content_hash == draft_fingerprint(db, program) for item in legacy_versions
    )
    for legacy in legacy_versions:
        snapshot = legacy.snapshot or {}
        converted = convert_snapshot(db, snapshot.get("template") or {}, list(snapshot.get("phases") or []), list(snapshot.get("objectives") or []), program.org_id)
        maps.warnings.extend(f"{program.name} v{legacy.number}: {warning}" for warning in converted.warnings)
        _claim_frozen_activities(db, template, converted.document)
        version = GoalTemplateVersion(
            version_uuid=legacy.version_uuid, template_id=int(template.id), org_id=legacy.org_id, number=legacy.number,  # type: ignore[arg-type]
            document=converted.document, note=legacy.note, restored_from_number=legacy.restored_from_number,
            published_by_user_id=legacy.published_by_user_id, published_at=legacy.published_at, creation_date=legacy.creation_date,
        )
        db.add(version)
        db.flush()
        maps.versions[int(legacy.id)] = version  # type: ignore[arg-type]
        if legacy.id == program.published_version_id:
            template.published_version_id = version.id
            # Publishing state carries over: an unchanged draft still reads as published.
            version.content_hash = template_service.fingerprint(db, template) if draft_unchanged else ""
    db.add(template)
    db.flush()
    return template


def _private_version(db: Session, template: GoalTemplate, legacy: ProgramTemplateVersion | None, program: Program,
                     assignment: ProgramAssignment, maps: TemplateMaps) -> GoalTemplateVersion:
    snapshot = (legacy.snapshot or {}) if legacy else {}
    meta = snapshot.get("template") or {key: getattr(program, key) for key in TEMPLATE_FIELDS}
    phases = list(snapshot.get("phases") or [])
    if not phases:
        phases = [{key: phase.get(key) for key in PHASE_FIELDS} for phase in program_phases(db, program)]
    converted = convert_snapshot(db, meta, phases, list(assignment.objective_snapshot or []), program.org_id)
    maps.warnings.extend(f"{program.name} (assignment): {warning}" for warning in converted.warnings)
    _claim_frozen_activities(db, template, converted.document)
    base = maps.versions.get(int(legacy.id)) if legacy else None  # type: ignore[arg-type]
    if base and base.document.get("stages") == converted.document.get("stages"):
        return base
    number = (db.exec(select(func.max(GoalTemplateVersion.number)).where(GoalTemplateVersion.template_id == template.id)).one() or 0) + 1
    version = GoalTemplateVersion(
        version_uuid=f"goal_template_version_{assignment.assignment_uuid}", template_id=int(template.id), org_id=template.org_id,  # type: ignore[arg-type]
        number=number, document=converted.document, private=True, note="What this assignment's learners were issued",
        published_by_user_id=assignment.created_by_user_id, published_at=None, creation_date=assignment.creation_date,
    )
    db.add(version)
    db.flush()
    return version


def _step_dates(schedule: dict | None) -> dict:
    """Per-objective dates; an objective's first step keeps its uuid as the key."""
    dates = {}
    for item in (schedule or {}).get("objectives") or []:
        if item.get("objective_uuid") and (item.get("due_date") or item.get("allow_late")):
            dates[item["objective_uuid"]] = {"due_date": item.get("due_date"), "allow_late": bool(item.get("allow_late"))}
    return dates


def _stage_dates(schedule: dict | None) -> dict:
    dates = {}
    for phase in (schedule or {}).get("phases") or []:
        if phase.get("phase_uuid"):
            dates[phase["phase_uuid"]] = {"start_date": phase.get("start_date"), "due_date": phase.get("end_date")}
    return dates


def migrate_assignment(db: Session, assignment: ProgramAssignment, maps: TemplateMaps) -> GoalAssignment | None:
    template = maps.templates.get(assignment.program_id)
    program = db.get(Program, assignment.program_id)
    if template is None or program is None:
        maps.warnings.append(f"assignment {assignment.assignment_uuid}: its template is gone, skipped")
        return None
    legacy = db.get(ProgramTemplateVersion, assignment.template_version_id) if assignment.template_version_id else None
    version = _private_version(db, template, legacy, program, assignment, maps)
    row = GoalAssignment(
        assignment_uuid=assignment.assignment_uuid, org_id=assignment.org_id, template_id=int(template.id), version_id=int(version.id),  # type: ignore[arg-type]
        usergroup_id=assignment.usergroup_id, user_id=assignment.user_id, subject_email=assignment.subject_email,
        welcome_message=assignment.welcome_message or "", staff_user_ids=list(assignment.staff_user_ids or []),
        start_date=_date(assignment.start_date), due_date=_date(assignment.due_date), stage_dates=_stage_dates(assignment.schedule),
        step_dates=_step_dates(assignment.schedule), collaborators=[dict(item) for item in assignment.collaborators or [] if item.get("user_id")],
        status=AssignmentStatus.ACTIVE if assignment.active else AssignmentStatus.ENDED, owner_user_id=assignment.owner_user_id, created_by_user_id=assignment.created_by_user_id,
        creation_date=assignment.creation_date, update_date=assignment.update_date,
    )
    db.add(row)
    db.flush()
    maps.assignments[int(assignment.id)] = row  # type: ignore[arg-type]
    return row


def migrate_templates(db: Session) -> TemplateMaps:
    maps = TemplateMaps()
    for program in db.exec(select(Program).order_by(Program.id)).all():  # type: ignore[arg-type]
        migrate_template(db, program, maps)
    for assignment in db.exec(select(ProgramAssignment).order_by(ProgramAssignment.id)).all():  # type: ignore[arg-type]
        migrate_assignment(db, assignment, maps)
    return maps

