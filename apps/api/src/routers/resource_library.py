"""Resource routes for staff's view of their resources and the Library, org saves, and comments with moderation."""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.resources import ResourceCommentCreate, ResourceCommentUpdate, ResourceReviewCreate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.resource_comments import (
    create_comment,
    create_review,
    delete_comment,
    list_channel_comments,
    list_comments,
    moderate_comment,
    report_comment,
    update_comment,
)
from src.services.resource_library import (
    get_channel,
    library,
    org_workspace,
    reorder_channel,
    resource_detail,
    save_channel_for_org,
    save_resource_for_org,
    unsave_channel_for_org,
    unsave_resource_for_org,
)

router = APIRouter()


class ReorderRequest(BaseModel):
    resource_uuids: list[str]


class ModerateRequest(BaseModel):
    action: str


@router.get("/org/{org_id}/workspace")
async def api_org_workspace(
    request: Request,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """Your resources: the org's channels, the Library channels it saved, and every resource in them."""
    return await org_workspace(request, org_id, current_user, db_session)


@router.get("/org/{org_id}/library")
async def api_library(
    request: Request,
    org_id: int,
    query: str | None = Query(default=None, max_length=200),
    resource_type: str | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await library(request, org_id, current_user, db_session, query=query, resource_type=resource_type)


@router.get("/org/{org_id}/channels/{channel_uuid}")
async def api_get_channel(
    request: Request,
    org_id: int,
    channel_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_channel(request, org_id, channel_uuid, current_user, db_session)


@router.get("/org/{org_id}/resources/{resource_uuid}")
async def api_resource_detail(
    request: Request,
    org_id: int,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """A resource as staff see it, with the org's plans that use it."""
    return await resource_detail(request, org_id, resource_uuid, current_user, db_session)


@router.post("/org/{org_id}/saved/channels/{channel_uuid}")
async def api_save_channel_for_org(
    request: Request,
    org_id: int,
    channel_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await save_channel_for_org(request, org_id, channel_uuid, current_user, db_session)


@router.delete("/org/{org_id}/saved/channels/{channel_uuid}")
async def api_unsave_channel_for_org(
    request: Request,
    org_id: int,
    channel_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await unsave_channel_for_org(request, org_id, channel_uuid, current_user, db_session)


@router.post("/org/{org_id}/saved/resources/{resource_uuid}")
async def api_save_resource_for_org(
    request: Request,
    org_id: int,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await save_resource_for_org(request, org_id, resource_uuid, current_user, db_session)


@router.delete("/org/{org_id}/saved/resources/{resource_uuid}")
async def api_unsave_resource_for_org(
    request: Request,
    org_id: int,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await unsave_resource_for_org(request, org_id, resource_uuid, current_user, db_session)


@router.put("/channels/{channel_uuid}/order")
async def api_reorder_channel(
    request: Request,
    channel_uuid: str,
    order: ReorderRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await reorder_channel(request, channel_uuid, order.resource_uuids, current_user, db_session)


@router.get("/channels/{channel_uuid}/comments")
async def api_list_channel_comments(
    request: Request,
    channel_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_channel_comments(request, channel_uuid, current_user, db_session)


@router.post("/comments/{comment_uuid}/moderate")
async def api_moderate_comment(
    request: Request,
    comment_uuid: str,
    moderation: ModerateRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await moderate_comment(request, comment_uuid, moderation.action, current_user, db_session)


@router.post("/comments/{comment_uuid}/report")
async def api_report_comment(
    request: Request,
    comment_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await report_comment(request, comment_uuid, current_user, db_session)


@router.get("/{resource_uuid}/reviews")
async def api_list_reviews(
    request: Request,
    resource_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_comments(request, resource_uuid, current_user, db_session)


@router.post("/{resource_uuid}/reviews")
async def api_create_review(
    request: Request,
    resource_uuid: str,
    review_data: ResourceReviewCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_review(request, resource_uuid, review_data, current_user, db_session)


@router.put("/reviews/{comment_uuid}")
async def api_update_review(
    request: Request,
    comment_uuid: str,
    review_data: ResourceCommentUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_comment(request, comment_uuid, review_data, current_user, db_session)


@router.delete("/reviews/{comment_uuid}")
async def api_delete_review(
    request: Request,
    comment_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_comment(request, comment_uuid, current_user, db_session)


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
