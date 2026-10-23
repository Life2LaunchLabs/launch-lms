"""Plan collections: groupings of an organization's plans, not containers.

A plan can be in any number of collections, and removing a collection (or a plan from one) never
touches the plans. Up to three categories from a fixed set describe everything inside; Discover uses
them for the plans and collections an organization shares.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, col, func, select

from src.db.goals import GoalTemplate, TemplateStatus
from src.db.plan_collections import PlanCollection, PlanCollectionCreate, PlanCollectionItem, PlanCollectionUpdate
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates

CATEGORIES = ("Career exploration", "Work-based learning", "College and training", "Financial literacy",
              "Life skills", "Portfolio", "Wellbeing", "Civic and community")
MAX_CATEGORIES = 3
THUMBS = 4


def _now() -> str:
    return datetime.now().isoformat()


def _categories(values: list[str]) -> list[str]:
    chosen = list(dict.fromkeys(value.strip() for value in values if value.strip()))
    unknown = [value for value in chosen if value not in CATEGORIES]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown category: {unknown[0]}")
    if len(chosen) > MAX_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Pick up to {MAX_CATEGORIES} categories")
    return chosen


def _collection_or_404(db: Session, org_id: int, collection_uuid: str) -> PlanCollection:
    row = db.exec(select(PlanCollection).where(PlanCollection.collection_uuid == collection_uuid, PlanCollection.org_id == org_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return row


def _templates(db: Session, org_id: int, template_uuids: list[str]) -> list[GoalTemplate]:
    """The organization's own plans, and other organizations' plans it added (or asked for) from Discover."""
    rows = list(db.exec(select(GoalTemplate).where(col(GoalTemplate.template_uuid).in_(template_uuids))).all())
    foreign = [row for row in rows if row.org_id != org_id]
    if foreign:
        from src.services.goals.discover import added_template_ids

        allowed = added_template_ids(db, org_id)
        rows = [row for row in rows if row.org_id == org_id or int(row.id or 0) in allowed]
    if len(rows) != len(set(template_uuids)):
        raise HTTPException(status_code=404, detail="Plan not found")
    order = {uuid: index for index, uuid in enumerate(template_uuids)}
    return sorted(rows, key=lambda row: order[row.template_uuid])


def _items(db: Session, collection_ids: list[int]) -> dict[int, list[GoalTemplate]]:
    """Each collection's plans in order, archived ones left out."""
    if not collection_ids:
        return {}
    rows = db.exec(select(PlanCollectionItem.collection_id, GoalTemplate).join(GoalTemplate, GoalTemplate.id == PlanCollectionItem.template_id)
                   .where(col(PlanCollectionItem.collection_id).in_(collection_ids), GoalTemplate.status != TemplateStatus.ARCHIVED.value)
                   .order_by(PlanCollectionItem.position, PlanCollectionItem.id)).all()
    result: dict[int, list[GoalTemplate]] = {}
    for collection_id, template in rows:
        result.setdefault(int(collection_id), []).append(template)
    return result


def _listed_ids(db: Session, template_ids: list[int]) -> set[int]:
    """Plans shared in the marketplace with a live version."""
    from src.db.template_marketplace import GoalTemplateListing

    if not template_ids or not inspect(db.connection()).has_table(GoalTemplateListing.__tablename__):
        return set()
    return {int(row) for row in db.exec(select(GoalTemplateListing.template_id).join(GoalTemplate, GoalTemplate.id == GoalTemplateListing.template_id).where(
        col(GoalTemplateListing.template_id).in_(template_ids), GoalTemplateListing.listed == True,  # noqa: E712
        col(GoalTemplate.published_version_id).is_not(None))).all()}


def _dict(row: PlanCollection, plans: list[GoalTemplate], listed: set[int]) -> dict:
    return {
        "collection_uuid": row.collection_uuid, "name": row.name, "description": row.description, "categories": row.categories or [],
        "plan_count": len(plans), "template_uuids": [plan.template_uuid for plan in plans],
        "thumbs": [{"template_uuid": plan.template_uuid, "title": plan.title, "thumbnail_image": plan.thumbnail_image} for plan in plans[:THUMBS]],
        "published_count": sum(int(plan.id or 0) in listed for plan in plans),
        "last_opened_at": row.last_opened_at, "update_date": row.update_date, "source_collection_uuid": row.source_collection_uuid,
    }


def list_collections(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The organization's collections, most recently opened first, and the categories to pick from."""
    templates.require_reader(db, current_user, org_id)
    rows = list(db.exec(select(PlanCollection).where(PlanCollection.org_id == org_id)).all())
    rows.sort(key=lambda row: (row.last_opened_at or datetime.min, row.id or 0), reverse=True)
    items = _items(db, [int(row.id) for row in rows if row.id])
    listed = _listed_ids(db, [int(plan.id) for plans in items.values() for plan in plans if plan.id])
    return {"collections": [_dict(row, items.get(int(row.id or 0), []), listed) for row in rows], "categories": list(CATEGORIES)}


def collection_dict(db: Session, row: PlanCollection) -> dict:
    plans = _items(db, [int(row.id or 0)]).get(int(row.id or 0), [])
    return _dict(row, plans, _listed_ids(db, [int(plan.id) for plan in plans if plan.id]))


def get_collection(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str) -> dict:
    templates.require_reader(db, current_user, org_id)
    return collection_dict(db, _collection_or_404(db, org_id, collection_uuid))


def _append(db: Session, row: PlanCollection, plans: list[GoalTemplate]) -> None:
    present = {int(item) for item in db.exec(select(PlanCollectionItem.template_id).where(PlanCollectionItem.collection_id == row.id)).all()}
    position = db.exec(select(func.max(PlanCollectionItem.position)).where(PlanCollectionItem.collection_id == row.id)).one() or 0
    for plan in plans:
        if int(plan.id or 0) in present:
            continue
        position += 1
        db.add(PlanCollectionItem(collection_id=int(row.id), template_id=int(plan.id), position=position, creation_date=_now()))  # type: ignore[arg-type]
        present.add(int(plan.id or 0))


def create_collection(db: Session, current_user: PublicUser, org_id: int, payload: PlanCollectionCreate) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    now = _now()
    row = PlanCollection(collection_uuid=f"plan_collection_{uuid4()}", org_id=org_id, name=payload.name.strip(), description=payload.description.strip(),
                         categories=_categories(payload.categories), last_opened_at=datetime.utcnow(), created_by_user_id=current_user.id,
                         creation_date=now, update_date=now)
    db.add(row)
    db.flush()
    _append(db, row, _templates(db, org_id, payload.template_uuids))
    db.commit()
    db.refresh(row)
    return collection_dict(db, row)


def update_collection(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str, payload: PlanCollectionUpdate) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    row = _collection_or_404(db, org_id, collection_uuid)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.description is not None:
        row.description = payload.description.strip()
    if payload.categories is not None:
        row.categories = _categories(payload.categories)
    row.update_date = _now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return collection_dict(db, row)


def delete_collection(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str) -> dict:
    """Remove the grouping; its plans stay."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    row = _collection_or_404(db, org_id, collection_uuid)
    for item in db.exec(select(PlanCollectionItem).where(PlanCollectionItem.collection_id == row.id)).all():
        db.delete(item)
    db.delete(row)
    db.commit()
    return {"deleted": collection_uuid}


def add_plans(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str, template_uuids: list[str]) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    row = _collection_or_404(db, org_id, collection_uuid)
    _append(db, row, _templates(db, org_id, template_uuids))
    row.update_date = _now()
    db.add(row)
    db.commit()
    return collection_dict(db, row)


def remove_plan(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str, template_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    row = _collection_or_404(db, org_id, collection_uuid)
    plan = _templates(db, org_id, [template_uuid])[0]
    item = db.exec(select(PlanCollectionItem).where(PlanCollectionItem.collection_id == row.id, PlanCollectionItem.template_id == plan.id)).first()
    if item is not None:
        db.delete(item)
        db.commit()
    return collection_dict(db, row)


def opened(db: Session, current_user: PublicUser, org_id: int, collection_uuid: str) -> dict:
    """Someone opened the collection: it moves to the front of the carousel."""
    templates.require_reader(db, current_user, org_id)
    row = _collection_or_404(db, org_id, collection_uuid)
    row.last_opened_at = datetime.utcnow()
    db.add(row)
    db.commit()
    return {"collection_uuid": collection_uuid, "last_opened_at": row.last_opened_at}


def collections_by_template(db: Session, org_id: int, template_ids: list[int]) -> dict[int, list[dict]]:
    """Template id -> the organization's collections it's in, for plan cards and the plan header."""
    if not template_ids or not inspect(db.connection()).has_table(PlanCollection.__tablename__):
        return {}
    rows = db.exec(select(PlanCollectionItem.template_id, PlanCollection).join(PlanCollection, PlanCollection.id == PlanCollectionItem.collection_id)
                   .where(col(PlanCollectionItem.template_id).in_(template_ids), PlanCollection.org_id == org_id).order_by(PlanCollection.name)).all()
    result: dict[int, list[dict]] = {}
    for template_id, row in rows:
        result.setdefault(int(template_id), []).append({"collection_uuid": row.collection_uuid, "name": row.name})
    return result
