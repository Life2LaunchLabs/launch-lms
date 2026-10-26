"""Tracking learners on requirement frameworks: enrollments made when a plan whose steps count is issued, credit
recomputed from the steps' sources, group batches kept in step with membership, and moving active enrollments to a
newly published version."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import StepProgress
from src.db.requirements import (
    RequirementAssignmentBatch,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementEnrollmentMigrate,
    RequirementEnrollmentStatus,
    RequirementFramework,
    RequirementFrameworkVersion,
)
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.requirements import _available, _framework_or_404, _now, _now_string, _snapshot, _version


def _recompute_enrollment(db: Session, enrollment: RequirementEnrollment) -> None:
    leaf_ids = set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or [])
    active = db.exec(select(RequirementAttainmentSource.node_uuid).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id,
        RequirementAttainmentSource.revoked_at.is_(None),
    )).all()
    complete = bool(leaf_ids) and leaf_ids.issubset(set(active))
    enrollment.status = RequirementEnrollmentStatus.COMPLETED if complete else RequirementEnrollmentStatus.ACTIVE
    enrollment.completed_at = enrollment.completed_at or _now() if complete else None
    enrollment.update_date = _now_string()
    db.add(enrollment)


def _upsert_source(
    db: Session, enrollment: RequirementEnrollment, node_uuid: str, *, step_progress: StepProgress,
    title: str, evidence: dict, verified_by: int | None, verified_at: datetime | None, active: bool,
) -> None:
    source = db.exec(select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id, RequirementAttainmentSource.node_uuid == node_uuid,
        RequirementAttainmentSource.step_progress_id == step_progress.id,
    )).first()
    now = _now()
    if not source:
        source = RequirementAttainmentSource(
            source_uuid=f"requirement_source_{uuid4()}", enrollment_id=int(enrollment.id),
            node_uuid=node_uuid, step_progress_id=int(step_progress.id),  # type: ignore[arg-type]
            creation_date=now.isoformat(), update_date=now.isoformat(),
        )
    source.objective_title = title
    source.evidence_snapshot = evidence
    source.verified_by_user_id = verified_by
    source.verified_at = verified_at
    source.revoked_at = None if active else now
    source.update_date = now.isoformat()
    db.add(source)


def _backfill(db: Session, enrollment: RequirementEnrollment) -> None:
    from src.services.goals.credit import backfill_steps
    backfill_steps(db, enrollment)


def _auto_batch(db: Session, framework: RequirementFramework, version: RequirementFrameworkVersion) -> RequirementAssignmentBatch:
    """The batch that holds a framework's automatic enrollments: no group or learner, nobody created it."""
    batch = db.exec(select(RequirementAssignmentBatch).where(
        RequirementAssignmentBatch.framework_id == framework.id,
        RequirementAssignmentBatch.usergroup_id.is_(None),
        RequirementAssignmentBatch.user_id.is_(None),
        RequirementAssignmentBatch.created_by_user_id.is_(None),
    )).first()
    if batch:
        return batch
    now = _now_string()
    batch = RequirementAssignmentBatch(
        batch_uuid=f"requirement_batch_{uuid4()}", org_id=framework.org_id,
        framework_id=int(framework.id), version_id=int(version.id), creation_date=now, update_date=now,
    )
    db.add(batch)
    db.flush()
    return batch


def track(db: Session, org_id: int, user_id: int, framework_ids: set[int]) -> None:
    """Start tracking a learner on frameworks their plans count toward: an enrollment on the published version, credited
    with steps they already finished. Nobody assigns a framework; a plan whose steps count is enough."""
    if not framework_ids or not _available(db):
        return
    for framework in db.exec(select(RequirementFramework).where(
        RequirementFramework.id.in_(framework_ids), RequirementFramework.org_id == org_id,
        RequirementFramework.archived == False,  # noqa: E712
    )).all():
        if not framework.published_version or db.exec(select(RequirementEnrollment.id).where(
            RequirementEnrollment.framework_id == framework.id, RequirementEnrollment.user_id == user_id,
            RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN,
        )).first():
            continue
        version = _version(db, framework, framework.published_version)
        now = _now_string()
        enrollment = RequirementEnrollment(
            enrollment_uuid=f"requirement_enrollment_{uuid4()}", batch_id=int(_auto_batch(db, framework, version).id),
            org_id=org_id, framework_id=int(framework.id), version_id=int(version.id), user_id=user_id,
            framework_snapshot=_snapshot(db, framework, version), creation_date=now, update_date=now,
        )
        db.add(enrollment)
        db.flush()
        _backfill(db, enrollment)


def track_goal(db: Session, goal) -> None:
    """Track a goal's learner on every framework its steps count toward."""
    from src.db.goals import GoalStep

    if not goal.subject_user_id or not _available(db):
        return
    db.flush()
    links = db.exec(select(GoalStep.requirement_links).where(GoalStep.goal_id == goal.id)).all()
    track(db, goal.org_id, goal.subject_user_id, {int(link["framework_id"]) for items in links for link in items or [] if link.get("framework_id")})


def sync_group_batches(db: Session, org_id: int, framework_id: int | None = None) -> None:
    statement = select(RequirementAssignmentBatch).where(
        RequirementAssignmentBatch.org_id == org_id,
        RequirementAssignmentBatch.active == True,  # noqa: E712
        RequirementAssignmentBatch.usergroup_id.is_not(None),
    )
    if framework_id:
        statement = statement.where(RequirementAssignmentBatch.framework_id == framework_id)
    for batch in db.exec(statement).all():
        enrollment_rows = db.exec(select(RequirementEnrollment).where(
            RequirementEnrollment.batch_id == batch.id,
        )).all()
        existing = {item.user_id for item in enrollment_rows}
        user_ids = set(db.exec(select(UserGroupUser.user_id).where(
            UserGroupUser.usergroup_id == batch.usergroup_id,
            UserGroupUser.org_id == org_id,
        )).all())
        framework = db.get(RequirementFramework, batch.framework_id)
        version = db.get(RequirementFrameworkVersion, batch.version_id)
        snapshot = _snapshot(db, framework, version)
        now = _now_string()
        for enrollment in enrollment_rows:
            if enrollment.user_id not in user_ids and enrollment.status == RequirementEnrollmentStatus.ACTIVE:
                enrollment.status = RequirementEnrollmentStatus.WITHDRAWN
                enrollment.update_date = now
                db.add(enrollment)
            elif enrollment.user_id in user_ids and enrollment.status == RequirementEnrollmentStatus.WITHDRAWN:
                enrollment.status = RequirementEnrollmentStatus.ACTIVE
                enrollment.update_date = now
                db.add(enrollment)
                _recompute_enrollment(db, enrollment)
        for user_id in user_ids - existing:
            enrollment = RequirementEnrollment(
                enrollment_uuid=f"requirement_enrollment_{uuid4()}", batch_id=int(batch.id), org_id=org_id,
                framework_id=batch.framework_id, version_id=batch.version_id, user_id=user_id,
                framework_snapshot=snapshot, creation_date=now, update_date=now,
            )
            db.add(enrollment)
            db.flush()
            _backfill(db, enrollment)


def migrate_enrollments(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, payload: RequirementEnrollmentMigrate) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    framework = _framework_or_404(db, org_id, framework_uuid)
    if not framework.published_version:
        raise HTTPException(status_code=409, detail="No published version is available")
    version = _version(db, framework, framework.published_version)
    statement = select(RequirementEnrollment).where(
        RequirementEnrollment.framework_id == framework.id,
        RequirementEnrollment.status == RequirementEnrollmentStatus.ACTIVE,
        RequirementEnrollment.version_id != version.id,
    )
    if payload.enrollment_uuids:
        statement = statement.where(RequirementEnrollment.enrollment_uuid.in_(payload.enrollment_uuids))
    enrollments = db.exec(statement).all()
    snapshot = _snapshot(db, framework, version)
    for enrollment in enrollments:
        enrollment.version_id = int(version.id)
        enrollment.framework_snapshot = snapshot
        _recompute_enrollment(db, enrollment)
        _backfill(db, enrollment)
    db.commit()
    return {"updated": len(enrollments), "version": version.version_number}
