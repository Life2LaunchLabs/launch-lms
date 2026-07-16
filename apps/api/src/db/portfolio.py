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


class WorkStoryKind(str, Enum):
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


class WorkItem(SQLModel, table=True):
    __tablename__ = "workitem"
    __table_args__ = (UniqueConstraint("work_uuid"), UniqueConstraint("portfolio_id", "slug"))

    id: Optional[int] = Field(default=None, primary_key=True)
    work_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    story_kind: WorkStoryKind = Field(default=WorkStoryKind.MADE, sa_column=Column(String, nullable=False))
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


class WorkItemBlock(SQLModel, table=True):
    __tablename__ = "workitemblock"

    id: Optional[int] = Field(default=None, primary_key=True)
    block_uuid: str = Field(index=True, unique=True)
    work_item_id: int = Field(sa_column=Column(Integer, ForeignKey("workitem.id", ondelete="CASCADE"), index=True))
    block_type: str
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    sort_order: int = 0
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class JourneyEntry(SQLModel, table=True):
    __tablename__ = "journeyentry"
    __table_args__ = (UniqueConstraint("journey_uuid"), UniqueConstraint("portfolio_id", "slug"))

    id: Optional[int] = Field(default=None, primary_key=True)
    journey_uuid: str = Field(index=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), index=True))
    entry_type: str = Field(default="experience", sa_column=Column(String, nullable=False, index=True))
    title: str
    organization: str = ""
    location_label: str = ""
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


class JourneyEntryBlock(SQLModel, table=True):
    __tablename__ = "journeyentryblock"

    id: Optional[int] = Field(default=None, primary_key=True)
    block_uuid: str = Field(index=True, unique=True)
    journey_entry_id: int = Field(sa_column=Column(Integer, ForeignKey("journeyentry.id", ondelete="CASCADE"), index=True))
    block_type: str = "image"
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    sort_order: int = 0
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class JourneyWorkLink(SQLModel, table=True):
    __tablename__ = "journeyworklink"
    __table_args__ = (UniqueConstraint("journey_entry_id", "work_item_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    journey_entry_id: int = Field(sa_column=Column(Integer, ForeignKey("journeyentry.id", ondelete="CASCADE"), index=True))
    work_item_id: int = Field(sa_column=Column(Integer, ForeignKey("workitem.id", ondelete="CASCADE"), index=True))
    relationship_label: str = "Related work"
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
    labels: list[str] = Field(default_factory=list, max_length=5)


class WorkItemCreate(SQLModel):
    title: str
    story_kind: WorkStoryKind = WorkStoryKind.MADE
    subtitle: str = ""
    summary: str = ""
    role_label: str = ""
    visibility: PortfolioVisibility = PortfolioVisibility.PUBLIC
    featured: bool = False
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    cover_asset_uuid: Optional[str] = None
    blocks: list[dict] = Field(default_factory=list)
    idempotency_key: Optional[str] = None


class WorkItemUpdate(SQLModel):
    title: Optional[str] = None
    story_kind: Optional[WorkStoryKind] = None
    subtitle: Optional[str] = None
    summary: Optional[str] = None
    role_label: Optional[str] = None
    visibility: Optional[PortfolioVisibility] = None
    featured: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    cover_asset_uuid: Optional[str] = None
    blocks: Optional[list[dict]] = None
    revision: int


class JourneyEntryCreate(SQLModel):
    title: str
    entry_type: str = "experience"
    organization: str = ""
    location_label: str = ""
    summary: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_precision: str = "month"
    end_precision: Optional[str] = None
    is_current: bool = False
    visibility: PortfolioVisibility = PortfolioVisibility.PUBLIC
    cover_asset_uuid: Optional[str] = None
    blocks: list[dict] = Field(default_factory=list)
    work_links: list[dict] = Field(default_factory=list)
    idempotency_key: Optional[str] = None


class JourneyEntryUpdate(SQLModel):
    title: Optional[str] = None
    entry_type: Optional[str] = None
    organization: Optional[str] = None
    location_label: Optional[str] = None
    summary: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_precision: Optional[str] = None
    end_precision: Optional[str] = None
    is_current: Optional[bool] = None
    visibility: Optional[PortfolioVisibility] = None
    cover_asset_uuid: Optional[str] = None
    blocks: Optional[list[dict]] = None
    work_links: Optional[list[dict]] = None
    revision: int


class PublishRequest(SQLModel):
    revision: int
    privacy_confirmed: bool = False
