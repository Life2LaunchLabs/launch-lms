"""Read, validate, save, create and publish requirement frameworks as Requirement Framework Documents.

A document is the framework's working version: a published version is never
edited in place. Saving over one starts a new draft (the REST editor behaves
the same way); publishing stays a separate, explicit step.
"""

from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import Session, func, select

from src.db.programs import Objective, Program, ProgramObjective
from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementEnrollment,
    RequirementEnrollmentStatus,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
)
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services import requirements
from src.services.requirement_documents.models import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, RequirementFrameworkDocument


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _ordered(nodes: list[dict]) -> list[dict]:
    """Parents before their children, siblings by position: the order people read a framework in."""
    children: dict[str | None, list[dict]] = {}
    for index, node in enumerate(nodes):
        children.setdefault(node.get("parent_node_uuid"), []).append({**node, "_index": index})
    ordered: list[dict] = []

    def walk(parent: str | None) -> None:
        for node in sorted(children.get(parent, []), key=lambda item: (item.get("position") or 0, item["_index"])):
            ordered.append(node)
            walk(node["node_uuid"])

    walk(None)
    seen = {node["node_uuid"] for node in ordered}
    ordered.extend({**node, "_index": 0} for node in nodes if node["node_uuid"] not in seen)  # orphans, defensively
    return ordered


def _document(name: str, description: str, levels: list[dict], nodes: list[dict]) -> dict:
    return {
        "format": DOCUMENT_FORMAT,
        "format_version": DOCUMENT_FORMAT_VERSION,
        "framework": {"name": name, "description": description or "", "levels": levels},
        "nodes": [
            {
                "node_uuid": node["node_uuid"],
                "parent_node_uuid": node.get("parent_node_uuid"),
                "code": node.get("code") or "",
                "title": node["title"],
                "description": node.get("description") or "",
                **({"metadata": node["metadata"]} if node.get("metadata") else {}),
            }
            for node in _ordered(nodes)
        ],
    }


def _levels(source_metadata: dict | None) -> list[dict]:
    return list(requirements._normalize_source_metadata(source_metadata).get("requirement_levels") or [])


def export_document(db: Session, framework: RequirementFramework) -> dict:
    version = requirements._version(db, framework)
    nodes = [requirements._node_dict(node) for node in requirements._nodes(db, int(version.id))]  # type: ignore[arg-type]
    return _document(framework.name, framework.description, _levels(framework.source_metadata), nodes)


def document_etag(document: dict) -> str:
    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def framework_links(db: Session, framework: RequirementFramework) -> dict[str, list[dict]]:
    """Template objectives linked to each node of this framework."""
    rows = db.exec(
        select(ProgramObjectiveRequirement, Program, Objective)
        .join(ProgramObjective, ProgramObjective.id == ProgramObjectiveRequirement.program_objective_id)  # type: ignore[arg-type]
        .join(Program, Program.id == ProgramObjective.program_id)  # type: ignore[arg-type]
        .join(Objective, Objective.id == ProgramObjective.objective_id)  # type: ignore[arg-type]
        .where(ProgramObjectiveRequirement.framework_id == framework.id)
    ).all()
    links: dict[str, list[dict]] = {}
    for mapping, program, objective in rows:
        links.setdefault(mapping.node_uuid, []).append(
            {"template_uuid": program.program_uuid, "template_name": program.name, "objective_uuid": objective.objective_uuid, "objective_title": objective.title}
        )
    return links


def _envelope(db: Session, framework: RequirementFramework) -> dict:
    document = export_document(db, framework)
    version = requirements._version(db, framework)
    links = framework_links(db, framework)
    parents = {node["parent_node_uuid"] for node in document["nodes"] if node["parent_node_uuid"]}
    leaves = [node for node in document["nodes"] if node["node_uuid"] not in parents]
    versions = db.exec(
        select(RequirementFrameworkVersion).where(RequirementFrameworkVersion.framework_id == framework.id).order_by(RequirementFrameworkVersion.version_number)  # type: ignore[arg-type]
    ).all()
    active = db.exec(
        select(func.count(RequirementEnrollment.id)).where(  # type: ignore[arg-type]
            RequirementEnrollment.framework_id == framework.id, RequirementEnrollment.status == RequirementEnrollmentStatus.ACTIVE
        )
    ).one()
    return {
        "document": document,
        "etag": document_etag(document),
        "context": {
            "framework_uuid": framework.framework_uuid,
            "version": version.version_number,
            "status": _value(version.status),
            "published_version": framework.published_version,
            "versions": [{"version": item.version_number, "status": _value(item.status), "published_at": item.published_at} for item in versions],
            "active_enrollments": active,
            "published_to_library": framework.library_published_version is not None,
            "linked_objectives": links,
            "unlinked_leaf_nodes": [{"node_uuid": node["node_uuid"], "code": node["code"], "title": node["title"]} for node in leaves if node["node_uuid"] not in links],
        },
    }


def _path(loc) -> str:
    path = ""
    for part in loc:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
    return path or "document"


def _known_node_uuids(db: Session, framework: RequirementFramework | None) -> set[str]:
    if framework is None:
        return set()
    return set(
        db.exec(
            select(RequirementNode.node_uuid)
            .join(RequirementFrameworkVersion, RequirementFrameworkVersion.id == RequirementNode.version_id)  # type: ignore[arg-type]
            .where(RequirementFrameworkVersion.framework_id == framework.id)
        ).all()
    )


def _check(db: Session, raw, framework: RequirementFramework | None) -> tuple[RequirementFrameworkDocument | None, dict, dict]:
    errors: list[dict] = []
    warnings: list[dict] = []
    prepared: dict = {}

    def report() -> dict:
        return {"valid": not errors, "errors": errors, "warnings": warnings}

    try:
        document = RequirementFrameworkDocument.model_validate(raw)
    except ValidationError as exc:
        errors.extend({"path": _path(error["loc"]), "message": error["msg"]} for error in exc.errors())
        return None, report(), prepared
    if not document.framework.name.strip():
        errors.append({"path": "framework.name", "message": "Give the framework a name"})

    levels = []
    for depth, level in enumerate(document.framework.levels):
        data = level.model_dump(exclude_none=True)
        data["level_uuid"] = level.level_uuid or f"requirement_level_{uuid4()}"
        data["code_style"] = level.code_style or requirements._default_code_style(depth)
        data["metadata_fields"] = [
            {**field.model_dump(exclude_none=True), "field_uuid": field.field_uuid or f"metadata_field_{uuid4()}"} for field in level.metadata_fields
        ]
        levels.append(data)

    known = _known_node_uuids(db, framework)
    ids: dict[str, str] = {}
    for i, node in enumerate(document.nodes):
        given = node.node_uuid
        if given and given in ids:
            errors.append({"path": f"nodes[{i}].node_uuid", "message": "This node_uuid appears more than once"})
            continue
        resolved = given if given and given in known else f"requirement_node_{uuid4()}"
        if given:
            ids[given] = resolved
        else:
            ids[f"#{i}"] = resolved
    resolved_ids = [ids.get(node.node_uuid or f"#{i}") for i, node in enumerate(document.nodes)]

    sibling_positions: dict[str | None, int] = {}
    inputs: list[RequirementNodeInput] = []
    for i, node in enumerate(document.nodes):
        parent = None
        if node.parent_node_uuid:
            parent = ids.get(node.parent_node_uuid)
            if parent is None:
                errors.append({"path": f"nodes[{i}].parent_node_uuid", "message": f"No node in this document has node_uuid {node.parent_node_uuid}"})
        position = sibling_positions.get(parent, 0)
        sibling_positions[parent] = position + 1
        inputs.append(
            RequirementNodeInput(
                node_uuid=resolved_ids[i], parent_node_uuid=parent, code=node.code, title=node.title.strip(),
                description=node.description, position=position, metadata=dict(node.metadata),
            )
        )
    stored_metadata = dict(framework.source_metadata or {}) if framework else {}
    source_metadata = {**stored_metadata, "requirement_levels": levels}
    normalized: list[dict] = []
    if not errors:
        try:
            normalized = requirements._validate_nodes(inputs, source_metadata)
        except HTTPException as exc:
            errors.append({"path": "nodes", "message": str(exc.detail)})

    if normalized and levels:
        by_uuid = {node["node_uuid"]: node for node in normalized}
        index_of = {resolved_ids[i]: i for i in range(len(resolved_ids))}
        for node in normalized:
            depth, parent = 0, node["parent_node_uuid"]
            while parent:
                depth, parent = depth + 1, by_uuid[parent]["parent_node_uuid"]
            fields = levels[depth]["metadata_fields"] if depth < len(levels) else []
            missing = [field["name"] for field in fields if field.get("required") and node["metadata"].get(field["field_uuid"]) in (None, "", [])]
            if missing:
                errors.append({"path": f"nodes[{index_of[node['node_uuid']]}].metadata", "message": f"Fill in the required {levels[depth]['name']} fields: {', '.join(missing)}"})

    if framework is not None and normalized:
        links = framework_links(db, framework)
        kept = {node["node_uuid"] for node in normalized}
        parents = {node["parent_node_uuid"] for node in normalized if node["parent_node_uuid"]}
        for node_uuid, linked in links.items():
            names = ", ".join(f"{item['template_name']}: {item['objective_title']}" for item in linked)
            if node_uuid not in kept:
                warnings.append({"path": "nodes", "message": f"Removes a requirement linked to {len(linked)} objective(s) ({names}); those links stop earning credit"})
            elif node_uuid in parents:
                warnings.append({"path": "nodes", "message": f"A linked requirement now has children; only leaf requirements earn credit ({names})"})

    prepared.update(inputs=inputs, source_metadata=source_metadata, normalized=normalized, levels=levels)
    return document, report(), prepared


def _reject(report: dict) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": "The document has errors; nothing was saved", **report})


def _framework(db: Session, org_id: int, framework_uuid: str) -> RequirementFramework:
    return requirements._framework_or_404(db, org_id, framework_uuid)


def get_framework_document(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return _envelope(db, _framework(db, org_id, framework_uuid))


def validate_framework_document(db: Session, current_user: PublicUser, org_id: int, raw, framework_uuid: str | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework(db, org_id, framework_uuid) if framework_uuid else None
    return _check(db, raw, framework)[1]


def save_framework_document(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str, raw, base_etag: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    framework = _framework(db, org_id, framework_uuid)
    current = _envelope(db, framework)
    if base_etag != current["etag"]:
        raise HTTPException(
            status_code=409,
            detail={"message": "The framework changed since it was read; merge your edit into `current` and save again", "current": current},
        )
    document, report, prepared = _check(db, raw, framework)
    if document is None or not report["valid"]:
        raise _reject(report)
    candidate = _document(document.framework.name.strip(), document.framework.description, prepared["levels"], prepared["normalized"])
    if candidate == current["document"]:
        return {**current, "changed": False, "warnings": report["warnings"]}
    requirements.update_framework(
        db, current_user, org_id, framework_uuid,
        RequirementFrameworkUpdate(
            name=document.framework.name.strip(), description=document.framework.description,
            source_metadata=prepared["source_metadata"], nodes=prepared["inputs"],
        ),
    )
    db.refresh(framework)
    return {**_envelope(db, framework), "changed": True, "warnings": report["warnings"]}


def create_framework_from_document(db: Session, current_user: PublicUser, org_id: int, raw) -> dict:
    require_org_admin(current_user.id, org_id, db)
    document, report, prepared = _check(db, raw, None)
    if document is None or not report["valid"]:
        raise _reject(report)
    created = requirements.create_framework(
        db, current_user,
        RequirementFrameworkCreate(
            org_id=org_id, name=document.framework.name.strip(), description=document.framework.description,
            source_metadata=prepared["source_metadata"], nodes=prepared["inputs"],
        ),
    )
    framework = _framework(db, org_id, created["framework_uuid"])
    return {**_envelope(db, framework), "changed": True, "warnings": report["warnings"]}


def publish_framework(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    published = requirements.publish_framework(db, current_user, org_id, framework_uuid)
    framework = _framework(db, org_id, framework_uuid)
    return {**_envelope(db, framework), "enrollments_on_older_versions": published.get("active_incomplete_enrollments", 0)}
