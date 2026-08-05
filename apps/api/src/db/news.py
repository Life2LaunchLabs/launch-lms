from enum import Enum

from sqlalchemy import Boolean, Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class NewsArticleStatus(str, Enum):
    draft = "draft"
    published = "published"


class NewsArticleBase(SQLModel):
    title: str
    slug: str
    summary: str | None = Field(default=None, sa_column=Column(Text))
    body: str | None = Field(default=None, sa_column=Column(Text))
    external_url: str | None = None
    featured: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    status: NewsArticleStatus = NewsArticleStatus.draft
    published_at: str | None = None


class NewsArticle(NewsArticleBase, table=True):
    __tablename__ = "newsarticle"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_newsarticle_org_slug"),
    )

    id: int | None = Field(default=None, primary_key=True)
    article_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    author_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""


class NewsArticleCreate(NewsArticleBase):
    pass


class NewsArticleUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    body: str | None = None
    external_url: str | None = None
    featured: bool | None = None
    status: NewsArticleStatus | None = None
    published_at: str | None = None


class NewsArticleRead(NewsArticleBase):
    id: int
    article_uuid: str
    org_id: int
    author_user_id: int | None = None
    creation_date: str
    update_date: str
