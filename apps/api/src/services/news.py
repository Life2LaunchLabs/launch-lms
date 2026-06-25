import re
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlmodel import Session, select

from src.db.news import (
    NewsArticle,
    NewsArticleCreate,
    NewsArticleRead,
    NewsArticleStatus,
    NewsArticleUpdate,
)
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.superadmin import is_user_owner_org_admin, is_user_superadmin


def _now() -> str:
    return str(datetime.now())


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"article-{uuid4().hex[:8]}"


def _get_org(org_id: int, db_session: Session) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_default_org(db_session: Session) -> Organization | None:
    return db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()


def _ensure_default_org_admin(current_user: PublicUser, db_session: Session) -> None:
    if is_user_superadmin(current_user.id, db_session):
        return
    if is_user_owner_org_admin(current_user.id, db_session):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Default organization admin access required",
    )


def _ensure_default_org_target(org_id: int, db_session: Session) -> None:
    default_org = _get_default_org(db_session)
    if not default_org or default_org.id != org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="News editing is limited to the default organization",
        )


def _ensure_article_in_org(article_uuid: str, org_id: int, db_session: Session) -> NewsArticle:
    article = db_session.exec(
        select(NewsArticle).where(
            NewsArticle.article_uuid == article_uuid,
            NewsArticle.org_id == org_id,
        )
    ).first()
    if not article:
        raise HTTPException(status_code=404, detail="News article not found")
    return article


def _read(article: NewsArticle) -> NewsArticleRead:
    return NewsArticleRead.model_validate(article)


async def list_public_articles(org_id: int, db_session: Session) -> list[NewsArticleRead]:
    _get_org(org_id, db_session)
    articles = db_session.exec(
        select(NewsArticle)
        .where(NewsArticle.org_id == org_id)
        .where(NewsArticle.status == NewsArticleStatus.published)
        .order_by(NewsArticle.published_at.desc(), NewsArticle.creation_date.desc())
    ).all()
    return [_read(article) for article in articles]


async def get_public_article(org_id: int, slug: str, db_session: Session) -> NewsArticleRead:
    _get_org(org_id, db_session)
    article = db_session.exec(
        select(NewsArticle).where(
            NewsArticle.org_id == org_id,
            NewsArticle.slug == slug,
            NewsArticle.status == NewsArticleStatus.published,
        )
    ).first()
    if not article:
        raise HTTPException(status_code=404, detail="News article not found")
    return _read(article)


async def list_admin_articles(
    org_id: int,
    current_user: PublicUser,
    db_session: Session,
    query: str | None = None,
) -> list[NewsArticleRead]:
    _get_org(org_id, db_session)
    _ensure_default_org_target(org_id, db_session)
    _ensure_default_org_admin(current_user, db_session)

    statement = select(NewsArticle).where(NewsArticle.org_id == org_id)
    if query:
        like_query = f"%{query}%"
        statement = statement.where(
            or_(NewsArticle.title.ilike(like_query), NewsArticle.slug.ilike(like_query))
        )
    articles = db_session.exec(
        statement.order_by(NewsArticle.update_date.desc(), NewsArticle.creation_date.desc())
    ).all()
    return [_read(article) for article in articles]


async def create_article(
    org_id: int,
    article_data: NewsArticleCreate,
    current_user: PublicUser,
    db_session: Session,
) -> NewsArticleRead:
    _get_org(org_id, db_session)
    _ensure_default_org_target(org_id, db_session)
    _ensure_default_org_admin(current_user, db_session)
    now = _now()
    slug = _slugify(article_data.slug or article_data.title)
    published_at = article_data.published_at
    if article_data.status == NewsArticleStatus.published and not published_at:
        published_at = now

    article = NewsArticle(
        article_uuid=f"news_{uuid4()}",
        org_id=org_id,
        author_user_id=current_user.id,
        title=article_data.title,
        slug=slug,
        summary=article_data.summary,
        body=article_data.body,
        external_url=article_data.external_url,
        status=article_data.status,
        published_at=published_at,
        creation_date=now,
        update_date=now,
    )
    db_session.add(article)
    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise HTTPException(status_code=409, detail="News article slug already exists")
    db_session.refresh(article)
    return _read(article)


async def update_article(
    org_id: int,
    article_uuid: str,
    article_data: NewsArticleUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> NewsArticleRead:
    _get_org(org_id, db_session)
    _ensure_default_org_target(org_id, db_session)
    _ensure_default_org_admin(current_user, db_session)
    article = _ensure_article_in_org(article_uuid, org_id, db_session)
    updates = article_data.model_dump(exclude_unset=True)

    if "slug" in updates and updates["slug"]:
        updates["slug"] = _slugify(updates["slug"])
    if updates.get("status") == NewsArticleStatus.published and not (
        updates.get("published_at") or article.published_at
    ):
        updates["published_at"] = _now()
    if updates.get("status") == NewsArticleStatus.draft:
        updates.setdefault("published_at", None)

    for key, value in updates.items():
        setattr(article, key, value)
    article.update_date = _now()

    db_session.add(article)
    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise HTTPException(status_code=409, detail="News article slug already exists")
    db_session.refresh(article)
    return _read(article)


async def publish_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> NewsArticleRead:
    return await update_article(
        org_id,
        article_uuid,
        NewsArticleUpdate(status=NewsArticleStatus.published, published_at=_now()),
        current_user,
        db_session,
    )


async def unpublish_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> NewsArticleRead:
    return await update_article(
        org_id,
        article_uuid,
        NewsArticleUpdate(status=NewsArticleStatus.draft, published_at=None),
        current_user,
        db_session,
    )


async def delete_article(
    org_id: int,
    article_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, bool]:
    _get_org(org_id, db_session)
    _ensure_default_org_target(org_id, db_session)
    _ensure_default_org_admin(current_user, db_session)
    article = _ensure_article_in_org(article_uuid, org_id, db_session)
    db_session.delete(article)
    db_session.commit()
    return {"deleted": True}
