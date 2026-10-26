from datetime import datetime

from pydantic import BaseModel, EmailStr, Field as PydanticField
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlmodel import Field, SQLModel


class OrganizationJoinRequest(SQLModel, table=True):
    """Someone asking to join an invite-only organization, with or without an account yet (services/orgs/join_requests.py)."""

    __tablename__ = "organization_join_request"
    __table_args__ = (Index("ix_organization_join_request_org_status", "org_id", "status"),)

    id: int | None = Field(default=None, primary_key=True)
    request_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    email: str
    email_normalized: str = Field(index=True)
    name: str = ""
    message: str = ""
    # requested, approved (a learner now, or invited when they have no account), declined
    status: str = Field(default="requested", sa_column=Column(String, nullable=False))
    decided_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class JoinRequestCreate(BaseModel):
    """Signed in, the account's address is used; otherwise the asker gives theirs."""

    email: EmailStr | None = None
    name: str = PydanticField(default="", max_length=120)
    message: str = PydanticField(default="", max_length=500)
