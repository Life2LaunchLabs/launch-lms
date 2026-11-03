"""Tester feedback kept in the app first, then synced to Jira (services/feedback_outbox.py).

A submission is saved the moment it's sent, so sending is instant and a slow or down Jira never loses it; a
background sync creates the Jira issue and drops the stored screenshots. Each person's list of their feedback
is cached here too, so it opens at once and refreshes from Jira behind the scenes.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, ForeignKey, Integer, LargeBinary, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class FeedbackSubmission(SQLModel, table=True):
    __tablename__ = "feedback_submission"
    __table_args__ = (UniqueConstraint("submission_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    # Made by the browser, so a retry after a dropped connection never files it twice.
    submission_uuid: str = Field(max_length=64, index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    message: str = Field(sa_column=Column(Text, nullable=False))
    intent: str | None = None
    context: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # pending until Jira has it, then synced.
    status: str = Field(default="pending", max_length=16, index=True)
    issue_key: str | None = Field(default=None, max_length=64)
    attempts: int = 0
    last_error: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    synced_at: datetime | None = None


class FeedbackSubmissionFile(SQLModel, table=True):
    """A screenshot waiting to go to Jira with its submission; removed once it has."""

    __tablename__ = "feedback_submission_file"

    id: int | None = Field(default=None, primary_key=True)
    submission_id: int = Field(sa_column=Column(Integer, ForeignKey("feedback_submission.id", ondelete="CASCADE"), index=True))
    filename: str = Field(max_length=255)
    content_type: str = Field(max_length=64)
    content: bytes = Field(sa_column=Column(LargeBinary, nullable=False))


class FeedbackListCache(SQLModel, table=True):
    """A person's feedback in one organization as Jira last showed it."""

    __tablename__ = "feedback_list_cache"
    __table_args__ = (UniqueConstraint("org_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    items: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    refreshed_at: datetime = Field(default_factory=datetime.utcnow)
