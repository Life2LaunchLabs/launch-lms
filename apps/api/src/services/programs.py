from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningActivity,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeVersion,
    LearningPage,
    LearningResponseAttempt,
    LearningRun,
)
from src.db.planning import (
    DEFAULT_ROLE_DEFINITIONS,
    Plan,
    PlanInvitation,
    PlanObjective,
    PlanObjectiveProgress,
    PlanObjectiveStatus,
    PlanStatus,
)
from src.services.planning import _normalized_capability_list, capabilities_for as plan_capabilities_for
from src.db.organizations import Organization
from src.db.programs import (
    Objective,
    ObjectiveCreate,
    ObjectiveKind,
    ObjectiveProgress,
    ObjectiveProgressStatus,
    ObjectiveReviewDecision,
    ParticipantStatus,
    Program,
    ProgramAssignment,
    ProgramAssignmentCreate,
    ProgramAssignmentObjectiveUpdate,
    ProgramCreate,
    ProgramObjective,
    ProgramObjectiveScheduleUpdate,
    ProgramObjectiveUpdate,
    ProgramPhase,
    ProgramPhaseCreate,
    ProgramPhaseUpdate,
    ProgramReorder,
    ProgramParticipant,
    ProgramStatus,
    ProgramUpdate,
)
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.db.roles import Role
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_string() -> str:
    return _now().isoformat()


def _has_live_plan_tables(db: Session) -> bool:
    return inspect(db.get_bind()).has_table("plan") and inspect(db.get_bind()).has_table("planobjective")


def _unique_program_slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-") or "program"
    slug = base
    suffix = 2
    while db.exec(select(Program.id).where(Program.slug == slug)).first() is not None:
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def _major(version: str | None) -> int:
    try:
        return int(str(version or "1").split(".")[0])
    except (TypeError, ValueError):
        return 1


STEP_TYPES = {"text", "media", "link", "checkbox", "badge"}
MEDIA_TYPES = {"image", "video", "document"}


def _validated_steps(db: Session, fields: list[dict] | None) -> list[dict]:
    """Return the shared objective-step wire format used by templates and live plans."""
    normalized: list[dict] = []
    seen: set[str] = set()
    for raw in fields or []:
        field = dict(raw)
        key = str(field.get("field_uuid") or f"field_{uuid4()}")
        if key in seen:
            raise HTTPException(status_code=422, detail="Objective steps require unique field_uuid values")
        seen.add(key)
        step_type = str(field.get("type") or "text")
        if step_type not in STEP_TYPES:
            raise HTTPException(status_code=422, detail=f"Unsupported objective step type: {step_type}")
        title = str(field.get("title") or "").strip()
        if not title and field.get("field_uuid"):
            title = str(field["field_uuid"]).replace("_", " ").strip().title()
        if not title:
            raise HTTPException(status_code=422, detail="Give every objective step a title")
        restricted = bool(field.get("restricted", str(field.get("access") or "contributor") in {"reviewer", "staff"}))
        item = {**field, "field_uuid": key, "title": title, "type": step_type, "restricted": restricted, "access": "reviewer" if restricted else "contributor"}
        if step_type == "media":
            allowed = ["document" if value == "pdf" else str(value) for value in (field.get("allowed_types") or ["image", "document"])]
            # Early plan editors represented a URL upload as a media field. Preserve
            # those definitions while moving them to the canonical link step.
            if set(allowed) == {"link"}:
                item["type"] = "link"
                item.pop("allowed_types", None)
                normalized.append(item)
                continue
            if not allowed or set(allowed) - MEDIA_TYPES:
                raise HTTPException(status_code=422, detail="Media steps accept image, video, or document")
            item["allowed_types"] = list(dict.fromkeys(allowed))
        if step_type == "badge":
            badge_uuid = str(field.get("badge_uuid") or "").strip()
            badge = db.exec(select(LearningBadge).where(LearningBadge.badge_uuid == badge_uuid)).first()
            if not badge:
                raise HTTPException(status_code=404, detail=f"Badge not found: {badge_uuid}")
            item.update(badge_uuid=badge.badge_uuid, badge_major_version=int(field.get("badge_major_version") or _latest_badge_major(db, int(badge.id))), accept_previous_major_versions=bool(field.get("accept_previous_major_versions", False)))
        normalized.append(item)
    return normalized


def _program_or_404(db: Session, program_uuid: str, org_id: int) -> Program:
    program = db.exec(
        select(Program).where(Program.program_uuid == program_uuid, Program.org_id == org_id)
    ).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


def _assignment_or_404(db: Session, assignment_uuid: str, org_id: int) -> ProgramAssignment:
    assignment = db.exec(
        select(ProgramAssignment).where(
            ProgramAssignment.assignment_uuid == assignment_uuid,
            ProgramAssignment.org_id == org_id,
        )
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Program assignment not found")
    return assignment


def _objective_dict(objective: Objective, relation: ProgramObjective | None = None) -> dict:
    result = {
        "id": objective.id,
        "objective_uuid": objective.objective_uuid,
        "title": objective.title,
        "description": objective.description,
        "kind": objective.kind.value if hasattr(objective.kind, "value") else objective.kind,
        "completion_policy": objective.completion_policy.value if hasattr(objective.completion_policy, "value") else objective.completion_policy,
        "evidence_policy": objective.evidence_policy.value if hasattr(objective.evidence_policy, "value") else objective.evidence_policy,
        "allow_learner_confirmation": objective.allow_learner_confirmation,
        "custom_fields": objective.custom_fields or [],
        "fields": objective.custom_fields or [],
        "badge_id": objective.badge_id,
    }
    if relation:
        result.update({
            "position": relation.position,
            "target_days": relation.target_days,
            "badge_major_version": relation.badge_major_version,
            "accept_previous_major_versions": relation.accept_previous_major_versions,
            "phase_id": relation.phase_id,
            "default_start_rule": relation.default_start_rule.value if hasattr(relation.default_start_rule, "value") else relation.default_start_rule,
            "default_due_rule": relation.default_due_rule.value if hasattr(relation.default_due_rule, "value") else relation.default_due_rule,
            "default_allow_late": relation.default_allow_late,
        })
    return result


def _program_objectives(db: Session, program: Program) -> list[dict]:
    rows = db.exec(
        select(ProgramObjective, Objective)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .where(ProgramObjective.program_id == program.id)
        .outerjoin(ProgramPhase, ProgramPhase.id == ProgramObjective.phase_id)
        .order_by(ProgramPhase.position, ProgramObjective.position, ProgramObjective.id)
    ).all()
    results = []
    for relation, objective in rows:
        item = _objective_dict(objective, relation)
        if objective.badge_id:
            badge = db.get(LearningBadge, objective.badge_id)
            if badge:
                item["badge_uuid"] = badge.badge_uuid
                item["badge_name"] = badge.name
        results.append(item)
    return results


def _ensure_default_phase(db: Session, program: Program) -> ProgramPhase:
    phase = db.exec(
        select(ProgramPhase)
        .where(ProgramPhase.program_id == program.id)
        .order_by(ProgramPhase.position, ProgramPhase.id)
    ).first()
    if phase:
        return phase
    now = _now_string()
    phase = ProgramPhase(
        phase_uuid=f"program_phase_{uuid4()}",
        program_id=program.id,
        name="Phase 1",
        position=0,
        creation_date=now,
        update_date=now,
    )
    db.add(phase)
    db.flush()
    return phase


def _program_phases(db: Session, program: Program) -> list[dict]:
    phases = db.exec(
        select(ProgramPhase)
        .where(ProgramPhase.program_id == program.id)
        .order_by(ProgramPhase.position, ProgramPhase.id)
    ).all()
    if not phases:
        phases = [_ensure_default_phase(db, program)]
    objectives = _program_objectives(db, program)
    return [
        {
            "id": phase.id,
            "phase_uuid": phase.phase_uuid,
            "name": phase.name,
            "description": phase.description,
            "position": phase.position,
            "target_days": phase.target_days,
            "suggested_duration_weeks": phase.suggested_duration_weeks,
            "objectives": [{**item, "program_uuid": program.program_uuid} for item in objectives if item.get("phase_id") == phase.id],
        }
        for phase in phases
    ]


def _program_dict(
    db: Session,
    program: Program,
    *,
    include_objectives: bool = True,
    include_assignments: bool = False,
) -> dict:
    result = {
        "id": program.id,
        "program_uuid": program.program_uuid,
        "slug": program.slug,
        "org_id": program.org_id,
        "name": program.name,
        "description": program.description,
        "thumbnail_image": program.thumbnail_image,
        "instructions": program.instructions,
        "role_definitions": program.role_definitions or list(DEFAULT_ROLE_DEFINITIONS),
        "available_capabilities": sorted({capability for role in DEFAULT_ROLE_DEFINITIONS for capability in role["capabilities"]}),
        "default_subject_role_key": program.default_subject_role_key,
        "default_staff_role_key": program.default_staff_role_key,
        "status": program.status.value if hasattr(program.status, "value") else program.status,
        "version": program.version,
        "creation_date": program.creation_date,
        "update_date": program.update_date,
        "assignment_count": len(db.exec(
            select(ProgramAssignment).where(ProgramAssignment.program_id == program.id)
        ).all()),
    }
    if include_objectives:
        objectives = _program_objectives(db, program)
        result["objectives"] = objectives
        result["phases"] = _program_phases(db, program)
        result["outdated_badge_objectives"] = _outdated_badge_objectives(db, objectives)
    if include_assignments:
        assignments = db.exec(
            select(ProgramAssignment)
            .where(ProgramAssignment.program_id == program.id)
            .order_by(ProgramAssignment.creation_date.desc(), ProgramAssignment.id.desc())
        ).all()
        result["assignments"] = [_assignment_summary(db, assignment) for assignment in assignments]
    return result


def _latest_badge_major(db: Session, badge_id: int) -> int:
    versions = db.exec(
        select(LearningBadgeVersion).where(
            LearningBadgeVersion.badge_id == badge_id,
            LearningBadgeVersion.state == "published",
        )
    ).all()
    return max((_major(version.semantic_version) for version in versions), default=1)


def _outdated_badge_objectives(db: Session, objectives: list[dict]) -> list[dict]:
    outdated: list[dict] = []
    for objective in objectives:
        badge_id = objective.get("badge_id")
        pinned = objective.get("badge_major_version")
        if not badge_id or not pinned:
            continue
        latest = _latest_badge_major(db, badge_id)
        if latest > pinned:
            versions = db.exec(select(LearningBadgeVersion).where(
                LearningBadgeVersion.badge_id == badge_id,
                LearningBadgeVersion.state == "published",
            )).all()
            prior_version = next(
                (item for item in versions if _major(item.semantic_version) == int(pinned)),
                None,
            )
            latest_version = next(
                (item for item in versions if _major(item.semantic_version) == latest),
                None,
            )
            earlier_holders = {
                award.user_id
                for award in db.exec(select(LearningBadgeAward).where(
                    LearningBadgeAward.badge_id == badge_id,
                    LearningBadgeAward.major_version < latest,
                )).all()
            }
            outdated.append({
                **objective,
                "latest_badge_major_version": latest,
                "earlier_version_holder_count": len(earlier_holders),
                "version_comparison": {
                    "previous": {
                        "semantic_version": prior_version.semantic_version if prior_version else f"{pinned}.x",
                        "title": prior_version.title if prior_version else "Earlier version",
                        "description": prior_version.description if prior_version else "",
                    },
                    "latest": {
                        "semantic_version": latest_version.semantic_version if latest_version else f"{latest}.x",
                        "title": latest_version.title if latest_version else "New version",
                        "description": latest_version.description if latest_version else "",
                    },
                },
            })
    return outdated


def list_programs(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    programs = db.exec(
        select(Program).where(Program.org_id == org_id).order_by(Program.update_date.desc())
    ).all()
    assignments = db.exec(select(ProgramAssignment).where(ProgramAssignment.org_id == org_id)).all()
    assignment_counts: dict[int, int] = {}
    for assignment in assignments:
        assignment_counts[assignment.program_id] = assignment_counts.get(assignment.program_id, 0) + 1
    result = []
    for program in programs:
        item = _program_dict(db, program)
        item["assignment_count"] = assignment_counts.get(program.id or 0, 0)
        result.append(item)
    return result


def list_program_assignments(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Return active managed-plan assignments visible to the current staff member."""
    require_org_membership(current_user.id, org_id, db)
    assignments = db.exec(
        select(ProgramAssignment).where(
            ProgramAssignment.org_id == org_id,
            ProgramAssignment.active == True,  # noqa: E712
        ).order_by(ProgramAssignment.creation_date.desc(), ProgramAssignment.id.desc())
    ).all()
    if not is_org_admin(current_user.id, org_id, db) and not current_user.is_superadmin:
        assignments = [
            assignment for assignment in assignments
            if current_user.id in (assignment.staff_user_ids or [])
        ]
    return [_assignment_summary(db, assignment) for assignment in assignments]


def create_program(db: Session, current_user: PublicUser, payload: ProgramCreate) -> dict:
    require_org_admin(current_user.id, payload.org_id, db)
    now = _now_string()
    role_definitions, subject_role, staff_role = _validated_template_roles(
        payload.role_definitions, payload.default_subject_role_key, payload.default_staff_role_key,
    )
    program = Program(
        program_uuid=f"program_{uuid4()}",
        slug=_unique_program_slug(db, payload.name),
        org_id=payload.org_id,
        name=payload.name.strip(),
        description=payload.description,
        instructions=payload.instructions,
        role_definitions=role_definitions,
        default_subject_role_key=subject_role,
        default_staff_role_key=staff_role,
        status=ProgramStatus.ACTIVE,
        created_by_user_id=current_user.id,
        creation_date=now,
        update_date=now,
    )
    if not program.name:
        raise HTTPException(status_code=422, detail="Program name is required")
    db.add(program)
    db.flush()
    _ensure_default_phase(db, program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def get_program(db: Session, current_user: PublicUser, org_id: int, program_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return _program_dict(
        db,
        _program_or_404(db, program_uuid, org_id),
        include_assignments=True,
    )


def update_program(db: Session, current_user: PublicUser, org_id: int, program_uuid: str, payload: ProgramUpdate) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    changes = payload.model_dump(exclude_unset=True)
    if {"role_definitions", "default_subject_role_key", "default_staff_role_key"} & set(changes):
        roles, subject_role, staff_role = _validated_template_roles(
            changes.get("role_definitions", program.role_definitions),
            changes.get("default_subject_role_key", program.default_subject_role_key),
            changes.get("default_staff_role_key", program.default_staff_role_key),
        )
        changes.update(role_definitions=roles, default_subject_role_key=subject_role, default_staff_role_key=staff_role)
    for key, value in changes.items():
        setattr(program, key, value)
    if "name" in changes and not str(program.name).strip():
        raise HTTPException(status_code=422, detail="Program name is required")
    program.version += 1
    program.update_date = _now_string()
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def _validated_template_roles(role_definitions: list[dict] | None, subject_key: str, staff_key: str) -> tuple[list[dict], str, str]:
    definitions = role_definitions or [dict(item) for item in DEFAULT_ROLE_DEFINITIONS]
    keys = [str(item.get("key") or "").strip() for item in definitions]
    if not keys or any(not key for key in keys) or len(keys) != len(set(keys)):
        raise HTTPException(status_code=422, detail="Template roles require unique keys")
    known_capabilities = {capability for item in DEFAULT_ROLE_DEFINITIONS for capability in item["capabilities"]}
    normalized = []
    for item, key in zip(definitions, keys):
        capabilities = _normalized_capability_list(item.get("capabilities") or [])
        invalid = set(capabilities) - known_capabilities
        if invalid:
            raise HTTPException(status_code=422, detail=f"Unknown role capabilities: {', '.join(sorted(invalid))}")
        grants = list(dict.fromkeys(item.get("grantable_role_keys") or []))
        if set(grants) - set(keys):
            raise HTTPException(status_code=422, detail="A grantable template role does not exist")
        if key == "plan_admin":
            capabilities = sorted(known_capabilities)
        name = "Learner" if key == "subject" else str(item.get("name") or key).strip() or key
        normalized.append({"key": key, "name": name, "capabilities": capabilities, "grantable_role_keys": grants})
    if subject_key not in keys or staff_key not in keys or "plan_admin" not in keys:
        raise HTTPException(status_code=422, detail="Default subject and staff roles must exist")
    if "review_badge_submissions" not in next(item["capabilities"] for item in normalized if item["key"] == staff_key):
        raise HTTPException(status_code=422, detail="The default staff role must be able to review badge submissions")
    return normalized, subject_key, staff_key


def delete_program(db: Session, current_user: PublicUser, org_id: int, program_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    db.delete(program)
    db.commit()
    return {"deleted": True, "program_uuid": program_uuid}


def list_objectives(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    objectives = db.exec(
        select(Objective).where(
            Objective.org_id == org_id,
            Objective.kind == ObjectiveKind.CUSTOM,
            Objective.archived == False,  # noqa: E712
        ).order_by(Objective.title)
    ).all()
    return [_objective_dict(objective) for objective in objectives]


def add_program_objective(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    payload: ObjectiveCreate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    objective: Objective | None = None
    badge_major: int | None = None
    if payload.objective_uuid:
        objective = db.exec(
            select(Objective).where(
                Objective.objective_uuid == payload.objective_uuid,
                Objective.org_id == org_id,
            )
        ).first()
        if not objective:
            raise HTTPException(status_code=404, detail="Objective not found")
    else:
        if not payload.title or not payload.title.strip():
            raise HTTPException(status_code=422, detail="Objective title is required")
        badge_id = None
        custom_fields = list(payload.custom_fields or [])
        if payload.kind == ObjectiveKind.BADGE:
            badge_uuid = str(payload.badge_uuid or "")
            badge = db.exec(
                select(LearningBadge).where(
                    LearningBadge.badge_uuid.in_([badge_uuid, f"badge_{badge_uuid.removeprefix('badge_')}"])
                )
            ).first()
            if not badge:
                raise HTTPException(status_code=404, detail="Badge not found")
            badge_id = badge.id
            badge_major = _latest_badge_major(db, badge.id)
            custom_fields.append({
                "field_uuid": f"badge_requirement_{uuid4()}", "title": payload.title.strip(),
                "type": "badge", "badge_uuid": badge.badge_uuid,
                "badge_major_version": badge_major, "accept_previous_major_versions": False,
                "restricted": False, "access": "contributor",
            })
        custom_fields = _validated_steps(db, custom_fields)
        now = _now_string()
        learner_can_add_evidence = any(
            not bool(field.get("restricted", not field.get("allow_student_upload", False)))
            for field in custom_fields
        )
        has_evidence_fields = bool(custom_fields)
        objective = Objective(
            objective_uuid=f"objective_{uuid4()}",
            org_id=org_id,
            title=payload.title.strip(),
            description=payload.description,
            kind=ObjectiveKind.CUSTOM,
            completion_policy=("either" if payload.allow_learner_confirmation or payload.kind == ObjectiveKind.BADGE else "staff"),
            evidence_policy=("both" if learner_can_add_evidence else ("staff" if has_evidence_fields else "none")),
            custom_fields=custom_fields,
            allow_learner_confirmation=payload.allow_learner_confirmation or payload.kind == ObjectiveKind.BADGE,
            badge_id=badge_id,
            created_by_user_id=current_user.id,
            creation_date=now,
            update_date=now,
        )
        db.add(objective)
        db.flush()
    existing = db.exec(
        select(ProgramObjective).where(
            ProgramObjective.program_id == program.id,
            ProgramObjective.objective_id == objective.id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Objective is already in this program")
    phase = None
    if payload.phase_uuid:
        phase = db.exec(select(ProgramPhase).where(
            ProgramPhase.phase_uuid == payload.phase_uuid,
            ProgramPhase.program_id == program.id,
        )).first()
        if not phase:
            raise HTTPException(status_code=404, detail="Program phase not found")
    else:
        phase = _ensure_default_phase(db, program)
    position = len(db.exec(select(ProgramObjective).where(
        ProgramObjective.program_id == program.id,
        ProgramObjective.phase_id == phase.id,
    )).all())
    if objective.badge_id and badge_major is None:
        badge_major = _latest_badge_major(db, objective.badge_id)
    now = _now_string()
    db.add(ProgramObjective(
        program_id=program.id,
        phase_id=phase.id,
        objective_id=objective.id,
        position=position,
        target_days=payload.target_days,
        badge_major_version=badge_major,
        default_start_rule=payload.default_start_rule,
        default_due_rule=payload.default_due_rule,
        default_allow_late=payload.default_allow_late,
        creation_date=now,
        update_date=now,
    ))
    program.version += 1
    program.update_date = now
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def update_program_objective_schedule(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    objective_uuid: str,
    payload: ProgramObjectiveScheduleUpdate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    relation = db.exec(
        select(ProgramObjective)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .where(
            ProgramObjective.program_id == program.id,
            Objective.objective_uuid == objective_uuid,
        )
    ).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Program objective not found")
    relation.default_start_rule = payload.default_start_rule
    relation.default_due_rule = payload.default_due_rule
    relation.default_allow_late = payload.default_allow_late
    now = _now_string()
    relation.update_date = now
    program.version += 1
    program.update_date = now
    db.add(relation)
    db.add(program)
    db.commit()
    return _program_dict(db, program)


def update_program_objective(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    objective_uuid: str,
    payload: ProgramObjectiveUpdate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    row = db.exec(
        select(ProgramObjective, Objective)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .where(
            ProgramObjective.program_id == program.id,
            Objective.objective_uuid == objective_uuid,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Program objective not found")
    relation, objective = row
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Objective title is required")
    objective.title = title
    objective.description = payload.description
    if objective.kind == ObjectiveKind.CUSTOM:
        steps = _validated_steps(db, payload.custom_fields)
        objective.custom_fields = steps
        objective.allow_learner_confirmation = payload.allow_learner_confirmation
        learner_can_add_evidence = any(
            not bool(field.get("restricted", not field.get("allow_student_upload", False)))
            for field in steps
        )
        objective.completion_policy = "either" if payload.allow_learner_confirmation else "staff"
        objective.evidence_policy = "both" if learner_can_add_evidence else ("staff" if steps else "none")
    relation.default_start_rule = payload.default_start_rule
    relation.default_due_rule = payload.default_due_rule
    relation.default_allow_late = payload.default_allow_late
    now = _now_string()
    objective.update_date = now
    relation.update_date = now
    program.version += 1
    program.update_date = now
    db.add(objective)
    db.add(relation)
    db.add(program)
    db.commit()
    return _program_dict(db, program)


def _role_can_manage_programs(role: Role | None) -> bool:
    if not role:
        return False
    if role.id in ADMIN_OR_MAINTAINER_ROLE_IDS:
        return True
    rights = role.rights if isinstance(role.rights, dict) else {}
    return bool(
        rights.get("dashboard", {}).get("action_access")
        and rights.get("learning_activities", {}).get("action_update")
    )


def create_program_phase(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    payload: ProgramPhaseCreate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Phase name is required")
    phases = db.exec(select(ProgramPhase).where(ProgramPhase.program_id == program.id)).all()
    now = _now_string()
    phase = ProgramPhase(
        phase_uuid=f"program_phase_{uuid4()}",
        program_id=program.id,
        name=name,
        description=payload.description,
        target_days=payload.target_days,
        suggested_duration_weeks=payload.suggested_duration_weeks,
        position=len(phases),
        creation_date=now,
        update_date=now,
    )
    db.add(phase)
    program.version += 1
    program.update_date = now
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def update_program_phase(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    phase_uuid: str,
    payload: ProgramPhaseUpdate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    phase = db.exec(select(ProgramPhase).where(
        ProgramPhase.phase_uuid == phase_uuid,
        ProgramPhase.program_id == program.id,
    )).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Program phase not found")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        changes["name"] = str(changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Phase name is required")
    for key, value in changes.items():
        setattr(phase, key, value)
    now = _now_string()
    phase.update_date = now
    program.version += 1
    program.update_date = now
    db.add(phase)
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def reorder_program(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    payload: ProgramReorder,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    phases = db.exec(select(ProgramPhase).where(ProgramPhase.program_id == program.id)).all()
    phase_by_uuid = {phase.phase_uuid: phase for phase in phases}
    objectives = db.exec(
        select(ProgramObjective, Objective)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .where(ProgramObjective.program_id == program.id)
    ).all()
    relation_by_uuid = {objective.objective_uuid: relation for relation, objective in objectives}
    supplied_phase_uuids = [item.phase_uuid for item in payload.phases]
    supplied_objective_uuids = [uuid for item in payload.phases for uuid in item.objective_uuids]
    if set(supplied_phase_uuids) != set(phase_by_uuid):
        raise HTTPException(status_code=422, detail="Reorder must include every program phase exactly once")
    if len(supplied_objective_uuids) != len(set(supplied_objective_uuids)) or set(supplied_objective_uuids) != set(relation_by_uuid):
        raise HTTPException(status_code=422, detail="Reorder must include every program objective exactly once")
    now = _now_string()
    for phase_position, phase_order in enumerate(payload.phases):
        phase = phase_by_uuid[phase_order.phase_uuid]
        phase.position = phase_position
        phase.update_date = now
        db.add(phase)
        for objective_position, objective_uuid in enumerate(phase_order.objective_uuids):
            relation = relation_by_uuid[objective_uuid]
            relation.phase_id = phase.id
            relation.position = objective_position
            relation.update_date = now
            db.add(relation)
    program.version += 1
    program.update_date = now
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_dict(db, program)


def update_badge_versions(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    accept_previous_major_versions: bool = False,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    relations = db.exec(
        select(ProgramObjective).where(ProgramObjective.program_id == program.id)
    ).all()
    changed = False
    for relation in relations:
        objective = db.get(Objective, relation.objective_id)
        if objective and objective.badge_id:
            latest = _latest_badge_major(db, objective.badge_id)
            if latest != relation.badge_major_version:
                relation.badge_major_version = latest
                relation.accept_previous_major_versions = accept_previous_major_versions
                relation.update_date = _now_string()
                db.add(relation)
                changed = True
    if changed:
        program.version += 1
        program.update_date = _now_string()
        db.add(program)
        db.commit()
        db.refresh(program)
    return _program_dict(db, program)


def _snapshot(db: Session, program: Program) -> list[dict]:
    return [
        {**objective, "phase_uuid": phase["phase_uuid"], "phase_name": phase["name"]}
        for phase in _program_phases(db, program)
        for objective in phase["objectives"]
    ]


def _validated_schedule(program: Program, phases: list[dict], payload: ProgramAssignmentCreate) -> dict:
    schedule = payload.schedule or {}
    supplied_phases = schedule.get("phases") or []
    if not supplied_phases:
        return {
            "phases": [],
            "objectives": [
                {
                    "objective_uuid": objective["objective_uuid"],
                    "phase_uuid": phase["phase_uuid"],
                    "due_rule": objective.get("default_due_rule", "optional"),
                    "allow_late": objective.get("default_allow_late", False),
                    "due_date": None,
                    "effective_due_date": None,
                }
                for phase in phases
                for objective in phase["objectives"]
            ],
        }
    phase_by_uuid = {item.get("phase_uuid"): item for item in supplied_phases}
    expected = {phase["phase_uuid"] for phase in phases}
    if set(phase_by_uuid) != expected:
        raise HTTPException(status_code=422, detail="Set a target date for every phase")
    for phase in phases:
        scheduled_phase = phase_by_uuid[phase["phase_uuid"]]
        if not scheduled_phase.get("end_date"):
            raise HTTPException(status_code=422, detail=f"Set a target date for {phase['name']}")
    ordered_targets = [phase_by_uuid[phase["phase_uuid"]]["end_date"] for phase in phases]
    if ordered_targets != sorted(ordered_targets):
        raise HTTPException(status_code=422, detail="Phase target dates must follow phase order")
    normalized_phases = [
        {"phase_uuid": phase["phase_uuid"], "end_date": phase_by_uuid[phase["phase_uuid"]]["end_date"]}
        for phase in phases
    ]
    supplied_objectives = schedule.get("objectives") or []
    objective_by_uuid = {item.get("objective_uuid"): dict(item) for item in supplied_objectives}
    expected_objectives = {objective["objective_uuid"] for phase in phases for objective in phase["objectives"]}
    if objective_by_uuid and set(objective_by_uuid) != expected_objectives:
        raise HTTPException(status_code=422, detail="Set scheduling rules for every objective")
    for phase in phases:
        for objective in phase["objectives"]:
            rule = objective_by_uuid.setdefault(objective["objective_uuid"], {
                "objective_uuid": objective["objective_uuid"], "phase_uuid": phase["phase_uuid"],
                "due_rule": "phase_end", "allow_late": bool(objective.get("default_allow_late", False)),
                "due_date": None,
            })
            due_rule = rule.get("due_rule")
            if due_rule not in {"optional", "phase_end", "specific_date"}:
                raise HTTPException(status_code=422, detail=f"Invalid completion rule for {objective['title']}")
            if due_rule == "specific_date" and not rule.get("due_date"):
                raise HTTPException(status_code=422, detail=f"Choose a due date for {objective['title']}")
            rule["phase_uuid"] = phase["phase_uuid"]
            rule.pop("start_rule", None)
            rule.pop("start_date", None)
            rule.pop("effective_start_date", None)
            # Inherited phase targets remain on PlanPhase; only explicit overrides are stored on an objective.
            rule["effective_due_date"] = rule.get("due_date") if due_rule == "specific_date" else None
    return {"phases": normalized_phases, "objectives": list(objective_by_uuid.values())}


def ensure_group_participants(db: Session, usergroup_id: int, user_ids: list[int] | None = None) -> None:
    assignments = db.exec(
        select(ProgramAssignment).where(
            ProgramAssignment.usergroup_id == usergroup_id,
            ProgramAssignment.active == True,  # noqa: E712
        )
    ).all()
    if not assignments:
        return
    if user_ids is None:
        user_ids = list(db.exec(
            select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == usergroup_id)
        ).all())
    now = _now_string()
    for assignment in assignments:
        for user_id in user_ids:
            existing = db.exec(select(ProgramParticipant).where(
                ProgramParticipant.assignment_id == assignment.id,
                ProgramParticipant.user_id == user_id,
            )).first()
            if existing:
                if existing.status == ParticipantStatus.LEFT:
                    existing.status = ParticipantStatus.INVITED
                    existing.viewed_at = None
                    existing.update_date = now
                    db.add(existing)
                continue
            db.add(ProgramParticipant(
                participant_uuid=f"participant_{uuid4()}",
                assignment_id=assignment.id,
                org_id=assignment.org_id,
                user_id=user_id,
                status=ParticipantStatus.INVITED,
                creation_date=now,
                update_date=now,
            ))
        db.flush()
        from src.services.planning import materialize_assignment_plans
        materialize_assignment_plans(db, int(assignment.id))


def assign_program(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    payload: ProgramAssignmentCreate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    targets = [bool(payload.usergroup_id), bool(payload.user_id), bool(payload.subject_email and payload.subject_email.strip())]
    if sum(targets) != 1:
        raise HTTPException(status_code=422, detail="Choose one group, connected user, or external subject email")
    if payload.usergroup_id:
        group = db.get(UserGroup, payload.usergroup_id)
        if not group or group.org_id != org_id:
            raise HTTPException(status_code=404, detail="Group not found")
    elif payload.user_id:
        membership = db.exec(select(UserOrganization).where(
            UserOrganization.org_id == org_id,
            UserOrganization.user_id == payload.user_id,
        )).first()
        if not membership:
            raise HTTPException(status_code=404, detail="User is not connected to this organization")
    else:
        email = str(payload.subject_email or "").strip().lower()
        if "@" not in email:
            raise HTTPException(status_code=422, detail="A valid subject email is required")
    phases = _program_phases(db, program)
    schedule = _validated_schedule(program, phases, payload)
    # The new assignment flow always supplies a target. Keep older API clients and
    # saved automation working by deriving a target from the phase schedule (or the
    # template's suggested durations) when they omit it.
    scheduled_ends = [item.get("end_date") for item in schedule.get("phases", []) if item.get("end_date")]
    scheduled_due = datetime.fromisoformat(max(scheduled_ends)) if scheduled_ends else None
    legacy_due_date = payload.due_date or scheduled_due
    if not legacy_due_date:
        suggested_weeks = sum(int(phase.get("suggested_duration_weeks") or 4) for phase in phases) or 4
        legacy_due_date = datetime.now(timezone.utc) + timedelta(weeks=suggested_weeks)
    owner_user_id = payload.owner_user_id or current_user.id
    supplied_collaborators = [dict(item) for item in (payload.collaborators or [])]
    staff_ids = list(dict.fromkeys([int(item["user_id"]) for item in supplied_collaborators if item.get("user_id")] or payload.staff_user_ids))
    if owner_user_id not in staff_ids:
        staff_ids.insert(0, owner_user_id)
    if not staff_ids:
        raise HTTPException(status_code=422, detail="Assign at least one staff member")
    if staff_ids:
        memberships = db.exec(select(UserOrganization, Role).join(
            Role, Role.id == UserOrganization.role_id
        ).where(
            UserOrganization.org_id == org_id,
            UserOrganization.user_id.in_(staff_ids),
        )).all()
        eligible_ids = {membership.user_id for membership, role in memberships if _role_can_manage_programs(role)}
        if eligible_ids != set(staff_ids):
            raise HTTPException(status_code=422, detail="Every assigned staff member must have program management permissions")
    owner_membership = db.exec(select(UserOrganization).where(
        UserOrganization.org_id == org_id,
        UserOrganization.user_id == owner_user_id,
    )).first()
    if not owner_membership:
        raise HTTPException(status_code=422, detail="The plan owner must belong to this organization")
    supplied_roles = {int(item["user_id"]): str(item.get("role_key") or program.default_staff_role_key or "reviewer") for item in supplied_collaborators if item.get("user_id")}
    role_keys = {str(item.get("key")) for item in (program.role_definitions or DEFAULT_ROLE_DEFINITIONS)}
    collaborators = []
    for user_id in staff_ids:
        role_key = "plan_admin" if user_id == owner_user_id else supplied_roles.get(user_id, program.default_staff_role_key or "reviewer")
        if role_key not in role_keys or (role_key in {"subject", "plan_admin"} and user_id != owner_user_id):
            raise HTTPException(status_code=422, detail=f"Invalid assignment collaborator role: {role_key}")
        collaborators.append({"user_id": user_id, "role_key": role_key})
    now = _now_string()
    assignment = ProgramAssignment(
        assignment_uuid=f"assignment_{uuid4()}",
        org_id=org_id,
        program_id=program.id,
        usergroup_id=payload.usergroup_id,
        user_id=payload.user_id,
        subject_email=str(payload.subject_email or "").strip().lower() or None,
        program_version=program.version,
        definition_version=1,
        objective_snapshot=_snapshot(db, program),
        welcome_message=payload.welcome_message,
        initiate_date=payload.initiate_date or _now(),
        staff_user_ids=staff_ids,
        collaborators=collaborators,
        schedule=schedule,
        start_date=payload.start_date,
        due_date=legacy_due_date,
        created_by_user_id=current_user.id,
        owner_user_id=owner_user_id,
        creation_date=now,
        update_date=now,
    )
    db.add(assignment)
    db.flush()
    if payload.usergroup_id:
        ensure_group_participants(db, payload.usergroup_id)
    elif payload.user_id:
        db.add(ProgramParticipant(
            participant_uuid=f"participant_{uuid4()}",
            assignment_id=assignment.id,
            org_id=org_id,
            user_id=payload.user_id,
            status=ParticipantStatus.INVITED,
            creation_date=now,
            update_date=now,
        ))
    elif payload.subject_email:
        target = db.exec(select(User).where(User.email == payload.subject_email.strip().lower())).first()
        if target:
            db.add(ProgramParticipant(
                participant_uuid=f"participant_{uuid4()}", assignment_id=assignment.id,
                org_id=org_id, user_id=int(target.id), status=ParticipantStatus.INVITED,
                creation_date=now, update_date=now,
            ))
    db.flush()
    from src.services.planning import materialize_assignment_plans
    materialize_assignment_plans(db, int(assignment.id))
    if payload.subject_email and not db.exec(select(ProgramParticipant.id).where(ProgramParticipant.assignment_id == assignment.id)).first():
        from src.services.planning import materialize_external_assignment_plan
        materialize_external_assignment_plan(db, int(assignment.id), payload.subject_email)
    db.commit()
    return _assignment_summary(db, assignment)


def _progress_map(db: Session, org_id: int, user_ids: list[int], objective_ids: list[int]) -> dict[tuple[int, int], ObjectiveProgress]:
    if not user_ids or not objective_ids:
        return {}
    progresses = db.exec(select(ObjectiveProgress).where(
        ObjectiveProgress.org_id == org_id,
        ObjectiveProgress.user_id.in_(user_ids),
        ObjectiveProgress.objective_id.in_(objective_ids),
    )).all()
    return {(progress.user_id, progress.objective_id): progress for progress in progresses}


def _badge_award_keys(db: Session, user_ids: list[int], objectives: list[dict]) -> set[tuple[int, int]]:
    badge_objectives = [
        item
        for item in objectives
        if item.get("badge_id") and item.get("id")
    ]
    if not user_ids or not badge_objectives:
        return set()
    awards = db.exec(select(LearningBadgeAward).where(
        LearningBadgeAward.user_id.in_(user_ids),
        LearningBadgeAward.badge_id.in_([int(item["badge_id"]) for item in badge_objectives]),
    )).all()
    completed: set[tuple[int, int]] = set()
    for award in awards:
        for objective in badge_objectives:
            required_major = int(objective.get("badge_major_version") or 1)
            if award.badge_id != int(objective["badge_id"]):
                continue
            if award.major_version == required_major or (
                objective.get("accept_previous_major_versions")
                and award.major_version < required_major
            ):
                completed.add((award.user_id, int(objective["id"])))
    return completed


def _assignment_summary(db: Session, assignment: ProgramAssignment) -> dict:
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    assigned_user = db.get(User, assignment.user_id) if assignment.user_id else None
    owner = db.get(User, assignment.owner_user_id) if assignment.owner_user_id else None
    participants = db.exec(select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)).all()
    plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id)).all() if _has_live_plan_tables(db) else []
    staff = db.exec(select(User).where(User.id.in_(assignment.staff_user_ids or []))).all() if assignment.staff_user_ids else []
    user_ids = [participant.user_id for participant in participants]
    objective_ids = [int(item["id"]) for item in (assignment.objective_snapshot or []) if item.get("id")]
    live_objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id.in_([int(plan.id) for plan in plans]))).all() if plans else []
    live_progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id.in_([int(item.id) for item in live_objectives]))).all() if live_objectives else []
    progress_by_objective = {item.plan_objective_id: item for item in live_progress}
    if plans:
        completed = sum(
            1 for objective in live_objectives
            if progress_by_objective.get(int(objective.id))
            and progress_by_objective[int(objective.id)].status == PlanObjectiveStatus.COMPLETED
        )
        ready = sum(1 for item in live_progress if item.status in {PlanObjectiveStatus.SUBMITTED, PlanObjectiveStatus.CHANGES_REQUESTED})
        total = len(live_objectives)
    else:
        legacy_progress = _progress_map(db, assignment.org_id, user_ids, objective_ids)
        badge_awards = _badge_award_keys(db, user_ids, assignment.objective_snapshot or [])
        completed_progress = {key for key, item in legacy_progress.items() if item.status == ObjectiveProgressStatus.COMPLETED}
        completed = len(completed_progress | badge_awards)
        ready = sum(1 for item in legacy_progress.values() if item.status in {ObjectiveProgressStatus.SUBMITTED, ObjectiveProgressStatus.READY_FOR_REVIEW})
        total = len(user_ids) * len(objective_ids)
    lifecycle_counts = {status: 0 for status in ("pending", "active", "completed", "archived")}
    plan_progress: list[int] = []
    for plan in plans:
        status = plan.status.value if hasattr(plan.status, "value") else str(plan.status)
        lifecycle_counts[status] = lifecycle_counts.get(status, 0) + 1
        plan_items = [item for item in live_objectives if item.plan_id == plan.id]
        plan_complete = sum(
            1 for item in plan_items
            if progress_by_objective.get(int(item.id)) and progress_by_objective[int(item.id)].status == PlanObjectiveStatus.COMPLETED
        )
        plan_progress.append(round(plan_complete * 100 / len(plan_items)) if plan_items else 0)
    return {
        "assignment_uuid": assignment.assignment_uuid,
        "org_id": assignment.org_id,
        "program_uuid": program.program_uuid if program else "",
        "program_name": program.name if program else "Deleted program",
        "program_version": assignment.program_version,
        "definition_version": assignment.definition_version,
        "usergroup_id": assignment.usergroup_id,
        "user_id": assignment.user_id,
        "subject_email": assignment.subject_email,
        "welcome_message": assignment.welcome_message,
        "initiate_date": assignment.initiate_date,
        "staff_user_ids": assignment.staff_user_ids or [],
        "collaborators": assignment.collaborators or [],
        "staff": [{
            "id": item.id,
            "username": item.username,
            "first_name": item.first_name,
            "last_name": item.last_name,
            "avatar_image": item.avatar_image,
        } for item in staff],
        "owner": ({
            "id": owner.id,
            "username": owner.username,
            "first_name": owner.first_name,
            "last_name": owner.last_name,
            "avatar_image": owner.avatar_image,
        } if owner else None),
        "schedule": assignment.schedule or {},
        "start_date": assignment.start_date,
        "due_date": assignment.due_date,
        "active": assignment.active,
        "creation_date": assignment.creation_date,
        "cohort": ({
            "id": group.id,
            "uuid": group.usergroup_uuid,
            "name": group.name,
        } if group else None),
        "user": ({
            "id": assigned_user.id,
            "username": assigned_user.username,
            "first_name": assigned_user.first_name,
            "last_name": assigned_user.last_name,
        } if assigned_user else None),
        "learner_count": len(plans) or len(user_ids),
        "plan_count": len(plans),
        "plan_uuid": plans[0].plan_uuid if len(plans) == 1 else None,
        "plan_slug": plans[0].slug if len(plans) == 1 else None,
        "assignment_type": "group" if group else ("external" if assignment.subject_email and not assignment.user_id else "individual"),
        "lifecycle_counts": lifecycle_counts,
        "objective_count": len(objective_ids),
        "completed_count": completed,
        "ready_for_review_count": ready,
        "progress_percent": round((completed / total) * 100) if total else 0,
        "min_progress_percent": min(plan_progress) if plan_progress else 0,
        "max_progress_percent": max(plan_progress) if plan_progress else 0,
    }


def cohort_overview(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int) -> dict:
    require_org_admin(current_user.id, org_id, db)
    group = db.get(UserGroup, usergroup_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    users = db.exec(
        select(User).join(UserGroupUser, UserGroupUser.user_id == User.id).where(UserGroupUser.usergroup_id == usergroup_id)
    ).all()
    assignments = db.exec(select(ProgramAssignment).where(
        ProgramAssignment.usergroup_id == usergroup_id,
        ProgramAssignment.org_id == org_id,
    ).order_by(ProgramAssignment.due_date)).all()
    active_assignments = [assignment for assignment in assignments if assignment.active]
    completed_assignments = [assignment for assignment in assignments if not assignment.active]
    return {
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name, "description": group.description, "thumbnail_image": group.thumbnail_image},
        "learner_count": len(users),
        "programs": [_assignment_summary(db, assignment) for assignment in active_assignments],
        "completed_programs": [_assignment_summary(db, assignment) for assignment in completed_assignments],
    }


def assignment_matrix(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    require_org_membership(current_user.id, org_id, db)
    if not _has_live_plan_tables(db):
        return _legacy_assignment_matrix(db, current_user, org_id, assignment)
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id).order_by(Plan.id)).all()
    accessible_plans = [plan for plan in plans if "view_plan" in plan_capabilities_for(db, plan, current_user.id)]
    if plans and not accessible_plans:
        raise HTTPException(status_code=403, detail="You cannot view this group plan")
    snapshot_by_id = {int(item["id"]): item for item in (assignment.objective_snapshot or []) if item.get("id")}
    shared_columns = [{
        **item,
        "source_objective_id": int(item["id"]),
        "fields": item.get("fields") or item.get("custom_fields") or [],
    } for item in (assignment.objective_snapshot or []) if item.get("id")]
    learner_rows = []
    cell_rows = []
    for plan in accessible_plans:
        user = db.get(User, plan.subject_user_id) if plan.subject_user_id else None
        objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
        progresses = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id.in_([int(item.id) for item in objectives]))).all() if objectives else []
        progress_by_id = {item.plan_objective_id: item for item in progresses}
        invitation = db.exec(select(PlanInvitation).where(PlanInvitation.plan_id == plan.id).order_by(PlanInvitation.id.desc())).first()
        cells = {}
        custom_objectives = []
        for objective in objectives:
            progress = progress_by_id.get(int(objective.id))
            source = snapshot_by_id.get(int(objective.source_objective_id)) if objective.source_objective_id else None
            if not source:
                custom_objectives.append({"plan_objective_uuid": objective.objective_uuid, "title": objective.title, "status": (progress.status.value if progress and hasattr(progress.status, "value") else str(progress.status) if progress else "not_started")})
                continue
            scheduled = next((item for item in (assignment.schedule or {}).get("objectives", []) if item.get("objective_uuid") == source.get("objective_uuid")), {})
            expected_due = scheduled.get("effective_due_date")
            customized = objective.title != (source.get("title") or "Objective") or (str(objective.due_date) if objective.due_date else None) != expected_due
            cell = {
                "plan_uuid": plan.plan_uuid,
                "source_objective_id": int(objective.source_objective_id),
                "plan_objective_uuid": objective.objective_uuid,
                "status": progress.status.value if progress and hasattr(progress.status, "value") else str(progress.status) if progress else "not_started",
                "due_date": objective.due_date,
                "customized": customized,
                "blocked": objective.blocked,
                "field_values": progress.field_values if progress else {},
                "learner_note": progress.subject_note if progress else "",
                "staff_note": progress.reviewer_note if progress else "",
                "feedback_history": progress.feedback_history if progress else [],
                "completed_at": progress.completed_at if progress else None,
            }
            cells[str(objective.source_objective_id)] = cell
            cells[source["objective_uuid"]] = cell
            cell_rows.append(cell)
        lifecycle = plan.status.value if hasattr(plan.status, "value") else str(plan.status)
        invitation_status = invitation.status.value if invitation and hasattr(invitation.status, "value") else str(invitation.status) if invitation else ("accepted" if user else "pending")
        complete = sum(item["status"] == "completed" for key, item in cells.items() if key.isdigit())
        learner_rows.append({
            "id": user.id if user else -int(plan.id),
            "username": user.username if user else (invitation.email if invitation else assignment.subject_email),
            "first_name": user.first_name if user else "",
            "last_name": user.last_name if user else "",
            "avatar_image": user.avatar_image if user else None,
            "plan_uuid": plan.plan_uuid,
            "slug": plan.slug,
            "lifecycle": lifecycle,
            "update_date": plan.update_date,
            "invitation_status": invitation_status,
            "progress_percent": round(complete * 100 / len(shared_columns)) if shared_columns else 0,
            "capabilities": sorted(plan_capabilities_for(db, plan, current_user.id)),
            "custom_objectives": custom_objectives,
            "cells": cells,
        })
    siblings = []
    if assignment.usergroup_id:
        sibling_assignments = db.exec(select(ProgramAssignment).where(
            ProgramAssignment.usergroup_id == assignment.usergroup_id,
            ProgramAssignment.active == True,  # noqa: E712
        )).all()
        siblings = [_assignment_summary(db, sibling) for sibling in sibling_assignments]
    phase_order = list(dict.fromkeys((item.get("phase_uuid") or "legacy") for item in shared_columns))
    phases = [{
        "phase_uuid": phase_uuid,
        "name": next((item.get("phase_name") for item in shared_columns if (item.get("phase_uuid") or "legacy") == phase_uuid), None) or "Phase 1",
        "position": index,
        "due_date": next((item.get("end_date") for item in (assignment.schedule or {}).get("phases", []) if item.get("phase_uuid") == phase_uuid), None),
        "objectives": [item for item in shared_columns if (item.get("phase_uuid") or "legacy") == phase_uuid],
    } for index, phase_uuid in enumerate(phase_order)]
    for objective in shared_columns:
        objective_cells = [learner["cells"].get(objective["objective_uuid"], {}) for learner in learner_rows]
        statuses = [cell.get("status", "not_started") for cell in objective_cells]
        phase_target = next((phase["due_date"] for phase in phases if phase["phase_uuid"] == (objective.get("phase_uuid") or "legacy")), None)
        step_fields = [field for field in (objective.get("fields") or []) if field.get("field_uuid")]
        completion = []
        for cell in objective_cells:
            if not step_fields:
                completion.append(100 if cell.get("status") == "completed" else 0)
                continue
            values = cell.get("field_values") or {}
            percentages = []
            for field in step_fields:
                value = values.get(str(field.get("field_uuid")))
                if field.get("type") == "badge" and isinstance(value, dict):
                    percentages.append(max(0, min(100, int(value.get("progress_percent") or 0))))
                else:
                    percentages.append(100 if bool(value) else 0)
            completion.append(round(sum(percentages) / len(percentages)))
        step_aggregates = {}
        for field in objective.get("fields") or []:
            field_uuid = str(field.get("field_uuid") or "")
            if not field_uuid:
                continue
            percentages = []
            for cell in objective_cells:
                value = (cell.get("field_values") or {}).get(field_uuid)
                if field.get("type") == "badge" and isinstance(value, dict):
                    percentages.append(max(0, min(100, int(value.get("progress_percent") or 0))))
                else:
                    percentages.append(100 if bool(value) else 0)
            step_aggregates[field_uuid] = {
                "min_progress_percent": min(percentages) if percentages else 0,
                "max_progress_percent": max(percentages) if percentages else 0,
            }
        objective["aggregate"] = {
            "learner_count": len(learner_rows),
            "completed_count": sum(status == "completed" for status in statuses),
            "review_count": sum(status == "submitted" for status in statuses),
            "blocked_count": sum(bool(cell.get("blocked")) for cell in objective_cells),
            "overdue_count": sum(
                bool(phase_target and str(phase_target)[:10] < _now().date().isoformat() and status not in {"completed", "canceled"})
                for status in statuses
            ),
            "min_progress_percent": min(completion) if completion else 0,
            "max_progress_percent": max(completion) if completion else 0,
            "steps": step_aggregates,
        }
    return {
        "assignment": _assignment_summary(db, assignment),
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "program": _program_dict(db, program, include_objectives=False) if program else None,
        "programs": siblings,
        "batch": _assignment_summary(db, assignment),
        "shared_columns": shared_columns,
        "phases": phases,
        "definition_version": assignment.definition_version,
        "plans": learner_rows,
        "cells": cell_rows,
        "objectives": shared_columns,
        "learners": learner_rows,
    }


def _require_assignment_lifecycle_capability(
    db: Session,
    current_user: PublicUser,
    assignment: ProgramAssignment,
    capability: str,
) -> list[Plan]:
    require_org_membership(current_user.id, assignment.org_id, db)
    plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id)).all() if _has_live_plan_tables(db) else []
    if current_user.is_superadmin or is_org_admin(current_user.id, assignment.org_id, db):
        return plans
    if plans and all(capability in plan_capabilities_for(db, plan, current_user.id) for plan in plans):
        return plans
    if not plans and (current_user.id == assignment.owner_user_id or current_user.id in (assignment.staff_user_ids or [])):
        return plans
    raise HTTPException(status_code=403, detail="Your group plan role cannot manage this assignment")


def change_assignment_status(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
    status: PlanStatus,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    if not assignment.usergroup_id:
        raise HTTPException(status_code=422, detail="Group lifecycle actions require a group assignment")
    permission = "complete_plan" if status in {PlanStatus.COMPLETED, PlanStatus.ACTIVE} else "archive_plan"
    plans = _require_assignment_lifecycle_capability(db, current_user, assignment, permission)
    now = _now()
    now_string = now.isoformat()
    for plan in plans:
        plan.status = status
        plan.completed_at = now if status == PlanStatus.COMPLETED else None
        plan.update_date = now_string
        db.add(plan)
    assignment.active = status == PlanStatus.ACTIVE
    assignment.update_date = now_string
    db.add(assignment)
    db.commit()
    return {
        "assignment_uuid": assignment.assignment_uuid,
        "status": status.value,
        "affected_plan_count": len(plans),
    }


def delete_assignment(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    if not assignment.usergroup_id:
        raise HTTPException(status_code=422, detail="Group deletion requires a group assignment")
    plans = _require_assignment_lifecycle_capability(db, current_user, assignment, "edit_structure")
    affected_plan_count = len(plans)
    for plan in plans:
        db.delete(plan)
    participants = db.exec(select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)).all()
    for participant in participants:
        db.delete(participant)
    db.flush()
    db.delete(assignment)
    db.commit()
    return {
        "deleted": True,
        "assignment_uuid": assignment_uuid,
        "affected_plan_count": affected_plan_count,
    }


def _legacy_assignment_matrix(db: Session, current_user: PublicUser, org_id: int, assignment: ProgramAssignment) -> dict:
    if not is_org_admin(current_user.id, org_id, db) and current_user.id not in (assignment.staff_user_ids or []):
        raise HTTPException(status_code=403, detail="You cannot view this program assignment")
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    participants = db.exec(select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)).all()
    participant_by_user = {participant.user_id: participant for participant in participants}
    users = db.exec(select(User).where(User.id.in_(list(participant_by_user)))).all() if participants else []
    objective_ids = [int(item["id"]) for item in (assignment.objective_snapshot or []) if item.get("id")]
    progress = _progress_map(db, org_id, list(participant_by_user), objective_ids)
    badge_awards = _badge_award_keys(db, list(participant_by_user), assignment.objective_snapshot or [])
    rows = []
    for user in users:
        participant = participant_by_user[user.id]
        cells = {}
        for objective in assignment.objective_snapshot or []:
            item = progress.get((user.id, int(objective["id"])))
            cells[objective["objective_uuid"]] = {
                "status": "completed" if (user.id, int(objective["id"])) in badge_awards else ((item.status.value if hasattr(item.status, "value") else item.status) if item else "not_started"),
                "evidence": item.evidence if item else [], "learner_note": item.learner_note if item else "",
                "staff_note": item.staff_note if item else "", "feedback_history": item.feedback_history if item else [],
                "completed_at": item.completed_at if item else None,
            }
        rows.append({"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image, "invitation_status": participant.status.value if hasattr(participant.status, "value") else participant.status, "cells": cells})
    siblings = []
    if assignment.usergroup_id:
        sibling_assignments = db.exec(select(ProgramAssignment).where(ProgramAssignment.usergroup_id == assignment.usergroup_id, ProgramAssignment.active == True)).all()  # noqa: E712
        siblings = [_assignment_summary(db, sibling) for sibling in sibling_assignments]
    return {"assignment": _assignment_summary(db, assignment), "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None, "program": _program_dict(db, program, include_objectives=False) if program else None, "programs": siblings, "objectives": assignment.objective_snapshot or [], "learners": rows}


def _require_assignment_reviewer(
    db: Session, current_user: PublicUser, assignment: ProgramAssignment
) -> None:
    require_org_membership(current_user.id, assignment.org_id, db)
    if _has_live_plan_tables(db):
        plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id)).all()
        if any("edit_structure" in plan_capabilities_for(db, plan, current_user.id) for plan in plans):
            return
        if plans and not current_user.is_superadmin:
            raise HTTPException(status_code=403, detail="Your group plan role cannot edit its definition")
    assigned = set(assignment.staff_user_ids or [])
    if current_user.id not in assigned and not current_user.is_superadmin:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to review this program",
        )


def update_assignment_objective(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
    objective_uuid: str,
    payload: ProgramAssignmentObjectiveUpdate,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    _require_assignment_reviewer(db, current_user, assignment)
    if not assignment.usergroup_id:
        raise HTTPException(status_code=422, detail="Batch definition editing is only used for group assignments")
    if payload.definition_version != assignment.definition_version:
        raise HTTPException(status_code=409, detail="This group plan changed in another session. Refresh before saving.")
    snapshots = [dict(item) for item in (assignment.objective_snapshot or [])]
    snapshot = next((item for item in snapshots if item.get("objective_uuid") == objective_uuid), None)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Group objective not found")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Objective title is required")
    fields = _validated_steps(db, payload.fields)
    plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id)).all() if _has_live_plan_tables(db) else []
    plan_objectives = db.exec(select(PlanObjective).where(
        PlanObjective.plan_id.in_([int(plan.id) for plan in plans]),
        PlanObjective.source_objective_id == snapshot.get("id"),
    )).all() if plans else []
    progresses = db.exec(select(PlanObjectiveProgress).where(
        PlanObjectiveProgress.plan_objective_id.in_([int(item.id) for item in plan_objectives])
    )).all() if plan_objectives else []
    old_fields = snapshot.get("fields") or snapshot.get("custom_fields") or []
    if fields != old_fields and any(item.status == PlanObjectiveStatus.COMPLETED for item in progresses):
        raise HTTPException(status_code=409, detail="Reopen completed group objectives before changing supporting steps")
    now = _now_string()
    before = {"title": snapshot.get("title"), "description": snapshot.get("description"), "fields": old_fields}
    snapshot.update(title=title, description=payload.description, custom_fields=fields, fields=fields, allow_learner_confirmation=not payload.completion_restricted, default_allow_late=payload.allow_late)
    for item in plan_objectives:
        item.title = title
        item.description = payload.description
        item.fields = fields
        item.completion_restricted = payload.completion_restricted
        item.allow_late = payload.allow_late
        item.update_date = now
        db.add(item)
    assignment.objective_snapshot = snapshots
    assignment.definition_version += 1
    assignment.definition_audit = [*(assignment.definition_audit or []), {"version": assignment.definition_version, "objective_uuid": objective_uuid, "actor_user_id": current_user.id, "before": before, "changed_at": now}]
    assignment.update_date = now
    db.add(assignment)
    db.commit()
    return {"assignment_uuid": assignment.assignment_uuid, "definition_version": assignment.definition_version, "affected_plan_count": len(plans)}


def assignment_reviews(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    require_org_membership(current_user.id, org_id, db)
    live_plans = db.exec(select(Plan).where(Plan.source_assignment_id == assignment.id)).all() if _has_live_plan_tables(db) else []
    reviewable_plans = [plan for plan in live_plans if "complete_restricted_objectives" in plan_capabilities_for(db, plan, current_user.id)]
    reviews = []
    for plan in reviewable_plans:
        user = db.get(User, plan.subject_user_id) if plan.subject_user_id else None
        objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all()
        if not objectives:
            continue
        progresses = db.exec(select(PlanObjectiveProgress).where(
            PlanObjectiveProgress.plan_objective_id.in_([int(item.id) for item in objectives]),
            PlanObjectiveProgress.status == PlanObjectiveStatus.SUBMITTED,
        )).all()
        objective_by_id = {int(item.id): item for item in objectives}
        for progress in progresses:
            objective = objective_by_id[int(progress.plan_objective_id)]
            source = next((item for item in (assignment.objective_snapshot or []) if item.get("id") == objective.source_objective_id), None)
            reviews.append({
                "review_type": "objective",
                "progress_uuid": progress.progress_uuid,
                "plan_uuid": plan.plan_uuid,
                "plan_objective_uuid": objective.objective_uuid,
                "objective": {**(source or {}), "objective_uuid": (source or {}).get("objective_uuid") or objective.objective_uuid, "title": objective.title},
                "user": ({"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image} if user else {"id": -int(plan.id), "username": "External learner"}),
                "status": progress.status.value if hasattr(progress.status, "value") else str(progress.status),
                "learner_note": progress.subject_note,
                "evidence": list((progress.field_values or {}).values()),
                "feedback_history": progress.feedback_history or [],
                "submitted_at": progress.update_date,
            })
    reviews.sort(key=lambda item: item.get("submitted_at") or "")
    participants = db.exec(
        select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)
    ).all()
    user_ids = [item.user_id for item in participants]
    objective_by_id = {
        int(item["id"]): item
        for item in (assignment.objective_snapshot or [])
        if item.get("id")
    }
    progresses = db.exec(
        select(ObjectiveProgress).where(
            ObjectiveProgress.org_id == org_id,
            ObjectiveProgress.user_id.in_(user_ids),
            ObjectiveProgress.objective_id.in_(list(objective_by_id)),
            ObjectiveProgress.status.in_([
                ObjectiveProgressStatus.SUBMITTED,
                ObjectiveProgressStatus.READY_FOR_REVIEW,
            ]),
        )
    ).all() if user_ids and objective_by_id else []
    users = {
        item.id: item
        for item in db.exec(select(User).where(User.id.in_(user_ids))).all()
    }
    legacy_reviews = []
    for progress in progresses:
        user = users.get(progress.user_id)
        objective = objective_by_id.get(progress.objective_id)
        if not user or not objective:
            continue
        legacy_reviews.append({
            "review_type": "objective",
            "progress_uuid": progress.progress_uuid,
            "objective": objective,
            "user": {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "avatar_image": user.avatar_image,
            },
            "status": progress.status.value if hasattr(progress.status, "value") else progress.status,
            "learner_note": progress.learner_note,
            "evidence": progress.evidence or [],
            "feedback_history": progress.feedback_history or [],
            "submitted_at": progress.update_date,
        })
    if not live_plans:
        reviews = legacy_reviews
    activity_reviews = _assignment_activity_reviews(db, assignment, users)
    return {
        "assignment_uuid": assignment_uuid,
        "objective_reviews": reviews,
        "activity_reviews": activity_reviews,
    }


def _assignment_activity_reviews(
    db: Session,
    assignment: ProgramAssignment,
    users: dict[int, User],
) -> list[dict]:
    participant_ids = set(users)
    badge_ids = {
        int(item["badge_id"])
        for item in (assignment.objective_snapshot or [])
        if item.get("badge_id")
    }
    runs = db.exec(select(LearningRun).where(
        LearningRun.user_id.in_(participant_ids),  # type: ignore
        LearningRun.badge_id.in_(badge_ids),  # type: ignore
    )).all() if participant_ids and badge_ids else []
    if not runs:
        return []
    run_ids = [run.id for run in runs if run.id]
    attempts = db.exec(
        select(LearningResponseAttempt)
        .where(LearningResponseAttempt.run_id.in_(run_ids))
        .order_by(LearningResponseAttempt.submitted_at.asc())  # type: ignore
    ).all()
    latest_by_run_page = {
        (attempt.run_id, attempt.page_id): attempt for attempt in attempts
    }
    page_ids = {page_id for _, page_id in latest_by_run_page}
    pages = {
        page.id: page
        for page in db.exec(select(LearningPage).where(LearningPage.id.in_(page_ids))).all()
    } if page_ids else {}
    activity_ids = {page.activity_id for page in pages.values()}
    activities = {
        activity.id: activity
        for activity in db.exec(
            select(LearningActivity).where(LearningActivity.id.in_(activity_ids))
        ).all()
    } if activity_ids else {}
    badges = {
        badge.id: badge
        for badge in db.exec(
            select(LearningBadge).where(
                LearningBadge.id.in_({run.badge_id for run in runs})
            )
        ).all()
    }
    grouped: dict[tuple[int, int], list[tuple[LearningPage, LearningResponseAttempt]]] = {}
    for (run_id, page_id), attempt in latest_by_run_page.items():
        page = pages.get(page_id)
        if page:
            grouped.setdefault((run_id, page.activity_id), []).append((page, attempt))
    run_by_id = {run.id: run for run in runs}
    result = []
    for (run_id, activity_id), rows in grouped.items():
        pending = [
            (page, attempt)
            for page, attempt in rows
            if (attempt.result or {}).get("grading_status") == "pending"
        ]
        if not pending:
            continue
        run = run_by_id.get(run_id)
        activity = activities.get(activity_id)
        user = users.get(run.user_id) if run else None
        badge = badges.get(run.badge_id) if run else None
        if not run or not activity or not user:
            continue
        history_rows = [
            (pages[attempt.page_id], attempt)
            for attempt in attempts
            if attempt.run_id == run_id
            and attempt.page_id in pages
            and pages[attempt.page_id].activity_id == activity_id
        ]
        auto_score = sum(
            float(attempt.score or 0)
            for _, attempt in rows
            if (attempt.result or {}).get("grading_status") == "graded"
        )
        max_score = sum(float((attempt.result or {}).get("max_score") or 0) for _, attempt in rows)
        pending_max = sum(
            sum(
                float(question.get("max_score") or question.get("points") or 0)
                for question in ((attempt.result or {}).get("questions") or {}).values()
                if question.get("grading_status") == "pending"
            )
            for _, attempt in pending
        )
        result.append({
            "review_type": "activity",
            "review_id": f"{run.run_uuid}:{activity.activity_uuid}",
            "run_uuid": run.run_uuid,
            "plan_uuid": db.get(Plan, run.plan_id).plan_uuid if run.plan_id and db.get(Plan, run.plan_id) else None,
            "user": {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "avatar_image": user.avatar_image,
            },
            "badge": {
                "id": badge.id,
                "badge_uuid": badge.badge_uuid,
                "name": badge.name,
            } if badge else None,
            "activity": activity.model_dump(),
            "attempts": [{
                **attempt.model_dump(),
                "page": page.model_dump(),
            } for page, attempt in rows],
            "attempt_history": [{
                **attempt.model_dump(),
                "page": page.model_dump(),
            } for page, attempt in history_rows],
            "pending_attempt_uuids": [attempt.attempt_uuid for _, attempt in pending],
            "auto_score": auto_score,
            "pending_max_score": pending_max,
            "max_score": max_score,
            "minimum_score_percent": float((activity.settings or {}).get("grading", {}).get("minimum_score_percent", 70)),
            "submitted_at": max(attempt.submitted_at for _, attempt in pending),
        })
    result.sort(key=lambda item: item["submitted_at"])
    return result


def review_objective_submission(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
    payload: ObjectiveReviewDecision,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    require_org_membership(current_user.id, org_id, db)
    if payload.action not in {"confirm", "flag"}:
        raise HTTPException(status_code=422, detail="Action must be confirm or flag")
    if payload.action == "flag" and not payload.message.strip():
        raise HTTPException(status_code=422, detail="Tell the learner what needs to change")
    if payload.plan_uuid or payload.plan_objective_uuid:
        plan = db.exec(select(Plan).where(
            Plan.source_assignment_id == assignment.id,
            Plan.plan_uuid == payload.plan_uuid,
        )).first() if payload.plan_uuid else None
        plan_objective = db.exec(select(PlanObjective).where(
            PlanObjective.objective_uuid == payload.plan_objective_uuid,
        )).first() if payload.plan_objective_uuid else None
        if not plan and plan_objective:
            plan = db.get(Plan, plan_objective.plan_id)
        if not plan or not plan_objective or plan_objective.plan_id != plan.id or plan.source_assignment_id != assignment.id:
            raise HTTPException(status_code=404, detail="Plan objective not found in this assignment")
        if "complete_restricted_objectives" not in plan_capabilities_for(db, plan, current_user.id):
            raise HTTPException(status_code=403, detail="You cannot review this plan")
        progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == plan_objective.id)).first()
        if not progress or progress.status != PlanObjectiveStatus.SUBMITTED:
            raise HTTPException(status_code=409, detail="This submission is no longer waiting for review")
        now = _now()
        history = list(progress.feedback_history or [])
        if payload.message.strip():
            history.append({"message": payload.message.strip(), "action": "confirmed" if payload.action == "confirm" else "changes_requested", "created_at": now.isoformat(), "staff_user_id": current_user.id})
        progress.status = PlanObjectiveStatus.COMPLETED if payload.action == "confirm" else PlanObjectiveStatus.CHANGES_REQUESTED
        progress.completed_at = now if payload.action == "confirm" else None
        progress.reviewer_note = payload.message.strip()
        progress.feedback_history = history
        progress.updated_by_user_id = current_user.id
        progress.update_date = now.isoformat()
        db.add(progress)
        db.commit()
        return {"plan_uuid": plan.plan_uuid, "plan_objective_uuid": plan_objective.objective_uuid, "status": progress.status.value}

    _require_assignment_reviewer(db, current_user, assignment)
    objective = db.exec(
        select(Objective).where(
            Objective.objective_uuid == payload.objective_uuid,
            Objective.org_id == org_id,
        )
    ).first()
    if not objective or not any(
        item.get("objective_uuid") == payload.objective_uuid
        for item in (assignment.objective_snapshot or [])
    ):
        raise HTTPException(status_code=404, detail="Objective not found in this assignment")
    participant = db.exec(
        select(ProgramParticipant).where(
            ProgramParticipant.assignment_id == assignment.id,
            ProgramParticipant.user_id == payload.user_id,
        )
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Learner is not in this assignment")
    progress = db.exec(
        select(ObjectiveProgress).where(
            ObjectiveProgress.org_id == org_id,
            ObjectiveProgress.objective_id == objective.id,
            ObjectiveProgress.user_id == payload.user_id,
        )
    ).first()
    if not progress or progress.status not in {
        ObjectiveProgressStatus.SUBMITTED,
        ObjectiveProgressStatus.READY_FOR_REVIEW,
    }:
        raise HTTPException(status_code=409, detail="This submission is no longer waiting for review")
    now = _now()
    history = list(progress.feedback_history or [])
    organization = db.get(Organization, org_id)
    attribution = {
        "staff_user_id": current_user.id,
        "staff_name": " ".join(filter(None, [current_user.first_name, current_user.last_name])) or current_user.username,
        "org_id": org_id,
        "org_name": organization.name if organization else "Unknown organization",
    }
    if payload.action == "confirm":
        progress.status = ObjectiveProgressStatus.COMPLETED
        progress.completed_at = now
        progress.completed_by_user_id = current_user.id
        if payload.message.strip():
            progress.staff_note = payload.message.strip()
            history.append({
                "message": payload.message.strip(),
                "action": "confirmed",
                "created_at": now.isoformat(),
                **attribution,
            })
    else:
        message = payload.message.strip()
        progress.status = ObjectiveProgressStatus.FLAGGED
        progress.staff_note = message
        progress.completed_at = None
        progress.completed_by_user_id = None
        history.append({
            "message": message,
            "action": "flagged",
            "created_at": now.isoformat(),
            **attribution,
        })
    progress.feedback_history = history
    progress.update_date = now.isoformat()
    db.add(progress)
    db.commit()
    return {
        "objective_uuid": payload.objective_uuid,
        "user_id": payload.user_id,
        "status": progress.status.value if hasattr(progress.status, "value") else progress.status,
        "feedback_history": history,
    }


def update_progress(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    objective_uuid: str,
    user_ids: list[int],
    status: ObjectiveProgressStatus,
    staff_note: str,
    evidence: list[dict] | None,
    completion_date: datetime | None,
    plan_uuids: list[str] | None = None,
    override_customized: bool = False,
    field_values: dict | None = None,
) -> list[dict]:
    require_org_membership(current_user.id, org_id, db)
    objective = db.exec(select(Objective).where(
        Objective.objective_uuid == objective_uuid,
        Objective.org_id == org_id,
    )).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    now = _now()
    live_statement = (
        select(PlanObjective, Plan)
        .join(Plan, Plan.id == PlanObjective.plan_id)
        .where(
            Plan.source_org_id == org_id,
            PlanObjective.source_objective_id == objective.id,
        )
    )
    if plan_uuids:
        live_statement = live_statement.where(Plan.plan_uuid.in_(list(set(plan_uuids))))
    else:
        live_statement = live_statement.where(Plan.subject_user_id.in_(list(set(user_ids))))
    live_objectives = db.exec(live_statement).all() if _has_live_plan_tables(db) else []
    results = []
    for live_objective, plan in live_objectives:
        capabilities = plan_capabilities_for(db, plan, current_user.id)
        if not ({"complete_restricted_objectives", "update_progress"} & capabilities):
            continue
        if status == ObjectiveProgressStatus.COMPLETED and live_objective.completion_restricted and "complete_restricted_objectives" not in capabilities:
            continue
        source_assignment = db.get(ProgramAssignment, plan.source_assignment_id) if plan.source_assignment_id else None
        source_snapshot = next((item for item in (source_assignment.objective_snapshot or []) if item.get("id") == live_objective.source_objective_id), None) if source_assignment else None
        scheduled = next((item for item in (source_assignment.schedule or {}).get("objectives", []) if source_snapshot and item.get("objective_uuid") == source_snapshot.get("objective_uuid")), {}) if source_assignment else {}
        customized = bool(source_snapshot) and (
            live_objective.title != (source_snapshot.get("title") or "Objective")
            or (str(live_objective.due_date) if live_objective.due_date else None) != scheduled.get("effective_due_date")
        )
        if customized and not override_customized:
            results.append({"plan_uuid": plan.plan_uuid, "plan_objective_uuid": live_objective.objective_uuid, "status": "skipped", "reason": "customized"})
            continue
        progress = db.exec(select(PlanObjectiveProgress).where(
            PlanObjectiveProgress.plan_objective_id == live_objective.id,
        )).first()
        if not progress:
            progress = PlanObjectiveProgress(
                progress_uuid=f"plan_progress_{uuid4()}",
                plan_objective_id=int(live_objective.id),
                creation_date=now.isoformat(),
                update_date=now.isoformat(),
            )
        status_value = status.value if hasattr(status, "value") else str(status)
        progress.status = PlanObjectiveStatus(status_value)
        progress.reviewer_note = staff_note
        if field_values is not None:
            progress.field_values = dict(field_values)
        if evidence is not None:
            values = dict(progress.field_values or {})
            values["batch_evidence"] = evidence
            progress.field_values = values
        progress.completed_at = (completion_date or now) if status_value == "completed" else None
        progress.updated_by_user_id = current_user.id
        progress.update_date = now.isoformat()
        db.add(progress)
        results.append({
            "user_id": plan.subject_user_id,
            "plan_uuid": plan.plan_uuid,
            "plan_objective_uuid": live_objective.objective_uuid,
            "source_objective_id": objective.id,
            "status": status_value,
        })
    if live_objectives:
        if not results:
            raise HTTPException(status_code=403, detail="You cannot update the selected plans")
        db.commit()
        return results
    if plan_uuids and _has_live_plan_tables(db):
        raise HTTPException(status_code=404, detail="No selected plans contain this objective")

    # Compatibility for assignments created before live plans were materialized.
    require_org_admin(current_user.id, org_id, db)
    for user_id in set(user_ids):
        progress = db.exec(select(ObjectiveProgress).where(
            ObjectiveProgress.org_id == org_id,
            ObjectiveProgress.objective_id == objective.id,
            ObjectiveProgress.user_id == user_id,
        )).first()
        if not progress:
            progress = ObjectiveProgress(
                progress_uuid=f"progress_{uuid4()}", org_id=org_id, objective_id=objective.id,
                user_id=user_id, creation_date=now.isoformat(), update_date=now.isoformat(),
            )
        progress.status = status
        progress.staff_note = staff_note
        if evidence is not None:
            progress.evidence = evidence
        progress.completed_at = (completion_date or now) if status == ObjectiveProgressStatus.COMPLETED else None
        progress.completed_by_user_id = current_user.id if status == ObjectiveProgressStatus.COMPLETED else None
        progress.update_date = now.isoformat()
        db.add(progress)
        results.append({"user_id": user_id, "objective_uuid": objective_uuid, "status": status.value})
    db.commit()
    return results


def user_program_overview(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    require_org_membership(current_user.id, org_id, db)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    participants = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.org_id == org_id,
        ProgramParticipant.user_id == user_id,
    )).all()
    assignments = [db.get(ProgramAssignment, participant.assignment_id) for participant in participants]
    assignments = [
        assignment
        for assignment in assignments
        if assignment and (
            is_org_admin(current_user.id, org_id, db)
            or current_user.id in (assignment.staff_user_ids or [])
        )
    ]
    participant_by_assignment = {participant.assignment_id: participant for participant in participants}
    items = []
    for assignment in assignments:
        participant = participant_by_assignment[assignment.id]
        summary = _assignment_summary(db, assignment)
        group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
        summary.update({
            "participant_uuid": participant.participant_uuid,
            "invitation_status": participant.status.value if hasattr(participant.status, "value") else participant.status,
            "cohort": {"id": group.id, "name": group.name} if group else None,
        })
        items.append(summary)
    return {"user": {"id": user.id, "username": user.username}, "programs": items}


def _my_programs_for_org(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    participants = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.org_id == org_id,
        ProgramParticipant.user_id == current_user.id,
    )).all()
    result = []
    for participant in participants:
        assignment = db.get(ProgramAssignment, participant.assignment_id)
        if not assignment:
            continue
        if assignment.initiate_date:
            initiate_date = assignment.initiate_date
            if initiate_date.tzinfo is None:
                initiate_date = initiate_date.replace(tzinfo=timezone.utc)
            if initiate_date.date() > _now().date():
                continue
        program = db.get(Program, assignment.program_id)
        objective_ids = [int(item["id"]) for item in assignment.objective_snapshot or [] if item.get("id")]
        progress = _progress_map(db, org_id, [current_user.id], objective_ids)
        badge_awards = _badge_award_keys(db, [current_user.id], assignment.objective_snapshot or [])
        objectives = []
        schedule_by_objective = {item.get("objective_uuid"): item for item in (assignment.schedule or {}).get("objectives", [])}
        for snapshot in assignment.objective_snapshot or []:
            item = progress.get((current_user.id, int(snapshot["id"])))
            earned_badge = (current_user.id, int(snapshot["id"])) in badge_awards
            objective_schedule = schedule_by_objective.get(snapshot["objective_uuid"], {})
            effective_start = objective_schedule.get("effective_start_date")
            effective_due = objective_schedule.get("effective_due_date")
            available = not effective_start or effective_start <= _now().date().isoformat()
            late = bool(effective_due and effective_due < _now().date().isoformat())
            badge = db.get(LearningBadge, int(snapshot["badge_id"])) if snapshot.get("badge_id") else None
            objectives.append({**snapshot, **({"badge_uuid": badge.badge_uuid, "badge_name": badge.name} if badge else {}), "schedule": objective_schedule, "can_start": available, "is_late": late, "progress": {
                "status": "completed" if earned_badge else ((item.status.value if hasattr(item.status, "value") else item.status) if item else "not_started"),
                "evidence": item.evidence if item else [],
                "learner_note": item.learner_note if item else "",
                "staff_note": item.staff_note if item else "",
                "feedback_history": item.feedback_history if item else [],
            }})
        status = participant.status.value if hasattr(participant.status, "value") else participant.status
        if status == ParticipantStatus.ACTIVE.value and not assignment.active:
            status = ParticipantStatus.COMPLETED.value
        assignment_summary = _assignment_summary(db, assignment)
        enrollment = {
            "participant_uuid": participant.participant_uuid,
            "status": status,
            "viewed_at": participant.viewed_at,
            "responded_at": participant.responded_at,
            "created_at": participant.creation_date,
        }
        result.append({
            "participant_uuid": participant.participant_uuid,
            "status": status,
            "created_at": participant.creation_date,
            "program": _program_dict(db, program, include_objectives=False) if program else None,
            "assignment": assignment_summary,
            "objectives": objectives,
            "enrollment": enrollment,
            "run": assignment_summary,
        })
    return result


def my_programs(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_membership(current_user.id, org_id, db)
    return _my_programs_for_org(db, current_user, org_id)


def _learner_program_enrollments(db: Session, current_user: PublicUser) -> list[dict]:
    participants = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.user_id == current_user.id,
    )).all()
    result = []
    for org_id in sorted({participant.org_id for participant in participants}):
        organization = db.get(Organization, org_id)
        if not organization:
            continue
        for item in _my_programs_for_org(db, current_user, org_id):
            if not item["program"]:
                continue
            item["organization"] = {
                "id": organization.id,
                "org_uuid": organization.org_uuid,
                "name": organization.name,
                "slug": organization.slug,
                "logo_image": organization.logo_image,
            }
            result.append(item)
    return result


def _ordered_enrollments(items: list[dict]) -> list[dict]:
    status_priority = {
        ParticipantStatus.ACTIVE.value: 0,
        ParticipantStatus.INVITED.value: 1,
        ParticipantStatus.COMPLETED.value: 2,
        ParticipantStatus.DECLINED.value: 3,
        ParticipantStatus.LEFT.value: 4,
    }
    newest_first = sorted(items, key=lambda item: item["created_at"] or "", reverse=True)
    return sorted(newest_first, key=lambda item: status_priority.get(item["status"], 99))


def my_programs_all(db: Session, current_user: PublicUser) -> list[dict]:
    by_program: dict[str, list[dict]] = {}
    for item in _learner_program_enrollments(db, current_user):
        by_program.setdefault(item["program"]["slug"], []).append(item)
    result = []
    for enrollments in by_program.values():
        ordered = _ordered_enrollments(enrollments)
        current = ordered[0]
        current["enrollment_count"] = len(ordered)
        result.append(current)
    return sorted(result, key=lambda item: item["created_at"] or "", reverse=True)


def _program_detail(enrollments: list[dict], participant_uuid: str | None = None) -> dict:
    if not enrollments:
        raise HTTPException(status_code=404, detail="Program enrollment not found")
    ordered = _ordered_enrollments(enrollments)
    for item in ordered:
        item["enrollment_count"] = len(ordered)
    current = next(
        (item for item in ordered if item["participant_uuid"] == participant_uuid),
        ordered[0],
    )
    return {
        "program": ordered[0]["program"],
        "organization": ordered[0]["organization"],
        "current_enrollment": current,
        "enrollments": ordered,
    }


def my_program_detail(db: Session, current_user: PublicUser, program_slug: str) -> dict:
    program = db.exec(select(Program).where(Program.slug == program_slug)).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program enrollment not found")
    organization = db.get(Organization, program.org_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Program enrollment not found")
    enrollments = [
        item for item in _my_programs_for_org(db, current_user, program.org_id)
        if item["program"] and item["program"]["program_uuid"] == program.program_uuid
    ]
    organization_summary = {
        "id": organization.id,
        "org_uuid": organization.org_uuid,
        "name": organization.name,
        "slug": organization.slug,
        "logo_image": organization.logo_image,
    }
    for item in enrollments:
        item["organization"] = organization_summary
    return _program_detail(enrollments)


def my_enrollment_detail(db: Session, current_user: PublicUser, participant_uuid: str) -> dict:
    participant = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.participant_uuid == participant_uuid,
        ProgramParticipant.user_id == current_user.id,
    )).first()
    assignment = db.get(ProgramAssignment, participant.assignment_id) if participant else None
    program = db.get(Program, assignment.program_id) if assignment else None
    if not participant or not assignment or not program:
        raise HTTPException(status_code=404, detail="Program enrollment not found")
    detail = my_program_detail(db, current_user, program.slug)
    return _program_detail(detail["enrollments"], participant_uuid)


def my_program_summaries(db: Session, current_user: PublicUser) -> list[dict]:
    participants = db.exec(
        select(ProgramParticipant).where(
            ProgramParticipant.user_id == current_user.id,
            ProgramParticipant.status.in_([ParticipantStatus.INVITED, ParticipantStatus.ACTIVE]),
        )
    ).all()
    result = []
    for participant in participants:
        assignment = db.get(ProgramAssignment, participant.assignment_id)
        if not assignment:
            continue
        if assignment.initiate_date:
            initiate_date = assignment.initiate_date
            if initiate_date.tzinfo is None:
                initiate_date = initiate_date.replace(tzinfo=timezone.utc)
            if initiate_date.date() > _now().date():
                continue
        program = db.get(Program, assignment.program_id)
        organization = db.get(Organization, assignment.org_id)
        group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
        if not program or not organization:
            continue
        status = participant.status.value if hasattr(participant.status, "value") else participant.status
        result.append({
            "participant_uuid": participant.participant_uuid,
            "org_id": assignment.org_id,
            "status": status,
            "unread": status == ParticipantStatus.INVITED.value and participant.viewed_at is None,
            "viewed_at": participant.viewed_at.isoformat() if participant.viewed_at else None,
            "created_at": participant.creation_date,
            "organization": {
                "id": organization.id,
                "org_uuid": organization.org_uuid,
                "name": organization.name,
                "slug": organization.slug,
                "logo_image": organization.logo_image,
            },
            "program": {
                "program_uuid": program.program_uuid,
                "slug": program.slug,
                "name": program.name,
                "description": program.description,
                "thumbnail_image": program.thumbnail_image,
            },
            "group": {"id": group.id, "name": group.name} if group else None,
            "assignment": {
                "assignment_uuid": assignment.assignment_uuid,
                "welcome_message": assignment.welcome_message,
                "initiate_date": assignment.initiate_date,
                "start_date": assignment.start_date,
                "due_date": assignment.due_date,
                "active": assignment.active,
            },
        })
    return sorted(result, key=lambda item: item["created_at"] or "", reverse=True)


def mark_my_program_invitations_viewed(db: Session, current_user: PublicUser) -> dict:
    participants = db.exec(
        select(ProgramParticipant).where(
            ProgramParticipant.user_id == current_user.id,
            ProgramParticipant.status == ParticipantStatus.INVITED,
            ProgramParticipant.viewed_at.is_(None),
        )
    ).all()
    now = _now()
    updated = 0
    for participant in participants:
        assignment = db.get(ProgramAssignment, participant.assignment_id)
        if not assignment:
            continue
        initiate_date = assignment.initiate_date
        if initiate_date and initiate_date.tzinfo is None:
            initiate_date = initiate_date.replace(tzinfo=timezone.utc)
        if initiate_date and initiate_date.date() > now.date():
            continue
        participant.viewed_at = now
        participant.update_date = now.isoformat()
        db.add(participant)
        updated += 1
    db.commit()
    return {"detail": "Program invitations marked as viewed", "updated": updated}


def respond_to_invitation(db: Session, current_user: PublicUser, org_id: int, participant_uuid: str, accept: bool) -> dict:
    require_org_membership(current_user.id, org_id, db)
    participant = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.participant_uuid == participant_uuid,
        ProgramParticipant.org_id == org_id,
        ProgramParticipant.user_id == current_user.id,
    )).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Program invitation not found")
    assignment = db.get(ProgramAssignment, participant.assignment_id)
    if assignment and assignment.initiate_date:
        initiate_date = assignment.initiate_date
        if initiate_date.tzinfo is None:
            initiate_date = initiate_date.replace(tzinfo=timezone.utc)
        if initiate_date.date() > _now().date():
            raise HTTPException(status_code=403, detail="This program invitation has not been sent yet")
    response_status = ParticipantStatus.ACTIVE if accept else ParticipantStatus.DECLINED
    participant.status = response_status
    participant.viewed_at = participant.viewed_at or _now()
    participant.responded_at = _now()
    participant.update_date = _now_string()
    db.add(participant)
    if accept and assignment:
        _activate_program_badge_collaborations(db, assignment, participant, current_user.id)
    db.commit()
    return {"participant_uuid": participant.participant_uuid, "status": response_status.value}


def _activate_program_badge_collaborations(
    db: Session,
    assignment: ProgramAssignment,
    participant: ProgramParticipant,
    decided_by_user_id: int,
) -> None:
    """Accepting a program activates its org on each authorized badge objective."""
    badge_ids = {
        int(item["badge_id"])
        for item in (assignment.objective_snapshot or [])
        if item.get("badge_id")
    }
    if not badge_ids:
        return
    badges = db.exec(select(LearningBadge).where(LearningBadge.id.in_(badge_ids))).all()  # type: ignore
    for badge in badges:
        authorization = db.exec(select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge.id,
            BadgeIssuerAuthorization.issuer_org_id == assignment.org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )).first()
        if not authorization and badge.org_id == assignment.org_id:
            now = _now()
            authorization = BadgeIssuerAuthorization(
                authorization_uuid=f"issuer_authorization_{uuid4()}",
                badge_id=badge.id or 0,
                creator_org_id=badge.org_id,
                issuer_org_id=assignment.org_id,
                status=BadgeIssuerAuthorizationStatus.APPROVED,
                decided_by_user_id=decided_by_user_id,
                decided_at=now,
                creation_date=now.isoformat(),
                update_date=now.isoformat(),
            )
            db.add(authorization)
            db.flush()
        if not authorization:
            continue
        link = db.exec(select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.authorization_id == authorization.id,
            BadgeIssuerLearnerLink.user_id == participant.user_id,
        )).first()
        now = _now()
        if not link:
            link = BadgeIssuerLearnerLink(
                link_uuid=f"issuer_link_{uuid4()}",
                authorization_id=authorization.id or 0,
                badge_id=badge.id or 0,
                issuer_org_id=assignment.org_id,
                user_id=participant.user_id,
                creation_date=now.isoformat(),
            )
        link.status = BadgeIssuerLearnerLinkStatus.ACCEPTED
        link.staff_user_ids = list(dict.fromkeys([*(link.staff_user_ids or []), *(assignment.staff_user_ids or [])]))
        link.decided_by_user_id = decided_by_user_id
        link.decided_at = now
        link.end_reason = None
        link.ended_by_user_id = None
        link.ended_at = None
        link.update_date = now.isoformat()
        db.add(link)


def update_my_progress(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    objective_uuid: str,
    status: ObjectiveProgressStatus,
    learner_note: str,
    evidence: list[dict],
) -> dict:
    require_org_membership(current_user.id, org_id, db)
    objective = db.exec(select(Objective).where(
        Objective.objective_uuid == objective_uuid,
        Objective.org_id == org_id,
    )).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    participants = db.exec(select(ProgramParticipant).where(
        ProgramParticipant.org_id == org_id,
        ProgramParticipant.user_id == current_user.id,
        ProgramParticipant.status == ParticipantStatus.ACTIVE,
    )).all()
    assignments = [db.get(ProgramAssignment, participant.assignment_id) for participant in participants]
    matching_assignments = [assignment for assignment in assignments if assignment and any(
        item.get("objective_uuid") == objective_uuid for item in assignment.objective_snapshot or []
    )]
    if not matching_assignments:
        raise HTTPException(status_code=403, detail="This objective is not in one of your active programs")
    today = _now().date().isoformat()
    actionable = False
    for assignment in matching_assignments:
        rule = next((item for item in (assignment.schedule or {}).get("objectives", []) if item.get("objective_uuid") == objective_uuid), {})
        starts = rule.get("effective_start_date")
        due = rule.get("effective_due_date")
        if (not starts or starts <= today) and (not due or due >= today or rule.get("allow_late")):
            actionable = True
            break
    if not actionable:
        raise HTTPException(status_code=403, detail="This objective is not currently open for submissions")
    completion_policy = objective.completion_policy.value if hasattr(objective.completion_policy, "value") else objective.completion_policy
    evidence_policy = objective.evidence_policy.value if hasattr(objective.evidence_policy, "value") else objective.evidence_policy
    if status not in {ObjectiveProgressStatus.SUBMITTED, ObjectiveProgressStatus.COMPLETED}:
        raise HTTPException(status_code=422, detail="Learners can only submit objectives for review")
    if completion_policy not in {"learner", "either", "both"}:
        raise HTTPException(status_code=403, detail="Staff must confirm this objective")
    if evidence and evidence_policy not in {"learner", "both"}:
        raise HTTPException(status_code=403, detail="Learner evidence is not enabled for this objective")
    progress = db.exec(select(ObjectiveProgress).where(
        ObjectiveProgress.org_id == org_id,
        ObjectiveProgress.objective_id == objective.id,
        ObjectiveProgress.user_id == current_user.id,
    )).first()
    now = _now()
    if not progress:
        progress = ObjectiveProgress(
            progress_uuid=f"progress_{uuid4()}", org_id=org_id, objective_id=objective.id,
            user_id=current_user.id, creation_date=now.isoformat(), update_date=now.isoformat(),
        )
    # Learner-completable means the learner may submit; staff confirmation is
    # intentionally distinct from a staff-authored completion.
    progress.status = ObjectiveProgressStatus.SUBMITTED
    progress.learner_note = learner_note
    progress.evidence = evidence
    progress.completed_at = None
    progress.completed_by_user_id = None
    progress.update_date = now.isoformat()
    db.add(progress)
    db.commit()
    return {"objective_uuid": objective_uuid, "status": ObjectiveProgressStatus.SUBMITTED.value}
