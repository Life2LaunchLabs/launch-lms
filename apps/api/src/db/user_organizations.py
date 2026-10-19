from sqlalchemy import JSON, Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class UserOrganization(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(default=None, foreign_key="user.id", index=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    role_id: int = Field(default=None, foreign_key="role.id")
    # This member's own settings in this org, e.g. {"admin_home": {"order": [...], "hidden": [...]}}.
    preferences: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    creation_date: str
    update_date: str
