from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlmodel import Field, SQLModel


class LearningActivityPreview(SQLModel, table=True):
    """A short-lived, read-only snapshot of an activity document for previewing.

    The bearer token is the capability (previews render inside sandboxed
    iframes without a session cookie); only its sha256 is stored.
    """

    id: int | None = Field(default=None, primary_key=True)
    token_hash: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=True))
    activity_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    source: str = Field(default="editor", sa_column=Column(String(32), nullable=False))
    document: dict = Field(default_factory=dict, sa_column=Column(JSON))
    persona: dict = Field(default_factory=dict, sa_column=Column(JSON))
    expires_at: datetime = Field(sa_column=Column(DateTime, nullable=False, index=True))
    creation_date: str = ""
