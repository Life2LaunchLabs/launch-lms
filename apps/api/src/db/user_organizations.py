from sqlalchemy import JSON, Column, ForeignKey, Integer, String
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
    # Set by the organization: only active learners count toward its limit (see services/orgs/member_status.py).
    status: str = Field(default="active", sa_column=Column(String, nullable=False, server_default="active", index=True))
    status_since: str | None = None
    # Staff only: the permissions the admin gave them (security/org_auth.STAFF_PERMISSIONS); None means the defaults.
    permissions: list[str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    creation_date: str
    update_date: str
