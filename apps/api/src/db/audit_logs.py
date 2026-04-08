from typing import Optional

from sqlalchemy import JSON, Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "auditlog"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), index=True),
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True),
    )
    username: Optional[str] = None
    name: Optional[str] = None
    action: str = Field(index=True)
    resource: str = Field(index=True)
    resource_id: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: int = Field(default=200, index=True)
    ip_address: Optional[str] = None
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    request_metadata: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: str = Field(index=True)
