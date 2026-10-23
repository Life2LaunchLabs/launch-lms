"""The library is the marketplace: templates listed open to copy (open mode, open access).

There is one place plans are shared. Sharing "to the library" lists the template in
the marketplace so any organization can copy it without asking; the library list,
search and copy below read those listings. Copying makes an ordinary draft template
in the copying organization with its own copy of every activity, so the two never
share content.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import GoalTemplate, TemplateStatus
from src.db.learning import LearningActivity, LearningPage
from src.db.users import PublicUser
from src.security.access.access import ensure_feature
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.document import iter_steps
from src.services.learning.activity_copy import copy_activity


def _open_listing(listing) -> bool:
    return listing is not None and listing.listed and listing.mode == "open" and listing.access == "open"


def library_status(db: Session, template: GoalTemplate) -> dict:
    from src.services.goals.template_marketplace import listing_of

    listing = listing_of(db, template)
    shared = _open_listing(listing)
    return {
        "published_to_library": shared, "library_published_at": listing.listed_at if shared else None,  # type: ignore[union-attr]
        "source_template_uuid": template.source_template_uuid, "source_version": template.source_version,
    }


def publish_to_library(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """List the template in the marketplace open to copy without asking (plan publishers only)."""
    from src.db.template_marketplace import TemplateListingUpdate
    from src.services.goals import template_marketplace

    require_org_admin(current_user.id, org_id, db, "build_plans")
    ensure_feature(org_id, "plan_publishing", db)
    template = templates.template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates can't be shared in the library")
    if templates.published_version(db, template) is None:
        # The connector shares what it built: its draft becomes the first live version.
        templates.publish(db, current_user, org_id, template_uuid, "Shared in the library")
    template_marketplace.set_listing(db, current_user, org_id, template_uuid, TemplateListingUpdate(listed=True, mode="open", access="open"))
    db.refresh(template)
    return {**templates.template_dict(db, template), **library_status(db, template)}


def list_library(db: Session, current_user: PublicUser, org_id: int, query: str = "") -> list[dict]:
    """Marketplace templates any organization may copy without asking, in the library's shape."""
    from src.services.goals import template_marketplace

    cards = template_marketplace.browse(db, current_user, org_id, query)
    return [{
        "template_uuid": card["template_uuid"], "title": card["title"], "description": card["description"],
        "thumbnail_image": card["thumbnail_image"], "stage_count": card["stage_count"], "step_count": card["step_count"],
        "published_at": card["listed_at"], "owner_org_name": (card["creator_org"] or {}).get("name", ""),
    } for card in cards if card["mode"] == "open" and card["access"] == "open"]


def copy_from_library(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """A draft template of the organization's own from a template open to copy, with copies of its activities."""
    from src.services.goals import template_marketplace

    require_org_admin(current_user.id, org_id, db, "build_plans")
    source = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if source is None or source.published_version_id is None or not _open_listing(template_marketplace.listing_of(db, source)):
        raise HTTPException(status_code=404, detail="Library template not found")
    if source.org_id != org_id:
        return template_marketplace.copy_template(db, current_user, org_id, template_uuid)
    # The owner copying its own shared template gets a fresh draft of the live version.
    live = templates.published_version(db, source)
    copied = copy_into(db, current_user, org_id, source, live.document, live.number)  # type: ignore[union-attr]
    db.commit()
    db.refresh(copied)
    return {**templates.template_dict(db, copied), **library_status(db, copied)}


def copy_into(db: Session, current_user: PublicUser, org_id: int, source: GoalTemplate, source_document: dict, source_version: int | None) -> GoalTemplate:
    """A new draft template of the organization's own from another template's document, with copies of its activities (flushed, not committed)."""
    from src.services.requirements import mappable_nodes, parent_node_uuids

    document = deepcopy(source_document)
    now = datetime.now().isoformat()
    copied = GoalTemplate(
        template_uuid=f"goal_template_{uuid4()}", org_id=org_id, title="", document={}, thumbnail_image=source.thumbnail_image,
        status=TemplateStatus.ACTIVE, source_template_uuid=source.template_uuid, source_version=source_version,
        created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    db.add(copied)
    db.flush()
    linkable: set[str] | None = None
    for _, step in iter_steps(document):
        # Keep only the requirement links this organization's own frameworks can take.
        if step.get("requirement_node_uuids"):
            linkable = linkable if linkable is not None else set(mappable_nodes(db, org_id)) - parent_node_uuids(db, org_id)
            step["requirement_node_uuids"] = [node for node in step["requirement_node_uuids"] if node in linkable]
        if step.get("type") != "activity":
            continue
        config = step.setdefault("config", {})
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == config.get("activity_uuid"))).first()
        if activity:
            copy = copy_activity(db, activity, goal_template_id=copied.id, org_id=org_id, frozen_from_id=None, frozen_hash=None)
            for page in db.exec(select(LearningPage).where(LearningPage.activity_id == copy.id)).all():
                page.org_id = org_id
                db.add(page)
            config["activity_uuid"] = copy.activity_uuid
        else:
            config.pop("activity_uuid", None)
    templates._store(db, copied, templates._validated(db, copied, document))
    db.flush()
    return copied
