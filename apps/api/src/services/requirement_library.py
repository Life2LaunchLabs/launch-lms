"""The global library of requirement frameworks: what it shares, readable without an organization (/start lists
it before the account exists). Copying one into an org stays in ``services/requirements``."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.requirements import RequirementFramework
from src.services.requirements import _leaf_ids, _owner_org


def library_snapshot(db: Session, framework_uuid: str) -> dict | None:
    """What the library shares of a framework, or None when it isn't in the library."""
    item = db.exec(select(RequirementFramework).where(
        RequirementFramework.framework_uuid == framework_uuid,
        RequirementFramework.org_id == _owner_org(db).id,
        RequirementFramework.library_published_version.is_not(None),
        RequirementFramework.archived == False,  # noqa: E712
    )).first()
    return dict(item.library_snapshot) if item and item.library_snapshot else None


def library_leaf_ids(snapshot: dict) -> list[str]:
    return _leaf_ids(snapshot.get("nodes") or [])


def library_frameworks(db: Session, query: str = "") -> list[dict]:
    """The frameworks in the global library. Nothing private: /start lists them before the account exists."""
    owner = _owner_org(db)
    items = db.exec(select(RequirementFramework).where(
        RequirementFramework.org_id == owner.id,
        RequirementFramework.library_published_version.is_not(None),
        RequirementFramework.archived == False,  # noqa: E712
    ).order_by(RequirementFramework.name)).all()
    needle = query.strip().lower()
    results = []
    for item in items:
        snapshot = dict(item.library_snapshot or {})
        if needle and needle not in f"{snapshot.get('name', '')} {snapshot.get('description', '')}".lower():
            continue
        results.append({
            "framework_uuid": item.framework_uuid, "name": snapshot.get("name", item.name),
            "description": snapshot.get("description", item.description),
            "version": snapshot.get("version", item.library_published_version),
            "node_count": len(snapshot.get("nodes") or []),
            "requirement_count": len(_leaf_ids(snapshot.get("nodes") or [])),
            "editable": item.library_editable,
            "owner_org_name": owner.name,
        })
    return results
