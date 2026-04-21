from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.resources import (
    ResourceChannelCreate,
    ResourceChannelUpdate,
    ResourceCommentCreate,
    ResourceCommentUpdate,
    ResourceCreate,
    ResourceTagCreate,
    ResourceTagUpdate,
    ResourceUpdate,
    UserResourceChannelCreate,
    UserSavedResourceUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.resources import (
    add_resource_to_channel,
    create_channel,
    create_comment,
    create_resource,
    create_tag,
    create_user_channel,
    delete_tag,
    delete_channel,
    delete_comment,
    delete_resource,
    get_resource,
    import_resources_csv,
    list_channel_resources,
    list_channels,
    list_comments,
    list_resources,
    list_tags,
    remove_resource_from_channel,
    save_resource_for_user,
    unsave_resource_for_user,
    update_tag,
    update_channel,
    update_comment,
    update_resource,
    upload_channel_thumbnail,
    upload_resource_thumbnail,
    upload_saved_resource_outcome_file,
)


router = APIRouter()


class LinkResourceRequest(BaseModel):
    resource_uuid: str
    sort_order: int = 0


@router.get("/org/{org_id}/channels")
async def api_list_channels(
    request: Request,
    org_id: int,
    include_private: bool = False,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_channels(request, org_id, current_user, db_session, include_private=include_private)


@router.get("/org/{org_id}/tags")
async def api_list_tags(
    request: Request,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_tags(request, org_id, current_user, db_session)


@router.post("/org/{org_id}/tags")
async def api_create_tag(
    request: Request,
    org_id: int,
    tag_data: ResourceTagCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_tag(request, org_id, tag_data, current_user, db_session)


@router.put("/tags/{tag_uuid}")
async def api_update_tag(
    request: Request,
    tag_uuid: str,
    tag_data: ResourceTagUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_tag(request, tag_uuid, tag_data, current_user, db_session)


@router.delete("/tags/{tag_uuid}")
async def api_delete_tag(
    request: Request,
    tag_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_tag(request, tag_uuid, current_user, db_session)


@router.post("/channels")
async def api_create_channel(
    request: Request,
    org_id: int,
    channel_data: ResourceChannelCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_channel(request, org_id, channel_data, current_user, db_session)


@router.put("/channels/{channel_uuid}")
async def api_update_channel(
    request: Request,
    channel_uuid: str,
    channel_data: ResourceChannelUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_channel(request, channel_uuid, channel_data, current_user, db_session)


@router.delete("/channels/{channel_uuid}")
async def api_delete_channel(
    request: Request,
    channel_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_channel(request, channel_uuid, current_user, db_session)


@router.put("/channels/{channel_uuid}/thumbnail")
async def api_upload_channel_thumbnail(
    request: Request,
    channel_uuid: str,
    thumbnail: UploadFile | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not thumbnail:
        raise HTTPException(status_code=400, detail="thumbnail is required")
    return await upload_channel_thumbnail(request, channel_uuid, thumbnail, current_user, db_session)


@router.get("/org/{org_id}")
async def api_list_resources(
    request: Request,
    org_id: int,
    channel_uuid: Optional[str] = None,
    user_channel_uuid: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_types: Optional[str] = None,
    tags: Optional[str] = None,
    provider: Optional[str] = None,
    query: Optional[str] = None,
    access: Optional[str] = None,
    saved_only: bool = False,
    completed_only: bool = False,
    include_private: bool = False,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_resources(
        request,
        org_id,
        current_user,
        db_session,
        channel_uuid=channel_uuid,
        user_channel_uuid=user_channel_uuid,
        resource_type=resource_type,
        resource_types=resource_types,
        tags=tags,
        provider=provider,
        query=query,
        access=access,
        saved_only=saved_only,
        completed_only=completed_only,
        include_private=include_private,
    )


@router.post("/")
async def api_create_resource(
    request: Request,
    org_id: int,
    resource_data: ResourceCreate,
    enrich_metadata: bool = True,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_resource(request, org_id, resource_data, current_user, db_session, enrich_metadata=enrich_metadata)


@router.get("/{resource_uuid}")
async def api_get_resource(
    request: Request,
    resource_uuid: str,
    include_private: bool = False,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_resource(request, resource_uuid, current_user, db_session, include_private=include_private)


@router.put("/{resource_uuid}")
async def api_update_resource(
    request: Request,
    resource_uuid: str,
    resource_data: ResourceUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_resource(request, resource_uuid, resource_data, current_user, db_session)


@router.delete("/{resource_uuid}")
async def api_delete_resource(
    request: Request,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_resource(request, resource_uuid, current_user, db_session)


@router.put("/{resource_uuid}/thumbnail")
async def api_upload_resource_thumbnail(
    request: Request,
    resource_uuid: str,
    thumbnail: UploadFile | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not thumbnail:
        raise HTTPException(status_code=400, detail="thumbnail is required")
    return await upload_resource_thumbnail(request, resource_uuid, thumbnail, current_user, db_session)


@router.get("/channels/{channel_uuid}/resources")
async def api_list_channel_resources(
    request: Request,
    channel_uuid: str,
    include_private: bool = False,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_channel_resources(request, channel_uuid, current_user, db_session, include_private=include_private)


@router.post("/channels/{channel_uuid}/resources")
async def api_add_resource_to_channel(
    request: Request,
    channel_uuid: str,
    link_data: LinkResourceRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await add_resource_to_channel(
        request,
        channel_uuid,
        link_data.resource_uuid,
        current_user,
        db_session,
        sort_order=link_data.sort_order,
    )


@router.delete("/channels/{channel_uuid}/resources/{resource_uuid}")
async def api_remove_resource_from_channel(
    request: Request,
    channel_uuid: str,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await remove_resource_from_channel(request, channel_uuid, resource_uuid, current_user, db_session)


@router.post("/org/{org_id}/me/channels")
async def api_create_user_channel(
    request: Request,
    org_id: int,
    channel_data: UserResourceChannelCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_user_channel(request, org_id, current_user, db_session, channel_data)


@router.post("/{resource_uuid}/save")
async def api_save_resource(
    request: Request,
    resource_uuid: str,
    save_data: UserSavedResourceUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await save_resource_for_user(request, resource_uuid, save_data, current_user, db_session)


@router.delete("/{resource_uuid}/save")
async def api_unsave_resource(
    request: Request,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await unsave_resource_for_user(request, resource_uuid, current_user, db_session)


@router.put("/{resource_uuid}/save/outcome-file")
async def api_upload_outcome_file(
    request: Request,
    resource_uuid: str,
    outcome_file: UploadFile | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not outcome_file:
        raise HTTPException(status_code=400, detail="outcome_file is required")
    return await upload_saved_resource_outcome_file(request, resource_uuid, outcome_file, current_user, db_session)


@router.get("/{resource_uuid}/comments")
async def api_list_comments(
    request: Request,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_comments(request, resource_uuid, current_user, db_session)


@router.post("/{resource_uuid}/comments")
async def api_create_comment(
    request: Request,
    resource_uuid: str,
    comment_data: ResourceCommentCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_comment(request, resource_uuid, comment_data, current_user, db_session)


@router.put("/comments/{comment_uuid}")
async def api_update_comment(
    request: Request,
    comment_uuid: str,
    comment_data: ResourceCommentUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_comment(request, comment_uuid, comment_data, current_user, db_session)


@router.delete("/comments/{comment_uuid}")
async def api_delete_comment(
    request: Request,
    comment_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_comment(request, comment_uuid, current_user, db_session)


@router.post("/org/{org_id}/import")
async def api_import_resources_csv(
    request: Request,
    org_id: int,
    channel_uuid: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await import_resources_csv(request, org_id, file, current_user, db_session, channel_uuid=channel_uuid)
