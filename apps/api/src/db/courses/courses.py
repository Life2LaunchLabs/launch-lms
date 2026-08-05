from enum import Enum

from pydantic import BaseModel
from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel
from src.db.courses.chapters import ChapterRead
from src.db.resource_authors import ResourceAuthorshipEnum, ResourceAuthorshipStatusEnum
from src.db.trails import TrailRead
from src.db.users import UserRead


class CourseSEO(BaseModel):
    """SEO configuration for a course stored as JSON"""
    # Basic SEO
    title: str | None = None
    description: str | None = None
    keywords: str | None = None
    canonical_url: str | None = None
    # Open Graph
    og_title: str | None = None
    og_description: str | None = None
    og_image: str | None = None
    # Twitter Card
    twitter_card: str | None = None  # 'summary' | 'summary_large_image'
    twitter_title: str | None = None
    twitter_description: str | None = None
    # Robots & Structured Data
    robots_noindex: bool = False
    robots_nofollow: bool = False
    enable_jsonld: bool = True
    # Public badge invite landing page copy
    badge_invite_eyebrow: str | None = None
    badge_invite_headline: str | None = None
    badge_invite_subheadline: str | None = None
    badge_invite_primary_stat: str | None = None
    badge_invite_secondary_stat: str | None = None
    badge_invite_testimonial: str | None = None


class ThumbnailType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    BOTH = "both"


class AuthorWithRole(SQLModel):
    user: UserRead
    authorship: ResourceAuthorshipEnum
    authorship_status: ResourceAuthorshipStatusEnum
    creation_date: str
    update_date: str


class CourseBase(SQLModel):
    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    public: bool
    shared: bool = Field(default=False)
    guest_access: bool = Field(default=False)
    published: bool = Field(default=False)
    coming_soon: bool = Field(default=False)
    core_course: bool = Field(default=False)
    core_course_order: int | None = Field(default=None)
    hidden: bool = Field(default=False)
    protected: bool = Field(default=False)
    system_type: str | None = Field(default=None)
    open_to_contributors: bool


class Course(CourseBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    collection_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("collection.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    course_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""
    seo: dict | None = Field(default=None, sa_column=Column(JSONB))


class CourseCreate(CourseBase):
    org_id: int = Field(default=None, foreign_key="organization.id")
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")


class CourseUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = None
    thumbnail_image: str | None = None
    thumbnail_video: str | None = None
    public: bool | None = None
    shared: bool | None = None
    guest_access: bool | None = None
    published: bool | None = None
    coming_soon: bool | None = None
    core_course: bool | None = None
    core_course_order: int | None = None
    hidden: bool | None = None
    protected: bool | None = None
    system_type: str | None = None
    open_to_contributors: bool | None = None
    seo: dict | None = None


class CourseRead(CourseBase):
    id: int
    org_id: int = Field(default=None, foreign_key="organization.id")
    collection_id: int | None = None
    authors: list[AuthorWithRole]
    course_uuid: str
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str
    update_date: str
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    seo: dict | None = None


class FullCourseRead(CourseBase):
    id: int
    org_id: int
    org_uuid: str | None = None
    course_uuid: str | None = None
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str | None = None
    update_date: str | None = None
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    seo: dict | None = None
    # Chapters, Activities
    chapters: list[ChapterRead]
    authors: list[AuthorWithRole]


class FullCourseReadWithTrail(CourseBase):
    id: int
    course_uuid: str | None = None
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str | None = None
    update_date: str | None = None
    org_id: int = Field(default=None, foreign_key="organization.id")
    seo: dict | None = None
    authors: list[AuthorWithRole]
    # Chapters, Activities
    chapters: list[ChapterRead]
    # Trail
    trail: TrailRead | None = None
