import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine

from src.db.news import NewsArticle, NewsArticleCreate
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.news import (
    create_article,
    get_public_article,
    list_public_articles,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Organization.__table__.create(engine)
    User.__table__.create(engine)
    Role.__table__.create(engine)
    UserOrganization.__table__.create(engine)
    NewsArticle.__table__.create(engine)
    with Session(engine) as session:
        yield session


def _create_org(session: Session, org_id: int, slug: str) -> Organization:
    org = Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name=slug.title(),
        slug=slug,
        email=f"{slug}@example.com",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )
    session.add(org)
    session.commit()
    return org


def _create_user(session: Session, user_id: int = 1, *, superadmin: bool = False) -> PublicUser:
    user = User(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=f"user{user_id}",
        first_name="News",
        last_name="Admin",
        email=f"user{user_id}@example.com",
        is_superadmin=superadmin,
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )
    session.add(user)
    session.commit()
    return PublicUser(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=f"user{user_id}",
        first_name="News",
        last_name="Admin",
        email=f"user{user_id}@example.com",
        email_verified=False,
        is_superadmin=superadmin,
    )


def _make_default_org_admin(session: Session, org_id: int, user_id: int) -> None:
    session.add(
        Role(
            id=ADMIN_ROLE_ID,
            name="Admin",
            rights={},
            creation_date="2026-01-01T00:00:00",
            update_date="2026-01-01T00:00:00",
        )
    )
    session.add(
        UserOrganization(
            user_id=user_id,
            org_id=org_id,
            role_id=ADMIN_ROLE_ID,
            creation_date="2026-01-01T00:00:00",
            update_date="2026-01-01T00:00:00",
        )
    )
    session.commit()


@pytest.mark.asyncio
async def test_public_reads_include_published_and_hide_drafts(db_session: Session):
    org = _create_org(db_session, 1, "default")
    admin = _create_user(db_session)
    _make_default_org_admin(db_session, org.id, admin.id)

    published = await create_article(
        org.id,
        NewsArticleCreate(title="Published", slug="published", status="published"),
        admin,
        db_session,
    )
    await create_article(
        org.id,
        NewsArticleCreate(title="Draft", slug="draft", status="draft"),
        admin,
        db_session,
    )

    articles = await list_public_articles(org.id, db_session)
    assert [article.slug for article in articles] == ["published"]

    article = await get_public_article(org.id, published.slug, db_session)
    assert article.title == "Published"

    with pytest.raises(HTTPException) as exc_info:
        await get_public_article(org.id, "draft", db_session)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_default_org_admin_can_create_news_article(db_session: Session):
    org = _create_org(db_session, 1, "default")
    admin = _create_user(db_session)
    _make_default_org_admin(db_session, org.id, admin.id)

    article = await create_article(
        org.id,
        NewsArticleCreate(title="State of the app", slug="state-of-the-app"),
        admin,
        db_session,
    )

    assert article.article_uuid.startswith("news_")
    assert article.author_user_id == admin.id
    assert article.status == "draft"


@pytest.mark.asyncio
async def test_non_default_org_news_writes_are_denied(db_session: Session):
    default_org = _create_org(db_session, 1, "default")
    other_org = _create_org(db_session, 2, "other")
    admin = _create_user(db_session)
    _make_default_org_admin(db_session, default_org.id, admin.id)

    with pytest.raises(HTTPException) as exc_info:
        await create_article(
            other_org.id,
            NewsArticleCreate(title="Nope", slug="nope"),
            admin,
            db_session,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_news_slug_unique_per_org(db_session: Session):
    org = _create_org(db_session, 1, "default")
    admin = _create_user(db_session)
    _make_default_org_admin(db_session, org.id, admin.id)

    await create_article(
        org.id,
        NewsArticleCreate(title="Duplicate", slug="duplicate"),
        admin,
        db_session,
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_article(
            org.id,
            NewsArticleCreate(title="Duplicate again", slug="duplicate"),
            admin,
            db_session,
        )

    assert exc_info.value.status_code == 409
