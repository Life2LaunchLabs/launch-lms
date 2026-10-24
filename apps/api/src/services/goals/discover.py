"""Discover: the one marketplace of plans and collections organizations share.

A plan is in Discover when its creator lists it with a live version (``template_marketplace``).
A collection is in Discover when two or more of its plans are; it shows only those. Categories
come from the creator's collections a plan is in.

Adding is per organization. A plan open to anyone is added at once; one by request waits on its
creator and shows in Plans as requested. A plan others may edit is copied when it's added (or when
the request is approved), so the organization edits its own copy; a locked plan is run as the
creator publishes it. Adding a collection adds each of its plans and a collection of the
organization's own that holds them.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import GoalTemplate, TemplateStatus
from src.db.organizations import Organization
from src.db.plan_collections import PlanCollection, PlanCollectionItem
from src.db.template_marketplace import GoalTemplateAuthorization, GoalTemplateListing, TemplateAuthorizationRequest, TemplateAuthorizationStatus
from src.db.users import PublicUser
from src.security.access.access import orgs_with_feature
from src.security.org_auth import require_org_admin
from src.services.goals import collections, template_marketplace as market, templates

APPROVED = TemplateAuthorizationStatus.APPROVED.value
REQUESTED = TemplateAuthorizationStatus.REQUESTED.value
MIN_COLLECTION_PLANS = 2


def _now() -> str:
    return datetime.now().isoformat()


def _listed_templates(db: Session) -> list[tuple[GoalTemplate, GoalTemplateListing]]:
    return list(db.exec(select(GoalTemplate, GoalTemplateListing).join(GoalTemplateListing, GoalTemplateListing.template_id == GoalTemplate.id)
                        .where(GoalTemplateListing.listed == True, GoalTemplate.status != TemplateStatus.ARCHIVED,  # noqa: E712
                               col(GoalTemplate.published_version_id).is_not(None)).order_by(GoalTemplate.title)).all())


def _owner_collections(db: Session, org_ids: set[int]) -> list[tuple[PlanCollection, list[int]]]:
    """Each collection of these organizations, with its plan ids in order."""
    if not org_ids:
        return []
    rows = list(db.exec(select(PlanCollection).where(col(PlanCollection.org_id).in_(org_ids), col(PlanCollection.source_collection_uuid).is_(None))
                        .order_by(PlanCollection.name)).all())
    items: dict[int, list[int]] = {}
    for item in db.exec(select(PlanCollectionItem).where(col(PlanCollectionItem.collection_id).in_([row.id for row in rows] or [0]))
                        .order_by(PlanCollectionItem.position, PlanCollectionItem.id)).all():
        items.setdefault(int(item.collection_id), []).append(int(item.template_id))
    return [(row, items.get(int(row.id or 0), [])) for row in rows]


def _authorizations(db: Session, org_id: int) -> dict[int, GoalTemplateAuthorization]:
    return {int(row.template_id): row for row in db.exec(select(GoalTemplateAuthorization).where(GoalTemplateAuthorization.issuer_org_id == org_id)).all()}


def _state(template: GoalTemplate, listing: GoalTemplateListing, authorization: GoalTemplateAuthorization | None, org_id: int,
           copies: dict[int, str]) -> dict:
    """This organization's standing with a listed plan: own, added (with its plan here), requested, or none."""
    if template.org_id == org_id:
        return {"status": "own", "local_template_uuid": template.template_uuid}
    if authorization is not None and authorization.status == REQUESTED:
        return {"status": "requested", "local_template_uuid": None}
    if authorization is not None and authorization.status == APPROVED:
        if listing.mode == "locked":
            return {"status": "added", "local_template_uuid": template.template_uuid}
        if authorization.copied_template_id and int(authorization.copied_template_id) in copies:
            return {"status": "added", "local_template_uuid": copies[int(authorization.copied_template_id)]}
    return {"status": "none", "local_template_uuid": None}


def _copies(db: Session, authorizations: dict[int, GoalTemplateAuthorization]) -> dict[int, str]:
    ids = [int(row.copied_template_id) for row in authorizations.values() if row.copied_template_id]
    if not ids:
        return {}
    return {int(row.id): row.template_uuid for row in db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_(ids),
                                                                                         GoalTemplate.status != TemplateStatus.ARCHIVED)).all()}


def _catalog(db: Session, org_id: int) -> dict:
    """Everything listed, with categories, collections and this organization's standing on each."""
    listed = _listed_templates(db)
    by_id = {int(template.id or 0): (template, listing) for template, listing in listed}
    owner_ids = {template.org_id for template, _ in listed}
    orgs = {org.id: org for org in db.exec(select(Organization).where(col(Organization.id).in_(owner_ids or {0}))).all()}
    partners = orgs_with_feature(owner_ids, "badge_publishing", db) if owner_ids else set()
    authorizations = _authorizations(db, org_id)
    copies = _copies(db, authorizations)
    categories: dict[int, list[str]] = {}
    shared_collections = []
    for row, template_ids in _owner_collections(db, owner_ids):
        shown = [template_id for template_id in template_ids if template_id in by_id and by_id[template_id][0].org_id == row.org_id]
        for template_id in shown:
            for category in row.categories or []:
                if category not in categories.setdefault(template_id, []):
                    categories[template_id].append(category)
        if len(shown) >= MIN_COLLECTION_PLANS:
            shared_collections.append((row, shown))
    plans = {}
    for template_id, (template, listing) in by_id.items():
        card = market._card(db, template, listing, org_id)
        plans[template_id] = {**card, "categories": categories.get(template_id, []), "partner": template.org_id in partners,
                              **_state(template, listing, authorizations.get(template_id), org_id, copies)}
    added = {row.source_collection_uuid: row.collection_uuid for row in db.exec(select(PlanCollection).where(
        PlanCollection.org_id == org_id, col(PlanCollection.source_collection_uuid).is_not(None))).all()}
    result_collections = []
    for row, shown in shared_collections:
        items = [plans[template_id] for template_id in shown]
        statuses = {item["status"] for item in items}
        status = "own" if row.org_id == org_id else "added" if row.collection_uuid in added else "requested" if "requested" in statuses else "none"
        result_collections.append({
            "collection_uuid": row.collection_uuid, "name": row.name, "description": row.description, "categories": row.categories or [],
            "creator_org": market._org(orgs.get(row.org_id)), "partner": row.org_id in partners, "plan_count": len(items),
            "template_uuids": [item["template_uuid"] for item in items],
            "thumbs": [{key: item[key] for key in ("template_uuid", "title", "thumbnail_image", "icon", "color")} for item in items[:4]],
            "badge_count": sum(1 for item in items if item["badge"]), "locked": all(item["mode"] == "locked" for item in items),
            "access": "open" if all(item["access"] == "open" for item in items) else "request",
            "status": status, "local_collection_uuid": added.get(row.collection_uuid),
        })
    return {"plans": list(plans.values()), "collections": result_collections}


def _matches(needle: str, *texts: str) -> bool:
    return not needle or needle in " ".join(text or "" for text in texts).lower()


def discover(db: Session, current_user: PublicUser, org_id: int, query: str = "") -> dict:
    """The Discover page: a partner collection to feature, collections, and plans with their categories."""
    market.require_reader(db, current_user, org_id)
    catalog = _catalog(db, org_id)
    needle = query.strip().lower()
    plans = [plan for plan in catalog["plans"] if _matches(needle, plan["title"], plan["description"], (plan["creator_org"] or {}).get("name", ""), *plan["categories"])]
    shared = [item for item in catalog["collections"] if _matches(needle, item["name"], item["description"], (item["creator_org"] or {}).get("name", ""), *item["categories"])]
    # Partners' collections lead; among them, the largest is the one featured.
    shared.sort(key=lambda item: (not item["partner"], -item["plan_count"], item["name"]))
    featured = next((item for item in shared if item["partner"] and item["status"] != "own"), None)
    return {"featured": featured, "collections": shared, "plans": plans, "categories": list(collections.CATEGORIES)}


def _listed_or_404(db: Session, template_uuid: str) -> tuple[GoalTemplate, GoalTemplateListing]:
    row = db.exec(select(GoalTemplate, GoalTemplateListing).join(GoalTemplateListing, GoalTemplateListing.template_id == GoalTemplate.id).where(
        GoalTemplate.template_uuid == template_uuid, GoalTemplateListing.listed == True,  # noqa: E712
        col(GoalTemplate.published_version_id).is_not(None))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="This plan isn't in Discover")
    return row


def plan_detail(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """A listed plan as Discover shows it: its live steps and the collections it's shared in."""
    market.require_reader(db, current_user, org_id)
    template, _ = _listed_or_404(db, template_uuid)
    catalog = _catalog(db, org_id)
    card = next(plan for plan in catalog["plans"] if plan["template_uuid"] == template_uuid)
    live = templates.published_version(db, template)
    return {**card, "document": live.document if live else {"stages": []}, "live_version": {"semver": live.semver, "number": live.number} if live else None,
            "collections": [item for item in catalog["collections"] if template_uuid in item["template_uuids"]]}


def collection_detail(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str) -> dict:
    market.require_reader(db, current_user, org_id)
    catalog = _catalog(db, org_id)
    found = next((item for item in catalog["collections"] if item["collection_uuid"] == collection_uuid), None)
    if found is None:
        raise HTTPException(status_code=404, detail="This collection isn't in Discover")
    plans = {plan["template_uuid"]: plan for plan in catalog["plans"]}
    return {**found, "plans": [plans[uuid] for uuid in found["template_uuids"]]}


# Adding --------------------------------------------------------------------------------------------------

def _add(db: Session, current_user: PublicUser, org_id: int, template: GoalTemplate, listing: GoalTemplateListing) -> GoalTemplate | None:
    """Ask for (or take) the plan; an editable one approved is copied. Returns the plan as it is here, or None while requested."""
    authorization = market.authorization_of(db, template, org_id)
    if authorization is None or authorization.status not in (APPROVED, REQUESTED):
        market.request_use(db, current_user, TemplateAuthorizationRequest(template_uuid=template.template_uuid, issuer_org_id=org_id))
        authorization = market.authorization_of(db, template, org_id)
    if authorization is None or authorization.status != APPROVED:
        return None
    if listing.mode == "locked":
        return template
    copied = db.get(GoalTemplate, authorization.copied_template_id) if authorization.copied_template_id else None
    if copied is not None and copied.status != TemplateStatus.ARCHIVED:
        return copied
    return copy_for(db, current_user.id, org_id, template, authorization)


def copy_for(db: Session, user_id: int | None, org_id: int, template: GoalTemplate, authorization: GoalTemplateAuthorization) -> GoalTemplate:
    """The organization's own copy of an editable plan, live at the creator's version (flushed, not committed).

    Collections of the organization that held the creator's plan (added while it was requested) hold the copy instead."""
    from src.services.badges.definition import without_badge
    from src.services.goals.library import copy_into

    live = templates.issuable_version(db, template)
    copied = copy_into(db, PublicUser.model_construct(id=user_id), org_id, template, without_badge(live.document), live.number)
    # It arrives ready to assign: live at the creator's version, no draft.
    templates.publish_draft(db, copied, user_id, f"Added from {template.title}", semver=live.semver or "1.0.0")
    authorization.copied_template_id = copied.id
    authorization.update_date = _now()
    db.add(authorization)
    for item in db.exec(select(PlanCollectionItem).join(PlanCollection, PlanCollection.id == PlanCollectionItem.collection_id).where(
            PlanCollection.org_id == org_id, PlanCollectionItem.template_id == template.id)).all():
        item.template_id = int(copied.id or 0)
        db.add(item)
    db.flush()
    return copied


def _result(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    db.commit()
    return plan_detail(db, current_user, org_id, template_uuid)


def add_plan(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    template, listing = _listed_or_404(db, template_uuid)
    if template.org_id == org_id:
        raise HTTPException(status_code=422, detail="Your organization already owns this plan")
    _add(db, current_user, org_id, template, listing)
    return _result(db, current_user, org_id, template_uuid)


def cancel_request(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Withdraw a request still waiting on the creator; collections here stop holding the plan."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    template, _ = _listed_or_404(db, template_uuid)
    authorization = market.authorization_of(db, template, org_id)
    if authorization is None or authorization.status != REQUESTED:
        raise HTTPException(status_code=422, detail="There's no request waiting for this plan")
    db.delete(authorization)
    for item in db.exec(select(PlanCollectionItem).join(PlanCollection, PlanCollection.id == PlanCollectionItem.collection_id).where(
            PlanCollection.org_id == org_id, PlanCollectionItem.template_id == template.id)).all():
        db.delete(item)
    return _result(db, current_user, org_id, template_uuid)


def add_collection(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str) -> dict:
    """Add each of the collection's plans, and a collection of this organization's own holding them."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    shared = collection_detail(db, current_user, org_id, collection_uuid)
    if shared["status"] == "own":
        raise HTTPException(status_code=422, detail="Your organization already owns this collection")
    local = db.exec(select(PlanCollection).where(PlanCollection.org_id == org_id, PlanCollection.source_collection_uuid == collection_uuid)).first()
    if local is None:
        now = _now()
        local = PlanCollection(collection_uuid=f"plan_collection_{uuid4()}", org_id=org_id, name=shared["name"], description=shared["description"],
                               categories=shared["categories"], last_opened_at=datetime.utcnow(), created_by_user_id=current_user.id,
                               source_collection_uuid=collection_uuid, creation_date=now, update_date=now)
        db.add(local)
        db.flush()
    held = []
    for uuid in shared["template_uuids"]:
        template, listing = _listed_or_404(db, uuid)
        held.append(_add(db, current_user, org_id, template, listing) or template)
    collections._append(db, local, held)
    db.commit()
    return {**collection_detail(db, current_user, org_id, collection_uuid), "local_collection_uuid": local.collection_uuid}


# Plans here from other organizations ----------------------------------------------------------------------

def added_template_ids(db: Session, org_id: int) -> set[int]:
    """Other organizations' plans this one runs as-is or is waiting on (collections may hold them)."""
    rows = db.exec(select(GoalTemplateAuthorization.template_id).join(GoalTemplateListing, GoalTemplateListing.template_id == GoalTemplateAuthorization.template_id).where(
        GoalTemplateAuthorization.issuer_org_id == org_id,
        (GoalTemplateAuthorization.status == REQUESTED) | ((GoalTemplateAuthorization.status == APPROVED) & (GoalTemplateListing.mode == "locked")))).all()
    return {int(row) for row in rows}


def added_plans(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Plans of other organizations shown in Plans: locked ones this organization runs, and ones it asked for."""
    templates.require_reader(db, current_user, org_id)
    ids = added_template_ids(db, org_id)
    if not ids:
        return []
    authorizations = _authorizations(db, org_id)
    in_collections = collections.collections_by_template(db, org_id, list(ids))
    result = []
    for template in db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_(ids), GoalTemplate.status != TemplateStatus.ARCHIVED).order_by(GoalTemplate.title)).all():
        live = templates.published_version(db, template)
        document = (live.document if live else template.document) or {}
        authorization = authorizations[int(template.id or 0)]
        result.append({
            "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
            **templates.cover(template), "org_id": template.org_id, "owner_org": market._org(db.get(Organization, template.org_id)),
            "step_count": sum(len(stage.get("steps") or []) for stage in document.get("stages") or []), "badge": market.badge_summary(db, template),
            "live_version": {"semver": live.semver, "number": live.number} if live else None, "published_version": live.number if live else None,
            "requested": authorization.status == REQUESTED, "read_only": True, "collections": in_collections.get(int(template.id or 0), []),
        })
    return result
