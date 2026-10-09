"""Badge collections."""

from datetime import datetime, timedelta
from uuid import uuid4
from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import or_
from sqlmodel import Session, select
from src.db.learning import (
    BadgeCollection,
    BadgeCollectionCreate,
    BadgeCollectionRead,
    BadgeCollectionUpdate,
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    LearningBadge,
    LearningBadgeRead,
)
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services.utils.upload_content import upload_file
from src.services.learning import access_rules, lookups


async def create_collection(
    request: Request,
    data: BadgeCollectionCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeCollectionRead:
    access_rules._require_org_admin(db_session, current_user, data.org_id)
    now = access_rules._now()
    collection = BadgeCollection(
        **access_rules._strip_system_fields(data.model_dump()),
        collection_uuid=f"badge_collection_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    return BadgeCollectionRead(**collection.model_dump(), badges=[])


async def update_collection(
    request: Request,
    collection_uuid: str,
    data: BadgeCollectionUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeCollectionRead:
    collection = db_session.exec(
        select(BadgeCollection).where(
            BadgeCollection.collection_uuid == access_rules._clean_uuid(collection_uuid, "badge_collection_"),
            BadgeCollection.deleted_at.is_(None),
        )
    ).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    access_rules._require_org_admin(db_session, current_user, collection.org_id)
    for key, value in access_rules._strip_system_fields(data.model_dump(exclude_unset=True)).items():
        setattr(collection, key, value)
    collection.update_date = access_rules._now()
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    badges = db_session.exec(
        select(LearningBadge).where(LearningBadge.collection_id == collection.id)
    ).all()
    return BadgeCollectionRead(
        **collection.model_dump(),
        badges=[LearningBadgeRead(**badge.model_dump()) for badge in badges],
    )


async def update_collection_thumbnail(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
) -> BadgeCollectionRead:
    collection = db_session.exec(
        select(BadgeCollection).where(
            BadgeCollection.collection_uuid == access_rules._clean_uuid(collection_uuid, "badge_collection_"),
            BadgeCollection.deleted_at.is_(None),
        )
    ).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    access_rules._require_org_admin(db_session, current_user, collection.org_id)
    org = access_rules._get_org(db_session, collection.org_id)

    if not thumbnail_file or not thumbnail_file.filename:
        raise HTTPException(status_code=400, detail="Thumbnail file is required")

    filename = await upload_file(
        file=thumbnail_file,
        directory=f"badge_collections/{collection.collection_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
    )
    collection.thumbnail_image = f"/content/orgs/{org.org_uuid}/badge_collections/{collection.collection_uuid}/thumbnails/{filename}"
    collection.update_date = access_rules._now()

    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    badges = db_session.exec(
        select(LearningBadge).where(LearningBadge.collection_id == collection.id)
    ).all()
    return BadgeCollectionRead(
        **collection.model_dump(),
        badges=[LearningBadgeRead(**badge.model_dump()) for badge in badges],
    )


async def delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    collection = db_session.exec(
        select(BadgeCollection).where(
            BadgeCollection.collection_uuid == access_rules._clean_uuid(collection_uuid, "badge_collection_"),
            BadgeCollection.deleted_at.is_(None),
        )
    ).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    access_rules._require_org_admin(db_session, current_user, collection.org_id)
    if access_rules._is_system_object(collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System badge collections cannot be deleted",
        )
    badges = db_session.exec(
        select(LearningBadge).where(LearningBadge.collection_id == collection.id)
    ).all()
    deleted_at = datetime.utcnow()
    for badge in badges:
        if badge.deleted_at is None:
            badge.deleted_at = deleted_at
            badge.update_date = access_rules._now()
            db_session.add(badge)
    collection.deleted_at = deleted_at
    collection.update_date = access_rules._now()
    db_session.add(collection)
    db_session.commit()
    return {"detail": "Badge collection moved to trash"}


async def list_deleted_collections(request: Request, org_id: int, current_user, db_session: Session) -> list[BadgeCollectionRead]:
    access_rules._require_org_admin(db_session, current_user, org_id)
    cutoff = datetime.utcnow() - timedelta(days=14)
    collections = db_session.exec(select(BadgeCollection).where(
        BadgeCollection.org_id == org_id,
        BadgeCollection.deleted_at.is_not(None),
        BadgeCollection.deleted_at >= cutoff,
    ).order_by(BadgeCollection.deleted_at.desc())).all()
    return [BadgeCollectionRead(**collection.model_dump(), badges=[]) for collection in collections]


async def restore_collection(request: Request, collection_uuid: str, current_user, db_session: Session) -> BadgeCollectionRead:
    collection = db_session.exec(select(BadgeCollection).where(
        BadgeCollection.collection_uuid == access_rules._clean_uuid(collection_uuid, "badge_collection_"),
        BadgeCollection.deleted_at.is_not(None),
    )).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found in trash")
    access_rules._require_org_admin(db_session, current_user, collection.org_id)
    if collection.deleted_at < datetime.utcnow() - timedelta(days=14):
        raise HTTPException(status_code=410, detail="The 14-day restore period has expired")
    deleted_at = collection.deleted_at
    badges = db_session.exec(select(LearningBadge).where(
        LearningBadge.collection_id == collection.id,
        LearningBadge.deleted_at == deleted_at,
    )).all()
    for badge in badges:
        badge.deleted_at = None
        badge.update_date = access_rules._now()
        db_session.add(badge)
    collection.deleted_at = None
    collection.update_date = access_rules._now()
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    return BadgeCollectionRead(**collection.model_dump(), badges=[LearningBadgeRead(**b.model_dump()) for b in badges])


async def list_collections(
    request: Request,
    org_id: int | None,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    admin: bool = False,
) -> list[BadgeCollectionRead]:
    if org_id is not None:
        access_rules._ensure_onboarding_for_owner_org(db_session, org_id)
    if admin:
        if org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id is required for admin badge collection listing",
            )
        access_rules._require_org_admin(db_session, current_user, org_id)
        owned_badges = db_session.exec(
            select(LearningBadge).where(
                LearningBadge.org_id == org_id, LearningBadge.deleted_at.is_(None)
            )
        ).all()
        authorized_badge_ids = {
            authorization.badge_id
            for authorization in db_session.exec(
                select(BadgeIssuerAuthorization).where(
                    BadgeIssuerAuthorization.issuer_org_id == org_id,
                    BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
                )
            ).all()
        }
        authorized_badges = (
            db_session.exec(
                select(LearningBadge).where(
                    LearningBadge.id.in_(authorized_badge_ids),  # type: ignore
                    LearningBadge.deleted_at.is_(None),
                )
            ).all()
            if authorized_badge_ids
            else []
        )
        badges_by_id = {badge.id: badge for badge in [*owned_badges, *authorized_badges]}
        badges = list(badges_by_id.values())
        collection_ids = {badge.collection_id for badge in authorized_badges if badge.collection_id is not None}
        collection_access = BadgeCollection.org_id == org_id
        if collection_ids:
            collection_access = or_(collection_access, BadgeCollection.id.in_(collection_ids))  # type: ignore
        collections = db_session.exec(
            select(BadgeCollection).where(
                collection_access,
                BadgeCollection.deleted_at.is_(None),
            )
        ).all()
    else:
        collection_statement = select(BadgeCollection).where(
            BadgeCollection.public == True, BadgeCollection.hidden == False,
            BadgeCollection.deleted_at.is_(None),
        )
        if org_id is not None:
            collection_statement = collection_statement.where(
                BadgeCollection.org_id == org_id
            )
        collections = db_session.exec(collection_statement).all()
        badges = db_session.exec(lookups._public_badge_query(org_id)).all()
    badges_by_collection: dict[int, list[LearningBadge]] = {}
    for badge in badges:
        if badge.collection_id is not None:
            badges_by_collection.setdefault(badge.collection_id, []).append(badge)
    creator_org_ids = {collection.org_id for collection in collections}
    creator_orgs = {
        creator.id or 0: creator
        for creator in db_session.exec(
            select(Organization).where(Organization.id.in_(creator_org_ids))  # type: ignore
        ).all()
    } if creator_org_ids else {}
    return [
        BadgeCollectionRead(
            **collection.model_dump(),
            badges=[
                LearningBadgeRead(
                    **badge.model_dump(),
                    can_edit=(badge.org_id == org_id) if admin else None,
                    access_type=("owned" if badge.org_id == org_id else "authorized") if admin else None,
                )
                for badge in badges_by_collection.get(collection.id or 0, [])
            ],
            can_edit=(collection.org_id == org_id) if admin else None,
            access_type=("owned" if collection.org_id == org_id else "authorized") if admin else None,
            creator_org=(
                {
                    "id": creator_orgs[collection.org_id].id,
                    "org_uuid": creator_orgs[collection.org_id].org_uuid,
                    "name": creator_orgs[collection.org_id].name,
                    "slug": creator_orgs[collection.org_id].slug,
                }
                if admin and collection.org_id in creator_orgs
                else None
            ),
        )
        for collection in collections
    ]
