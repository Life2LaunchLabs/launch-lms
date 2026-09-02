from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus
from src.db.programs import Objective, ObjectiveProgress, ObjectiveProgressStatus, ProgramObjective
from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementAssignmentBatch,
    RequirementAssignmentCreate,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementEnrollmentMigrate,
    RequirementEnrollmentStatus,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
    RequirementVersionStatus,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_admin


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_string() -> str:
    return _now().isoformat()


def _available(db: Session) -> bool:
    return inspect(db.connection()).has_table("requirementframework")


def _framework_or_404(db: Session, org_id: int, framework_uuid: str) -> RequirementFramework:
    item = db.exec(select(RequirementFramework).where(
        RequirementFramework.framework_uuid == framework_uuid,
        RequirementFramework.org_id == org_id,
        RequirementFramework.archived == False,  # noqa: E712
    )).first()
    if not item:
        raise HTTPException(status_code=404, detail="Requirement framework not found")
    return item


def _version(db: Session, framework: RequirementFramework, number: int | None = None) -> RequirementFrameworkVersion:
    number = number or framework.current_version
    item = db.exec(select(RequirementFrameworkVersion).where(
        RequirementFrameworkVersion.framework_id == framework.id,
        RequirementFrameworkVersion.version_number == number,
    )).first()
    if not item:
        raise HTTPException(status_code=404, detail="Requirement framework version not found")
    return item


def _nodes(db: Session, version_id: int) -> list[RequirementNode]:
    return list(db.exec(select(RequirementNode).where(
        RequirementNode.version_id == version_id,
    ).order_by(RequirementNode.position, RequirementNode.id)).all())


def _validate_nodes(items: list[RequirementNodeInput]) -> list[dict]:
    normalized: list[dict] = []
    identifiers: set[str] = set()
    for index, raw in enumerate(items):
        title = raw.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Every requirement needs a title")
        node_uuid = raw.node_uuid or f"requirement_node_{uuid4()}"
        if node_uuid in identifiers:
            raise HTTPException(status_code=422, detail="Requirement node UUIDs must be unique")
        identifiers.add(node_uuid)
        normalized.append({
            "node_uuid": node_uuid,
            "parent_node_uuid": raw.parent_node_uuid,
            "code": raw.code.strip(),
            "title": title,
            "description": raw.description,
            "position": raw.position if raw.position is not None else index,
            "metadata": dict(raw.metadata_json or {}),
        })
    by_uuid = {item["node_uuid"]: item for item in normalized}
    for item in normalized:
        parent = item["parent_node_uuid"]
        if parent and parent not in by_uuid:
            raise HTTPException(status_code=422, detail=f"Parent node {parent} does not exist")
        seen = {item["node_uuid"]}
        while parent:
            if parent in seen:
                raise HTTPException(status_code=422, detail="Requirement hierarchy cannot contain a cycle")
            seen.add(parent)
            parent = by_uuid[parent]["parent_node_uuid"]
    return normalized


def _replace_nodes(db: Session, version: RequirementFrameworkVersion, inputs: list[RequirementNodeInput]) -> None:
    existing = _nodes(db, int(version.id))
    for node in existing:
        db.delete(node)
    if existing:
        db.flush()
    now = _now_string()
    for item in _validate_nodes(inputs):
        db.add(RequirementNode(
            node_version_uuid=f"requirement_node_version_{uuid4()}",
            version_id=int(version.id), creation_date=now, update_date=now,
            metadata_json=item.pop("metadata"), **item,
        ))


def _node_dict(node: RequirementNode) -> dict:
    return {
        "node_uuid": node.node_uuid, "parent_node_uuid": node.parent_node_uuid,
        "code": node.code, "title": node.title, "description": node.description,
        "position": node.position, "metadata": node.metadata_json or {},
    }


def _leaf_ids(nodes: list[dict]) -> list[str]:
    parents = {item.get("parent_node_uuid") for item in nodes if item.get("parent_node_uuid")}
    return [item["node_uuid"] for item in nodes if item["node_uuid"] not in parents]


def _snapshot(db: Session, framework: RequirementFramework, version: RequirementFrameworkVersion) -> dict:
    nodes = [_node_dict(item) for item in _nodes(db, int(version.id))]
    return {
        "framework_uuid": framework.framework_uuid, "name": framework.name,
        "description": framework.description, "version": version.version_number,
        "nodes": nodes, "leaf_node_uuids": _leaf_ids(nodes),
    }


def _framework_dict(db: Session, framework: RequirementFramework, version_number: int | None = None) -> dict:
    version = _version(db, framework, version_number)
    versions = db.exec(select(RequirementFrameworkVersion).where(
        RequirementFrameworkVersion.framework_id == framework.id,
    ).order_by(RequirementFrameworkVersion.version_number.desc())).all()
    enrollment_count = len(db.exec(select(RequirementEnrollment.id).where(
        RequirementEnrollment.framework_id == framework.id,
    )).all())
    return {
        "framework_uuid": framework.framework_uuid, "org_id": framework.org_id,
        "name": framework.name, "description": framework.description,
        "source_framework_uuid": framework.source_framework_uuid,
        "source_version": framework.source_version, "source_metadata": framework.source_metadata or {},
        "current_version": framework.current_version, "published_version": framework.published_version,
        "version": version.version_number,
        "status": version.status.value if hasattr(version.status, "value") else version.status,
        "nodes": [_node_dict(item) for item in _nodes(db, int(version.id))],
        "versions": [{
            "version": item.version_number,
            "status": item.status.value if hasattr(item.status, "value") else item.status,
            "published_at": item.published_at,
        } for item in versions],
        "enrollment_count": enrollment_count,
        "creation_date": framework.creation_date, "update_date": framework.update_date,
    }


def list_frameworks(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    items = db.exec(select(RequirementFramework).where(
        RequirementFramework.org_id == org_id,
        RequirementFramework.archived == False,  # noqa: E712
    ).order_by(RequirementFramework.name)).all()
    return [_framework_dict(db, item) for item in items]


def create_framework(db: Session, current_user: PublicUser, payload: RequirementFrameworkCreate) -> dict:
    require_org_admin(current_user.id, payload.org_id, db)
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Framework name is required")
    now = _now_string()
    framework = RequirementFramework(
        framework_uuid=f"requirement_framework_{uuid4()}", org_id=payload.org_id,
        name=payload.name.strip(), description=payload.description,
        source_framework_uuid=payload.source_framework_uuid, source_version=payload.source_version,
        source_metadata=payload.source_metadata, created_by_user_id=current_user.id,
        creation_date=now, update_date=now,
    )
    db.add(framework)
    db.flush()
    version = RequirementFrameworkVersion(
        version_uuid=f"requirement_version_{uuid4()}", framework_id=int(framework.id),
        version_number=1, status=RequirementVersionStatus.DRAFT,
        creation_date=now, update_date=now,
    )
    db.add(version)
    db.flush()
    _replace_nodes(db, version, payload.nodes)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def get_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, version: int | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return _framework_dict(db, _framework_or_404(db, org_id, framework_uuid), version)


def update_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, payload: RequirementFrameworkUpdate) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework_or_404(db, org_id, framework_uuid)
    current = _version(db, framework)
    now = _now_string()
    if current.status == RequirementVersionStatus.PUBLISHED:
        prior_nodes = [_node_dict(item) for item in _nodes(db, int(current.id))]
        framework.current_version += 1
        current = RequirementFrameworkVersion(
            version_uuid=f"requirement_version_{uuid4()}", framework_id=int(framework.id),
            version_number=framework.current_version, status=RequirementVersionStatus.DRAFT,
            creation_date=now, update_date=now,
        )
        db.add(current)
        db.flush()
        _replace_nodes(db, current, [RequirementNodeInput(**item) for item in prior_nodes])
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = str(changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Framework name is required")
        framework.name = name
    if "description" in changes:
        framework.description = changes["description"] or ""
    if "source_metadata" in changes:
        framework.source_metadata = changes["source_metadata"] or {}
    if payload.nodes is not None:
        _replace_nodes(db, current, payload.nodes)
    framework.update_date = now
    current.update_date = now
    db.add(framework)
    db.add(current)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def publish_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework_or_404(db, org_id, framework_uuid)
    version = _version(db, framework)
    if version.status == RequirementVersionStatus.PUBLISHED:
        raise HTTPException(status_code=409, detail="This version is already published; save changes to create a new draft")
    nodes = _nodes(db, int(version.id))
    if not nodes:
        raise HTTPException(status_code=422, detail="Add at least one requirement before publishing")
    now = _now()
    version.status = RequirementVersionStatus.PUBLISHED
    version.published_at = now
    version.published_by_user_id = current_user.id
    version.update_date = now.isoformat()
    framework.published_version = version.version_number
    framework.update_date = now.isoformat()
    db.add(version)
    db.add(framework)
    db.commit()
    result = _framework_dict(db, framework)
    result["active_incomplete_enrollments"] = len(db.exec(select(RequirementEnrollment.id).where(
        RequirementEnrollment.framework_id == framework.id,
        RequirementEnrollment.status == RequirementEnrollmentStatus.ACTIVE,
        RequirementEnrollment.version_id != version.id,
    )).all())
    return result


def _eligible_user_ids(db: Session, org_id: int, payload: RequirementAssignmentCreate) -> list[int]:
    if bool(payload.user_id) == bool(payload.usergroup_id):
        raise HTTPException(status_code=422, detail="Choose one learner or one group")
    if payload.usergroup_id:
        group = db.exec(select(UserGroup).where(UserGroup.id == payload.usergroup_id, UserGroup.org_id == org_id)).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        return list(dict.fromkeys(db.exec(select(UserGroupUser.user_id).where(
            UserGroupUser.usergroup_id == group.id, UserGroupUser.org_id == org_id,
        )).all()))
    membership = db.exec(select(UserOrganization).where(
        UserOrganization.user_id == payload.user_id, UserOrganization.org_id == org_id,
    )).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Learner is not in this organization")
    return [int(payload.user_id)]


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
    db: Session, enrollment: RequirementEnrollment, node_uuid: str, *,
    plan_progress: PlanObjectiveProgress | None = None, legacy_progress: ObjectiveProgress | None = None,
    title: str, evidence: dict, verified_by: int | None, verified_at: datetime | None, active: bool,
) -> None:
    statement = select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id,
        RequirementAttainmentSource.node_uuid == node_uuid,
    )
    statement = statement.where(
        RequirementAttainmentSource.plan_objective_progress_id == plan_progress.id
    ) if plan_progress else statement.where(
        RequirementAttainmentSource.objective_progress_id == legacy_progress.id
    )
    source = db.exec(statement).first()
    now = _now()
    if not source:
        source = RequirementAttainmentSource(
            source_uuid=f"requirement_source_{uuid4()}", enrollment_id=int(enrollment.id),
            node_uuid=node_uuid,
            plan_objective_progress_id=int(plan_progress.id) if plan_progress else None,
            objective_progress_id=int(legacy_progress.id) if legacy_progress else None,
            creation_date=now.isoformat(), update_date=now.isoformat(),
        )
    source.objective_title = title
    source.evidence_snapshot = evidence
    source.verified_by_user_id = verified_by
    source.verified_at = verified_at
    source.revoked_at = None if active else now
    source.update_date = now.isoformat()
    db.add(source)


def _snapshot_mapping(snapshot: dict, source_objective_id: int | None) -> list[dict]:
    if not source_objective_id:
        return []
    item = next((row for row in snapshot.get("objectives", []) if row.get("id") == source_objective_id), None)
    return list((item or {}).get("requirement_mappings") or [])


def sync_live_progress(db: Session, progress: PlanObjectiveProgress, plan_objective: PlanObjective, plan: Plan) -> None:
    if not _available(db):
        return
    if not progress.id:
        db.flush()
    assignment = db.get(__import__("src.db.programs", fromlist=["ProgramAssignment"]).ProgramAssignment, plan.source_assignment_id) if plan.source_assignment_id else None
    mappings = _snapshot_mapping({"objectives": assignment.objective_snapshot or []}, plan_objective.source_objective_id) if assignment else []
    if not mappings:
        return
    active = progress.status == PlanObjectiveStatus.COMPLETED
    for mapping in mappings:
        enrollments = db.exec(select(RequirementEnrollment).where(
            RequirementEnrollment.org_id == plan.source_org_id,
            RequirementEnrollment.user_id == plan.subject_user_id,
            RequirementEnrollment.framework_id == mapping.get("framework_id"),
        )).all()
        for enrollment in enrollments:
            if mapping.get("node_uuid") not in set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or []):
                continue
            _upsert_source(db, enrollment, mapping["node_uuid"], plan_progress=progress,
                title=plan_objective.title, evidence={"field_values": progress.field_values or {}, "learner_note": progress.subject_note},
                verified_by=progress.updated_by_user_id, verified_at=progress.completed_at, active=active)
            _recompute_enrollment(db, enrollment)


def sync_legacy_progress(db: Session, progress: ObjectiveProgress, objective: Objective) -> None:
    if not _available(db):
        return
    if not progress.id:
        db.flush()
    mappings = db.exec(select(ProgramObjectiveRequirement).join(
        ProgramObjective, ProgramObjective.id == ProgramObjectiveRequirement.program_objective_id,
    ).where(ProgramObjective.objective_id == objective.id)).all()
    active = progress.status == ObjectiveProgressStatus.COMPLETED
    for mapping in mappings:
        enrollments = db.exec(select(RequirementEnrollment).where(
            RequirementEnrollment.org_id == progress.org_id,
            RequirementEnrollment.user_id == progress.user_id,
            RequirementEnrollment.framework_id == mapping.framework_id,
        )).all()
        for enrollment in enrollments:
            if mapping.node_uuid not in set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or []):
                continue
            _upsert_source(db, enrollment, mapping.node_uuid, legacy_progress=progress,
                title=objective.title, evidence={"evidence": progress.evidence or [], "learner_note": progress.learner_note},
                verified_by=progress.completed_by_user_id, verified_at=progress.completed_at, active=active)
            _recompute_enrollment(db, enrollment)


def _backfill(db: Session, enrollment: RequirementEnrollment) -> None:
    plans = db.exec(select(Plan).where(
        Plan.source_org_id == enrollment.org_id, Plan.subject_user_id == enrollment.user_id,
    )).all()
    for plan in plans:
        objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all()
        for objective in objectives:
            progress = db.exec(select(PlanObjectiveProgress).where(
                PlanObjectiveProgress.plan_objective_id == objective.id,
                PlanObjectiveProgress.status == PlanObjectiveStatus.COMPLETED,
            )).first()
            if progress:
                sync_live_progress(db, progress, objective, plan)
    legacy = db.exec(select(ObjectiveProgress, Objective).join(
        Objective, Objective.id == ObjectiveProgress.objective_id,
    ).where(
        ObjectiveProgress.org_id == enrollment.org_id,
        ObjectiveProgress.user_id == enrollment.user_id,
        ObjectiveProgress.status == ObjectiveProgressStatus.COMPLETED,
    )).all()
    for progress, objective in legacy:
        sync_legacy_progress(db, progress, objective)


def assign_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, payload: RequirementAssignmentCreate) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework_or_404(db, org_id, framework_uuid)
    if not framework.published_version:
        raise HTTPException(status_code=409, detail="Publish this framework before assigning it")
    version = _version(db, framework, framework.published_version)
    user_ids = _eligible_user_ids(db, org_id, payload)
    now = _now_string()
    batch = RequirementAssignmentBatch(
        batch_uuid=f"requirement_batch_{uuid4()}", org_id=org_id,
        framework_id=int(framework.id), version_id=int(version.id),
        usergroup_id=payload.usergroup_id, user_id=payload.user_id,
        created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    db.add(batch)
    db.flush()
    snapshot = _snapshot(db, framework, version)
    enrollments = []
    for user_id in user_ids:
        enrollment = RequirementEnrollment(
            enrollment_uuid=f"requirement_enrollment_{uuid4()}", batch_id=int(batch.id),
            org_id=org_id, framework_id=int(framework.id), version_id=int(version.id),
            user_id=user_id, framework_snapshot=snapshot, creation_date=now, update_date=now,
        )
        db.add(enrollment)
        db.flush()
        enrollments.append(enrollment)
        _backfill(db, enrollment)
    db.commit()
    return {"batch_uuid": batch.batch_uuid, "enrollment_count": len(enrollments), "version": version.version_number}


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
    require_org_admin(current_user.id, org_id, db)
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


def update_mappings(db: Session, current_user: PublicUser, org_id: int, relation: ProgramObjective, node_uuids: list[str]) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    valid: dict[str, RequirementFramework] = {}
    frameworks = db.exec(select(RequirementFramework).where(
        RequirementFramework.org_id == org_id, RequirementFramework.archived == False,  # noqa: E712
    )).all()
    for framework in frameworks:
        version = _version(db, framework)
        for node in _nodes(db, int(version.id)):
            valid[node.node_uuid] = framework
    requested = list(dict.fromkeys(node_uuids))
    invalid = set(requested) - set(valid)
    if invalid:
        raise HTTPException(status_code=422, detail="One or more requirement nodes are unavailable")
    for mapping in db.exec(select(ProgramObjectiveRequirement).where(
        ProgramObjectiveRequirement.program_objective_id == relation.id,
    )).all():
        db.delete(mapping)
    now = _now_string()
    for node_uuid in requested:
        framework = valid[node_uuid]
        db.add(ProgramObjectiveRequirement(
            mapping_uuid=f"requirement_mapping_{uuid4()}", program_objective_id=int(relation.id),
            framework_id=int(framework.id), node_uuid=node_uuid, creation_date=now,
        ))
    db.flush()
    return mappings_for_relation(db, relation)


def mappings_for_relation(db: Session, relation: ProgramObjective) -> list[dict]:
    if not _available(db):
        return []
    rows = db.exec(select(ProgramObjectiveRequirement, RequirementFramework).join(
        RequirementFramework, RequirementFramework.id == ProgramObjectiveRequirement.framework_id,
    ).where(ProgramObjectiveRequirement.program_objective_id == relation.id)).all()
    result = []
    for mapping, framework in rows:
        version = _version(db, framework)
        node = db.exec(select(RequirementNode).where(
            RequirementNode.version_id == version.id, RequirementNode.node_uuid == mapping.node_uuid,
        )).first()
        result.append({
            "framework_id": framework.id, "framework_uuid": framework.framework_uuid,
            "framework_name": framework.name, "node_uuid": mapping.node_uuid,
            "node_code": node.code if node else "", "node_title": node.title if node else "Retired requirement",
        })
    return result


def report(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str | None = None, version_number: int | None = None, usergroup_id: int | None = None, node_uuid: str | None = None, status: str | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework_or_404(db, org_id, framework_uuid) if framework_uuid else None
    sync_group_batches(db, org_id, int(framework.id) if framework else None)
    statement = select(RequirementEnrollment).where(
        RequirementEnrollment.org_id == org_id,
        RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN,
    )
    if framework:
        statement = statement.where(RequirementEnrollment.framework_id == framework.id)
        if version_number:
            selected_version = _version(db, framework, version_number)
            statement = statement.where(RequirementEnrollment.version_id == selected_version.id)
    if usergroup_id:
        user_ids = db.exec(select(UserGroupUser.user_id).where(
            UserGroupUser.org_id == org_id, UserGroupUser.usergroup_id == usergroup_id,
        )).all()
        statement = statement.where(RequirementEnrollment.user_id.in_(user_ids or [-1]))
    enrollments = db.exec(statement).all()
    rows = []
    for enrollment in enrollments:
        snapshot = enrollment.framework_snapshot or {}
        leaves = snapshot.get("leaf_node_uuids") or []
        sources = db.exec(select(RequirementAttainmentSource).where(
            RequirementAttainmentSource.enrollment_id == enrollment.id,
            RequirementAttainmentSource.revoked_at.is_(None),
        )).all()
        attained = {item.node_uuid for item in sources}
        if node_uuid and node_uuid not in leaves:
            continue
        node_satisfied = node_uuid in attained if node_uuid else None
        if status == "satisfied" and (not node_satisfied if node_uuid else enrollment.status != RequirementEnrollmentStatus.COMPLETED):
            continue
        if status == "not_satisfied" and (node_satisfied if node_uuid else enrollment.status == RequirementEnrollmentStatus.COMPLETED):
            continue
        user = db.get(User, enrollment.user_id)
        rows.append({
            "enrollment_uuid": enrollment.enrollment_uuid, "framework": {"framework_uuid": snapshot.get("framework_uuid"), "name": snapshot.get("name"), "version": snapshot.get("version")},
            "user": {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image} if user else {"id": enrollment.user_id},
            "status": enrollment.status.value if hasattr(enrollment.status, "value") else enrollment.status,
            "completed": len(attained.intersection(leaves)), "total": len(leaves), "attained_node_uuids": sorted(attained),
            "sources": [{
                "source_uuid": item.source_uuid, "node_uuid": item.node_uuid, "objective_title": item.objective_title,
                "evidence": item.evidence_snapshot, "verified_by_user_id": item.verified_by_user_id,
                "verified_by": _user_summary(db.get(User, item.verified_by_user_id)) if item.verified_by_user_id else None,
                "verified_at": item.verified_at,
            } for item in sources if not node_uuid or item.node_uuid == node_uuid],
        })
    db.commit()
    return {
        "rows": rows, "learner_count": len(rows),
        "completed_count": sum(1 for item in rows if item["status"] == "completed"),
        "framework": _framework_dict(db, framework) if framework else None,
    }


def _user_summary(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name}
