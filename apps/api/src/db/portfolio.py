from enum import Enum

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

    id: int | None = Field(default=None, primary_key=True)
    portfolio_uuid: str = Field(index=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    display_name: str = ""
    headline: str = ""
    short_bio: str = Field(default="", sa_column=Column(Text, nullable=False))
    location_label: str = ""
    avatar_asset_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    cover_asset_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PRIVATE, sa_column=Column(String, nullable=False))
    moderation_status: PortfolioModerationStatus = Field(default=PortfolioModerationStatus.CLEAR, sa_column=Column(String, nullable=False))
    theme_id: str = "default"
    theme_settings: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    privacy_confirmed_at: str | None = None
    previewed_at: str | None = None
    first_published_at: str | None = None
    published_at: str | None = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class PortfolioSection(SQLModel, table=True):
    __tablename__ = "portfoliosection"
    __table_args__ = (UniqueConstraint("portfolio_id", "section_type"),)

    id: int | None = Field(default=None, primary_key=True)
    section_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    section_type: str
    title_override: str | None = None
    enabled: bool = True
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    settings: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class ProjectItem(SQLModel, table=True):
    __tablename__ = "projectitem"
    __table_args__ = (UniqueConstraint("project_uuid"), UniqueConstraint("portfolio_id", "slug"))

    id: int | None = Field(default=None, primary_key=True)
    project_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    story_kind: ProjectStoryKind = Field(default=ProjectStoryKind.MADE, sa_column=Column(String, nullable=False))
    title: str
    subtitle: str = ""
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    role_label: str = ""
    start_date: str | None = None
    end_date: str | None = None
    date_precision: str | None = None
    is_ongoing: bool = False
    cover_asset_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    status: PortfolioContentStatus = Field(default=PortfolioContentStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    featured: bool = False
    slug: str = Field(index=True)
    source: str = "manual"
    source_reference: str | None = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class ProjectItemBlock(SQLModel, table=True):
    __tablename__ = "projectitemblock"

    id: int | None = Field(default=None, primary_key=True)
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

    id: int | None = Field(default=None, primary_key=True)
    timeline_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    entry_type: str = Field(default="experience", sa_column=Column(String, nullable=False, index=True))
    title: str
    organization: str = ""
    location_label: str = ""
    details: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    start_date: str | None = None
    end_date: str | None = None
    start_precision: str = "month"
    end_precision: str | None = None
    is_current: bool = False
    cover_asset_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True))
    status: PortfolioContentStatus = Field(default=PortfolioContentStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    slug: str = Field(index=True)
    source: str = "manual"
    source_reference: str | None = None
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class TimelineEntryBlock(SQLModel, table=True):
    __tablename__ = "timelineentryblock"

    id: int | None = Field(default=None, primary_key=True)
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

    id: int | None = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    timeline_entry_id: int = Field(sa_column=Column(Integer, ForeignKey("timelineentry.id", ondelete="CASCADE"), index=True))
    project_item_id: int = Field(sa_column=Column(Integer, ForeignKey("projectitem.id", ondelete="CASCADE"), index=True))
    relationship_label: str = "Related project"
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioLink(SQLModel, table=True):
    __tablename__ = "portfoliolink"

    id: int | None = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    link_type: str = "other"
    platform: str | None = None
    label: str
    url: str = Field(sa_column=Column(Text, nullable=False))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    safety_status: str = "pending"
    creation_date: str = ""
    update_date: str = ""


class ProfileTrait(SQLModel, table=True):
    __tablename__ = "profiletrait"

    id: int | None = Field(default=None, primary_key=True)
    trait_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    trait_type: str
    label: str
    description: str = ""
    source: str = "manual"
    source_reference: str | None = None
    verification_status: str = "self_reported"
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioUpdate(SQLModel):
    display_name: str | None = None
    headline: str | None = None
    short_bio: str | None = None
    location_label: str | None = None
    theme_id: str | None = None
    theme_settings: dict | None = None
    socials: list[dict] | None = None
    revision: int


class PortfolioTraitsUpdate(SQLModel):
    trait_type: str
    labels: list[str] = Field(default_factory=list)


class PortfolioFeaturedBadgesUpdate(SQLModel):
    badge_uuids: list[str] = Field(default_factory=list)


class PortfolioFeaturedProjectUpdate(SQLModel):
    project_uuid: str | None = None
    project_uuids: list[str] | None = None


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
    start_date: str | None = None
    end_date: str | None = None
    is_ongoing: bool = False
    cover_asset_uuid: str | None = None
    blocks: list[dict] = Field(default_factory=list)
    idempotency_key: str | None = None


class ProjectItemUpdate(SQLModel):
    title: str | None = None
    story_kind: ProjectStoryKind | None = None
    subtitle: str | None = None
    summary: str | None = None
    role_label: str | None = None
    visibility: PortfolioVisibility | None = None
    featured: bool | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_ongoing: bool | None = None
    cover_asset_uuid: str | None = None
    blocks: list[dict] | None = None
    revision: int


class TimelineEntryCreate(SQLModel):
    title: str
    entry_type: str = "experience"
    organization: str = ""
    location_label: str = ""
    details: dict = Field(default_factory=dict)
    summary: str = ""
    start_date: str | None = None
    end_date: str | None = None
    start_precision: str = "month"
    end_precision: str | None = None
    is_current: bool = False
    visibility: PortfolioVisibility = PortfolioVisibility.PUBLIC
    cover_asset_uuid: str | None = None
    blocks: list[dict] = Field(default_factory=list)
    project_links: list[dict] = Field(default_factory=list)
    idempotency_key: str | None = None


class TimelineEntryUpdate(SQLModel):
    title: str | None = None
    entry_type: str | None = None
    organization: str | None = None
    location_label: str | None = None
    details: dict | None = None
    summary: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    start_precision: str | None = None
    end_precision: str | None = None
    is_current: bool | None = None
    visibility: PortfolioVisibility | None = None
    cover_asset_uuid: str | None = None
    blocks: list[dict] | None = None
    project_links: list[dict] | None = None
    revision: int


class PublishRequest(SQLModel):
    revision: int
    privacy_confirmed: bool = False
