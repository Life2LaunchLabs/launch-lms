
from sqlalchemy import JSON, Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "auditlog"
    __table_args__ = {"extend_existing": True}

    id: int | None = Field(default=None, primary_key=True)
    org_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), index=True),
    )
    user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True),
    )
    username: str | None = None
    name: str | None = None
    action: str = Field(index=True)
    resource: str = Field(index=True)
    resource_id: str | None = None
    method: str | None = None
    path: str | None = None
    status_code: int = Field(default=200, index=True)
    ip_address: str | None = None
    payload: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    request_metadata: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: str = Field(index=True)
