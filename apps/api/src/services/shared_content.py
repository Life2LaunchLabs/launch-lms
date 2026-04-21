from __future__ import annotations

from typing import Any

from src.db.organizations import Organization


def can_access_shared_resource(
    resource: Any,
    *,
    is_authenticated: bool,
    require_published: bool = False,
) -> bool:
    if not is_authenticated:
        return False
    if not getattr(resource, "shared", False):
        return False
    if require_published and not getattr(resource, "published", False):
        return False
    return True


def owner_org_payload(org: Organization, current_org_id: int | None = None) -> dict[str, Any]:
    return {
        "owner_org_id": org.id,
        "owner_org_uuid": org.org_uuid,
        "owner_org_slug": org.slug,
        "owner_org_name": org.name,
        "is_shared_from_other_org": current_org_id is not None and org.id != current_org_id,
    }
