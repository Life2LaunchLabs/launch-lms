"""A legacy template's working draft, read the way the plan code read it.

``program_phases`` rebuilds the phase and objective dicts the old template
service produced, and ``draft_fingerprint`` the hash it stored on each
published version, so the move can tell whether a template's draft still
matched its published version.
"""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningBadge, LearningPage
from src.db.requirements import RequirementFramework, RequirementNode
from src.services.goals.migration.legacy_tables import (
    LEARNING_ACTIVITY,
    FrozenActivity,
    Objective,
    Program,
    ProgramObjective,
    ProgramObjectiveRequirement,
    ProgramPhase,
)
from src.services.learning.activity_copy import activity_hash, content_hash

PHASE_FIELDS = ("phase_uuid", "name", "description", "position", "target_days", "suggested_duration_weeks")
TEMPLATE_FIELDS = ("name", "description", "instructions", "step_order", "role_definitions", "default_subject_role_key", "default_staff_role_key")


def _mappings(db: Session, relation: ProgramObjective) -> list[dict]:
    from src.services.requirements import _available, _version

    if not _available(db):
        return []
    rows = db.exec(select(ProgramObjectiveRequirement, RequirementFramework).join(
        RequirementFramework, RequirementFramework.id == ProgramObjectiveRequirement.framework_id,  # type: ignore[arg-type]
    ).where(ProgramObjectiveRequirement.program_objective_id == relation.id)).all()
    result = []
    for mapping, framework in rows:
        version = _version(db, framework)
        node = db.exec(select(RequirementNode).where(RequirementNode.version_id == version.id, RequirementNode.node_uuid == mapping.node_uuid)).first()
        result.append({
            "framework_id": framework.id, "framework_uuid": framework.framework_uuid, "framework_name": framework.name, "node_uuid": mapping.node_uuid,
            "node_code": node.code if node else "", "node_title": node.title if node else "Retired requirement",
        })
    return result


def _activity(db: Session, objective: Objective) -> dict:
    """The objective's editable activity (never a frozen copy)."""
    activity_id = db.exec(
        select(LEARNING_ACTIVITY.c.id).where(LEARNING_ACTIVITY.c.objective_id == objective.id, LEARNING_ACTIVITY.c.id.not_in(select(FrozenActivity.activity_id)))
        .order_by(LEARNING_ACTIVITY.c.id)
    ).first()
    activity = db.get(LearningActivity, activity_id) if activity_id else None
    if not activity:
        return {}
    pages = db.exec(select(LearningPage.id).where(LearningPage.activity_id == activity.id)).all()
    return {"activity_id": activity.id, "activity": {"activity_uuid": activity.activity_uuid, "title": activity.title, "page_count": len(pages)}}


def _objective(db: Session, objective: Objective, relation: ProgramObjective) -> dict:
    item = {
        "id": objective.id, "objective_uuid": objective.objective_uuid, "title": objective.title, "description": objective.description,
        "kind": objective.kind, "completion_policy": objective.completion_policy, "evidence_policy": objective.evidence_policy,
        "allow_learner_confirmation": objective.allow_learner_confirmation, "custom_fields": objective.custom_fields or [],
        "fields": objective.custom_fields or [], "badge_id": objective.badge_id, "reviewer_guidance": objective.reviewer_guidance or "",
        "position": relation.position, "target_days": relation.target_days, "suggested_due_week": relation.suggested_due_week,
        "badge_major_version": relation.badge_major_version, "accept_previous_major_versions": relation.accept_previous_major_versions,
        "phase_id": relation.phase_id, "default_start_rule": relation.default_start_rule, "default_due_rule": relation.default_due_rule,
        "default_allow_late": relation.default_allow_late, "after_objective_uuids": relation.after_objective_uuids or [],
        "requirement_mappings": _mappings(db, relation),
    }
    if objective.kind == "activity":
        item.update(_activity(db, objective))
    badge = db.get(LearningBadge, objective.badge_id) if objective.badge_id else None
    if badge:
        item["badge_uuid"], item["badge_name"] = badge.badge_uuid, badge.name
    return item


def program_phases(db: Session, program: Program) -> list[dict]:
    """The template's phases, each with its objectives."""
    phases = db.exec(select(ProgramPhase).where(ProgramPhase.program_id == program.id).order_by(ProgramPhase.position, ProgramPhase.id)).all()  # type: ignore[arg-type]
    rows = db.exec(
        select(ProgramObjective, Objective).join(Objective, Objective.id == ProgramObjective.objective_id)  # type: ignore[arg-type]
        .outerjoin(ProgramPhase, ProgramPhase.id == ProgramObjective.phase_id)  # type: ignore[arg-type]
        .where(ProgramObjective.program_id == program.id)
        .order_by(ProgramPhase.position, ProgramObjective.position, ProgramObjective.id)  # type: ignore[arg-type]
    ).all()
    objectives = [_objective(db, objective, relation) for relation, objective in rows]
    listed = [
        {"id": phase.id, "phase_uuid": phase.phase_uuid, "name": phase.name, "description": phase.description, "position": phase.position,
         "target_days": phase.target_days, "suggested_duration_weeks": phase.suggested_duration_weeks}
        for phase in phases
    ] or [{"id": None, "phase_uuid": f"program_phase_{program.program_uuid}", "name": "Phase 1", "description": "", "position": 0,
           "target_days": None, "suggested_duration_weeks": None}]
    return [{**phase, "objectives": [{**item, "program_uuid": program.program_uuid} for item in objectives if item["phase_id"] == phase["id"]]} for phase in listed]


def draft_fingerprint(db: Session, program: Program) -> str:
    """The hash publishing stored on a version; equal when the draft hadn't changed since."""
    objectives = []
    for phase in program_phases(db, program):
        for item in phase["objectives"]:
            entry = {key: value for key, value in item.items() if key not in {"activity_id", "activity"}}
            entry.update(phase_uuid=phase["phase_uuid"], phase_name=phase["name"])
            if item.get("activity_id"):
                activity = db.get(LearningActivity, item["activity_id"])
                entry["activity_hash"] = activity_hash(db, activity) if activity else None
            objectives.append(entry)
    return content_hash({"template": {key: getattr(program, key) for key in TEMPLATE_FIELDS}, "objectives": objectives})
