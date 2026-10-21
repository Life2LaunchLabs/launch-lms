"""A learner's requirement status for the staff who support them, and framework coverage by template.

Counselors use this to find what a learner is missing and close it: by adding a
make-up step to that learner's plan, or by crediting the requirement with a note.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanPhase, PlanStatus
from src.db.programs import Objective, Program, ProgramObjective
from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementEnrollmentStatus,
)
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.services.plan_admin import OPEN_STATUSES, REVIEW, _now, _person, _record, _value
from src.services.planning import capabilities_for


def _review_plans(db: Session, current_user: PublicUser, org_id: int, user_ids: list[int]) -> list[Plan]:
    return [plan for plan in db.exec(select(Plan).where(
        Plan.source_org_id == org_id, Plan.subject_user_id.in_(user_ids or [-1]), Plan.source_assignment_id.is_not(None),  # type: ignore[union-attr]
        Plan.status != PlanStatus.ARCHIVED,
    )).all() if REVIEW in capabilities_for(db, plan, current_user.id)]


def _can_manage_learner(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> list[Plan]:
    """The learner's assignment plans this staff member can review. Admins may look even when there are none."""
    require_org_membership(current_user.id, org_id, db)
    plans = _review_plans(db, current_user, org_id, [user_id])
    if not plans and not is_org_admin(current_user.id, org_id, db):
        raise HTTPException(status_code=403, detail="You do not support this learner")
    return plans


def _planned_steps(db: Session, plans: list[Plan]) -> dict[str, list[dict]]:
    """Steps in these plans that count toward each requirement node, with their state."""
    planned: dict[str, list[dict]] = {}
    for plan in plans:
        for objective in db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all():
            if not objective.requirement_mappings:
                continue
            progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
            status = _value(progress.status) if progress else "not_started"
            due = objective.due_date
            for mapping in objective.requirement_mappings:
                planned.setdefault(str(mapping.get("node_uuid")), []).append({
                    "plan_uuid": plan.plan_uuid, "plan_name": plan.name, "plan_objective_uuid": objective.objective_uuid,
                    "title": objective.title, "status": status, "due_date": due,
                    "overdue": bool(due and due < date.today() and status not in {"completed", "canceled"}),
                })
    return planned


def _enrollments(db: Session, org_id: int, user_ids: list[int]) -> list[RequirementEnrollment]:
    from src.services.requirements import sync_group_batches

    sync_group_batches(db, org_id)
    db.commit()
    return list(db.exec(select(RequirementEnrollment).where(
        RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id.in_(user_ids or [-1]),
        RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN,
    ).order_by(RequirementEnrollment.id)).all())


def _framework_status(db: Session, enrollment: RequirementEnrollment, planned: dict[str, list[dict]]) -> dict:
    snapshot = enrollment.framework_snapshot or {}
    leaves = snapshot.get("leaf_node_uuids") or []
    source_by_node: dict[str, list] = {}
    for source in db.exec(select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id,
        RequirementAttainmentSource.revoked_at.is_(None),  # type: ignore[union-attr]
    )).all():
        source_by_node.setdefault(source.node_uuid, []).append(source)
    nodes = []
    for node in snapshot.get("nodes") or []:
        node_uuid = node["node_uuid"]
        is_leaf = node_uuid in leaves
        steps = planned.get(node_uuid, [])
        if not is_leaf:
            state = None
        elif source_by_node.get(node_uuid):
            state = "met"
        elif any(step["status"] not in {"completed", "canceled"} and not step["overdue"] for step in steps):
            state = "planned"
        else:
            state = "gap"
        nodes.append({
            **node, "leaf": is_leaf, "state": state, "steps": steps,
            "sources": [{
                "source_uuid": item.source_uuid, "title": item.objective_title,
                "note": (item.evidence_snapshot or {}).get("note"), "kind": (item.evidence_snapshot or {}).get("kind") or "step",
                "verified_by": _person(db.get(User, item.verified_by_user_id)) if item.verified_by_user_id else None,
                "verified_at": item.verified_at,
            } for item in source_by_node.get(node_uuid, [])],
        })
    return {
        "enrollment_uuid": enrollment.enrollment_uuid, "framework_uuid": snapshot.get("framework_uuid"),
        "name": snapshot.get("name"), "version": snapshot.get("version"),
        "status": _value(enrollment.status), "met": sum(1 for node in nodes if node["state"] == "met"), "total": len(leaves),
        "gaps": sum(1 for node in nodes if node["state"] == "gap"), "nodes": nodes,
    }


def learner_requirements(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    plans = _can_manage_learner(db, current_user, org_id, user_id)
    planned = _planned_steps(db, plans)
    return {
        "user_id": user_id,
        "frameworks": [_framework_status(db, enrollment, planned) for enrollment in _enrollments(db, org_id, [user_id])],
        "plans": [{"plan_uuid": plan.plan_uuid, "name": plan.name, "status": _value(plan.status)} for plan in plans],
    }


def group_requirements(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int, framework_uuid: str | None = None) -> dict:
    """Learners by requirement for one group: the same shape as the group plans grid, for one framework at a time."""
    require_org_membership(current_user.id, org_id, db)
    group = db.get(UserGroup, usergroup_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    member_ids = list(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == usergroup_id)).all())
    plans = _review_plans(db, current_user, org_id, member_ids)
    if not is_org_admin(current_user.id, org_id, db):
        member_ids = sorted({int(plan.subject_user_id) for plan in plans if plan.subject_user_id})
        if not member_ids:
            raise HTTPException(status_code=403, detail="You do not support anyone in this group")
    enrollments = _enrollments(db, org_id, member_ids)
    frameworks: dict[str, dict] = {}
    for enrollment in enrollments:
        snapshot = enrollment.framework_snapshot or {}
        entry = frameworks.setdefault(str(snapshot.get("framework_uuid")), {"framework_uuid": snapshot.get("framework_uuid"), "name": snapshot.get("name"), "learner_count": 0})
        entry["learner_count"] += 1
    chosen = framework_uuid if framework_uuid in frameworks else next(iter(frameworks), None)
    chosen_enrollments = [item for item in enrollments if str((item.framework_snapshot or {}).get("framework_uuid")) == chosen]
    # Columns come from the newest version any learner is on; older versions just leave unknown cells empty.
    newest = max(chosen_enrollments, key=lambda item: int((item.framework_snapshot or {}).get("version") or 0), default=None)
    planned_by_user: dict[int, list[Plan]] = {}
    for plan in plans:
        planned_by_user.setdefault(int(plan.subject_user_id or 0), []).append(plan)
    learners = []
    for enrollment in chosen_enrollments:
        status = _framework_status(db, enrollment, _planned_steps(db, planned_by_user.get(enrollment.user_id, [])))
        learners.append({
            **_person(db.get(User, enrollment.user_id)), "enrollment_uuid": enrollment.enrollment_uuid,
            "version": status["version"], "met": status["met"], "total": status["total"], "gaps": status["gaps"],
            "cells": {node["node_uuid"]: node["state"] for node in status["nodes"] if node["leaf"]},
        })
    learners.sort(key=lambda item: f"{item.get('first_name') or ''} {item.get('last_name') or ''} {item.get('username') or ''}".strip().lower())
    return {
        "group": {"id": group.id, "name": group.name}, "frameworks": list(frameworks.values()), "framework_uuid": chosen,
        "nodes": (newest.framework_snapshot or {}).get("nodes") or [] if newest else [],
        "leaf_node_uuids": (newest.framework_snapshot or {}).get("leaf_node_uuids") or [] if newest else [],
        "learners": learners,
        "not_enrolled": len(set(member_ids) - {item.user_id for item in enrollments}),
    }


def makeup_options(db: Session, current_user: PublicUser, org_id: int, user_id: int, node_uuid: str) -> list[dict]:
    """Template steps in this organization that also meet a requirement node."""
    _can_manage_learner(db, current_user, org_id, user_id)
    rows = db.exec(
        select(ProgramObjectiveRequirement, ProgramObjective, Objective, Program)
        .join(ProgramObjective, ProgramObjective.id == ProgramObjectiveRequirement.program_objective_id)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .join(Program, Program.id == ProgramObjective.program_id)
        .where(ProgramObjectiveRequirement.node_uuid == node_uuid, Program.org_id == org_id, Objective.archived == False)  # noqa: E712
    ).all()
    return [{
        "objective_uuid": objective.objective_uuid, "title": objective.title, "description": objective.description,
        "template": {"program_uuid": program.program_uuid, "name": program.name},
        "step_types": sorted({str(field.get("type") or "text") for field in objective.custom_fields or []}),
    } for _, _, objective, program in rows]


def add_makeup_step(db: Session, current_user: PublicUser, org_id: int, user_id: int, plan_uuid: str, node_uuid: str,
                    objective_uuid: str | None = None, title: str | None = None, due_date: date | None = None) -> dict:
    """Add a step to one learner's plan that counts toward a requirement they are missing."""
    plans = _can_manage_learner(db, current_user, org_id, user_id)
    plan = next((item for item in plans if item.plan_uuid == plan_uuid), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found for this learner")
    from src.services.requirements import mappable_nodes

    framework = mappable_nodes(db, org_id).get(node_uuid)
    if not framework:
        raise HTTPException(status_code=404, detail="Requirement not found")
    source = db.exec(select(Objective).where(Objective.objective_uuid == objective_uuid, Objective.org_id == org_id)).first() if objective_uuid else None
    if objective_uuid and not source:
        raise HTTPException(status_code=404, detail="Step not found")
    step_title = (title or "").strip() or (source.title if source else "")
    if not step_title:
        raise HTTPException(status_code=422, detail="Name the make-up step")
    from src.services.planning import _materialized_objective_fields

    fields = _materialized_objective_fields(db, {"custom_fields": source.custom_fields, "badge_id": source.badge_id, "objective_uuid": source.objective_uuid}) if source else []
    # Put it in the chapter the learner is working in: the first one with open work.
    phases = db.exec(select(PlanPhase).where(PlanPhase.plan_id == plan.id).order_by(PlanPhase.position)).all()
    objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all()
    open_phase_ids = set()
    for objective in objectives:
        progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
        if objective.phase_id and (not progress or progress.status in OPEN_STATUSES):
            open_phase_ids.add(objective.phase_id)
    phase = next((item for item in phases if item.id in open_phase_ids), phases[-1] if phases else None)
    now = _now().isoformat()
    objective = PlanObjective(
        objective_uuid=f"plan_objective_{uuid4()}", plan_id=int(plan.id), phase_id=phase.id if phase else None,
        title=step_title, description=source.description if source else "", kind="custom",
        position=len(objectives), badge_id=source.badge_id if source else None, fields=fields,
        due_date=due_date, completion_restricted=not (source.allow_learner_confirmation if source else False),
        requirement_mappings=[{"framework_id": int(framework.id), "framework_uuid": framework.framework_uuid, "node_uuid": node_uuid}],
        reviewer_guidance=source.reviewer_guidance if source else "", creation_date=now, update_date=now,
    )
    db.add(objective)
    db.flush()
    db.add(PlanObjectiveProgress(progress_uuid=f"plan_progress_{uuid4()}", plan_objective_id=int(objective.id), creation_date=now, update_date=now))
    plan.update_date = now
    db.add(plan)
    _record(db, plan, int(current_user.id), "objective.created", {"objective_uuid": objective.objective_uuid, "makeup_for": node_uuid})
    db.commit()
    return {"plan_uuid": plan.plan_uuid, "plan_objective_uuid": objective.objective_uuid, "title": objective.title}


def credit_requirement(db: Session, current_user: PublicUser, org_id: int, user_id: int, enrollment_uuid: str, node_uuid: str, note: str) -> dict:
    """Staff attest that a learner meets a requirement, with the reason on record."""
    from src.services.requirements import _recompute_enrollment

    note = (note or "").strip()
    if not note:
        raise HTTPException(status_code=422, detail="Say why this counts")
    _can_manage_learner(db, current_user, org_id, user_id)
    enrollment = db.exec(select(RequirementEnrollment).where(
        RequirementEnrollment.enrollment_uuid == enrollment_uuid, RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id == user_id,
    )).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Requirement enrollment not found")
    if node_uuid not in set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or []):
        raise HTTPException(status_code=422, detail="Only individual requirements can be credited")
    now = _now()
    source = db.exec(select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id, RequirementAttainmentSource.node_uuid == node_uuid,
        RequirementAttainmentSource.plan_objective_progress_id.is_(None), RequirementAttainmentSource.objective_progress_id.is_(None),  # type: ignore[union-attr]
    )).first() or RequirementAttainmentSource(
        source_uuid=f"requirement_source_{uuid4()}", enrollment_id=int(enrollment.id), node_uuid=node_uuid, creation_date=now.isoformat(),
    )
    source.objective_title = "Credited by staff"
    source.evidence_snapshot = {"kind": "staff_credit", "note": note[:2000]}
    source.verified_by_user_id = current_user.id
    source.verified_at = now
    source.revoked_at = None
    source.update_date = now.isoformat()
    db.add(source)
    db.flush()
    _recompute_enrollment(db, enrollment)
    db.commit()
    return {"source_uuid": source.source_uuid, "node_uuid": node_uuid}


def coverage(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    """The framework's current nodes, each with the template objectives that count toward it."""
    from src.services.requirements import _framework_dict, _framework_or_404

    require_org_admin(current_user.id, org_id, db, "see_reports")
    framework = _framework_or_404(db, org_id, framework_uuid)
    rows = db.exec(
        select(ProgramObjectiveRequirement, ProgramObjective, Objective, Program)
        .join(ProgramObjective, ProgramObjective.id == ProgramObjectiveRequirement.program_objective_id)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .join(Program, Program.id == ProgramObjective.program_id)
        .where(ProgramObjectiveRequirement.framework_id == framework.id, Program.org_id == org_id)
    ).all()
    by_node: dict[str, list[dict]] = {}
    templates: dict[str, dict] = {}
    for _, _, objective, program in rows:
        templates[program.program_uuid] = {"program_uuid": program.program_uuid, "name": program.name}
    for mapping, _, objective, program in rows:
        by_node.setdefault(mapping.node_uuid, []).append({
            "program_uuid": program.program_uuid, "objective_uuid": objective.objective_uuid, "title": objective.title,
            "step_types": sorted({str(field.get("type") or "text") for field in objective.custom_fields or []}),
        })
    all_templates = db.exec(select(Program).where(Program.org_id == org_id).order_by(Program.name)).all()
    framework_view = _framework_dict(db, framework)
    return {
        "framework": {key: framework_view[key] for key in ("framework_uuid", "name", "description", "version", "status", "source_framework_uuid", "source_metadata")},
        "templates": [{"program_uuid": item.program_uuid, "name": item.name, "mapped": item.program_uuid in templates} for item in all_templates],
        "nodes": [{**node, "covered_by": by_node.get(node["node_uuid"], [])} for node in framework_view["nodes"]],
    }
