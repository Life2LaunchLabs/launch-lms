from enum import Enum
from typing import Optional

from sqlalchemy import Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class NewsArticleStatus(str, Enum):
    draft = "draft"
    published = "published"


class NewsArticleBase(SQLModel):
    title: str
    slug: str
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    body: Optional[str] = Field(default=None, sa_column=Column(Text))
    external_url: Optional[str] = None
    status: NewsArticleStatus = NewsArticleStatus.draft
    published_at: Optional[str] = None


class NewsArticle(NewsArticleBase, table=True):
    __tablename__ = "newsarticle"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_newsarticle_org_slug"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    article_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    author_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""


class NewsArticleCreate(NewsArticleBase):
    pass


class NewsArticleUpdate(SQLModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    external_url: Optional[str] = None
    status: Optional[NewsArticleStatus] = None
    published_at: Optional[str] = None


class NewsArticleRead(NewsArticleBase):
    id: int
    article_uuid: str
    org_id: int
    author_user_id: Optional[int] = None
    creation_date: str
    update_date: str
