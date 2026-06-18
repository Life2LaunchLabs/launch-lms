from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.news import NewsArticleCreate, NewsArticleUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.news import (
    create_article,
    delete_article,
    get_public_article,
    list_admin_articles,
    list_public_articles,
    publish_article,
    unpublish_article,
    update_article,
)


router = APIRouter()


@router.get("/org/{org_id}")
async def api_list_public_articles(
    org_id: int,
    db_session: Session = Depends(get_db_session),
):
    return await list_public_articles(org_id, db_session)


@router.get("/org/{org_id}/{slug}")
async def api_get_public_article(
    org_id: int,
    slug: str,
    db_session: Session = Depends(get_db_session),
):
    return await get_public_article(org_id, slug, db_session)


@router.get("/admin/org/{org_id}")
async def api_list_admin_articles(
    org_id: int,
    query: str | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await list_admin_articles(org_id, current_user, db_session, query=query)


@router.post("/admin/org/{org_id}")
async def api_create_article(
    org_id: int,
    article_data: NewsArticleCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await create_article(org_id, article_data, current_user, db_session)


@router.put("/admin/org/{org_id}/{article_uuid}")
async def api_update_article(
    org_id: int,
    article_uuid: str,
    article_data: NewsArticleUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await update_article(org_id, article_uuid, article_data, current_user, db_session)


@router.post("/admin/org/{org_id}/{article_uuid}/publish")
async def api_publish_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await publish_article(org_id, article_uuid, current_user, db_session)


@router.post("/admin/org/{org_id}/{article_uuid}/unpublish")
async def api_unpublish_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await unpublish_article(org_id, article_uuid, current_user, db_session)


@router.delete("/admin/org/{org_id}/{article_uuid}")
async def api_delete_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await delete_article(org_id, article_uuid, current_user, db_session)
