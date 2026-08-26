from datetime import datetime

from pydantic import BaseModel
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
    invite_code_uuid: str | None = None
    status: str = Field(default="pending", sa_column=Column(String, nullable=False, index=True))
    email_sent: bool = False
    delivery_attempts: int = 0
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    accepted_at: datetime | None = None


class InviteUsersRequest(BaseModel):
    emails: list[str]
    role_id: int
    usergroup_id: int | None = None
    new_usergroup_name: str | None = None


class InviteRecipientResult(BaseModel):
    email: str
    status: str
    detail: str | None = None


class InviteUsersResponse(BaseModel):
    created: int
    results: list[InviteRecipientResult]
    usergroup_id: int | None = None
