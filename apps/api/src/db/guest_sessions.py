from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel


def default_guest_session_expiry() -> datetime:
    return datetime.utcnow() + timedelta(days=30)


class GuestSession(SQLModel, table=True):
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    guest_session_uuid: str = Field(default="", index=True, unique=True)
    expires_at: datetime = Field(
        default_factory=default_guest_session_expiry,
        sa_column=Column(DateTime(timezone=False), nullable=False),
    )
    consumed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=False), nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""
