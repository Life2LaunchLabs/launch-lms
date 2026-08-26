from datetime import datetime

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Index, Integer, String
from sqlmodel import Field, SQLModel


class OrganizationInvitation(SQLModel, table=True):
    """A seat-reserving invitation to join an organization."""

    __table_args__ = (
        Index("ix_organizationinvitation_org_status", "org_id", "status"),
        Index("ix_organizationinvitation_org_email", "org_id", "email_normalized"),
    )

    id: int | None = Field(default=None, primary_key=True)
    invitation_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    email: str
    email_normalized: str = Field(index=True)
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("role.id"), nullable=False))
    usergroup_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
    )
    target_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    created_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    invite_code_uuid: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    source: str = Field(default="manual", sa_column=Column(String, nullable=False, index=True))
    batch_uuid: str | None = Field(default=None, index=True)
    status: str = Field(default="pending", sa_column=Column(String, nullable=False, index=True))
    delivery_status: str = Field(default="queued", sa_column=Column(String, nullable=False, index=True))
    email_sent: bool = False
    delivery_attempts: int = 0
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: datetime | None = None
    viewed_at: datetime | None = None
    declined_at: datetime | None = None
    revoked_at: datetime | None = None
    last_sent_at: datetime | None = None


class OrganizationJoinLink(SQLModel, table=True):
    """A durable, controlled learner-only link (also rendered as a QR code)."""

    id: int | None = Field(default=None, primary_key=True)
    link_uuid: str = Field(index=True, unique=True)
    token_hash: str = Field(index=True, unique=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("role.id"), nullable=False))
    usergroup_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
    )
    display_name: str | None = None
    approved_email_domain: str | None = None
    max_redemptions: int = 1
    redemption_count: int = 0
    status: str = Field(default="active", sa_column=Column(String, nullable=False, index=True))
    created_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: datetime | None = None


class InviteUsersRequest(BaseModel):
    emails: list[str] = PydanticField(min_length=1, max_length=500)
    role_id: int
    usergroup_id: int | None = None
    new_usergroup_name: str | None = None
    source: str = "manual"
    batch_uuid: str | None = None


class InviteRecipientResult(BaseModel):
    email: str
    status: str
    detail: str | None = None


class InviteUsersResponse(BaseModel):
    created: int
    results: list[InviteRecipientResult]
    usergroup_id: int | None = None


class InvitePreviewResponse(BaseModel):
    results: list[InviteRecipientResult]


class CreateJoinLinkRequest(BaseModel):
    display_name: str
    usergroup_id: int | None = None
    expires_in_minutes: int = PydanticField(default=1440, ge=5, le=43200)
    max_redemptions: int = PydanticField(default=25, ge=1, le=1000)
    approved_email_domain: str | None = None
