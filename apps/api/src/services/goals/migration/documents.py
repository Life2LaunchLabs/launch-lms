"""Legacy template snapshots as goal template documents.

A legacy template is a set of settings, phases and objective dicts (the shape
``services.programs._snapshot`` produces), whether it is a template's draft, a
published version's snapshot, an assignment's objective snapshot or a library
snapshot. This turns one into a goal template document with the agreed step
rules from ``goals.legacy``.

Keys stay traceable: a stage's key is its phase uuid, and an objective's first
step takes the objective uuid as its key (split steps add ``-2``, ``-3``...).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningBadge
from src.services.goals.access import LEGACY_ALIASES
from src.services.goals.document import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, default_roles, validate_document
from src.db.planning import ALL_CAPABILITIES
from src.services.goals.legacy import convert_objective, objective_from_template

STEP_ORDER = {"by_chapter": "by_stage", "in_order": "in_order"}


@dataclass
class Converted:
    document: dict
    # Legacy objective uuid -> the step keys it became, in order.
    step_keys: dict[str, list[str]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def step_key(objective_uuid: str, index: int) -> str:
    return objective_uuid if index == 0 else f"{objective_uuid}-{index + 1}"


def roles(definitions: list[dict] | None, subject_key: str | None, staff_key: str | None) -> dict:
    """A template's legacy role definitions, with capabilities the goal model doesn't know dropped."""
    if not definitions:
        return default_roles()
    cleaned = []
    for item in definitions:
        if not item.get("key"):
            continue
        capabilities = sorted({LEGACY_ALIASES.get(name, name) for name in item.get("capabilities") or []} & ALL_CAPABILITIES)
        cleaned.append({"key": item["key"], "name": item.get("name") or item["key"], "capabilities": capabilities,
                        "grantable_role_keys": list(item.get("grantable_role_keys") or [])})
    keys = {item["key"] for item in cleaned}
    for item in cleaned:
        item["grantable_role_keys"] = [key for key in item["grantable_role_keys"] if key in keys]
    subject_key, staff_key = subject_key or "subject", staff_key or "reviewer"
    if subject_key not in keys or staff_key not in keys:
        return default_roles()
    return {"definitions": cleaned, "subject_role_key": subject_key, "staff_role_key": staff_key}


def _activity_uuid(db: Session, activity_id: int | None) -> str | None:
    if not activity_id:
        return None
    return db.exec(select(LearningActivity.activity_uuid).where(LearningActivity.id == activity_id)).first()


def badge_exists(db: Session, badge_uuid: str | None) -> bool:
    return bool(badge_uuid) and db.exec(select(LearningBadge.id).where(LearningBadge.badge_uuid == badge_uuid)).first() is not None


def _objectives_by_phase(phases: list[dict], objectives: list[dict] | None) -> list[tuple[dict, list[dict]]]:
    """Phases with their objectives, whether objectives are listed flat (with ``phase_uuid``) or nested in phases."""
    ordered = sorted(phases, key=lambda phase: (phase.get("position") or 0))
    if objectives is None:
        return [(phase, list(phase.get("objectives") or [])) for phase in ordered]
    grouped = [(phase, [item for item in objectives if item.get("phase_uuid") == phase.get("phase_uuid")]) for phase in ordered]
    known = {phase.get("phase_uuid") for phase in ordered}
    stray = [item for item in objectives if item.get("phase_uuid") not in known]
    if stray:
        grouped.append(({"phase_uuid": "stage_unsorted", "name": "Other steps"}, stray))
    return grouped


def convert_snapshot(db: Session, meta: dict, phases: list[dict], objectives: list[dict] | None, org_id: int | None) -> Converted:
    """A goal template document from legacy settings, phases and objectives (``objectives=None``: nested in phases)."""
    warnings: list[str] = []
    step_keys: dict[str, list[str]] = {}
    stages = []
    pending_after: list[tuple[dict, list[str]]] = []
    for phase, items in _objectives_by_phase(phases, objectives) or [({"phase_uuid": "stage_1", "name": "Stage 1"}, objectives or [])]:
        weeks = phase.get("suggested_duration_weeks") or None
        stage = {"key": str(phase.get("phase_uuid") or f"stage_{len(stages) + 1}"), "title": str(phase.get("name") or "Stage").strip() or "Stage",
                 "description": phase.get("description") or "", "timing": "", "duration_weeks": weeks, "steps": []}
        for item in sorted(items, key=lambda entry: (entry.get("position") or 0)):
            uuid = str(item.get("objective_uuid") or f"objective_{len(step_keys) + 1}")
            conversion = convert_objective(objective_from_template(item))
            warnings.extend(f"{item.get('title')}: {warning}" for warning in conversion.warnings)
            keys = [step_key(uuid, index) for index in range(len(conversion.steps))]
            step_keys[uuid] = keys
            nodes = [mapping["node_uuid"] for mapping in item.get("requirement_mappings") or [] if mapping.get("node_uuid")]
            due_week = item.get("suggested_due_week")
            for index, (spec, key) in enumerate(zip(conversion.steps, keys)):
                config = dict(spec.config)
                kind = spec.type
                if kind == "activity":
                    activity_uuid = _activity_uuid(db, config.get("activity_id"))
                    if activity_uuid:
                        config = {"activity_uuid": activity_uuid}
                    else:
                        warnings.append(f"{item.get('title')}: activity missing, kept as a task")
                        kind, config = "task", {}
                if kind == "badge" and not badge_exists(db, config.get("badge_uuid")):
                    warnings.append(f"{item.get('title')}: badge missing, kept as a task")
                    kind, config = "task", {}
                step = {
                    "key": key, "type": kind, "title": spec.title, "description": (item.get("description") or "") if index == 0 else "",
                    "config": config, "materials": [], "completed_by": spec.completed_by if kind != "activity" else "learner",
                    "review_required": spec.review_required and spec.completed_by == "learner",
                    "reviewer_guidance": item.get("reviewer_guidance") or "", "after": [],
                    "due_week": due_week if due_week and weeks and int(due_week) <= int(weeks) else None,
                    "allow_late": bool(item.get("default_allow_late")),
                    # A split objective credited its requirements once all of it was done; its last step carries them.
                    "requirement_node_uuids": nodes if index == len(keys) - 1 else [],
                }
                stage["steps"].append(step)
                if index == 0 and item.get("after_objective_uuids"):
                    pending_after.append((step, list(item["after_objective_uuids"])))
        stages.append(stage)
    for step, uuids in pending_after:
        step["after"] = [step_keys[uuid][0] for uuid in uuids if uuid in step_keys]
    document = {
        "format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"title": str(meta.get("name") or meta.get("title") or "Untitled template").strip()[:200] or "Untitled template",
                     "description": meta.get("description") or "", "instructions": meta.get("instructions") or "",
                     "step_order": STEP_ORDER.get(str(meta.get("step_order") or "any"), "any")},
        "roles": roles(meta.get("role_definitions"), meta.get("default_subject_role_key"), meta.get("default_staff_role_key")),
        "stages": stages or [{"key": "stage_1", "title": "Stage 1", "description": "", "timing": "", "steps": []}],
    }
    return Converted(validate_document(db, document, org_id), step_keys, warnings)
