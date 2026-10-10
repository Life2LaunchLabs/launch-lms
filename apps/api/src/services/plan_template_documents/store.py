"""Read, validate, save and create plan templates as Plan Template Documents.

A save applies the whole document in one transaction: template details, roles,
phases (order, names, durations) and objectives (content, steps, schedule,
requirement mappings, placement). Phases and objectives left out of the
document are removed; removed objectives are archived so the live plans made
from them keep their provenance.
"""

from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import Session, func, select

from src.db.learning import LearningBadge
from src.db.programs import Objective, ObjectiveKind, Program, ProgramAssignment, ProgramObjective, ProgramPhase, ProgramStatus
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services import programs
from src.services.plan_template_documents.models import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, MAX_OBJECTIVES, PlanTemplateDocument
from src.services.requirements import mappable_nodes, mappings_for_relation, update_mappings

# Kept on steps for the editor but derived from `restricted`, so it is left out of documents.
DERIVED_STEP_KEYS = frozenset({"access"})


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _without_none(data: dict) -> dict:
    return {key: value for key, value in data.items() if value is not None}


def _phases(db: Session, program: Program) -> list[ProgramPhase]:
    phases = db.exec(
        select(ProgramPhase).where(ProgramPhase.program_id == program.id).order_by(ProgramPhase.position, ProgramPhase.id)  # type: ignore[arg-type]
    ).all()
    if phases:
        return list(phases)
    # Templates from before phases existed get their default phase on first read,
    # committed so the phase_uuid a reader sees stays stable.
    phase = programs._ensure_default_phase(db, program)
    db.commit()
    return [phase]


def _relations(db: Session, program: Program) -> dict[str, tuple[ProgramObjective, Objective]]:
    rows = db.exec(
        select(ProgramObjective, Objective)
        .join(Objective, Objective.id == ProgramObjective.objective_id)  # type: ignore[arg-type]
        .where(ProgramObjective.program_id == program.id)
    ).all()
    return {objective.objective_uuid: (relation, objective) for relation, objective in rows}


def _export_objective(item: dict) -> dict:
    return _without_none(
        {
            "objective_uuid": item["objective_uuid"],
            "title": item["title"],
            "description": item.get("description") or "",
            "badge_uuid": item.get("badge_uuid"),
            "badge_major_version": item.get("badge_major_version") if item.get("badge_id") else None,
            "allow_learner_confirmation": bool(item.get("allow_learner_confirmation")),
            "steps": [{key: value for key, value in step.items() if key not in DERIVED_STEP_KEYS} for step in item.get("custom_fields") or []],
            "schedule": _without_none(
                {
                    "start_rule": item.get("default_start_rule") or "any_time",
                    "due_rule": item.get("default_due_rule") or "phase_end",
                    "allow_late": bool(item.get("default_allow_late")),
                    "suggested_due_week": item.get("suggested_due_week"),
                }
            ),
            "requirement_node_uuids": [mapping["node_uuid"] for mapping in item.get("requirement_mappings") or []],
        }
    )


def export_document(db: Session, program: Program) -> dict:
    phases = _phases(db, program)
    objectives = programs._program_objectives(db, program)
    return {
        "format": DOCUMENT_FORMAT,
        "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"name": program.name, "description": program.description or "", "instructions": program.instructions or ""},
        "roles": {
            "definitions": [
                {
                    "key": role["key"],
                    "name": role.get("name") or role["key"],
                    "capabilities": list(role.get("capabilities") or []),
                    "grantable_role_keys": list(role.get("grantable_role_keys") or []),
                }
                for role in (program.role_definitions or programs.DEFAULT_ROLE_DEFINITIONS)
            ],
            "default_subject_role_key": program.default_subject_role_key,
            "default_staff_role_key": program.default_staff_role_key,
        },
        "phases": [
            _without_none(
                {
                    "phase_uuid": phase.phase_uuid,
                    "name": phase.name,
                    "description": phase.description or "",
                    "suggested_duration_weeks": phase.suggested_duration_weeks,
                    "objectives": [_export_objective(item) for item in objectives if item.get("phase_id") == phase.id],
                }
            )
            for phase in phases
        ],
    }


def document_etag(document: dict) -> str:
    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _envelope(db: Session, program: Program) -> dict:
    document = export_document(db, program)
    objectives = programs._program_objectives(db, program)
    assignment_count = db.exec(select(func.count(ProgramAssignment.id)).where(ProgramAssignment.program_id == program.id)).one()  # type: ignore[arg-type]
    return {
        "document": document,
        "etag": document_etag(document),
        "context": {
            "template_uuid": program.program_uuid,
            "slug": program.slug,
            "version": program.version,
            "assignment_count": assignment_count,
            "published_to_library": program.library_published_at is not None,
            "outdated_badge_objectives": [
                {
                    "objective_uuid": item["objective_uuid"],
                    "title": item["title"],
                    "badge_major_version": item["badge_major_version"],
                    "latest_badge_major_version": item["latest_badge_major_version"],
                }
                for item in programs._outdated_badge_objectives(db, objectives)
            ],
        },
    }


def _path(loc) -> str:
    path = ""
    for part in loc:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
    return path or "document"


def _find_badge(db: Session, badge_uuid: str) -> LearningBadge | None:
    return db.exec(
        select(LearningBadge).where(LearningBadge.badge_uuid.in_([badge_uuid, f"badge_{badge_uuid.removeprefix('badge_')}"]))  # type: ignore[union-attr]
    ).first()


def _check(db: Session, org_id: int, raw, program: Program | None) -> tuple[PlanTemplateDocument | None, dict, dict]:
    """Validate a document against every rule. Returns the parsed document, the report and what a save needs."""
    errors: list[dict] = []
    warnings: list[dict] = []
    prepared: dict = {"objectives": {}, "roles": None}

    def report() -> dict:
        return {"valid": not errors, "errors": errors, "warnings": warnings}

    try:
        document = PlanTemplateDocument.model_validate(raw)
    except ValidationError as exc:
        errors.extend({"path": _path(error["loc"]), "message": error["msg"]} for error in exc.errors())
        return None, report(), prepared

    if not document.template.name.strip():
        errors.append({"path": "template.name", "message": "Give the template a name"})

    roles = document.roles
    if roles is not None or program is None:
        try:
            prepared["roles"] = programs._validated_template_roles(
                [role.model_dump() for role in roles.definitions] if roles else None,
                roles.default_subject_role_key if roles else "subject",
                roles.default_staff_role_key if roles else "reviewer",
            )
        except HTTPException as exc:
            errors.append({"path": "roles", "message": str(exc.detail)})

    phases_by_uuid = {phase.phase_uuid: phase for phase in _phases(db, program)} if program else {}
    relations = _relations(db, program) if program else {}
    seen_phases: set[str] = set()
    seen_objectives: set[str] = set()
    nodes: dict | None = None
    total = 0
    for i, phase in enumerate(document.phases):
        base = f"phases[{i}]"
        if not phase.name.strip():
            errors.append({"path": f"{base}.name", "message": "Give the phase a name"})
        if program and phase.phase_uuid:
            if phase.phase_uuid not in phases_by_uuid:
                errors.append({"path": f"{base}.phase_uuid", "message": "Unknown phase for this template; omit phase_uuid to add a new phase"})
            elif phase.phase_uuid in seen_phases:
                errors.append({"path": f"{base}.phase_uuid", "message": "This phase appears more than once"})
            seen_phases.add(phase.phase_uuid)
        for j, item in enumerate(phase.objectives):
            path = f"{base}.objectives[{j}]"
            total += 1
            if not item.title.strip():
                errors.append({"path": f"{path}.title", "message": "Give the objective a title"})
            existing = relations.get(item.objective_uuid) if program and item.objective_uuid else None
            if program and item.objective_uuid:
                if existing is None:
                    errors.append({"path": f"{path}.objective_uuid", "message": "Unknown objective for this template; omit objective_uuid to add a new objective"})
                elif item.objective_uuid in seen_objectives:
                    errors.append({"path": f"{path}.objective_uuid", "message": "This objective appears more than once"})
                seen_objectives.add(item.objective_uuid)

            badge = None
            steps = [step.model_dump(exclude_none=True) for step in item.steps]
            if existing is not None:
                current_badge = db.get(LearningBadge, existing[1].badge_id) if existing[1].badge_id else None
                if item.badge_uuid and (current_badge is None or current_badge.badge_uuid != item.badge_uuid):
                    errors.append({"path": f"{path}.badge_uuid", "message": "An objective's badge cannot change; add a new objective for another badge"})
            elif item.badge_uuid:
                badge = _find_badge(db, item.badge_uuid)
                if badge is None:
                    errors.append({"path": f"{path}.badge_uuid", "message": f"Badge not found: {item.badge_uuid}"})
                elif not any(step.get("type") == "badge" and step.get("badge_uuid") == badge.badge_uuid for step in steps):
                    steps.append({"field_uuid": f"badge_requirement_{uuid4()}", "title": item.title.strip() or badge.name, "type": "badge", "badge_uuid": badge.badge_uuid, "restricted": False})
            try:
                steps = programs._validated_steps(db, steps)
            except HTTPException as exc:
                errors.append({"path": f"{path}.steps", "message": str(exc.detail)})

            week = item.schedule.suggested_due_week
            if week is not None and (not phase.suggested_duration_weeks or week > phase.suggested_duration_weeks):
                errors.append({"path": f"{path}.schedule.suggested_due_week", "message": "Set the phase's suggested_duration_weeks, and keep the due week within it"})

            if item.requirement_node_uuids:
                nodes = mappable_nodes(db, org_id) if nodes is None else nodes
                unknown = [uuid for uuid in item.requirement_node_uuids if uuid not in nodes]
                if unknown:
                    errors.append({"path": f"{path}.requirement_node_uuids", "message": f"Unknown requirement nodes: {', '.join(unknown)}"})

            prepared["objectives"][(i, j)] = {"steps": steps, "badge": badge}
    if total > MAX_OBJECTIVES:
        errors.append({"path": "phases", "message": f"A template can have at most {MAX_OBJECTIVES} objectives"})

    if program:
        # Leaving something out of the document removes it. Plans already assigned keep their copy.
        for phase_uuid, phase in phases_by_uuid.items():
            if phase_uuid not in seen_phases:
                warnings.append({"path": "phases", "message": f"Removes phase \"{phase.name}\""})
        for objective_uuid, (_, objective) in relations.items():
            if objective_uuid not in seen_objectives:
                warnings.append({"path": "phases", "message": f"Removes objective \"{objective.title}\"; plans already assigned keep it"})
    return document, report(), prepared


def _apply(db: Session, current_user: PublicUser, org_id: int, program: Program, document: PlanTemplateDocument, prepared: dict, *, creating: bool) -> None:
    now = programs._now_string()
    program.name = document.template.name.strip()
    program.description = document.template.description
    program.instructions = document.template.instructions
    if prepared["roles"] is not None:
        program.role_definitions, program.default_subject_role_key, program.default_staff_role_key = prepared["roles"]
    phases_by_uuid = {} if creating else {phase.phase_uuid: phase for phase in _phases(db, program)}
    relations = {} if creating else _relations(db, program)
    for i, phase_doc in enumerate(document.phases):
        phase = phases_by_uuid.get(phase_doc.phase_uuid or "")
        if phase is None:
            phase = ProgramPhase(phase_uuid=f"program_phase_{uuid4()}", program_id=int(program.id), name="", creation_date=now)  # type: ignore[arg-type]
        phase.name = phase_doc.name.strip()
        phase.description = phase_doc.description
        phase.suggested_duration_weeks = phase_doc.suggested_duration_weeks
        phase.position = i
        phase.update_date = now
        db.add(phase)
        db.flush()
        for j, item in enumerate(phase_doc.objectives):
            ready = prepared["objectives"][(i, j)]
            existing = relations.get(item.objective_uuid or "")
            if existing is not None:
                relation, objective = existing
                learner_confirms = item.allow_learner_confirmation
            else:
                badge = ready["badge"]
                objective = Objective(
                    objective_uuid=f"objective_{uuid4()}", org_id=org_id, title="", kind=ObjectiveKind.CUSTOM,
                    badge_id=badge.id if badge else None, created_by_user_id=current_user.id, creation_date=now,
                )
                relation = ProgramObjective(
                    program_id=int(program.id), objective_id=0, creation_date=now,  # type: ignore[arg-type]
                    badge_major_version=programs._latest_badge_major(db, int(badge.id)) if badge else None,
                )
                learner_confirms = item.allow_learner_confirmation or badge is not None
            objective.title = item.title.strip()
            objective.description = item.description
            if _value(objective.kind) == ObjectiveKind.CUSTOM.value:
                objective.custom_fields = ready["steps"]
                objective.allow_learner_confirmation = learner_confirms
                objective.completion_policy, objective.evidence_policy = programs.objective_policies(ready["steps"], learner_confirms)  # type: ignore[assignment]
            objective.update_date = now
            db.add(objective)
            db.flush()
            relation.objective_id = int(objective.id)  # type: ignore[arg-type]
            relation.phase_id = phase.id
            relation.position = j
            relation.default_start_rule = item.schedule.start_rule
            relation.default_due_rule = item.schedule.due_rule
            relation.default_allow_late = item.schedule.allow_late
            relation.suggested_due_week = item.schedule.suggested_due_week
            relation.update_date = now
            db.add(relation)
            db.flush()
            requested = list(dict.fromkeys(item.requirement_node_uuids))
            current = [mapping["node_uuid"] for mapping in mappings_for_relation(db, relation)] if existing is not None else []
            if requested != current:
                update_mappings(db, current_user, org_id, relation, requested)
    kept_objectives = {item.objective_uuid for phase_doc in document.phases for item in phase_doc.objectives if item.objective_uuid}
    for objective_uuid, (relation, objective) in relations.items():
        if objective_uuid not in kept_objectives:
            programs.detach_program_objective(db, relation, objective)
    db.flush()
    kept_phases = {phase_doc.phase_uuid for phase_doc in document.phases if phase_doc.phase_uuid}
    for phase_uuid, phase in phases_by_uuid.items():
        if phase_uuid not in kept_phases:
            db.delete(phase)
    program.update_date = now
    db.add(program)
    db.flush()


def get_template_document(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return _envelope(db, programs._program_or_404(db, template_uuid, org_id))


def validate_template_document(db: Session, current_user: PublicUser, org_id: int, raw, template_uuid: str | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = programs._program_or_404(db, template_uuid, org_id) if template_uuid else None
    _, report, _ = _check(db, org_id, raw, program)
    return report


def _reject(report: dict) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": "The document has errors; nothing was saved", **report})


def save_template_document(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, raw, base_etag: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = programs._program_or_404(db, template_uuid, org_id)
    current = _envelope(db, program)
    if base_etag != current["etag"]:
        raise HTTPException(
            status_code=409,
            detail={"message": "The template changed since it was read; merge your edit into `current` and save again", "current": current},
        )
    document, report, prepared = _check(db, org_id, raw, program)
    if document is None or not report["valid"]:
        raise _reject(report)
    _apply(db, current_user, org_id, program, document, prepared, creating=False)
    if export_document(db, program) == current["document"]:
        db.rollback()
        return {**current, "changed": False, "warnings": report["warnings"]}
    program.version += 1
    db.add(program)
    db.commit()
    db.refresh(program)
    return {**_envelope(db, program), "changed": True, "warnings": report["warnings"]}


def create_template_from_document(db: Session, current_user: PublicUser, org_id: int, raw) -> dict:
    require_org_admin(current_user.id, org_id, db)
    document, report, prepared = _check(db, org_id, raw, None)
    if document is None or not report["valid"]:
        raise _reject(report)
    now = programs._now_string()
    program = Program(
        program_uuid=f"program_{uuid4()}",
        slug=programs._unique_program_slug(db, document.template.name),
        org_id=org_id,
        name=document.template.name.strip(),
        status=ProgramStatus.ACTIVE,
        created_by_user_id=current_user.id,
        creation_date=now,
        update_date=now,
    )
    db.add(program)
    db.flush()
    _apply(db, current_user, org_id, program, document, prepared, creating=True)
    db.commit()
    db.refresh(program)
    return {**_envelope(db, program), "changed": True, "warnings": report["warnings"]}
