"""Email notifications waiting to go out, and the ones that went (services/notifications).

Something worth telling a person (work handed in for them to review, a review of their work, a new
plan) adds one row here in the same transaction as the change itself. The notification worker sends
the rows that are due, folding several for the same person and stream into one email, and marks them
sent, skipped (switched off, or no longer true) or failed.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class NotificationEvent(SQLModel, table=True):
    __tablename__ = "notification_event"
    __table_args__ = (UniqueConstraint("dedupe_key"),)

    id: int | None = Field(default=None, primary_key=True)
    event_uuid: str = Field(max_length=64, index=True)
    # What happened (catalog.KINDS) and the stream it goes out on (catalog.STREAMS): the stream decides batching
    # and is what a person switches off.
    kind: str = Field(max_length=48)
    stream: str = Field(max_length=48)
    recipient_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=False))
    org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True, nullable=True))
    # What the email needs to say and link to (titles, uuids, names), captured when it happened.
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # The same happening never queues twice (a retried request, a double click).
    dedupe_key: str | None = Field(default=None, max_length=255)
    # pending until the worker takes it, then sending, and finally sent, skipped or failed.
    status: str = Field(default="pending", max_length=16, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    send_after: datetime = Field(default_factory=datetime.utcnow, index=True)
    claimed_at: datetime | None = None
    sent_at: datetime | None = None
    attempts: int = 0
    last_error: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
