"""Insights dashboards: a page of cards about one kind of thing (the organization, a plan, a group, a learner).

``document`` holds the cards, each ``{key, spec, span}`` (``services/insights/spec.CardSpec``), and the
default date range. A plan dashboard never names a plan: it answers for whichever plan the viewer picks.
Deleting a dashboard only marks it, so its captures stay readable.
"""

from sqlalchemy import JSON, Column, ForeignKey, Integer, String
from sqlmodel import Field, SQLModel


class InsightDashboard(SQLModel, table=True):
    __tablename__ = "insight_dashboard"

    id: int | None = Field(default=None, primary_key=True)
    dashboard_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    # org, plan, group or learner; fixed when the dashboard is made.
    scope: str = Field(sa_column=Column(String, nullable=False))
    title: str
    description: str = ""
    # me (the owner), staff (every staff member), admins.
    visibility: str = Field(default="me", sa_column=Column(String, nullable=False, server_default="me"))
    owner_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    document: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # Bumped on every save; clients send it back so two editors can't overwrite each other.
    revision: int = 1
    # The template it started from ("org.overview"), or "starter:<key>" for the ones made with the organization.
    source_template: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    deleted_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    creation_date: str = ""
    update_date: str = ""
