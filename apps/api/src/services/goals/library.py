"""The global template library: the platform owner organization shares templates every organization can copy.

Publishing to the library stores a frozen copy of the draft document on the
template. Copying makes an ordinary draft template in the copying organization
with its own copy of every activity, so the two never share content.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import GoalTemplate, TemplateStatus
from src.db.learning import LearningActivity, LearningPage
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.document import iter_steps
from src.services.learning.activity_copy import copy_activity


def _owner_org(db: Session) -> Organization:
    owner = db.exec(select(Organization).order_by(Organization.id).limit(1)).first()  # type: ignore[arg-type]
    if not owner:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return owner


def _library_dict(template: GoalTemplate, owner: Organization) -> dict:
    document = template.library_document or {}
    stages = document.get("stages") or []
    meta = document.get("template") or {}
    return {
        "template_uuid": template.template_uuid, "title": meta.get("title") or template.title,
        "description": meta.get("description") or template.description, "thumbnail_image": template.thumbnail_image,
        "stage_count": len(stages), "step_count": sum(1 for _ in iter_steps(document)),
        "published_at": template.library_published_at, "owner_org_name": owner.name,
    }


def library_status(template: GoalTemplate) -> dict:
    return {
        "published_to_library": template.library_published_at is not None, "library_published_at": template.library_published_at,
        "source_template_uuid": template.source_template_uuid, "source_version": template.source_version,
    }


def publish_to_library(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Share the template's current draft in the library (the owner organization only); publishing again replaces it."""
    owner = _owner_org(db)
    if owner.id != org_id:
        raise HTTPException(status_code=403, detail="Only the owner organization can publish to the global library")
    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates can't be shared in the library")
    template.library_document = templates.frozen_document(db, template, template.document)
    template.library_published_at = datetime.utcnow()
    template.update_date = datetime.now().isoformat()
    db.add(template)
    db.commit()
    db.refresh(template)
    return {**templates.template_dict(db, template), **library_status(template)}


def list_library(db: Session, current_user: PublicUser, org_id: int, query: str = "") -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    owner = _owner_org(db)
    rows = db.exec(
        select(GoalTemplate).where(GoalTemplate.org_id == owner.id, GoalTemplate.library_published_at.is_not(None))  # type: ignore[union-attr]
        .order_by(GoalTemplate.title)
    ).all()
    needle = query.strip().lower()
    items = [_library_dict(row, owner) for row in rows if row.library_document]
    return [item for item in items if not needle or needle in f"{item['title']} {item['description']}".lower()]


def copy_from_library(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """A draft template of the organization's own from a library template, with copies of its activities."""
    from src.services.requirements import mappable_nodes, parent_node_uuids

    require_org_admin(current_user.id, org_id, db)
    owner = _owner_org(db)
    source = db.exec(select(GoalTemplate).where(
        GoalTemplate.template_uuid == template_uuid, GoalTemplate.org_id == owner.id, GoalTemplate.library_published_at.is_not(None),  # type: ignore[union-attr]
    )).first()
    if not source or not source.library_document:
        raise HTTPException(status_code=404, detail="Library template not found")
    document = deepcopy(source.library_document)
    now = datetime.now().isoformat()
    copied = GoalTemplate(
        template_uuid=f"goal_template_{uuid4()}", org_id=org_id, title="", document={}, thumbnail_image=source.thumbnail_image,
        status=TemplateStatus.ACTIVE, source_template_uuid=source.template_uuid,
        source_version=templates.published_version(db, source).number if source.published_version_id else None,  # type: ignore[union-attr]
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
    db.commit()
    db.refresh(copied)
    return {**templates.template_dict(db, copied), **library_status(copied)}
