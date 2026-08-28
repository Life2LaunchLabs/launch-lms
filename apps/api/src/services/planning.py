from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.learning import LearningBadge, LearningBadgeAward, LearningRun
from src.db.media import MediaAsset, MediaOwnerType
from src.db.organizations import Organization
from src.db.planning import (
    DEFAULT_ROLE_DEFINITIONS,
    Plan,
    PlanActivity,
    PlanAttachment,
    PlanAttachmentCreate,
    PlanCollaborator,
    PlanCollaboratorRequest,
    PlanCollaboratorRequestCreate,
    PlanCollaboratorRequestStatus,
    PlanCollaboratorUpdate,
    PlanCreate,
    PlanCommentCreate,
    PlanInvitation,
    PlanInvitationCreate,
    PlanInvitationKind,
    PlanInvitationStatus,
    PlanObjective,
    PlanObjectiveCreate,
    PlanObjectiveUpdate,
    PlanObjectiveProgress,
    PlanObjectiveProgressUpdate,
    PlanObjectiveStatus,
    PlanOwnershipTransfer,
    PlanPhase,
    PlanPhaseCreate,
    PlanPhaseUpdate,
    PlanRole,
    PlanRoleCreate,
    PlanRoleUpdate,
    PlanStatus,
    PlanUpdate,
)
from src.db.users import PublicUser, User


ALL_CAPABILITIES = {
    "view_plan", "comment", "contribute_fields", "update_progress",
    "request_collaborators", "contribute_reviewer_fields", "review_objectives",
    "review_badge_submissions", "edit_plan_details", "edit_structure",
    "edit_schedule", "complete_plan", "archive_plan", "manage_collaborators",
    "manage_roles",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_string() -> str:
    return _now().isoformat()


def _slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "plan"
    return result[:72]


def _unique_slug(db: Session, name: str) -> str:
    base = _slug(name)
    candidate = base
    suffix = 2
    while db.exec(select(Plan.id).where(Plan.slug == candidate)).first() is not None:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _user_summary(db: Session, user_id: int | None) -> dict | None:
    user = db.get(User, user_id) if user_id else None
    if not user:
        return None
    return {
        "id": user.id,
        "user_uuid": user.user_uuid,
        "username": user.username,
        "name": " ".join(filter(None, [user.first_name, user.last_name])) or user.username,
        "avatar_image": user.avatar_image,
    }


def _org_summary(db: Session, org_id: int | None) -> dict | None:
    org = db.get(Organization, org_id) if org_id else None
    if not org:
        return None
    return {"id": org.id, "org_uuid": org.org_uuid, "name": org.name, "slug": org.slug, "logo_image": org.logo_image}


def _plan_or_404(db: Session, plan_uuid_or_slug: str) -> Plan:
    plan = db.exec(select(Plan).where(
        (Plan.plan_uuid == plan_uuid_or_slug) | (Plan.slug == plan_uuid_or_slug)
    )).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def _collaboration(db: Session, plan_id: int, user_id: int) -> tuple[PlanCollaborator, PlanRole] | None:
    row = db.exec(
        select(PlanCollaborator, PlanRole)
        .join(PlanRole, PlanRole.id == PlanCollaborator.role_id)
        .where(PlanCollaborator.plan_id == plan_id, PlanCollaborator.user_id == user_id, PlanCollaborator.active == True)  # noqa: E712
    ).first()
    return row if row else None


def capabilities_for(db: Session, plan: Plan, user_id: int) -> set[str]:
    if plan.owner_user_id == user_id:
        return set(ALL_CAPABILITIES) | {"transfer_ownership", "delete_plan"}
    row = _collaboration(db, int(plan.id), user_id)
    return set(row[1].capabilities or []) if row else set()


def _require(db: Session, plan: Plan, user_id: int, capability: str) -> set[str]:
    capabilities = capabilities_for(db, plan, user_id)
    if capability not in capabilities:
        # Do not reveal private plan existence to non-collaborators.
        raise HTTPException(status_code=404 if not capabilities else 403, detail="Plan not found" if not capabilities else f"Missing plan permission: {capability}")
    return capabilities


def _activity(db: Session, plan: Plan, actor_user_id: int | None, action: str, payload: dict | None = None) -> None:
    db.add(PlanActivity(
        activity_uuid=f"plan_activity_{uuid4()}", plan_id=int(plan.id), actor_user_id=actor_user_id,
        action=action, payload=payload or {}, creation_date=_now_string(),
    ))


def _seed_roles(db: Session, plan: Plan, definitions: list[dict] | None = None) -> dict[str, PlanRole]:
    now = _now_string()
    roles = {}
    for definition in definitions or DEFAULT_ROLE_DEFINITIONS:
        key = definition["key"]
        role = PlanRole(
            role_uuid=f"plan_role_{uuid4()}", plan_id=int(plan.id), key=key,
            name=definition["name"], capabilities=list(definition["capabilities"]),
            grantable_role_keys=list(definition.get("grantable_role_keys") or (["subject", "reviewer", "viewer"] if key == "plan_admin" else [])),
            creation_date=now, update_date=now,
        )
        db.add(role)
        db.flush()
        roles[key] = role
    return roles


def _progress_for(db: Session, objective: PlanObjective) -> PlanObjectiveProgress:
    progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
    if progress:
        return progress
    now = _now_string()
    progress = PlanObjectiveProgress(
        progress_uuid=f"plan_progress_{uuid4()}", plan_objective_id=int(objective.id),
        creation_date=now, update_date=now,
    )
    db.add(progress)
    db.flush()
    return progress


def _badge_state(db: Session, plan: Plan, objective: PlanObjective, progress: PlanObjectiveProgress) -> str:
    if not objective.badge_id or not plan.subject_user_id:
        return progress.status.value if hasattr(progress.status, "value") else str(progress.status)
    award = db.exec(select(LearningBadgeAward).where(
        LearningBadgeAward.badge_id == objective.badge_id,
        LearningBadgeAward.user_id == plan.subject_user_id,
    )).first()
    if award and (not objective.badge_major_version or award.major_version == objective.badge_major_version):
        return PlanObjectiveStatus.COMPLETED.value
    run = db.exec(select(LearningRun).where(
        LearningRun.plan_objective_id == objective.id,
        LearningRun.user_id == plan.subject_user_id,
    )).first()
    return PlanObjectiveStatus.IN_PROGRESS.value if run else (progress.status.value if hasattr(progress.status, "value") else str(progress.status))


def _objective_dict(db: Session, plan: Plan, objective: PlanObjective, capabilities: set[str]) -> dict:
    progress = _progress_for(db, objective)
    badge = db.get(LearningBadge, objective.badge_id) if objective.badge_id else None
    status = _badge_state(db, plan, objective, progress)
    return {
        "objective_uuid": objective.objective_uuid, "phase_id": objective.phase_id,
        "title": objective.title, "description": objective.description, "kind": objective.kind,
        "position": objective.position, "priority": objective.priority, "fields": objective.fields or [],
        "start_date": objective.start_date, "due_date": objective.due_date,
        "allow_late": objective.allow_late, "blocked": objective.blocked,
        "badge": ({"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image} if badge else None),
        "progress": {
            "status": status, "field_values": progress.field_values or {},
            "subject_note": progress.subject_note, "reviewer_note": progress.reviewer_note,
            "feedback_history": progress.feedback_history or [], "completed_at": progress.completed_at,
        },
        "can_update": "update_progress" in capabilities,
        "can_review": "review_objectives" in capabilities,
        "badge_href": f"/plans/{plan.slug}/objectives/{objective.objective_uuid}/badge" if badge else None,
    }


def _plan_dict(db: Session, plan: Plan, user_id: int, include_detail: bool = False) -> dict:
    capabilities = capabilities_for(db, plan, user_id)
    if not capabilities:
        raise HTTPException(status_code=404, detail="Plan not found")
    phases = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id).order_by(PlanPhase.position)).all()
    objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
    objective_rows = [_objective_dict(db, plan, item, capabilities) for item in objectives]
    complete_count = sum(item["progress"]["status"] == PlanObjectiveStatus.COMPLETED.value for item in objective_rows)
    result = {
        "plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name,
        "description": plan.description, "status": plan.status.value if hasattr(plan.status, "value") else plan.status,
        "priority": plan.priority, "start_date": plan.start_date, "due_date": plan.due_date,
        "subject": _user_summary(db, plan.subject_user_id), "owner": _user_summary(db, plan.owner_user_id),
        "source_organization": _org_summary(db, plan.source_org_id),
        "is_mine": plan.subject_user_id == user_id, "is_owner": plan.owner_user_id == user_id,
        "capabilities": sorted(capabilities), "objective_count": len(objective_rows),
        "completed_objective_count": complete_count,
        "progress_percent": round(complete_count * 100 / len(objective_rows)) if objective_rows else 0,
        "creation_date": plan.creation_date, "update_date": plan.update_date,
    }
    if include_detail:
        result["phases"] = [{
            "phase_uuid": phase.phase_uuid, "name": phase.name, "description": phase.description,
            "position": phase.position, "start_date": phase.start_date, "due_date": phase.due_date,
            "objectives": [item for item in objective_rows if item["phase_id"] == phase.id],
        } for phase in phases]
        result["objectives"] = objective_rows
        collaborators = db.exec(
            select(PlanCollaborator, PlanRole).join(PlanRole, PlanRole.id == PlanCollaborator.role_id)
            .where(PlanCollaborator.plan_id == plan.id, PlanCollaborator.active == True)  # noqa: E712
        ).all()
        result["collaborators"] = [{
            "collaborator_uuid": collaborator.collaborator_uuid,
            "user": _user_summary(db, collaborator.user_id),
            "role": {"role_uuid": role.role_uuid, "key": role.key, "name": role.name},
            "is_owner": collaborator.user_id == plan.owner_user_id,
        } for collaborator, role in collaborators]
        result["roles"] = [{"role_uuid": role.role_uuid, "key": role.key, "name": role.name, "capabilities": role.capabilities, "grantable_role_keys": role.grantable_role_keys} for role in db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id)).all()]
    return result


def list_plans(db: Session, current_user: PublicUser, lifecycle: str | None = None) -> list[dict]:
    rows = db.exec(
        select(Plan).join(PlanCollaborator, PlanCollaborator.plan_id == Plan.id)
        .where(PlanCollaborator.user_id == current_user.id, PlanCollaborator.active == True)  # noqa: E712
        .order_by(Plan.update_date.desc())
    ).all()
    if lifecycle:
        rows = [plan for plan in rows if str(plan.status.value if hasattr(plan.status, "value") else plan.status) == lifecycle]
    return [_plan_dict(db, plan, current_user.id) for plan in rows]


def create_plan(db: Session, current_user: PublicUser, payload: PlanCreate) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Plan name is required")
    now = _now_string()
    plan = Plan(
        plan_uuid=f"plan_{uuid4()}", slug=_unique_slug(db, name), name=name,
        description=payload.description, priority=max(0, min(3, payload.priority)),
        subject_user_id=current_user.id, owner_user_id=current_user.id,
        start_date=payload.start_date, due_date=payload.due_date,
        creation_date=now, update_date=now,
    )
    db.add(plan)
    db.flush()
    roles = _seed_roles(db, plan)
    db.add(PlanCollaborator(
        collaborator_uuid=f"plan_collaborator_{uuid4()}", plan_id=int(plan.id),
        user_id=current_user.id, role_id=int(roles["plan_admin"].id), creation_date=now, update_date=now,
    ))
    phase = PlanPhase(phase_uuid=f"plan_phase_{uuid4()}", plan_id=int(plan.id), name="Getting started", creation_date=now, update_date=now)
    db.add(phase)
    _activity(db, plan, current_user.id, "plan.created")
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def materialize_assignment_plans(db: Session, assignment_id: int) -> None:
    """Create the independent live plans represented by a legacy assignment batch.

    Program tables intentionally remain the template/assignment backing store for this
    release, so this bridge is also used by the deprecated Program API.
    """
    # Some focused compatibility tests construct only legacy tables. Production is
    # migrated before this bridge can run.
    if not inspect(db.connection()).has_table("plan"):
        return
    from src.db.programs import (  # Local import keeps the compatibility layer acyclic.
        ObjectiveProgress,
        ParticipantStatus,
        Program,
        ProgramAssignment,
        ProgramParticipant,
    )

    assignment = db.get(ProgramAssignment, assignment_id)
    if not assignment:
        return
    program = db.get(Program, assignment.program_id)
    if not program:
        return
    owner_id = assignment.owner_user_id or assignment.created_by_user_id or program.created_by_user_id
    if not owner_id:
        from src.db.user_organizations import UserOrganization
        owner_id = db.exec(
            select(UserOrganization.user_id)
            .where(UserOrganization.org_id == assignment.org_id)
            .order_by(UserOrganization.user_id)
        ).first()
    if not owner_id:
        return

    participants = db.exec(select(ProgramParticipant).where(ProgramParticipant.assignment_id == assignment.id)).all()
    phase_schedule = {item.get("phase_uuid"): item for item in (assignment.schedule or {}).get("phases", [])}
    objective_schedule = {item.get("objective_uuid"): item for item in (assignment.schedule or {}).get("objectives", [])}
    snapshots = assignment.objective_snapshot or []
    for participant in participants:
        exists = db.exec(select(Plan.id).where(
            Plan.source_assignment_id == assignment.id,
            Plan.subject_user_id == participant.user_id,
        )).first()
        if exists:
            continue
        status = {
            ParticipantStatus.INVITED: PlanStatus.PENDING,
            ParticipantStatus.ACTIVE: PlanStatus.ACTIVE,
            ParticipantStatus.COMPLETED: PlanStatus.COMPLETED,
            ParticipantStatus.DECLINED: PlanStatus.ARCHIVED,
            ParticipantStatus.LEFT: PlanStatus.ARCHIVED,
        }.get(participant.status, PlanStatus.ARCHIVED)
        now = participant.update_date or participant.creation_date or _now_string()
        plan = Plan(
            plan_uuid=f"plan_{uuid4()}",
            slug=_unique_slug(db, f"{program.name}-{str(participant.participant_uuid).split('_')[-1][:8]}"),
            name=program.name, description=program.description, status=status,
            subject_user_id=participant.user_id, owner_user_id=owner_id,
            source_org_id=assignment.org_id, source_program_id=program.id,
            source_assignment_id=assignment.id,
            start_date=assignment.start_date.date() if assignment.start_date else None,
            due_date=assignment.due_date.date() if assignment.due_date else None,
            creation_date=participant.creation_date or now, update_date=now,
        )
        db.add(plan)
        db.flush()
        roles = _seed_roles(db, plan, program.role_definitions or None)
        subject_role_key = program.default_subject_role_key or "subject"
        staff_role_key = program.default_staff_role_key or "reviewer"
        if subject_role_key not in roles or staff_role_key not in roles:
            raise HTTPException(status_code=422, detail="Plan template default roles are invalid")
        collaborator_roles: dict[int, str] = {int(owner_id): "plan_admin"}
        if participant.status in {ParticipantStatus.ACTIVE, ParticipantStatus.COMPLETED}:
            collaborator_roles.setdefault(participant.user_id, subject_role_key)
        for staff_id in assignment.staff_user_ids or []:
            collaborator_roles.setdefault(int(staff_id), staff_role_key)
        for user_id, role_key in collaborator_roles.items():
            db.add(PlanCollaborator(
                collaborator_uuid=f"plan_collaborator_{uuid4()}", plan_id=int(plan.id),
                user_id=user_id, role_id=int(roles[role_key].id),
                creation_date=now, update_date=now,
            ))

        phase_keys: list[str] = []
        for snapshot in snapshots:
            phase_key = snapshot.get("phase_uuid") or "legacy"
            if phase_key not in phase_keys:
                phase_keys.append(phase_key)
        phase_ids: dict[str, int] = {}
        for position, phase_key in enumerate(phase_keys or ["legacy"]):
            scheduled = phase_schedule.get(phase_key, {})
            phase = PlanPhase(
                phase_uuid=f"plan_phase_{uuid4()}", plan_id=int(plan.id),
                name=next((item.get("phase_name") for item in snapshots if (item.get("phase_uuid") or "legacy") == phase_key), None) or "Phase 1",
                position=position, start_date=scheduled.get("start_date"), due_date=scheduled.get("end_date"),
                creation_date=now, update_date=now,
            )
            db.add(phase)
            db.flush()
            phase_ids[phase_key] = int(phase.id)
        for position, snapshot in enumerate(snapshots):
            scheduled = objective_schedule.get(snapshot.get("objective_uuid"), {})
            fields = [
                {**field, "access": "either" if field.get("allow_student_upload") else "reviewer"}
                for field in snapshot.get("custom_fields") or []
            ]
            objective = PlanObjective(
                objective_uuid=f"plan_objective_{uuid4()}", plan_id=int(plan.id),
                phase_id=phase_ids[snapshot.get("phase_uuid") or "legacy"],
                source_objective_id=snapshot.get("id"), title=snapshot.get("title") or "Objective",
                description=snapshot.get("description") or "", kind=snapshot.get("kind") or "custom",
                position=position, badge_id=snapshot.get("badge_id"),
                badge_major_version=snapshot.get("badge_major_version"), fields=fields,
                start_date=scheduled.get("effective_start_date"), due_date=scheduled.get("effective_due_date"),
                allow_late=bool(scheduled.get("allow_late")), creation_date=now, update_date=now,
            )
            db.add(objective)
            db.flush()
            old = db.exec(select(ObjectiveProgress).where(
                ObjectiveProgress.org_id == assignment.org_id,
                ObjectiveProgress.objective_id == snapshot.get("id"),
                ObjectiveProgress.user_id == participant.user_id,
            )).first()
            old_status = str(old.status.value if old and hasattr(old.status, "value") else old.status if old else "not_started")
            progress_status = {"flagged": "changes_requested", "ready_for_review": "submitted"}.get(old_status, old_status)
            db.add(PlanObjectiveProgress(
                progress_uuid=f"plan_progress_{uuid4()}", plan_objective_id=int(objective.id),
                status=progress_status, field_values={"legacy_evidence": old.evidence or []} if old else {},
                subject_note=old.learner_note if old else "", reviewer_note=old.staff_note if old else "",
                feedback_history=old.feedback_history or [] if old else [], completed_at=old.completed_at if old else None,
                updated_by_user_id=old.completed_by_user_id if old else None,
                creation_date=old.creation_date if old else now, update_date=old.update_date if old else now,
            ))
        db.flush()
        _link_legacy_learning_runs(db, assignment.id, participant.id, participant.user_id, plan)
        invitation_status = {
            ParticipantStatus.INVITED: PlanInvitationStatus.PENDING,
            ParticipantStatus.DECLINED: PlanInvitationStatus.DECLINED,
            ParticipantStatus.LEFT: PlanInvitationStatus.REVOKED,
        }.get(participant.status)
        if invitation_status:
            target = db.get(User, participant.user_id)
            if target:
                email = str(target.email)
                db.add(PlanInvitation(
                    invitation_uuid=f"plan_invitation_{uuid4()}", plan_id=int(plan.id),
                    kind=PlanInvitationKind.SUBJECT, email=email, email_normalized=email.strip().lower(),
                    target_user_id=participant.user_id, role_id=int(roles[subject_role_key].id),
                    status=invitation_status, invited_by_user_id=int(owner_id),
                    viewed_at=participant.viewed_at, responded_at=participant.responded_at,
                    creation_date=participant.creation_date or now, update_date=now,
                ))


def materialize_external_assignment_plan(db: Session, assignment_id: int, subject_email: str) -> None:
    """Materialize a pending plan for a subject who does not have an account yet."""
    from src.db.programs import Program, ProgramAssignment

    assignment = db.get(ProgramAssignment, assignment_id)
    if not assignment or db.exec(select(Plan.id).where(
        Plan.source_assignment_id == assignment_id,
        Plan.subject_user_id.is_(None),
    )).first() is not None:
        return
    program = db.get(Program, assignment.program_id)
    if not program:
        return
    owner_id = assignment.owner_user_id or assignment.created_by_user_id or program.created_by_user_id
    if not owner_id:
        raise HTTPException(status_code=422, detail="An external subject assignment requires an owner")
    now = _now_string()
    plan = Plan(
        plan_uuid=f"plan_{uuid4()}", slug=_unique_slug(db, f"{program.name}-{uuid4().hex[:8]}"),
        name=program.name, description=program.description, status=PlanStatus.PENDING,
        subject_user_id=None, owner_user_id=int(owner_id), source_org_id=assignment.org_id,
        source_program_id=program.id, source_assignment_id=assignment.id,
        start_date=assignment.start_date.date() if assignment.start_date else None,
        due_date=assignment.due_date.date() if assignment.due_date else None,
        creation_date=now, update_date=now,
    )
    db.add(plan)
    db.flush()
    roles = _seed_roles(db, plan, program.role_definitions or None)
    subject_role_key = program.default_subject_role_key or "subject"
    staff_role_key = program.default_staff_role_key or "reviewer"
    if subject_role_key not in roles or staff_role_key not in roles or "plan_admin" not in roles:
        raise HTTPException(status_code=422, detail="Plan template default roles are invalid")
    collaborator_roles: dict[int, str] = {int(owner_id): "plan_admin"}
    for staff_id in assignment.staff_user_ids or []:
        collaborator_roles.setdefault(int(staff_id), staff_role_key)
    for user_id, role_key in collaborator_roles.items():
        db.add(PlanCollaborator(
            collaborator_uuid=f"plan_collaborator_{uuid4()}", plan_id=int(plan.id),
            user_id=user_id, role_id=int(roles[role_key].id), creation_date=now, update_date=now,
        ))

    schedule = assignment.schedule or {}
    phase_schedule = {item.get("phase_uuid"): item for item in schedule.get("phases", [])}
    objective_schedule = {item.get("objective_uuid"): item for item in schedule.get("objectives", [])}
    snapshots = assignment.objective_snapshot or []
    phase_keys = list(dict.fromkeys(item.get("phase_uuid") or "legacy" for item in snapshots)) or ["legacy"]
    phase_ids: dict[str, int] = {}
    for position, phase_key in enumerate(phase_keys):
        scheduled = phase_schedule.get(phase_key, {})
        phase = PlanPhase(
            phase_uuid=f"plan_phase_{uuid4()}", plan_id=int(plan.id),
            name=next((item.get("phase_name") for item in snapshots if (item.get("phase_uuid") or "legacy") == phase_key), None) or "Phase 1",
            position=position, start_date=scheduled.get("start_date"), due_date=scheduled.get("end_date"),
            creation_date=now, update_date=now,
        )
        db.add(phase)
        db.flush()
        phase_ids[phase_key] = int(phase.id)
    for position, snapshot in enumerate(snapshots):
        scheduled = objective_schedule.get(snapshot.get("objective_uuid"), {})
        objective = PlanObjective(
            objective_uuid=f"plan_objective_{uuid4()}", plan_id=int(plan.id),
            phase_id=phase_ids[snapshot.get("phase_uuid") or "legacy"],
            source_objective_id=snapshot.get("id"), title=snapshot.get("title") or "Objective",
            description=snapshot.get("description") or "", kind=snapshot.get("kind") or "custom",
            position=position, badge_id=snapshot.get("badge_id"),
            badge_major_version=snapshot.get("badge_major_version"),
            fields=[{**field, "access": "either" if field.get("allow_student_upload") else "reviewer"} for field in snapshot.get("custom_fields") or []],
            start_date=scheduled.get("effective_start_date"), due_date=scheduled.get("effective_due_date"),
            allow_late=bool(scheduled.get("allow_late")), creation_date=now, update_date=now,
        )
        db.add(objective)
        db.flush()
        db.add(PlanObjectiveProgress(
            progress_uuid=f"plan_progress_{uuid4()}", plan_objective_id=int(objective.id),
            creation_date=now, update_date=now,
        ))
    normalized = subject_email.strip().lower()
    db.add(PlanInvitation(
        invitation_uuid=f"plan_invitation_{uuid4()}", plan_id=int(plan.id),
        kind=PlanInvitationKind.SUBJECT, email=subject_email.strip(), email_normalized=normalized,
        role_id=int(roles[subject_role_key].id), status=PlanInvitationStatus.PENDING,
        invited_by_user_id=int(owner_id), creation_date=now, update_date=now,
    ))


def _link_legacy_learning_runs(
    db: Session,
    assignment_id: int,
    participant_id: int,
    user_id: int,
    plan: Plan,
) -> None:
    """Attach unambiguous legacy assignment runs to a materialized live plan."""
    objectives = db.exec(select(PlanObjective).where(
        PlanObjective.plan_id == plan.id,
        PlanObjective.badge_id.is_not(None),
    )).all()
    objectives_by_badge: dict[int, list[PlanObjective]] = {}
    for objective in objectives:
        objectives_by_badge.setdefault(int(objective.badge_id), []).append(objective)

    runs = db.exec(select(LearningRun).where(
        LearningRun.program_assignment_id == assignment_id,
        LearningRun.badge_id.in_(list(objectives_by_badge)),
    )).all() if objectives_by_badge else []
    for run in runs:
        belongs_to_participant = (
            run.program_participant_id == participant_id
            or (run.program_participant_id is None and run.user_id == user_id)
        )
        candidates = objectives_by_badge.get(run.badge_id, [])
        if not belongs_to_participant or len(candidates) != 1:
            continue
        if run.plan_id not in {None, plan.id} or run.plan_objective_id is not None:
            continue
        run.plan_id = plan.id
        run.plan_objective_id = candidates[0].id
        db.add(run)


def get_plan(db: Session, current_user: PublicUser, identifier: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "view_plan")
    return _plan_dict(db, plan, current_user.id, True)


def resolve_legacy_plan(db: Session, current_user: PublicUser, legacy_identifier: str) -> dict:
    from src.db.programs import Program, ProgramAssignment, ProgramParticipant

    plan = db.exec(select(Plan).where(
        Plan.subject_user_id == current_user.id,
        Plan.source_program_id.is_not(None),
    ).join(Program, Program.id == Plan.source_program_id).where(
        (Program.slug == legacy_identifier) | (Program.program_uuid == legacy_identifier),
    ).order_by(Plan.update_date.desc())).first()
    if not plan:
        participant = db.exec(select(ProgramParticipant).where(
            ProgramParticipant.participant_uuid == legacy_identifier,
            ProgramParticipant.user_id == current_user.id,
        )).first()
        if participant:
            assignment = db.get(ProgramAssignment, participant.assignment_id)
            plan = db.exec(select(Plan).where(
                Plan.source_assignment_id == (assignment.id if assignment else -1),
                Plan.subject_user_id == current_user.id,
            )).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Migrated plan not found")
    return {"plan_uuid": plan.plan_uuid, "slug": plan.slug}


def update_plan(db: Session, current_user: PublicUser, identifier: str, payload: PlanUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    changes = payload.model_dump(exclude_unset=True)
    if {"name", "description", "priority"} & set(changes):
        _require(db, plan, current_user.id, "edit_plan_details")
    if {"start_date", "due_date"} & set(changes):
        _require(db, plan, current_user.id, "edit_schedule")
    if "name" in changes:
        changes["name"] = str(changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Plan name is required")
    for key, value in changes.items():
        setattr(plan, key, value)
    plan.update_date = _now_string()
    db.add(plan)
    _activity(db, plan, current_user.id, "plan.updated", {"fields": list(changes)})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def change_plan_status(db: Session, current_user: PublicUser, identifier: str, status: PlanStatus) -> dict:
    plan = _plan_or_404(db, identifier)
    permission = "complete_plan" if status in {PlanStatus.COMPLETED, PlanStatus.ACTIVE} else "archive_plan"
    _require(db, plan, current_user.id, permission)
    plan.status = status
    plan.completed_at = _now() if status == PlanStatus.COMPLETED else None
    plan.update_date = _now_string()
    db.add(plan)
    _activity(db, plan, current_user.id, f"plan.{status.value}")
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def delete_plan(db: Session, current_user: PublicUser, identifier: str) -> dict:
    plan = _plan_or_404(db, identifier)
    if plan.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the plan owner can delete this plan")
    uuid = plan.plan_uuid
    db.delete(plan)
    db.commit()
    return {"deleted": True, "plan_uuid": uuid}


def create_phase(db: Session, current_user: PublicUser, identifier: str, payload: PlanPhaseCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "edit_structure")
    if payload.start_date is not None or payload.due_date is not None:
        _require(db, plan, current_user.id, "edit_schedule")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Phase name is required")
    count = len(db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id)).all())
    now = _now_string()
    db.add(PlanPhase(
        phase_uuid=f"plan_phase_{uuid4()}", plan_id=int(plan.id), name=name,
        description=payload.description, position=count, start_date=payload.start_date,
        due_date=payload.due_date, creation_date=now, update_date=now,
    ))
    plan.update_date = now
    db.add(plan)
    _activity(db, plan, current_user.id, "phase.created", {"name": name})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def update_phase(db: Session, current_user: PublicUser, identifier: str, phase_uuid: str, payload: PlanPhaseUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    phase = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id, PlanPhase.phase_uuid == phase_uuid)).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Plan phase not found")
    changes = payload.model_dump(exclude_unset=True)
    structure_fields = {"name", "description", "position"} & set(changes)
    schedule_fields = {"start_date", "due_date"} & set(changes)
    if structure_fields:
        _require(db, plan, current_user.id, "edit_structure")
    if schedule_fields:
        _require(db, plan, current_user.id, "edit_schedule")
    if not changes:
        return _plan_dict(db, plan, current_user.id, True)
    if "name" in changes:
        changes["name"] = str(changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Phase name is required")
    if "position" in changes:
        changes["position"] = max(0, int(changes["position"]))
    for key, value in changes.items():
        setattr(phase, key, value)
    phase.update_date = _now_string()
    plan.update_date = phase.update_date
    db.add(phase)
    db.add(plan)
    _activity(db, plan, current_user.id, "phase.updated", {"phase_uuid": phase_uuid, "fields": sorted(changes)})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def delete_phase(db: Session, current_user: PublicUser, identifier: str, phase_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "edit_structure")
    phase = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id, PlanPhase.phase_uuid == phase_uuid)).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Plan phase not found")
    if db.exec(select(PlanObjective.id).where(PlanObjective.phase_id == phase.id)).first() is not None:
        raise HTTPException(status_code=409, detail="Move or remove this phase's objectives first")
    db.delete(phase)
    _activity(db, plan, current_user.id, "phase.deleted", {"phase_uuid": phase_uuid})
    db.commit()
    return {"deleted": True, "phase_uuid": phase_uuid}


def create_objective(db: Session, current_user: PublicUser, identifier: str, payload: PlanObjectiveCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "edit_structure")
    if payload.start_date is not None or payload.due_date is not None or payload.allow_late:
        _require(db, plan, current_user.id, "edit_schedule")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Objective title is required")
    phase = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id, PlanPhase.phase_uuid == payload.phase_uuid)).first() if payload.phase_uuid else db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id).order_by(PlanPhase.position)).first()
    badge = None
    if payload.kind == "badge":
        badge = db.exec(select(LearningBadge).where(LearningBadge.badge_uuid == payload.badge_uuid)).first()
        if not badge:
            raise HTTPException(status_code=404, detail="Badge not found")
    position = len(db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all())
    now = _now_string()
    objective = PlanObjective(
        objective_uuid=f"plan_objective_{uuid4()}", plan_id=int(plan.id), phase_id=phase.id if phase else None,
        title=title, description=payload.description, kind=payload.kind, position=position,
        priority=max(0, min(3, payload.priority)), badge_id=badge.id if badge else None,
        fields=payload.fields, start_date=payload.start_date, due_date=payload.due_date,
        allow_late=payload.allow_late, creation_date=now, update_date=now,
    )
    db.add(objective)
    db.flush()
    _progress_for(db, objective)
    plan.update_date = now
    db.add(plan)
    _activity(db, plan, current_user.id, "objective.created", {"objective_uuid": objective.objective_uuid})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def update_objective(db: Session, current_user: PublicUser, identifier: str, objective_uuid: str, payload: PlanObjectiveUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    objective = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id, PlanObjective.objective_uuid == objective_uuid)).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    changes = payload.model_dump(exclude_unset=True)
    structure_fields = {"phase_uuid", "title", "description", "priority", "fields", "blocked"} & set(changes)
    schedule_fields = {"start_date", "due_date", "allow_late"} & set(changes)
    if structure_fields:
        _require(db, plan, current_user.id, "edit_structure")
    if schedule_fields:
        _require(db, plan, current_user.id, "edit_schedule")
    if "title" in changes:
        changes["title"] = str(changes["title"] or "").strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Objective title is required")
    if "priority" in changes:
        changes["priority"] = max(0, min(3, int(changes["priority"])))
    if "phase_uuid" in changes:
        phase_uuid = changes.pop("phase_uuid")
        phase = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id, PlanPhase.phase_uuid == phase_uuid)).first() if phase_uuid else None
        if phase_uuid and not phase:
            raise HTTPException(status_code=404, detail="Plan phase not found")
        objective.phase_id = phase.id if phase else None
    for key, value in changes.items():
        setattr(objective, key, value)
    objective.update_date = _now_string()
    plan.update_date = objective.update_date
    db.add(objective)
    db.add(plan)
    _activity(db, plan, current_user.id, "objective.updated", {"objective_uuid": objective_uuid, "fields": sorted(payload.model_dump(exclude_unset=True))})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def delete_objective(db: Session, current_user: PublicUser, identifier: str, objective_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "edit_structure")
    objective = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id, PlanObjective.objective_uuid == objective_uuid)).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    db.delete(objective)
    _activity(db, plan, current_user.id, "objective.deleted", {"objective_uuid": objective_uuid})
    db.commit()
    return {"deleted": True, "objective_uuid": objective_uuid}


def update_objective_progress(db: Session, current_user: PublicUser, identifier: str, objective_uuid: str, payload: PlanObjectiveProgressUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    capabilities = _require(db, plan, current_user.id, "view_plan")
    objective = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id, PlanObjective.objective_uuid == objective_uuid)).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found")
    reviewing = payload.status in {PlanObjectiveStatus.CHANGES_REQUESTED, PlanObjectiveStatus.COMPLETED} and "review_objectives" in capabilities
    if not reviewing and "update_progress" not in capabilities:
        raise HTTPException(status_code=403, detail="You cannot update this objective")
    if objective.kind == "badge" and payload.status == PlanObjectiveStatus.COMPLETED and "review_objectives" not in capabilities:
        raise HTTPException(status_code=403, detail="Badge objectives complete from an award or reviewer action")
    progress = _progress_for(db, objective)
    progress.status = payload.status
    if payload.field_values is not None:
        definitions = {
            str(field.get("field_uuid") or field.get("key") or ""): field
            for field in objective.fields or []
            if field.get("field_uuid") or field.get("key")
        }
        unknown = set(payload.field_values) - set(definitions)
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown objective fields: {', '.join(sorted(unknown))}")
        for field_key in payload.field_values:
            lane = str(definitions[field_key].get("access") or definitions[field_key].get("lane") or "contributor")
            allowed = (
                lane == "either" and ({"contribute_fields", "contribute_reviewer_fields"} & capabilities)
            ) or (lane in {"contributor", "subject"} and "contribute_fields" in capabilities) or (
                lane in {"reviewer", "staff"} and "contribute_reviewer_fields" in capabilities
            )
            if not allowed:
                raise HTTPException(status_code=403, detail=f"You cannot complete the {lane} field '{field_key}'")
        progress.field_values = {**(progress.field_values or {}), **payload.field_values}
    if payload.note is not None:
        if reviewing:
            progress.reviewer_note = payload.note
            if payload.status == PlanObjectiveStatus.CHANGES_REQUESTED:
                progress.feedback_history = [*(progress.feedback_history or []), {"message": payload.note, "user_id": current_user.id, "created_at": _now_string()}]
        else:
            progress.subject_note = payload.note
    progress.completed_at = _now() if payload.status == PlanObjectiveStatus.COMPLETED else None
    progress.updated_by_user_id = current_user.id
    progress.update_date = _now_string()
    db.add(progress)
    _activity(db, plan, current_user.id, "objective.progress", {"objective_uuid": objective_uuid, "status": payload.status.value})
    db.commit()
    return _objective_dict(db, plan, objective, capabilities)


def create_role(db: Session, current_user: PublicUser, identifier: str, payload: PlanRoleCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_roles")
    key = _slug(payload.key).replace("-", "_")
    invalid = set(payload.capabilities) - ALL_CAPABILITIES
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unknown capabilities: {', '.join(sorted(invalid))}")
    existing_keys = set(db.exec(select(PlanRole.key).where(PlanRole.plan_id == plan.id)).all())
    if key in existing_keys:
        raise HTTPException(status_code=409, detail="Role key already exists")
    if set(payload.grantable_role_keys) - existing_keys:
        raise HTTPException(status_code=422, detail="A grantable role does not exist")
    _validate_role_authority(db, plan, current_user.id, payload.capabilities, payload.grantable_role_keys)
    now = _now_string()
    role = PlanRole(role_uuid=f"plan_role_{uuid4()}", plan_id=int(plan.id), key=key, name=payload.name.strip() or key, capabilities=payload.capabilities, grantable_role_keys=payload.grantable_role_keys, creation_date=now, update_date=now)
    db.add(role)
    _activity(db, plan, current_user.id, "role.created", {"key": key})
    db.commit()
    db.refresh(role)
    return {"role_uuid": role.role_uuid, "key": role.key, "name": role.name, "capabilities": role.capabilities, "grantable_role_keys": role.grantable_role_keys}


def _validate_role_authority(db: Session, plan: Plan, actor_user_id: int, capabilities: list[str], grantable_role_keys: list[str]) -> None:
    if plan.owner_user_id == actor_user_id:
        return
    actor = _collaboration(db, int(plan.id), actor_user_id)
    actor_capabilities = set(actor[1].capabilities or []) if actor else set()
    actor_grants = set(actor[1].grantable_role_keys or []) if actor else set()
    if set(capabilities) - actor_capabilities or set(grantable_role_keys) - actor_grants:
        raise HTTPException(status_code=403, detail="A role cannot grant permissions beyond your own")


def update_role(db: Session, current_user: PublicUser, identifier: str, role_uuid: str, payload: PlanRoleUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_roles")
    role = db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id, PlanRole.role_uuid == role_uuid)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Plan role not found")
    changes = payload.model_dump(exclude_unset=True)
    capabilities = changes.get("capabilities", role.capabilities or [])
    grantable = changes.get("grantable_role_keys", role.grantable_role_keys or [])
    invalid = set(capabilities) - ALL_CAPABILITIES
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unknown capabilities: {', '.join(sorted(invalid))}")
    existing_keys = set(db.exec(select(PlanRole.key).where(PlanRole.plan_id == plan.id)).all())
    if set(grantable) - existing_keys:
        raise HTTPException(status_code=422, detail="A grantable role does not exist")
    _validate_role_authority(db, plan, current_user.id, capabilities, grantable)
    if "name" in changes:
        changes["name"] = str(changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Role name is required")
    for key, value in changes.items():
        setattr(role, key, value)
    role.update_date = _now_string()
    db.add(role)
    _activity(db, plan, current_user.id, "role.updated", {"role_uuid": role_uuid, "fields": sorted(changes)})
    db.commit()
    return {"role_uuid": role.role_uuid, "key": role.key, "name": role.name, "capabilities": role.capabilities, "grantable_role_keys": role.grantable_role_keys}


def delete_role(db: Session, current_user: PublicUser, identifier: str, role_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_roles")
    role = db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id, PlanRole.role_uuid == role_uuid)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Plan role not found")
    if role.key in {"subject", "reviewer", "plan_admin", "viewer"}:
        raise HTTPException(status_code=422, detail="Default plan roles cannot be deleted")
    if db.exec(select(PlanCollaborator.id).where(PlanCollaborator.role_id == role.id, PlanCollaborator.active == True)).first() is not None:  # noqa: E712
        raise HTTPException(status_code=409, detail="Reassign collaborators before deleting this role")
    db.delete(role)
    _activity(db, plan, current_user.id, "role.deleted", {"role_uuid": role_uuid, "key": role.key})
    db.commit()
    return {"deleted": True, "role_uuid": role_uuid}


def create_invitation(db: Session, current_user: PublicUser, identifier: str, payload: PlanInvitationCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    capability = "manage_collaborators" if payload.kind == PlanInvitationKind.COLLABORATOR else "manage_collaborators"
    _require(db, plan, current_user.id, capability)
    actor_row = _collaboration(db, int(plan.id), current_user.id)
    role = db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id, PlanRole.key == payload.role_key)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Plan role not found")
    if plan.owner_user_id != current_user.id and actor_row and role.key not in (actor_row[1].grantable_role_keys or []):
        raise HTTPException(status_code=403, detail="Your role cannot grant that plan role")
    email = payload.email.strip()
    normalized = email.lower()
    target = db.exec(select(User).where(User.email == email)).first() or db.exec(select(User).where(User.email == normalized)).first()
    if target and _collaboration(db, int(plan.id), int(target.id)):
        raise HTTPException(status_code=409, detail="This person is already a collaborator")
    now = _now_string()
    invitation = PlanInvitation(
        invitation_uuid=f"plan_invitation_{uuid4()}", plan_id=int(plan.id), kind=payload.kind,
        email=email, email_normalized=normalized, target_user_id=target.id if target else None,
        role_id=int(role.id), invited_by_user_id=current_user.id,
        expires_at=_now() + timedelta(days=30), creation_date=now, update_date=now,
    )
    db.add(invitation)
    _activity(db, plan, current_user.id, "invitation.created", {"kind": payload.kind.value, "role_key": role.key})
    db.commit()
    db.refresh(invitation)
    return {"invitation_uuid": invitation.invitation_uuid, "status": "pending", "email": email, "kind": payload.kind.value, "role": role.name}


def create_collaborator_request(db: Session, current_user: PublicUser, identifier: str, payload: PlanCollaboratorRequestCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "request_collaborators")
    role = db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id, PlanRole.key == payload.role_key)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Plan role not found")
    email = payload.email.strip()
    normalized = email.lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="A valid email is required")
    existing = db.exec(select(PlanCollaboratorRequest).where(
        PlanCollaboratorRequest.plan_id == plan.id,
        PlanCollaboratorRequest.email_normalized == normalized,
        PlanCollaboratorRequest.status == PlanCollaboratorRequestStatus.PENDING,
    )).first()
    if existing:
        raise HTTPException(status_code=409, detail="A request for this person is already pending")
    now = _now_string()
    item = PlanCollaboratorRequest(
        request_uuid=f"plan_collaborator_request_{uuid4()}", plan_id=int(plan.id),
        requested_by_user_id=current_user.id, email=email, email_normalized=normalized,
        role_key=role.key, message=payload.message.strip(), creation_date=now, update_date=now,
    )
    db.add(item)
    _activity(db, plan, current_user.id, "collaborator.requested", {"request_uuid": item.request_uuid, "role_key": role.key})
    db.commit()
    return _collaborator_request_dict(db, item)


def _collaborator_request_dict(db: Session, item: PlanCollaboratorRequest) -> dict:
    return {
        "request_uuid": item.request_uuid,
        "email": item.email,
        "role_key": item.role_key,
        "message": item.message,
        "status": item.status.value if hasattr(item.status, "value") else item.status,
        "requested_by": _user_summary(db, item.requested_by_user_id),
        "resolved_by": _user_summary(db, item.resolved_by_user_id),
        "creation_date": item.creation_date,
        "responded_at": item.responded_at,
    }


def list_collaborator_requests(db: Session, current_user: PublicUser, identifier: str) -> list[dict]:
    plan = _plan_or_404(db, identifier)
    capabilities = _require(db, plan, current_user.id, "view_plan")
    statement = select(PlanCollaboratorRequest).where(PlanCollaboratorRequest.plan_id == plan.id)
    if "manage_collaborators" not in capabilities:
        statement = statement.where(PlanCollaboratorRequest.requested_by_user_id == current_user.id)
    rows = db.exec(statement.order_by(PlanCollaboratorRequest.id.desc())).all()
    return [_collaborator_request_dict(db, item) for item in rows]


def respond_to_collaborator_request(db: Session, current_user: PublicUser, identifier: str, request_uuid: str, approve: bool) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_collaborators")
    item = db.exec(select(PlanCollaboratorRequest).where(
        PlanCollaboratorRequest.plan_id == plan.id,
        PlanCollaboratorRequest.request_uuid == request_uuid,
        PlanCollaboratorRequest.status == PlanCollaboratorRequestStatus.PENDING,
    )).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pending collaborator request not found")
    invitation = None
    if approve:
        invitation = create_invitation(db, current_user, identifier, PlanInvitationCreate(
            email=item.email, role_key=item.role_key, kind=PlanInvitationKind.COLLABORATOR,
        ))
    item.status = PlanCollaboratorRequestStatus.APPROVED if approve else PlanCollaboratorRequestStatus.DECLINED
    item.resolved_by_user_id = current_user.id
    item.responded_at = _now()
    item.update_date = _now_string()
    db.add(item)
    _activity(db, plan, current_user.id, "collaborator.request_resolved", {"request_uuid": request_uuid, "approved": approve})
    db.commit()
    result = _collaborator_request_dict(db, item)
    result["invitation"] = invitation
    return result


def update_collaborator(db: Session, current_user: PublicUser, identifier: str, collaborator_uuid: str, payload: PlanCollaboratorUpdate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_collaborators")
    collaborator = db.exec(select(PlanCollaborator).where(
        PlanCollaborator.plan_id == plan.id, PlanCollaborator.collaborator_uuid == collaborator_uuid,
    )).first()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    if collaborator.user_id == plan.owner_user_id:
        raise HTTPException(status_code=422, detail="Transfer ownership before changing the owner's role")
    role = db.exec(select(PlanRole).where(PlanRole.plan_id == plan.id, PlanRole.key == payload.role_key)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Plan role not found")
    actor = _collaboration(db, int(plan.id), current_user.id)
    if plan.owner_user_id != current_user.id and actor and role.key not in (actor[1].grantable_role_keys or []):
        raise HTTPException(status_code=403, detail="Your role cannot grant that plan role")
    collaborator.role_id = int(role.id)
    collaborator.update_date = _now_string()
    db.add(collaborator)
    _activity(db, plan, current_user.id, "collaborator.role_changed", {"collaborator_uuid": collaborator_uuid, "role_key": role.key})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def remove_collaborator(db: Session, current_user: PublicUser, identifier: str, collaborator_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_collaborators")
    collaborator = db.exec(select(PlanCollaborator).where(
        PlanCollaborator.plan_id == plan.id, PlanCollaborator.collaborator_uuid == collaborator_uuid,
    )).first()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    if collaborator.user_id == plan.owner_user_id:
        raise HTTPException(status_code=422, detail="Transfer ownership before removing the owner")
    collaborator.active = False
    collaborator.update_date = _now_string()
    db.add(collaborator)
    _activity(db, plan, current_user.id, "collaborator.removed", {"collaborator_uuid": collaborator_uuid})
    db.commit()
    return {"removed": True, "collaborator_uuid": collaborator_uuid}


def leave_plan(db: Session, current_user: PublicUser, identifier: str) -> dict:
    plan = _plan_or_404(db, identifier)
    if plan.owner_user_id == current_user.id:
        raise HTTPException(status_code=422, detail="Transfer ownership before leaving this plan")
    collaborator = db.exec(select(PlanCollaborator).where(
        PlanCollaborator.plan_id == plan.id,
        PlanCollaborator.user_id == current_user.id,
        PlanCollaborator.active == True,  # noqa: E712
    )).first()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Plan not found")
    collaborator.active = False
    collaborator.update_date = _now_string()
    db.add(collaborator)
    _activity(db, plan, current_user.id, "collaborator.left", {"collaborator_uuid": collaborator.collaborator_uuid})
    db.commit()
    return {"left": True, "plan_uuid": plan.plan_uuid}


def list_activity(db: Session, current_user: PublicUser, identifier: str) -> list[dict]:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "view_plan")
    rows = db.exec(select(PlanActivity).where(
        PlanActivity.plan_id == plan.id,
    ).order_by(PlanActivity.id.desc())).all()
    return [{
        "activity_uuid": item.activity_uuid,
        "action": item.action,
        "actor": _user_summary(db, item.actor_user_id),
        "payload": item.payload or {},
        "creation_date": item.creation_date,
    } for item in rows]


def add_comment(db: Session, current_user: PublicUser, identifier: str, payload: PlanCommentCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "comment")
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Comment is required")
    _activity(db, plan, current_user.id, "comment.added", {"body": body})
    db.commit()
    return list_activity(db, current_user, identifier)[0]


def _attachment_dict(asset: MediaAsset, attachment: PlanAttachment) -> dict:
    return {
        "asset_uuid": asset.asset_uuid,
        "title": asset.title,
        "url": asset.url,
        "thumbnail_url": asset.thumbnail_url,
        "filename": asset.filename,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "added_by_user_id": attachment.added_by_user_id,
        "creation_date": attachment.creation_date,
    }


def list_attachments(db: Session, current_user: PublicUser, identifier: str) -> list[dict]:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "view_plan")
    rows = db.exec(select(PlanAttachment, MediaAsset).join(
        MediaAsset, MediaAsset.id == PlanAttachment.asset_id,
    ).where(PlanAttachment.plan_id == plan.id).order_by(PlanAttachment.id.desc())).all()
    return [_attachment_dict(asset, attachment) for attachment, asset in rows]


def add_attachment(db: Session, current_user: PublicUser, identifier: str, payload: PlanAttachmentCreate) -> dict:
    plan = _plan_or_404(db, identifier)
    capabilities = capabilities_for(db, plan, current_user.id)
    if not ({"contribute_fields", "contribute_reviewer_fields", "edit_plan_details"} & capabilities):
        raise HTTPException(status_code=404 if not capabilities else 403, detail="Plan not found" if not capabilities else "You cannot add plan attachments")
    asset = db.exec(select(MediaAsset).where(MediaAsset.asset_uuid == payload.asset_uuid)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if plan.source_org_id:
        valid_owner = asset.owner_type == MediaOwnerType.org and asset.owner_org_id == plan.source_org_id
    else:
        valid_owner = asset.owner_type == MediaOwnerType.user and asset.owner_user_id == plan.owner_user_id
    if not valid_owner:
        raise HTTPException(status_code=403, detail="Use media owned by this plan's organization or owner")
    mime_type = (asset.mime_type or "").lower()
    if not (mime_type.startswith("image/") or mime_type.startswith("video/") or mime_type == "application/pdf"):
        raise HTTPException(status_code=422, detail="Plan attachments must be an image, video, or PDF")
    existing = db.exec(select(PlanAttachment).where(
        PlanAttachment.plan_id == plan.id, PlanAttachment.asset_id == asset.id,
    )).first()
    if existing:
        return _attachment_dict(asset, existing)
    attachment = PlanAttachment(
        plan_id=int(plan.id), asset_id=int(asset.id), added_by_user_id=current_user.id,
        creation_date=_now_string(),
    )
    db.add(attachment)
    db.flush()
    _activity(db, plan, current_user.id, "attachment.added", {"asset_uuid": asset.asset_uuid})
    db.commit()
    return _attachment_dict(asset, attachment)


def remove_attachment(db: Session, current_user: PublicUser, identifier: str, asset_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    capabilities = _require(db, plan, current_user.id, "view_plan")
    row = db.exec(select(PlanAttachment, MediaAsset).join(
        MediaAsset, MediaAsset.id == PlanAttachment.asset_id,
    ).where(PlanAttachment.plan_id == plan.id, MediaAsset.asset_uuid == asset_uuid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Plan attachment not found")
    attachment, _ = row
    if attachment.added_by_user_id != current_user.id and not ({"edit_plan_details", "manage_collaborators"} & capabilities):
        raise HTTPException(status_code=403, detail="You cannot remove this attachment")
    db.delete(attachment)
    _activity(db, plan, current_user.id, "attachment.removed", {"asset_uuid": asset_uuid})
    db.commit()
    return {"removed": True, "asset_uuid": asset_uuid}


def transfer_ownership(db: Session, current_user: PublicUser, identifier: str, payload: PlanOwnershipTransfer) -> dict:
    plan = _plan_or_404(db, identifier)
    if plan.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can transfer ownership")
    target = _collaboration(db, int(plan.id), payload.user_id)
    if not target:
        raise HTTPException(status_code=422, detail="The new owner must be an active collaborator")
    plan.owner_user_id = payload.user_id
    plan.update_date = _now_string()
    db.add(plan)
    _activity(db, plan, current_user.id, "ownership.transferred", {"new_owner_user_id": payload.user_id})
    db.commit()
    return _plan_dict(db, plan, current_user.id, True)


def list_my_invitations(db: Session, current_user: PublicUser) -> list[dict]:
    from src.db.programs import ProgramAssignment

    normalized = str(current_user.email).strip().lower()
    invitations = db.exec(select(PlanInvitation).where(
        ((PlanInvitation.target_user_id == current_user.id) | (PlanInvitation.email_normalized == normalized)),
        PlanInvitation.status == PlanInvitationStatus.PENDING,
    ).order_by(PlanInvitation.creation_date.desc())).all()
    result = []
    for invitation in invitations:
        plan = db.get(Plan, invitation.plan_id)
        role = db.get(PlanRole, invitation.role_id)
        if not plan or not role:
            continue
        if plan.source_assignment_id:
            assignment = db.get(ProgramAssignment, plan.source_assignment_id)
            if assignment and assignment.initiate_date:
                available_at = assignment.initiate_date
                if available_at.tzinfo is None:
                    available_at = available_at.replace(tzinfo=timezone.utc)
                if available_at > _now():
                    continue
        result.append({
            "invitation_uuid": invitation.invitation_uuid, "kind": invitation.kind,
            "status": invitation.status, "unread": invitation.viewed_at is None,
            "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name, "description": plan.description},
            "subject": _user_summary(db, plan.subject_user_id), "invited_by": _user_summary(db, invitation.invited_by_user_id),
            "role": {"key": role.key, "name": role.name}, "expires_at": invitation.expires_at,
        })
    return result


def respond_to_invitation(db: Session, current_user: PublicUser, invitation_uuid: str, accept: bool) -> dict:
    from src.db.programs import ProgramAssignment

    normalized = str(current_user.email).strip().lower()
    invitation = db.exec(select(PlanInvitation).where(
        PlanInvitation.invitation_uuid == invitation_uuid,
        ((PlanInvitation.target_user_id == current_user.id) | (PlanInvitation.email_normalized == normalized)),
        PlanInvitation.status == PlanInvitationStatus.PENDING,
    )).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Plan invitation not found")
    if invitation.expires_at:
        expires_at = invitation.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < _now():
            raise HTTPException(status_code=410, detail="Plan invitation expired")
    plan = db.get(Plan, invitation.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.source_assignment_id:
        assignment = db.get(ProgramAssignment, plan.source_assignment_id)
        if assignment and assignment.initiate_date:
            available_at = assignment.initiate_date
            if available_at.tzinfo is None:
                available_at = available_at.replace(tzinfo=timezone.utc)
            if available_at > _now():
                raise HTTPException(status_code=409, detail="This plan invitation is not available yet")
    invitation.status = PlanInvitationStatus.ACCEPTED if accept else PlanInvitationStatus.DECLINED
    invitation.target_user_id = current_user.id
    invitation.viewed_at = invitation.viewed_at or _now()
    invitation.responded_at = _now()
    invitation.update_date = _now_string()
    db.add(invitation)
    if accept:
        existing = _collaboration(db, int(plan.id), current_user.id)
        if not existing:
            db.add(PlanCollaborator(
                collaborator_uuid=f"plan_collaborator_{uuid4()}", plan_id=int(plan.id), user_id=current_user.id,
                role_id=invitation.role_id, creation_date=_now_string(), update_date=_now_string(),
            ))
        if invitation.kind == PlanInvitationKind.SUBJECT:
            plan.subject_user_id = current_user.id
            plan.status = PlanStatus.ACTIVE
            db.add(plan)
        _activity(db, plan, current_user.id, "invitation.accepted", {"kind": str(invitation.kind.value if hasattr(invitation.kind, "value") else invitation.kind)})
    db.commit()
    return {"invitation_uuid": invitation_uuid, "status": invitation.status.value if hasattr(invitation.status, "value") else invitation.status}


def feed(db: Session, current_user: PublicUser, scope: str = "all", plan_uuid: str | None = None, explore_all: bool = False) -> dict:
    accessible_plans = db.exec(
        select(Plan).join(PlanCollaborator, PlanCollaborator.plan_id == Plan.id)
        .where(PlanCollaborator.user_id == current_user.id, PlanCollaborator.active == True, Plan.status == PlanStatus.ACTIVE)  # noqa: E712
    ).all()
    has_helping = any(plan.subject_user_id != current_user.id for plan in accessible_plans)
    plans = accessible_plans
    if plan_uuid:
        plans = [plan for plan in plans if plan.plan_uuid == plan_uuid]
    if scope == "mine":
        plans = [plan for plan in plans if plan.subject_user_id == current_user.id]
    elif scope == "helping":
        plans = [plan for plan in plans if plan.subject_user_id != current_user.id]
    today = date.today()
    coming_cutoff = today + timedelta(days=7)
    coming, explore, future = [], [], []
    for plan in plans:
        capabilities = capabilities_for(db, plan, current_user.id)
        collaborator_rows = db.exec(
            select(PlanCollaborator, PlanRole)
            .join(PlanRole, PlanRole.id == PlanCollaborator.role_id)
            .where(PlanCollaborator.plan_id == plan.id, PlanCollaborator.active == True)  # noqa: E712
        ).all()
        completers = [
            _user_summary(db, collaborator.user_id)
            for collaborator, role in collaborator_rows
            if {"update_progress", "review_objectives"} & set(role.capabilities or [])
        ]
        objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all()
        for objective in objectives:
            item = _objective_dict(db, plan, objective, capabilities)
            status = item["progress"]["status"]
            if status in {PlanObjectiveStatus.COMPLETED.value, PlanObjectiveStatus.CANCELED.value}:
                continue
            actionable_review = status == PlanObjectiveStatus.SUBMITTED.value and "review_objectives" in capabilities
            if status == PlanObjectiveStatus.SUBMITTED.value and not actionable_review and plan.subject_user_id != current_user.id:
                continue
            card = {
                **item, "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name},
                "subject": _user_summary(db, plan.subject_user_id), "is_mine": plan.subject_user_id == current_user.id,
                "action_type": "review" if actionable_review else "objective", "completers": completers,
            }
            if actionable_review or status == PlanObjectiveStatus.CHANGES_REQUESTED.value or (objective.due_date and objective.due_date <= coming_cutoff):
                coming.append(card)
            elif not objective.due_date and not objective.blocked:
                explore.append(card)
            elif objective.due_date:
                future.append(card)
    coming.sort(key=lambda item: (0 if item.get("due_date") and item["due_date"] < today else 1, 0 if item["action_type"] == "review" else 1, item.get("due_date") or date.max))
    explore.sort(key=lambda item: (0 if item["progress"]["status"] == "in_progress" else 1, -int(item["priority"]), item["plan"]["name"].lower()))
    future.sort(key=lambda item: item["due_date"])
    groups = _adaptive_future_groups(future, today)
    return {
        "scope": scope, "has_helping": has_helping,
        "coming_up": coming, "explore": explore if explore_all else explore[:5], "explore_total": len(explore), "future_groups": groups,
    }


def review_queue(db: Session, current_user: PublicUser) -> list[dict]:
    """Return custom-objective and badge work currently assigned to this reviewer."""
    result = feed(db, current_user, "helping")
    return [item for item in result["coming_up"] if item["action_type"] == "review"]


def _adaptive_future_groups(items: list[dict], today: date) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    labels: dict[str, str] = {}
    one_year = today + timedelta(days=365)
    for item in items:
        due = item["due_date"]
        if due <= one_year:
            key = due.strftime("%Y-%m")
            labels[key] = due.strftime("%B %Y")
        else:
            key = str(due.year)
            labels[key] = str(due.year)
        buckets.setdefault(key, []).append(item)
    expanded: list[tuple[str, str, list[dict]]] = []
    for key in sorted(buckets):
        values = buckets[key]
        if len(values) <= 10:
            expanded.append((key, labels[key], values))
            continue
        by_segment: dict[str, list[dict]] = {}
        for item in values:
            due = item["due_date"]
            segment = f"{due.year}-W{due.isocalendar().week:02d}" if len(key) == 7 else f"{due.year}-Q{((due.month - 1) // 3) + 1}"
            by_segment.setdefault(segment, []).append(item)
        expanded.extend((segment, segment.split("-", 1)[-1].replace("W", "Week ").replace("Q", "Quarter ") + f" {values[0]['due_date'].year}", group) for segment, group in sorted(by_segment.items()))
    merged: list[dict] = []
    for key, label, values in expanded:
        if merged and len(merged[-1]["items"]) + len(values) <= 6:
            merged[-1]["label"] = f"{merged[-1]['label']} – {label}"
            merged[-1]["items"].extend(values)
        else:
            merged.append({"key": key, "label": label, "items": list(values)})
    return merged
