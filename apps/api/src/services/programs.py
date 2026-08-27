from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.learning import (
    LearningActivity,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeVersion,
    LearningPage,
    LearningResponseAttempt,
    LearningRun,
)
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


def _major(version: str | None) -> int:
    try:
        return int(str(version or "1").split(".")[0])
    except (TypeError, ValueError):
        return 1


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
        "badge_id": objective.badge_id,
    }
    if relation:
        result.update({
            "position": relation.position,
            "target_days": relation.target_days,
            "badge_major_version": relation.badge_major_version,
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
        "org_id": program.org_id,
        "name": program.name,
        "description": program.description,
        "thumbnail_image": program.thumbnail_image,
        "instructions": program.instructions,
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
            outdated.append({**objective, "latest_badge_major_version": latest})
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


def create_program(db: Session, current_user: PublicUser, payload: ProgramCreate) -> dict:
    require_org_admin(current_user.id, payload.org_id, db)
    now = _now_string()
    program = Program(
        program_uuid=f"program_{uuid4()}",
        org_id=payload.org_id,
        name=payload.name.strip(),
        description=payload.description,
        instructions=payload.instructions,
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
        now = _now_string()
        learner_can_add_evidence = any(bool(field.get("allow_student_upload")) for field in payload.custom_fields)
        has_evidence_fields = bool(payload.custom_fields)
        objective = Objective(
            objective_uuid=f"objective_{uuid4()}",
            org_id=org_id,
            title=payload.title.strip(),
            description=payload.description,
            kind=payload.kind,
            completion_policy=("either" if payload.allow_learner_confirmation else ("automatic" if payload.kind == ObjectiveKind.BADGE else "staff")),
            evidence_policy=("both" if learner_can_add_evidence else ("staff" if has_evidence_fields else "none")),
            custom_fields=payload.custom_fields,
            allow_learner_confirmation=payload.allow_learner_confirmation,
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
        objective.custom_fields = payload.custom_fields
        objective.allow_learner_confirmation = payload.allow_learner_confirmation
        learner_can_add_evidence = any(bool(field.get("allow_student_upload")) for field in payload.custom_fields)
        objective.completion_policy = "either" if payload.allow_learner_confirmation else "staff"
        objective.evidence_policy = "both" if learner_can_add_evidence else ("staff" if payload.custom_fields else "none")
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


def update_badge_versions(db: Session, current_user: PublicUser, org_id: int, program_uuid: str) -> dict:
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
                    "start_rule": objective.get("default_start_rule", "any_time"),
                    "due_rule": objective.get("default_due_rule", "optional"),
                    "allow_late": objective.get("default_allow_late", False),
                    "start_date": None,
                    "due_date": None,
                    "effective_start_date": None,
                    "effective_due_date": None,
                }
                for phase in phases
                for objective in phase["objectives"]
            ],
        }
    phase_by_uuid = {item.get("phase_uuid"): item for item in supplied_phases}
    expected = {phase["phase_uuid"] for phase in phases}
    if set(phase_by_uuid) != expected:
        raise HTTPException(status_code=422, detail="Set start and end dates for every phase")
    for phase in phases:
        scheduled_phase = phase_by_uuid[phase["phase_uuid"]]
        if not scheduled_phase.get("start_date") or not scheduled_phase.get("end_date"):
            raise HTTPException(status_code=422, detail=f"Set both dates for {phase['name']}")
        if scheduled_phase["end_date"] < scheduled_phase["start_date"]:
            raise HTTPException(status_code=422, detail=f"{phase['name']} must end after it starts")
    objective_by_uuid = {item.get("objective_uuid"): item for item in schedule.get("objectives") or []}
    expected_objectives = {objective["objective_uuid"] for phase in phases for objective in phase["objectives"]}
    if set(objective_by_uuid) != expected_objectives:
        raise HTTPException(status_code=422, detail="Set scheduling rules for every objective")
    for phase in phases:
        scheduled_phase = phase_by_uuid[phase["phase_uuid"]]
        for objective in phase["objectives"]:
            rule = objective_by_uuid[objective["objective_uuid"]]
            start_rule = rule.get("start_rule")
            due_rule = rule.get("due_rule")
            if start_rule not in {"any_time", "phase_start", "specific_date"}:
                raise HTTPException(status_code=422, detail=f"Invalid start rule for {objective['title']}")
            if due_rule not in {"optional", "phase_end", "specific_date"}:
                raise HTTPException(status_code=422, detail=f"Invalid completion rule for {objective['title']}")
            if start_rule == "specific_date" and not rule.get("start_date"):
                raise HTTPException(status_code=422, detail=f"Choose a start date for {objective['title']}")
            if due_rule == "specific_date" and not rule.get("due_date"):
                raise HTTPException(status_code=422, detail=f"Choose a due date for {objective['title']}")
            rule["phase_uuid"] = phase["phase_uuid"]
            rule["effective_start_date"] = scheduled_phase["start_date"] if start_rule == "phase_start" else rule.get("start_date")
            rule["effective_due_date"] = scheduled_phase["end_date"] if due_rule == "phase_end" else rule.get("due_date")
    return {"phases": supplied_phases, "objectives": list(objective_by_uuid.values())}


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


def assign_program(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    program_uuid: str,
    payload: ProgramAssignmentCreate,
) -> dict:
    require_org_admin(current_user.id, org_id, db)
    program = _program_or_404(db, program_uuid, org_id)
    if bool(payload.usergroup_id) == bool(payload.user_id):
        raise HTTPException(status_code=422, detail="Choose either one group or one user")
    if payload.usergroup_id:
        group = db.get(UserGroup, payload.usergroup_id)
        if not group or group.org_id != org_id:
            raise HTTPException(status_code=404, detail="Group not found")
    else:
        membership = db.exec(select(UserOrganization).where(
            UserOrganization.org_id == org_id,
            UserOrganization.user_id == payload.user_id,
        )).first()
        if not membership:
            raise HTTPException(status_code=404, detail="User is not connected to this organization")
    phases = _program_phases(db, program)
    schedule = _validated_schedule(program, phases, payload)
    staff_ids = list(dict.fromkeys(payload.staff_user_ids))
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
    now = _now_string()
    assignment = ProgramAssignment(
        assignment_uuid=f"assignment_{uuid4()}",
        org_id=org_id,
        program_id=program.id,
        usergroup_id=payload.usergroup_id,
        user_id=payload.user_id,
        program_version=program.version,
        objective_snapshot=_snapshot(db, program),
        welcome_message=payload.welcome_message,
        initiate_date=payload.initiate_date or _now(),
        staff_user_ids=staff_ids,
        schedule=schedule,
        start_date=payload.start_date,
        due_date=payload.due_date,
        created_by_user_id=current_user.id,
        creation_date=now,
        update_date=now,
    )
    db.add(assignment)
    db.flush()
    if payload.usergroup_id:
        ensure_group_participants(db, payload.usergroup_id)
    else:
        db.add(ProgramParticipant(
            participant_uuid=f"participant_{uuid4()}",
            assignment_id=assignment.id,
            org_id=org_id,
            user_id=payload.user_id,
            status=ParticipantStatus.INVITED,
            creation_date=now,
            update_date=now,
        ))
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
    badge_objectives = {
        (int(item["badge_id"]), int(item.get("badge_major_version") or 1)): int(item["id"])
        for item in objectives
        if item.get("badge_id") and item.get("id")
    }
    if not user_ids or not badge_objectives:
        return set()
    awards = db.exec(select(LearningBadgeAward).where(
        LearningBadgeAward.user_id.in_(user_ids),
        LearningBadgeAward.badge_id.in_([key[0] for key in badge_objectives]),
    )).all()
    return {
        (award.user_id, badge_objectives[(award.badge_id, award.major_version)])
        for award in awards
        if (award.badge_id, award.major_version) in badge_objectives
    }


def _assignment_summary(db: Session, assignment: ProgramAssignment) -> dict:
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    assigned_user = db.get(User, assignment.user_id) if assignment.user_id else None
    participants = db.exec(select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)).all()
    staff = db.exec(select(User).where(User.id.in_(assignment.staff_user_ids or []))).all() if assignment.staff_user_ids else []
    user_ids = [participant.user_id for participant in participants]
    objective_ids = [int(item["id"]) for item in (assignment.objective_snapshot or []) if item.get("id")]
    progress = _progress_map(db, assignment.org_id, user_ids, objective_ids)
    badge_awards = _badge_award_keys(db, user_ids, assignment.objective_snapshot or [])
    total = len(user_ids) * len(objective_ids)
    completed_progress = {
        key for key, item in progress.items() if item.status == ObjectiveProgressStatus.COMPLETED
    }
    completed = len(completed_progress | badge_awards)
    ready = sum(1 for item in progress.values() if item.status in {ObjectiveProgressStatus.SUBMITTED, ObjectiveProgressStatus.READY_FOR_REVIEW})
    return {
        "assignment_uuid": assignment.assignment_uuid,
        "program_uuid": program.program_uuid if program else "",
        "program_name": program.name if program else "Deleted program",
        "program_version": assignment.program_version,
        "usergroup_id": assignment.usergroup_id,
        "user_id": assignment.user_id,
        "welcome_message": assignment.welcome_message,
        "initiate_date": assignment.initiate_date,
        "staff_user_ids": assignment.staff_user_ids or [],
        "staff": [{
            "id": item.id,
            "username": item.username,
            "first_name": item.first_name,
            "last_name": item.last_name,
            "avatar_image": item.avatar_image,
        } for item in staff],
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
        "learner_count": len(user_ids),
        "objective_count": len(objective_ids),
        "completed_count": completed,
        "ready_for_review_count": ready,
        "progress_percent": round((completed / total) * 100) if total else 0,
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
    learner_rows = []
    for user in users:
        participant = participant_by_user[user.id]
        cells = {}
        for objective in assignment.objective_snapshot or []:
            objective_id = int(objective["id"])
            item = progress.get((user.id, objective_id))
            earned_badge = (user.id, objective_id) in badge_awards
            cells[objective["objective_uuid"]] = {
                "status": "completed" if earned_badge else ((item.status.value if hasattr(item.status, "value") else item.status) if item else "not_started"),
                "evidence": item.evidence if item else [],
                "learner_note": item.learner_note if item else "",
                "staff_note": item.staff_note if item else "",
                "feedback_history": item.feedback_history if item else [],
                "completed_at": item.completed_at if item else None,
            }
        learner_rows.append({
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_image": user.avatar_image,
            "invitation_status": participant.status.value if hasattr(participant.status, "value") else participant.status,
            "cells": cells,
        })
    siblings = []
    if assignment.usergroup_id:
        sibling_assignments = db.exec(select(ProgramAssignment).where(
            ProgramAssignment.usergroup_id == assignment.usergroup_id,
            ProgramAssignment.active == True,  # noqa: E712
        )).all()
        siblings = [_assignment_summary(db, sibling) for sibling in sibling_assignments]
    return {
        "assignment": _assignment_summary(db, assignment),
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "program": _program_dict(db, program, include_objectives=False) if program else None,
        "programs": siblings,
        "objectives": assignment.objective_snapshot or [],
        "learners": learner_rows,
    }


def _require_assignment_reviewer(
    db: Session, current_user: PublicUser, assignment: ProgramAssignment
) -> None:
    require_org_membership(current_user.id, assignment.org_id, db)
    assigned = set(assignment.staff_user_ids or [])
    if current_user.id not in assigned and not current_user.is_superadmin:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to review this program",
        )


def assignment_reviews(
    db: Session,
    current_user: PublicUser,
    org_id: int,
    assignment_uuid: str,
) -> dict:
    assignment = _assignment_or_404(db, assignment_uuid, org_id)
    _require_assignment_reviewer(db, current_user, assignment)
    participants = db.exec(
        select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)
    ).all()
    user_ids = [item.user_id for item in participants]
    objective_by_id = {
        int(item["id"]): item
        for item in (assignment.objective_snapshot or [])
        if item.get("id")
    }
    if not user_ids or not objective_by_id:
        return {"assignment_uuid": assignment_uuid, "objective_reviews": [], "activity_reviews": []}
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
    ).all()
    users = {
        item.id: item
        for item in db.exec(select(User).where(User.id.in_(user_ids))).all()
    }
    reviews = []
    for progress in progresses:
        user = users.get(progress.user_id)
        objective = objective_by_id.get(progress.objective_id)
        if not user or not objective:
            continue
        reviews.append({
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
    reviews.sort(key=lambda item: item.get("submitted_at") or "")
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
    runs = db.exec(
        select(LearningRun).where(LearningRun.program_assignment_id == assignment.id)
    ).all()
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
    _require_assignment_reviewer(db, current_user, assignment)
    if payload.action not in {"confirm", "flag"}:
        raise HTTPException(status_code=422, detail="Action must be confirm or flag")
    if payload.action == "flag" and not payload.message.strip():
        raise HTTPException(status_code=422, detail="Tell the learner what needs to change")
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
    if payload.action == "confirm":
        progress.status = ObjectiveProgressStatus.COMPLETED
        progress.completed_at = now
        progress.completed_by_user_id = current_user.id
        if payload.message.strip():
            progress.staff_note = payload.message.strip()
    else:
        message = payload.message.strip()
        progress.status = ObjectiveProgressStatus.FLAGGED
        progress.staff_note = message
        progress.completed_at = None
        progress.completed_by_user_id = None
        history.append({
            "message": message,
            "created_at": now.isoformat(),
            "staff_user_id": current_user.id,
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
) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    objective = db.exec(select(Objective).where(
        Objective.objective_uuid == objective_uuid,
        Objective.org_id == org_id,
    )).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    now = _now()
    results = []
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


def my_programs(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_membership(current_user.id, org_id, db)
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
        result.append({
            "participant_uuid": participant.participant_uuid,
            "status": participant.status.value if hasattr(participant.status, "value") else participant.status,
            "program": _program_dict(db, program, include_objectives=False) if program else None,
            "assignment": _assignment_summary(db, assignment),
            "objectives": objectives,
        })
    return result


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
    participant.status = ParticipantStatus.ACTIVE if accept else ParticipantStatus.DECLINED
    participant.viewed_at = participant.viewed_at or _now()
    participant.responded_at = _now()
    participant.update_date = _now_string()
    db.add(participant)
    db.commit()
    return {"participant_uuid": participant.participant_uuid, "status": participant.status.value}


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
