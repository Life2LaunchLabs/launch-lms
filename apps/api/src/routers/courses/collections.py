from typing import List
from fastapi import APIRouter, Depends, Request, UploadFile, HTTPException
from sqlmodel import select
from src.core.events.database import get_db_session
from src.db.collections import Collection, CollectionCreate, CollectionRead, CollectionUpdate
from src.db.organizations import Organization
from src.security.auth import get_current_user
from src.services.users.users import PublicUser
from src.services.courses.collections import (
    create_collection,
    get_collection,
    get_collections,
    update_collection,
    delete_collection,
)
from src.services.courses.collection_thumbnails import upload_collection_thumbnail


router = APIRouter()


@router.post("/")
async def api_create_collection(
    request: Request,
    collection_object: CollectionCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> CollectionRead:
    """
    Create new Collection
    """
    return await create_collection(request, collection_object, current_user, db_session)


@router.get("/{collection_uuid}")
async def api_get_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> CollectionRead:
    """
    Get single collection by ID
    """
    return await get_collection(request, collection_uuid, current_user, db_session)


@router.get("/org/{org_id}/page/{page}/limit/{limit}")
async def api_get_collections_by(
    request: Request,
    page: int,
    limit: int,
    org_id: str,
    include_shared: bool = True,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> List[CollectionRead]:
    """
    Get collections by page and limit
    """
    return await get_collections(
        request,
        org_id,
        current_user,
        db_session,
        page,
        limit,
        include_shared,
    )


@router.put("/{collection_uuid}")
async def api_update_collection(
    request: Request,
    collection_object: CollectionUpdate,
    collection_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> CollectionRead:
    """
    Update collection by ID
    """
    return await update_collection(
        request, collection_object, collection_uuid, current_user, db_session
    )


@router.delete("/{collection_uuid}")
async def api_delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """
    Delete collection by ID
    """

    return await delete_collection(request, collection_uuid, current_user, db_session)


@router.put("/{collection_uuid}/thumbnail")
async def api_update_collection_thumbnail(
    request: Request,
    collection_uuid: str,
    thumbnail: UploadFile | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """
    Upload or update a collection thumbnail.
    """
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    org_statement = select(Organization).where(Organization.id == collection.org_id)
    org = db_session.exec(org_statement).first()

    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if thumbnail:
        filename = await upload_collection_thumbnail(
            thumbnail,
            org.org_uuid,
            collection.collection_uuid,
        )
        collection.thumbnail_image = filename
        db_session.add(collection)
        db_session.commit()
        db_session.refresh(collection)

    return {"detail": "Thumbnail updated", "thumbnail_image": collection.thumbnail_image}
