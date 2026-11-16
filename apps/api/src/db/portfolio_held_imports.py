"""A learner's Oregon CIS work held for them until they accept, after staff sent it (services/portfolio_held_imports.py).

The export stays here only until the learner accepts (it is then copied into their portfolio and deleted),
declines, the staff member withdraws it, or the invitation is revoked or expires. Only the learner and the staff
who sent it can see it."""

from datetime import datetime

from sqlalchemy import JSON, Column, ForeignKey, Integer, LargeBinary, String
from sqlmodel import Field, SQLModel


class HeldPortfolioImport(SQLModel, table=True):
    __tablename__ = "heldportfolioimport"

    id: int | None = Field(default=None, primary_key=True)
    held_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    # The invitation that brings the learner in; None when they were already a member.
    invitation_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organizationinvitation.id", ondelete="SET NULL"), nullable=True, index=True))
    email_normalized: str = Field(index=True)
    learner_name: str = ""
    # Known once they have an account: already a member when sent, or when they accept.
    target_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    source: str = Field(default="cis", sa_column=Column(String, nullable=False))
    filename: str = ""
    # The export itself, removed as soon as it is no longer held.
    content: bytes | None = Field(default=None, sa_column=Column(LargeBinary, nullable=True))
    # What it will bring: {"items": n, "groups": {group: n}}.
    summary: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # held, imported, declined, withdrawn or expired.
    status: str = Field(default="held", sa_column=Column(String, nullable=False, index=True))
    added: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    imported_at: datetime | None = None
