from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class PortfolioVisibility(str, Enum):
    PRIVATE = "private"
    UNLISTED = "unlisted"
    PUBLIC = "public"


class PortfolioContentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class PortfolioModerationStatus(str, Enum):
    CLEAR = "clear"
    PENDING = "pending"
    RESTRICTED = "restricted"


class ProjectStoryKind(str, Enum):
    MADE = "made"
    DID = "did"
    HELPED = "helped"
    LED = "led"
    LEARNED = "learned"
    SOLVED = "solved"
    ACHIEVED = "achieved"
    LAUNCHED = "launched"
    PERFORMED = "performed"
    OTHER = "other"


class Portfolio(SQLModel, table=True):
    __tablename__ = "portfolio"
    __table_args__ = (UniqueConstraint("user_id"), UniqueConstraint("portfolio_uuid"))

    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_uuid: str = Field(index=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    display_name: str = ""
    headline: str = ""
    short_bio: str = Field(default="", sa_column=Column(Text, nullable=False))
    location_label: str = ""
    avatar_asset_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    cover_asset_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PRIVATE, sa_column=Column(String, nullable=False))
    moderation_status: PortfolioModerationStatus = Field(default=PortfolioModerationStatus.CLEAR, sa_column=Column(String, nullable=False))
    theme_id: str = "default"
    theme_settings: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    privacy_confirmed_at: Optional[str] = None
    previewed_at: Optional[str] = None
    first_published_at: Optional[str] = None
    published_at: Optional[str] = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class PortfolioSection(SQLModel, table=True):
    __tablename__ = "portfoliosection"
    __table_args__ = (UniqueConstraint("portfolio_id", "section_type"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    section_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    section_type: str
    title_override: Optional[str] = None
    enabled: bool = True
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    settings: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class ProjectItem(SQLModel, table=True):
    __tablename__ = "projectitem"
    __table_args__ = (UniqueConstraint("project_uuid"), UniqueConstraint("portfolio_id", "slug"))

    id: Optional[int] = Field(default=None, primary_key=True)
    project_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    story_kind: ProjectStoryKind = Field(default=ProjectStoryKind.MADE, sa_column=Column(String, nullable=False))
    title: str
    subtitle: str = ""
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    role_label: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_precision: Optional[str] = None
    is_ongoing: bool = False
    cover_asset_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    status: PortfolioContentStatus = Field(default=PortfolioContentStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    featured: bool = False
    slug: str = Field(index=True)
    source: str = "manual"
    source_reference: Optional[str] = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class ProjectItemBlock(SQLModel, table=True):
    __tablename__ = "projectitemblock"

    id: Optional[int] = Field(default=None, primary_key=True)
    block_uuid: str = Field(index=True, unique=True)
    project_item_id: int = Field(sa_column=Column(Integer, ForeignKey("projectitem.id", ondelete="CASCADE"), index=True))
    block_type: str
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    sort_order: int = 0
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class TimelineEntry(SQLModel, table=True):
    __tablename__ = "timelineentry"
    __table_args__ = (UniqueConstraint("timeline_uuid"), UniqueConstraint("portfolio_id", "slug"))

    id: Optional[int] = Field(default=None, primary_key=True)
    timeline_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    entry_type: str = Field(default="experience", sa_column=Column(String, nullable=False, index=True))
    title: str
    organization: str = ""
    location_label: str = ""
    details: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_precision: str = "month"
    end_precision: Optional[str] = None
    is_current: bool = False
    cover_asset_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    status: PortfolioContentStatus = Field(default=PortfolioContentStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    slug: str = Field(index=True)
    source: str = "manual"
    source_reference: Optional[str] = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class TimelineEntryBlock(SQLModel, table=True):
    __tablename__ = "timelineentryblock"

    id: Optional[int] = Field(default=None, primary_key=True)
    block_uuid: str = Field(index=True, unique=True)
    timeline_entry_id: int = Field(sa_column=Column(Integer, ForeignKey("timelineentry.id", ondelete="CASCADE"), index=True))
    block_type: str = "image"
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    sort_order: int = 0
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class TimelineProjectLink(SQLModel, table=True):
    __tablename__ = "timelineprojectlink"
    __table_args__ = (UniqueConstraint("timeline_entry_id", "project_item_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    timeline_entry_id: int = Field(sa_column=Column(Integer, ForeignKey("timelineentry.id", ondelete="CASCADE"), index=True))
    project_item_id: int = Field(sa_column=Column(Integer, ForeignKey("projectitem.id", ondelete="CASCADE"), index=True))
    relationship_label: str = "Related project"
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioLink(SQLModel, table=True):
    __tablename__ = "portfoliolink"

    id: Optional[int] = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    link_type: str = "other"
    platform: Optional[str] = None
    label: str
    url: str = Field(sa_column=Column(Text, nullable=False))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    safety_status: str = "pending"
    creation_date: str = ""
    update_date: str = ""


class ProfileTrait(SQLModel, table=True):
    __tablename__ = "profiletrait"

    id: Optional[int] = Field(default=None, primary_key=True)
    trait_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    trait_type: str
    label: str
    description: str = ""
    source: str = "manual"
    source_reference: Optional[str] = None
    verification_status: str = "self_reported"
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioUpdate(SQLModel):
    display_name: Optional[str] = None
    headline: Optional[str] = None
    short_bio: Optional[str] = None
    location_label: Optional[str] = None
    theme_id: Optional[str] = None
    theme_settings: Optional[dict] = None
    socials: Optional[list[dict]] = None
    revision: int


class PortfolioTraitsUpdate(SQLModel):
    trait_type: str
    labels: list[str] = Field(default_factory=list)


class PortfolioFeaturedBadgesUpdate(SQLModel):
    badge_uuids: list[str] = Field(default_factory=list)


class PortfolioFeaturedProjectUpdate(SQLModel):
    project_uuid: Optional[str] = None
    project_uuids: Optional[list[str]] = None


class PortfolioFeaturedTimelineUpdate(SQLModel):
    timeline_uuids: list[str] = Field(default_factory=list)


class PortfolioBadgeVisibilityUpdate(SQLModel):
    hidden_badge_uuids: list[str] = Field(default_factory=list)
    revision: int


class PortfolioSectionItemUpdate(SQLModel):
    section_uuid: str
    enabled: bool = True


class PortfolioSectionsUpdate(SQLModel):
    sections: list[PortfolioSectionItemUpdate] = Field(default_factory=list)
    revision: int


class ProjectItemCreate(SQLModel):
    title: str
    story_kind: ProjectStoryKind = ProjectStoryKind.MADE
    subtitle: str = ""
    summary: str = ""
    role_label: str = ""
    visibility: PortfolioVisibility = PortfolioVisibility.PUBLIC
    featured: bool = False
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_ongoing: bool = False
    cover_asset_uuid: Optional[str] = None
    blocks: list[dict] = Field(default_factory=list)
    idempotency_key: Optional[str] = None


class ProjectItemUpdate(SQLModel):
    title: Optional[str] = None
    story_kind: Optional[ProjectStoryKind] = None
    subtitle: Optional[str] = None
    summary: Optional[str] = None
    role_label: Optional[str] = None
    visibility: Optional[PortfolioVisibility] = None
    featured: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_ongoing: Optional[bool] = None
    cover_asset_uuid: Optional[str] = None
    blocks: Optional[list[dict]] = None
    revision: int


class TimelineEntryCreate(SQLModel):
    title: str
    entry_type: str = "experience"
    organization: str = ""
    location_label: str = ""
    details: dict = Field(default_factory=dict)
    summary: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_precision: str = "month"
    end_precision: Optional[str] = None
    is_current: bool = False
    visibility: PortfolioVisibility = PortfolioVisibility.PUBLIC
    cover_asset_uuid: Optional[str] = None
    blocks: list[dict] = Field(default_factory=list)
    project_links: list[dict] = Field(default_factory=list)
    idempotency_key: Optional[str] = None


class TimelineEntryUpdate(SQLModel):
    title: Optional[str] = None
    entry_type: Optional[str] = None
    organization: Optional[str] = None
    location_label: Optional[str] = None
    details: Optional[dict] = None
    summary: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_precision: Optional[str] = None
    end_precision: Optional[str] = None
    is_current: Optional[bool] = None
    visibility: Optional[PortfolioVisibility] = None
    cover_asset_uuid: Optional[str] = None
    blocks: Optional[list[dict]] = None
    project_links: Optional[list[dict]] = None
    revision: int


class PublishRequest(SQLModel):
    revision: int
    privacy_confirmed: bool = False
