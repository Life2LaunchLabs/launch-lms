from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class HubAdvisorConfiguration(SQLModel, table=True):
    """Singleton platform configuration for the learner Hub advisor."""

    __tablename__ = "hubadvisorconfiguration"

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(default="openai", max_length=50)
    enabled: bool = False
    instructions: str = Field(sa_column=Column(Text, nullable=False))
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubAdvisorProviderConfiguration(SQLModel, table=True):
    """Credential and inference choices retained independently per provider."""

    __tablename__ = "hubadvisorproviderconfiguration"

    provider: str = Field(primary_key=True, max_length=50)
    model: str = Field(max_length=200)
    api_key_ciphertext: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    advanced_settings: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubConversation(SQLModel, table=True):
    """A private Hub thread owned by one learner inside one organization."""

    __tablename__ = "hubconversation"
    __table_args__ = (Index("ix_hubconversation_owner_recent", "org_id", "user_id", "updated_at"),)

    id: int | None = Field(default=None, primary_key=True)
    conversation_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    title: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    archived_at: datetime | None = Field(default=None, index=True)


class HubConversationMessage(SQLModel, table=True):
    __tablename__ = "hubconversationmessage"
    __table_args__ = (UniqueConstraint("conversation_id", "sequence", name="uq_hubconversationmessage_sequence"),)

    id: int | None = Field(default=None, primary_key=True)
    message_uuid: str = Field(index=True, unique=True)
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("hubconversation.id", ondelete="CASCADE"), nullable=False, index=True))
    sequence: int = Field(index=True)
    role: str = Field(sa_column=Column(String(16), nullable=False))
    kind: str = Field(default="chat", sa_column=Column(String(16), nullable=False))
    content: str = Field(sa_column=Column(Text, nullable=False))
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class HubConversationMessageResource(SQLModel, table=True):
    __tablename__ = "hubconversationmessageresource"
    __table_args__ = (UniqueConstraint("message_id", "resource_uuid", name="uq_hubconversationmessage_resource"),)

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(sa_column=Column(Integer, ForeignKey("hubconversationmessage.id", ondelete="CASCADE"), nullable=False, index=True))
    resource_uuid: str = Field(index=True)
    display_order: int = 0
    label: str


class HubConversationResource(SQLModel, table=True):
    __tablename__ = "hubconversationresource"
    __table_args__ = (UniqueConstraint("conversation_id", "resource_uuid", name="uq_hubconversation_resource"),)

    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("hubconversation.id", ondelete="CASCADE"), nullable=False, index=True))
    resource_uuid: str = Field(index=True)
    display_order: int = 0
    active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True))


class HubMemoryPreference(SQLModel, table=True):
    """A learner's memory choice inside one organization."""

    __tablename__ = "hubmemorypreference"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_hubmemorypreference_owner"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    enabled: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubMemory(SQLModel, table=True):
    """One editable, organization-scoped learner memory."""

    __tablename__ = "hubmemory"
    __table_args__ = (
        Index("ix_hubmemory_owner_active", "org_id", "user_id", "status", "updated_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    memory_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    category: str = Field(sa_column=Column(String(32), nullable=False))
    content: str = Field(sa_column=Column(Text, nullable=False))
    normalized_key: str = Field(sa_column=Column(String(240), nullable=False, index=True))
    status: str = Field(default="active", sa_column=Column(String(16), nullable=False, default="active"))
    superseded_by_uuid: str | None = Field(default=None, max_length=120)
    version: int = Field(default=1, sa_column=Column(Integer, nullable=False, default=1))
    explicit: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    extraction_model: str | None = Field(default=None, max_length=200)
    extraction_version: str = Field(default="memory-v1", max_length=40)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    last_used_at: datetime | None = Field(default=None, index=True)


class HubMemorySource(SQLModel, table=True):
    """Provenance from a learner-authored Hub message to a memory."""

    __tablename__ = "hubmemorysource"
    __table_args__ = (UniqueConstraint("memory_id", "message_uuid", name="uq_hubmemorysource_message"),)

    id: int | None = Field(default=None, primary_key=True)
    memory_id: int = Field(sa_column=Column(Integer, ForeignKey("hubmemory.id", ondelete="CASCADE"), nullable=False, index=True))
    message_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("hubconversationmessage.id", ondelete="SET NULL"), nullable=True, index=True))
    message_uuid: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HubConversationMessageMemory(SQLModel, table=True):
    """Immutable receipt of memory created by or used for a Hub message."""

    __tablename__ = "hubconversationmessagememory"
    __table_args__ = (
        UniqueConstraint("message_id", "memory_uuid", "relationship", name="uq_hubmessagememory_receipt"),
    )

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(sa_column=Column(Integer, ForeignKey("hubconversationmessage.id", ondelete="CASCADE"), nullable=False, index=True))
    memory_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("hubmemory.id", ondelete="SET NULL"), nullable=True, index=True))
    memory_uuid: str = Field(index=True)
    relationship: str = Field(sa_column=Column(String(16), nullable=False))
    content_snapshot: str = Field(sa_column=Column(Text, nullable=False))
    category_snapshot: str = Field(sa_column=Column(String(32), nullable=False))
    memory_version: int = Field(sa_column=Column(Integer, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HubAdvisorAdvancedConfiguration(BaseModel):
    max_output_tokens: int = PydanticField(default=700, ge=128, le=4_000)
    reasoning_effort: Literal["default", "none", "low", "medium", "high", "xhigh"] = "default"
    verbosity: Literal["default", "low", "medium", "high"] = "default"
    thinking_effort: Literal["default", "low", "medium", "high", "xhigh", "max"] = "default"


class HubAdvisorConfigurationUpdate(BaseModel):
    provider: Literal["openai", "anthropic"]
    enabled: bool
    model: str = PydanticField(min_length=1, max_length=200)
    instructions: str = PydanticField(min_length=1, max_length=20_000)
    advanced: HubAdvisorAdvancedConfiguration = PydanticField(
        default_factory=HubAdvisorAdvancedConfiguration
    )
    api_key: str | None = PydanticField(default=None, min_length=20, max_length=512)
    clear_api_key: bool = False
