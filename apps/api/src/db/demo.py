"""Primary-database control records; never part of a visitor checkpoint."""

from datetime import datetime

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


class DemoConfiguration(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    enabled: bool = False
    source_user_id: int | None = None
    entry_org_id: int | None = None
    capacity: int = 200
    session_minutes: int = 60
    extension_minutes: int = 30
    ai_requests_per_minute: int = 10
    ai_tokens_per_visitor: int = 100000
    ai_tokens_per_day: int = 2000000
    revision: int = 1
    checkpoint_id: str | None = None


class DemoCheckpoint(SQLModel, table=True):
    id: str = Field(primary_key=True)
    schema_signature: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: int
    source_user_id: int
    entry_org_slug: str
    source_email: str
    data: dict = Field(sa_column=Column(JSON, nullable=False))


class DemoSession(SQLModel, table=True):
    id: str = Field(primary_key=True)
    checkpoint_id: str
    visitor_id: str = Field(index=True)
    namespace: str = Field(index=True, unique=True)
    schema_signature: str = ""
    duration_minutes: int = 60
    aliases: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(index=True)
    ended_at: datetime | None = None
    cleaned_at: datetime | None = None
    state: str = Field(default="preparing", index=True)
    error: str | None = Field(default=None, sa_column=Column(Text))


class DemoUsage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    tokens: int = 0
    requests: int = 0
