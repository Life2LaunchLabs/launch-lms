from datetime import datetime

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Column, ForeignKey, Index, Integer, String, Text
from sqlmodel import Field, SQLModel


class InboxMessage(SQLModel, table=True):
    """A durable message delivered to one user's account inbox."""

    __tablename__ = "inboxmessage"
    __table_args__ = (
        Index("ix_inboxmessage_recipient_read", "recipient_user_id", "read_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    message_uuid: str = Field(index=True, unique=True)
    recipient_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        )
    )
    recipient_email_normalized: str | None = Field(default=None, index=True)
    sender_org_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("organization.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    sender_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    message_type: str = Field(
        default="system", sa_column=Column(String, nullable=False, index=True)
    )
    subject: str
    body: str = Field(sa_column=Column(Text, nullable=False))
    action_url: str | None = None
    action_kind: str | None = Field(default=None, index=True)
    action_data: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    action_status: str | None = Field(default=None, index=True)
    resolved_at: datetime | None = None
    dedupe_key: str | None = Field(default=None, index=True, unique=True)
    read_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class InboxMessageTemplate(SQLModel, table=True):
    """Platform-managed copy used when creating system-authored messages."""

    __tablename__ = "inboxmessagetemplate"

    id: int | None = Field(default=None, primary_key=True)
    template_key: str = Field(index=True, unique=True)
    subject: str
    body: str = Field(sa_column=Column(Text, nullable=False))
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WelcomeMessageTemplateUpdate(BaseModel):
    subject: str = PydanticField(min_length=1, max_length=200)
    body: str = PydanticField(min_length=1, max_length=10_000)


class InboxMessageResponse(BaseModel):
    accept: bool
