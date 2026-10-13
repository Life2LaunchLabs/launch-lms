"""Badge collections for the Claude connector: list them, create or edit one (credibility, endorsers)."""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.learning import BadgeCollection, LearningBadge
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.badge_documents.store import _URL, _collection
from src.services.learning import access_rules


def _collection_entry(db: Session, collection: BadgeCollection) -> dict:
    metadata = collection.collection_metadata or {}
    badges = db.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id, LearningBadge.deleted_at.is_(None))).all()  # type: ignore[union-attr]
    return {
        "collection_uuid": collection.collection_uuid, "name": collection.name, "description": collection.description or "",
        "thumbnail_image": collection.thumbnail_image or "", "public": collection.public, "hidden": collection.hidden,
        "credibility": metadata.get("credibility") or "", "endorsers": metadata.get("endorsers") or [],
        "badges": [{"badge_uuid": badge.badge_uuid, "name": badge.name} for badge in badges],
    }


def list_collections(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    collections = db.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id, BadgeCollection.deleted_at.is_(None)).order_by(BadgeCollection.name.asc())).all()  # type: ignore[union-attr]
    return [_collection_entry(db, item) for item in collections]


def save_collection(db: Session, current_user: PublicUser, org_id: int, args: dict) -> dict:
    require_org_admin(current_user.id, org_id, db)
    now = access_rules._now()
    if args.get("collection_uuid"):
        collection = _collection(db, org_id, str(args["collection_uuid"]))
        if collection is None:
            raise HTTPException(status_code=404, detail="Badge collection not found in the connected organization")
    else:
        name = str(args.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="A new collection needs a name")
        collection = BadgeCollection(org_id=org_id, name=name, collection_uuid=f"badge_collection_{uuid4()}", creation_date=now)
    for key in ("name", "description", "thumbnail_image"):
        if key in args and args[key] is not None:
            value = str(args[key]).strip()
            if key == "name" and not value:
                raise HTTPException(status_code=422, detail="Collection name cannot be empty")
            if key == "thumbnail_image" and value and not _URL.match(value):
                raise HTTPException(status_code=422, detail="thumbnail_image must be an https:// URL or a /content/... path")
            setattr(collection, key, value)
    for key in ("public", "hidden"):
        if key in args and args[key] is not None:
            setattr(collection, key, bool(args[key]))
    metadata = dict(collection.collection_metadata or {})
    if args.get("credibility") is not None:
        metadata["credibility"] = str(args["credibility"]).strip()
    if args.get("endorsers") is not None:
        endorsers = []
        for item in args["endorsers"]:
            if not isinstance(item, dict) or not str(item.get("name") or "").strip():
                raise HTTPException(status_code=422, detail="Each endorser needs a name")
            entry = {"name": str(item["name"]).strip()}
            for key in ("logo_url", "url"):
                if str(item.get(key) or "").strip():
                    entry[key] = str(item[key]).strip()
            endorsers.append(entry)
        metadata["endorsers"] = endorsers
    collection.collection_metadata = metadata
    collection.update_date = now
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _collection_entry(db, collection)
