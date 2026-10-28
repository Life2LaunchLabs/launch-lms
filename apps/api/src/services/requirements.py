from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.organizations import Organization
from src.db.requirements import (
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementEnrollmentStatus,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
    RequirementVersionStatus,
)
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_admin
from src.security.superadmin import is_user_superadmin
from src.services.requirement_codes import (  # noqa: F401
    NUMBERING_STYLES,
    _code_segment,
    _default_code_style,
    _normalize_source_metadata,
    node_fields,
    node_numbering,
    node_rule,
    upgrade_levels,
)
from src.services.school.roles import is_staff


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_string() -> str:
    return _now().isoformat()


def _owner_org(db: Session) -> Organization:
    owner = db.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return owner


def _require_owner_org_admin(db: Session, current_user: PublicUser, org_id: int) -> None:
    if _owner_org(db).id != org_id:
        raise HTTPException(status_code=403, detail="Only the owner organization can publish to the global library")
    require_org_admin(current_user.id, org_id, db, "build_plans")


def _require_staff(db: Session, current_user: PublicUser, org_id: int) -> None:
    """Reading frameworks is for the organization's staff; changing them stays with its admins."""
    if is_user_superadmin(current_user.id, db) or is_org_admin(current_user.id, org_id, db) or is_staff(db, org_id, current_user.id):
        return
    raise HTTPException(status_code=403, detail="Only the organization's staff can see its requirement frameworks")


def _publisher(db: Session, framework: RequirementFramework) -> dict:
    """Who publishes a framework: the org it was copied from (the global library), or its own org."""
    source = db.exec(select(RequirementFramework).where(
        RequirementFramework.framework_uuid == framework.source_framework_uuid,
    )).first() if framework.source_framework_uuid else None
    org_id = source.org_id if source else framework.org_id
    org = db.get(Organization, org_id)
    return {"org_id": org_id, "name": org.name if org else "", "yours": org_id == framework.org_id}


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


def _validate_nodes(items: list[RequirementNodeInput], source_metadata: dict | None = None) -> list[dict]:
    """Check the hierarchy and number it: each parent's `numbering` codes its children (the framework's codes the top level)."""
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
        metadata = dict(raw.metadata_json or {})
        if raw.numbering is not None:
            metadata["numbering"] = raw.numbering
        if raw.rule is not None:
            metadata["rule"] = raw.rule
        normalized.append({
            "node_uuid": node_uuid,
            "parent_node_uuid": raw.parent_node_uuid,
            "code": raw.code.strip(),
            "title": title,
            "description": raw.description,
            "position": raw.position if raw.position is not None else index,
            "metadata": metadata,
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
    meta, normalized = upgrade_levels(_normalize_source_metadata(source_metadata, validate=True), normalized)
    input_order = {item["node_uuid"]: index for index, item in enumerate(normalized)}
    children: dict[str | None, list[dict]] = {}
    for item in normalized:
        children.setdefault(item["parent_node_uuid"], []).append(item)
    for siblings in children.values():
        siblings.sort(key=lambda item: (item["position"], input_order[item["node_uuid"]]))

    def assign_codes(parent_uuid: str | None, style: str, prefix: str = "") -> None:
        for sibling_number, item in enumerate(children.get(parent_uuid, []), start=1):
            if style == "none":
                item["code"] = ""
            elif style != "custom":
                segment = _code_segment(sibling_number, style)
                item["code"] = f"{prefix}.{segment}" if prefix else segment
            metadata = item["metadata"]
            numbering = metadata.get("numbering")
            if numbering is not None and numbering not in NUMBERING_STYLES:
                raise HTTPException(status_code=422, detail=f"Unsupported numbering: {numbering}")
            count = len(children.get(item["node_uuid"], []))
            if not count:
                metadata.pop("rule", None)  # a requirement is met by a step or a credit, not a rule
            elif "rule" in metadata:
                rule = metadata["rule"] or {}
                if rule.get("kind") not in ("all", "any"):
                    raise HTTPException(status_code=422, detail="A rule is all of its requirements, or any number of them")
                if rule["kind"] == "any" and not (isinstance(rule.get("count"), int) and 1 <= rule["count"] <= count):
                    raise HTTPException(status_code=422, detail=f"“{item['title']}” has {count} items, so it can need between 1 and {count} of them")
                metadata["rule"] = node_rule(metadata)
            assign_codes(item["node_uuid"], node_numbering(metadata), item["code"])

    assign_codes(None, meta["numbering"])
    return normalized


def _replace_nodes(
    db: Session,
    version: RequirementFrameworkVersion,
    inputs: list[RequirementNodeInput],
    source_metadata: dict | None = None,
) -> None:
    existing = _nodes(db, int(version.id))
    for node in existing:
        db.delete(node)
    if existing:
        db.flush()
    now = _now_string()
    for item in _validate_nodes(inputs, source_metadata):
        db.add(RequirementNode(
            node_version_uuid=f"requirement_node_version_{uuid4()}",
            version_id=int(version.id), creation_date=now, update_date=now,
            metadata_json=item.pop("metadata"), **item,
        ))


def _node_dict(node: RequirementNode) -> dict:
    return {
        "node_uuid": node.node_uuid, "parent_node_uuid": node.parent_node_uuid,
        "code": node.code, "title": node.title, "description": node.description,
        "position": node.position, "metadata": node_fields(node.metadata_json),
        "numbering": node_numbering(node.metadata_json), "rule": node_rule(node.metadata_json),
    }


def _upgraded_metadata(source_metadata: dict | None, nodes: list[RequirementNodeInput]) -> dict:
    """The framework's source_metadata to store: validated, with old levels turned into numbering and fields."""
    meta, _ = upgrade_levels(source_metadata, [{"node_uuid": item.node_uuid or "", "parent_node_uuid": item.parent_node_uuid, "metadata": {}} for item in nodes])
    return _normalize_source_metadata(meta, validate=True)


def _leaf_ids(nodes: list[dict]) -> list[str]:
    parents = {item.get("parent_node_uuid") for item in nodes if item.get("parent_node_uuid")}
    return [item["node_uuid"] for item in nodes if item["node_uuid"] not in parents]


def _snapshot(db: Session, framework: RequirementFramework, version: RequirementFrameworkVersion) -> dict:
    nodes = [_node_dict(item) for item in _nodes(db, int(version.id))]
    return {
        "framework_uuid": framework.framework_uuid, "name": framework.name,
        "description": framework.description, "version": version.version_number,
        "source_metadata": _normalize_source_metadata(framework.source_metadata),
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
        "source_version": framework.source_version, "source_metadata": _normalize_source_metadata(framework.source_metadata),
        "current_version": framework.current_version, "published_version": framework.published_version,
        "library_published_version": framework.library_published_version,
        "published_to_library": framework.library_published_version is not None,
        "library_editable": framework.library_editable,
        "locked": framework.locked,
        "flagged_node_uuids": list(framework.flagged_node_uuids or []),
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


def _reader_view(db: Session, current_user: PublicUser, framework: RequirementFramework, version_number: int | None = None) -> dict:
    """A framework as staff read it: who publishes it, and whether this viewer can change it."""
    return {
        **_framework_dict(db, framework, version_number),
        "publisher": _publisher(db, framework),
        "can_edit": is_org_admin(current_user.id, framework.org_id, db) and not framework.locked,
    }


def list_frameworks(db: Session, current_user: PublicUser, org_id: int, with_coverage: bool = False) -> list[dict]:
    """The org's frameworks; with `with_coverage`, each also says how much of it the org's published templates cover."""
    _require_staff(db, current_user, org_id)
    items = db.exec(select(RequirementFramework).where(
        RequirementFramework.org_id == org_id,
        RequirementFramework.archived == False,  # noqa: E712
    ).order_by(RequirementFramework.name)).all()
    views = [_reader_view(db, current_user, item) for item in items]
    if with_coverage:
        from src.services.goals.requirements import coverage_summaries

        summaries = coverage_summaries(db, org_id, views)
        for view in views:
            view["coverage"] = summaries[view["framework_uuid"]]
    return views


def publish_framework_to_library(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, editable: bool = True) -> dict:
    """Share the published version in Discover. Not editable: orgs use it exactly as published (an official standard)."""
    _require_owner_org_admin(db, current_user, org_id)
    framework = _framework_or_404(db, org_id, framework_uuid)
    if framework.published_version is None:
        raise HTTPException(status_code=422, detail="Publish a framework version before adding it to the global library")
    framework.library_editable = editable
    framework.library_published_version = framework.published_version
    framework.library_snapshot = _snapshot(db, framework, _version(db, framework, framework.published_version))
    framework.update_date = _now_string()
    db.add(framework)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def list_framework_library(db: Session, current_user: PublicUser, org_id: int, query: str = "") -> list[dict]:
    from src.services.goals.template_marketplace import require_reader

    from src.services.requirement_library import library_frameworks

    require_reader(db, current_user, org_id)  # staff browse the marketplace too; copying stays admin only
    return library_frameworks(db, query)


def copy_framework_from_library(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    owner = _owner_org(db)
    source = db.exec(select(RequirementFramework).where(
        RequirementFramework.framework_uuid == framework_uuid,
        RequirementFramework.org_id == owner.id,
        RequirementFramework.library_published_version.is_not(None),
        RequirementFramework.archived == False,  # noqa: E712
    )).first()
    if not source or source.library_published_version is None or not source.library_snapshot:
        raise HTTPException(status_code=404, detail="Library requirement framework not found")
    snapshot = dict(source.library_snapshot)
    created = create_framework(db, current_user, RequirementFrameworkCreate(
        org_id=org_id, name=str(snapshot.get("name") or source.name), description=str(snapshot.get("description") or ""),
        source_framework_uuid=source.framework_uuid, source_version=source.library_published_version,
        source_metadata=snapshot.get("source_metadata") or {},
        nodes=[RequirementNodeInput(**node) for node in snapshot.get("nodes") or []],
    ))
    if source.library_editable:
        return created  # the org's own framework now, started from the library one
    # used as is: the copy is published straight away and can't be changed
    framework = _framework_or_404(db, org_id, created["framework_uuid"])
    version = _version(db, framework)
    now = _now()
    version.status = RequirementVersionStatus.PUBLISHED
    version.published_at = now
    version.published_by_user_id = current_user.id
    framework.published_version = version.version_number
    framework.locked = True
    db.add(version)
    db.add(framework)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def create_framework(db: Session, current_user: PublicUser, payload: RequirementFrameworkCreate) -> dict:
    require_org_admin(current_user.id, payload.org_id, db, "build_plans")
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Framework name is required")
    now = _now_string()
    source_metadata = _upgraded_metadata(payload.source_metadata, payload.nodes)
    framework = RequirementFramework(
        framework_uuid=f"requirement_framework_{uuid4()}", org_id=payload.org_id,
        name=payload.name.strip(), description=payload.description,
        source_framework_uuid=payload.source_framework_uuid, source_version=payload.source_version,
        source_metadata=source_metadata, created_by_user_id=current_user.id,
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
    _replace_nodes(db, version, payload.nodes, payload.source_metadata)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def get_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, version: int | None = None) -> dict:
    _require_staff(db, current_user, org_id)
    return _reader_view(db, current_user, _framework_or_404(db, org_id, framework_uuid), version)


def _require_editable(framework: RequirementFramework) -> None:
    if framework.locked:
        raise HTTPException(status_code=409, detail="This framework is used as its publisher shares it, so it can't be changed")


def update_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, payload: RequirementFrameworkUpdate) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    framework = _framework_or_404(db, org_id, framework_uuid)
    _require_editable(framework)
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
        _replace_nodes(
            db,
            current,
            [RequirementNodeInput(**item) for item in prior_nodes],
            framework.source_metadata,
        )
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = str(changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Framework name is required")
        framework.name = name
    if "description" in changes:
        framework.description = changes["description"] or ""
    if payload.nodes is not None or "source_metadata" in changes:
        nodes = payload.nodes if payload.nodes is not None else [RequirementNodeInput(**item) for item in (_node_dict(node) for node in _nodes(db, int(current.id)))]
        given = changes["source_metadata"] if "source_metadata" in changes else framework.source_metadata
        _replace_nodes(db, current, nodes, given)
        framework.source_metadata = _upgraded_metadata(given, nodes)
    framework.update_date = now
    current.update_date = now
    db.add(framework)
    db.add(current)
    db.commit()
    db.refresh(framework)
    return _framework_dict(db, framework)


def set_flags(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, node_uuids: list[str]) -> dict:
    """Replace the gaps staff flagged to fill. Only requirements (leaves) of the current version can be flagged; any
    staff member can flag, since flags are notes for finding and building plans, not changes to the framework."""
    _require_staff(db, current_user, org_id)
    framework = _framework_or_404(db, org_id, framework_uuid)
    leaves = set(_leaf_ids([_node_dict(node) for node in _nodes(db, int(_version(db, framework).id))]))
    unknown = [node for node in node_uuids if node not in leaves]
    if unknown:
        raise HTTPException(status_code=422, detail="Only requirements in this framework can be flagged")
    framework.flagged_node_uuids = list(dict.fromkeys(node_uuids))
    framework.update_date = _now_string()
    db.add(framework)
    db.commit()
    return {"framework_uuid": framework.framework_uuid, "flagged_node_uuids": framework.flagged_node_uuids}


def publish_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    framework = _framework_or_404(db, org_id, framework_uuid)
    _require_editable(framework)
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


def _org_nodes(db: Session, org_id: int) -> list[tuple[RequirementFramework, RequirementNode]]:
    """Every node in the organization's current framework versions, with its framework."""
    if not _available(db):
        return []
    frameworks = db.exec(select(RequirementFramework).where(RequirementFramework.org_id == org_id, RequirementFramework.archived == False)).all()  # noqa: E712
    return [(framework, node) for framework in frameworks for node in _nodes(db, int(_version(db, framework).id))]


def mappable_nodes(db: Session, org_id: int) -> dict[str, RequirementFramework]:
    """Requirement nodes objectives in this organization can map to, by node uuid."""
    return {node.node_uuid: framework for framework, node in _org_nodes(db, org_id)}


def parent_node_uuids(db: Session, org_id: int) -> set[str]:
    """Nodes that have children (and so never earn credit themselves)."""
    return {node.parent_node_uuid for _, node in _org_nodes(db, org_id) if node.parent_node_uuid}


def report(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str | None = None, version_number: int | None = None, usergroup_id: int | None = None, node_uuid: str | None = None, status: str | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db, "see_reports")
    from src.services.requirement_tracking import sync_group_batches

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
