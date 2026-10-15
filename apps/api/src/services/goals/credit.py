"""Requirement credit for goal steps: which nodes a step links to, and crediting them when it's done."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.goals import Goal, GoalStep, StepProgress, StepStatus
from src.db.requirements import RequirementEnrollment
from src.services.requirements import _available, _recompute_enrollment, _upsert_source, mappable_nodes


def sync_step_progress(db: Session, progress: StepProgress, step: GoalStep, goal: Goal, evidence: dict) -> None:
    """Credit (or withdraw) the requirements a goal step counts toward."""
    if not _available(db) or not step.requirement_links or not goal.subject_user_id:
        return
    if not progress.id:
        db.flush()
    active = getattr(progress.status, "value", progress.status) == StepStatus.COMPLETED.value
    for link in step.requirement_links:
        enrollments = db.exec(select(RequirementEnrollment).where(
            RequirementEnrollment.org_id == goal.org_id,
            RequirementEnrollment.user_id == goal.subject_user_id,
            RequirementEnrollment.framework_id == link.get("framework_id"),
        )).all()
        for enrollment in enrollments:
            if link.get("node_uuid") not in set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or []):
                continue
            _upsert_source(db, enrollment, link["node_uuid"], step_progress=progress, title=step.title, evidence=evidence,
                verified_by=progress.completed_by_user_id, verified_at=progress.completed_at, active=active)
            _recompute_enrollment(db, enrollment)


def requirement_links(db: Session, org_id: int | None, node_uuids: list[str]) -> list[dict]:
    """Requirement links for a step, from node uuids the template document checked."""
    if not org_id or not node_uuids:
        return []
    frameworks = mappable_nodes(db, org_id)
    return [
        {"framework_id": int(frameworks[node].id), "framework_uuid": frameworks[node].framework_uuid, "node_uuid": node}  # type: ignore[arg-type]
        for node in node_uuids if node in frameworks
    ]
