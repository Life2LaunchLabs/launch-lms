"""A plan's resources when other organizations get it: only ones in the Library, so they can open them.

A plan can't be listed in the marketplace, or release a new version while listed, if it points at a
resource that isn't in the Library. For each one the publisher swaps it for a Library resource or
removes it; that holds for other organizations only, and their own plan keeps it. A resource partner
can instead list the resource's channel in the Library. The choices live on the listing
(``GoalTemplateListing.resource_overrides``) and apply where another organization gets the plan:
issuing its learners' goals and copying an open plan.
"""

from __future__ import annotations

from copy import deepcopy

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import GoalTemplate
from src.db.resources import Resource
from src.db.template_marketplace import GoalTemplateListing
from src.db.users import PublicUser
from src.security.access.access import org_access
from src.security.org_auth import require_org_admin
from src.security.superadmin import is_user_superadmin


def resource_uuids(document: dict | list | None) -> list[str]:
    """Every resource a document points at (Explore suggestions, materials, staff materials), in order."""
    found: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("resource_uuid"), str) and node["resource_uuid"] not in found:
                found.append(node["resource_uuid"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(document)
    return found


def apply_overrides(document: dict, overrides: dict | None) -> dict:
    """The document with each overridden resource swapped (title and link too) or taken out."""
    if not overrides:
        return document

    def walk(node):
        if isinstance(node, list):
            kept, seen = [], set()
            for value in node:
                uuid = value.get("resource_uuid") if isinstance(value, dict) else None
                if uuid in overrides and overrides[uuid] is None:
                    continue
                value = walk(value)
                # A swap can land on a resource the list already has: keep it once.
                if isinstance(value, dict) and isinstance(value.get("resource_uuid"), str):
                    if value["resource_uuid"] in seen:
                        continue
                    seen.add(value["resource_uuid"])
                kept.append(value)
            return kept
        if isinstance(node, dict):
            out = {key: walk(value) for key, value in node.items()}
            swap = overrides.get(node.get("resource_uuid")) if isinstance(node.get("resource_uuid"), str) else None
            if swap:
                out["resource_uuid"] = swap["resource_uuid"]
                if "title" in out:
                    out["title"] = swap.get("title") or out["title"]
                if "url" in out:
                    out["url"] = swap.get("url") or out["url"]
            return out
        return node

    return walk(deepcopy(document))


def for_org(db: Session, template: GoalTemplate | None, org_id: int | None, document: dict) -> dict:
    """The document another organization gets: the listing's swaps and removals applied. The owner's is as written."""
    if template is None or org_id is None or template.org_id == org_id:
        return document
    listing = db.exec(select(GoalTemplateListing).where(GoalTemplateListing.template_id == template.id)).first()
    return apply_overrides(document, listing.resource_overrides if listing else None)


def _in_library(db: Session, resource: Resource) -> bool:
    from src.services.resources import _in_library as listed

    return listed(resource, db)


def private_resources(db: Session, template: GoalTemplate, document: dict | list, overrides: dict | None = None) -> list[dict]:
    """The document's (or documents') resources other organizations couldn't open, with what the publisher chose for each."""
    from src.services.resources import _channels_of

    overrides = overrides or {}
    uuids = resource_uuids(document)
    if not uuids:
        return []
    rows = {resource.resource_uuid: resource for resource in db.exec(select(Resource).where(col(Resource.resource_uuid).in_(uuids))).all()}
    out = []
    for uuid in uuids:
        resource = rows.get(uuid)
        if resource is None or _in_library(db, resource):
            continue
        own_channels = [channel for channel in _channels_of(resource.id, db) if channel.org_id == template.org_id]
        out.append({
            "resource_uuid": uuid, "title": resource.title, "resource_type": resource.resource_type, "url": resource.external_url,
            "channels": [{"channel_uuid": channel.channel_uuid, "name": channel.name} for channel in own_channels],
            "fix": ("remove" if overrides[uuid] is None else "swap") if uuid in overrides else None,
            "swap": overrides.get(uuid) or None,
        })
    return out


def blocking(db: Session, template: GoalTemplate, document: dict, listing: GoalTemplateListing | None) -> list[dict]:
    return [item for item in private_resources(db, template, document, listing.resource_overrides if listing else None) if not item["fix"]]


def ensure_shareable(db: Session, template: GoalTemplate, document: dict, listing: GoalTemplateListing | None) -> None:
    """Refuse while other organizations would get resources they can't open."""
    waiting = blocking(db, template, document, listing)
    if waiting:
        names = ", ".join(f"“{item['title']}”" for item in waiting[:3]) + (f" and {len(waiting) - 3} more" if len(waiting) > 3 else "")
        raise HTTPException(status_code=409, detail=(
            f"{names} {'isn’t' if len(waiting) == 1 else 'aren’t'} in the Library, so other organizations couldn’t open "
            f"{'it' if len(waiting) == 1 else 'them'}. In Who can find it, swap or remove each one for them, or list its channel in the Library."
        ))


def ensure_listed_shareable(db: Session, template: GoalTemplate, document: dict) -> None:
    """While the plan is in the marketplace, a version going live must be one other organizations can open."""
    listing = db.exec(select(GoalTemplateListing).where(GoalTemplateListing.template_id == template.id)).first()
    if listing is not None and listing.listed:
        ensure_shareable(db, template, document, listing)


def can_list_resources(db: Session, user_id: int, org_id: int) -> bool:
    """Resource partners list their channels in the Library themselves."""
    return is_user_superadmin(user_id, db) or org_access(org_id, db).has("resource_publishing")


def set_override(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, resource_uuid: str, fix: str | None, replacement_uuid: str | None) -> dict:
    """Swap a resource for a Library one or remove it, for other organizations (``fix`` None undoes it)."""
    from src.services.goals import template_marketplace, templates

    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    listing = template_marketplace.listing_of(db, template)
    if listing is None:
        listing = GoalTemplateListing(template_id=int(template.id), org_id=org_id, creation_date=template_marketplace._now())  # type: ignore[arg-type]
    overrides = dict(listing.resource_overrides or {})
    if fix is None:
        overrides.pop(resource_uuid, None)
    elif fix == "remove":
        overrides[resource_uuid] = None
    elif fix == "swap":
        replacement = db.exec(select(Resource).where(Resource.resource_uuid == (replacement_uuid or ""))).first()
        if replacement is None or not _in_library(db, replacement):
            raise HTTPException(status_code=422, detail="Swap it for a resource that's in the Library")
        overrides[resource_uuid] = {"resource_uuid": replacement.resource_uuid, "title": replacement.title, "url": replacement.external_url}
    else:
        raise HTTPException(status_code=422, detail="Choose swap or remove")
    listing.resource_overrides = overrides or None
    listing.update_date = template_marketplace._now()
    db.add(listing)
    db.commit()
    return template_marketplace.get_listing(db, current_user, org_id, template_uuid)
