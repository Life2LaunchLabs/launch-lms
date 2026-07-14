from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.media import (
    MediaAssetRead,
    MediaAssetFolderUpdate,
    MediaFolderCreate,
    MediaFolderRead,
    MediaFolderUpdate,
    MediaLinkCreate,
    MediaOwnerType,
    MediaType,
)
from src.db.users import PublicUser, UserRead
from src.routers.users import _invalidate_session_cache
from src.security.auth import get_current_user
from src.services.media import (
    apply_media_asset_to_user_avatar,
    create_media_folder,
    create_link_media_asset,
    delete_media_folder,
    list_media_folders,
    list_media_assets,
    update_media_folder,
    update_media_asset_folder,
    upload_media_asset,
)


router = APIRouter()


@router.get("", response_model=list[MediaAssetRead])
async def api_list_media_assets(
    owner_type: MediaOwnerType,
    owner_id: int,
    media_type: MediaType | None = None,
    folder: str | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return list_media_assets(owner_type, owner_id, current_user, db_session, media_type=media_type, folder=folder)


@router.post("/upload", response_model=MediaAssetRead)
async def api_upload_media_asset(
    owner_type: MediaOwnerType = Form(...),
    owner_id: int = Form(...),
    media_type: MediaType = Form(...),
    title: str | None = Form(None),
    folder: str | None = Form(None),
    media_file: UploadFile = File(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await upload_media_asset(
        owner_type,
        owner_id,
        media_type,
        media_file,
        current_user,
        db_session,
        title=title,
        folder=folder,
    )


@router.get("/folders", response_model=list[MediaFolderRead])
async def api_list_media_folders(
    owner_type: MediaOwnerType,
    owner_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return list_media_folders(owner_type, owner_id, current_user, db_session)


@router.post("/folders", response_model=MediaFolderRead)
async def api_create_media_folder(
    payload: MediaFolderCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return create_media_folder(payload, current_user, db_session)


@router.patch("/folders/{folder_uuid}", response_model=MediaFolderRead)
async def api_update_media_folder(
    folder_uuid: str,
    payload: MediaFolderUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return update_media_folder(folder_uuid, payload, current_user, db_session)


@router.delete("/folders/{folder_uuid}")
async def api_delete_media_folder(
    folder_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return delete_media_folder(folder_uuid, current_user, db_session)


@router.post("/link", response_model=MediaAssetRead)
async def api_create_link_media_asset(
    payload: MediaLinkCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_link_media_asset(payload, current_user, db_session)


@router.patch("/{asset_uuid}/folder", response_model=MediaAssetRead)
async def api_update_media_asset_folder(
    asset_uuid: str,
    payload: MediaAssetFolderUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return update_media_asset_folder(asset_uuid, payload, current_user, db_session)


@router.post("/{asset_uuid}/apply/user-avatar", response_model=UserRead)
async def api_apply_media_asset_to_user_avatar(
    asset_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    user = apply_media_asset_to_user_avatar(asset_uuid, current_user, db_session)
    _invalidate_session_cache(user.id or current_user.id)
    return UserRead.model_validate(user)
