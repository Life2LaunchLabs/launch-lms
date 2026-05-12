from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class FrameworkContentType(str, Enum):
    resource = "resource"
    course = "course"
    activity = "activity"
    community = "community"
    collection = "collection"


class FrameworkTagIntent(str, Enum):
    teaches = "teaches"
    assesses = "assesses"
    supports = "supports"
    community = "community"
    explores = "explores"


class KnowledgeSourceType(str, Enum):
    manual_note = "manual_note"
    resource_outcome = "resource_outcome"
    course_quiz_result = "course_quiz_result"
    reflection = "reflection"
    uploaded_file = "uploaded_file"
    system_synthesis = "system_synthesis"


class KnowledgeEntryStatus(str, Enum):
    active = "active"
    archived = "archived"


class InsightStatus(str, Enum):
    suggested = "suggested"
    confirmed = "confirmed"
    dismissed = "dismissed"
    archived = "archived"


class DevelopmentState(str, Enum):
    empty = "empty"
    started = "started"
    emerging = "emerging"
    developed = "developed"
    stale = "stale"


class LifeFrameworkNode(SQLModel, table=True):
    __tablename__ = "lifeframeworknode"
    __table_args__ = (
        UniqueConstraint("key", name="uq_lifeframeworknode_key"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True)
    parent_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("lifeframeworknode.id", ondelete="CASCADE"), index=True),
    )
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    node_type: str = Field(default="category", index=True)
    sort_order: int = 0
    is_active: bool = True
    creation_date: str = ""
    update_date: str = ""


class ContentFrameworkTag(SQLModel, table=True):
    __tablename__ = "contentframeworktag"
    __table_args__ = (
        UniqueConstraint(
            "org_id",
            "content_type",
            "content_uuid",
            "framework_node_id",
            name="uq_contentframeworktag_org_content_node",
        ),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    content_type: FrameworkContentType = Field(sa_column=Column(String, nullable=False, index=True))
    content_uuid: str = Field(index=True)
    framework_node_id: int = Field(
        sa_column=Column(Integer, ForeignKey("lifeframeworknode.id", ondelete="CASCADE"), index=True)
    )
    relevance: float = Field(default=1.0, sa_column=Column(Float, nullable=False, server_default="1"))
    intent: FrameworkTagIntent = Field(
        default=FrameworkTagIntent.supports,
        sa_column=Column(String, nullable=False, server_default=FrameworkTagIntent.supports.value, index=True),
    )
    creation_date: str = ""
    update_date: str = ""


class UserKnowledgeEntry(SQLModel, table=True):
    __tablename__ = "userknowledgeentry"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "org_id",
            "source_type",
            "source_content_uuid",
            name="uq_userknowledgeentry_user_org_source_content",
        ),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    entry_uuid: str = Field(index=True, unique=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    source_type: KnowledgeSourceType = Field(sa_column=Column(String, nullable=False, index=True))
    source_id: Optional[int] = Field(default=None, index=True)
    source_content_type: Optional[str] = Field(default=None, index=True)
    source_content_uuid: Optional[str] = Field(default=None, index=True)
    title: str
    body: Optional[str] = Field(default=None, sa_column=Column(Text))
    source_url: Optional[str] = None
    file_url: Optional[str] = None
    raw_payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: KnowledgeEntryStatus = Field(
        default=KnowledgeEntryStatus.active,
        sa_column=Column(String, nullable=False, server_default=KnowledgeEntryStatus.active.value, index=True),
    )
    creation_date: str = ""
    update_date: str = ""


class UserKnowledgeEntryTag(SQLModel, table=True):
    __tablename__ = "userknowledgeentrytag"
    __table_args__ = (
        UniqueConstraint("entry_id", "framework_node_id", name="uq_userknowledgeentrytag_entry_node"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    entry_id: int = Field(sa_column=Column(Integer, ForeignKey("userknowledgeentry.id", ondelete="CASCADE"), index=True))
    framework_node_id: int = Field(
        sa_column=Column(Integer, ForeignKey("lifeframeworknode.id", ondelete="CASCADE"), index=True)
    )
    relevance: float = Field(default=1.0, sa_column=Column(Float, nullable=False, server_default="1"))
    creation_date: str = ""


class UserInsight(SQLModel, table=True):
    __tablename__ = "userinsight"
    __table_args__ = ({"extend_existing": True},)

    id: Optional[int] = Field(default=None, primary_key=True)
    insight_uuid: str = Field(index=True, unique=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    framework_node_id: int = Field(
        sa_column=Column(Integer, ForeignKey("lifeframeworknode.id", ondelete="CASCADE"), index=True)
    )
    insight_type: str = Field(default="general", index=True)
    label: str
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    structured_value: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: InsightStatus = Field(
        default=InsightStatus.confirmed,
        sa_column=Column(String, nullable=False, server_default=InsightStatus.confirmed.value, index=True),
    )
    confidence: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class UserInsightEvidence(SQLModel, table=True):
    __tablename__ = "userinsightevidence"
    __table_args__ = (
        UniqueConstraint("insight_id", "entry_id", name="uq_userinsightevidence_insight_entry"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    insight_id: int = Field(sa_column=Column(Integer, ForeignKey("userinsight.id", ondelete="CASCADE"), index=True))
    entry_id: int = Field(sa_column=Column(Integer, ForeignKey("userknowledgeentry.id", ondelete="CASCADE"), index=True))
    creation_date: str = ""


class UserFrameworkProfile(SQLModel, table=True):
    __tablename__ = "userframeworkprofile"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", "framework_node_id", name="uq_userframeworkprofile_user_org_node"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    framework_node_id: int = Field(
        sa_column=Column(Integer, ForeignKey("lifeframeworknode.id", ondelete="CASCADE"), index=True)
    )
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    development_state: Optional[DevelopmentState] = Field(
        default=None,
        sa_column=Column(String, nullable=True, index=True),
    )
    selected_lifestyle_option_key: Optional[str] = Field(default=None, index=True)
    user_confidence: Optional[int] = None
    reviewed_at: Optional[str] = None
    creation_date: str = ""
    update_date: str = ""


class FrameworkNodeRead(BaseModel):
    id: int
    key: str
    parent_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    node_type: str
    sort_order: int
    evidence_count: int = 0
    insight_count: int = 0
    development_state: DevelopmentState = DevelopmentState.empty
    latest_update: Optional[str] = None
    children: list["FrameworkNodeRead"] = PydanticField(default_factory=list)


class UserKnowledgeEntryCreate(BaseModel):
    title: str
    body: Optional[str] = None
    source_type: KnowledgeSourceType = KnowledgeSourceType.manual_note
    source_id: Optional[int] = None
    source_content_type: Optional[str] = None
    source_content_uuid: Optional[str] = None
    source_url: Optional[str] = None
    file_url: Optional[str] = None
    raw_payload: dict = PydanticField(default_factory=dict)
    framework_node_keys: list[str] = PydanticField(default_factory=list)


class UserKnowledgeEntryUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    source_url: Optional[str] = None
    file_url: Optional[str] = None
    raw_payload: Optional[dict] = None
    status: Optional[KnowledgeEntryStatus] = None
    framework_node_keys: Optional[list[str]] = None


class UserKnowledgeEntryRead(BaseModel):
    entry_uuid: str
    source_type: KnowledgeSourceType
    source_content_type: Optional[str] = None
    source_content_uuid: Optional[str] = None
    title: str
    body: Optional[str] = None
    source_url: Optional[str] = None
    file_url: Optional[str] = None
    raw_payload: dict = PydanticField(default_factory=dict)
    status: KnowledgeEntryStatus
    framework_nodes: list[dict] = PydanticField(default_factory=list)
    creation_date: str
    update_date: str


class UserInsightCreate(BaseModel):
    framework_node_key: str
    insight_type: str = "general"
    label: str
    summary: Optional[str] = None
    structured_value: dict = PydanticField(default_factory=dict)
    status: InsightStatus = InsightStatus.confirmed
    confidence: Optional[float] = None
    evidence_entry_uuids: list[str] = PydanticField(default_factory=list)


class UserInsightUpdate(BaseModel):
    insight_type: Optional[str] = None
    label: Optional[str] = None
    summary: Optional[str] = None
    structured_value: Optional[dict] = None
    status: Optional[InsightStatus] = None
    confidence: Optional[float] = None
    evidence_entry_uuids: Optional[list[str]] = None


class UserInsightRead(BaseModel):
    insight_uuid: str
    framework_node_key: str
    insight_type: str
    label: str
    summary: Optional[str] = None
    structured_value: dict = PydanticField(default_factory=dict)
    status: InsightStatus
    confidence: Optional[float] = None
    evidence_entry_uuids: list[str] = PydanticField(default_factory=list)
    creation_date: str
    update_date: str


class UserFrameworkProfileUpdate(BaseModel):
    summary: Optional[str] = None
    development_state: Optional[DevelopmentState] = None
    selected_lifestyle_option_key: Optional[str] = None
    user_confidence: Optional[int] = None
    reviewed_at: Optional[str] = None


class UserFrameworkProfileRead(BaseModel):
    framework_node_key: str
    summary: Optional[str] = None
    development_state: DevelopmentState = DevelopmentState.empty
    selected_lifestyle_option_key: Optional[str] = None
    user_confidence: Optional[int] = None
    reviewed_at: Optional[str] = None
    update_date: Optional[str] = None


class IdentitySummaryRead(BaseModel):
    roots: list[FrameworkNodeRead]
    top_insights: list[UserInsightRead]
    recent_evidence: list[UserKnowledgeEntryRead]
    suggested_next_nodes: list[FrameworkNodeRead]


class IdentityNodeDetailRead(BaseModel):
    node: FrameworkNodeRead
    profile: Optional[UserFrameworkProfileRead] = None
    insights: list[UserInsightRead]
    evidence: list[UserKnowledgeEntryRead]
    tagged_content: list[dict] = PydanticField(default_factory=list)


FrameworkNodeRead.model_rebuild()
