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


class InsightCapture(SQLModel, table=True):
    """A dashboard frozen at one moment: every card's result as the capturer saw it, with a note.

    Kept forever (for now) and readable after its dashboard is deleted, so it carries the dashboard's title,
    scope and cards as they were. ``attachments`` holds extra material made with it, such as each learner's
    evidence for a requirement report (``services/insights/captures.ATTACHMENTS``).
    """

    __tablename__ = "insight_capture"

    id: int | None = Field(default=None, primary_key=True)
    capture_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    dashboard_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("insight_dashboard.id", ondelete="SET NULL"), nullable=True, index=True))
    # Set when a capture rule made it (I6b); none when someone pressed Capture.
    rule_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    title: str
    scope: str = Field(sa_column=Column(String, nullable=False))
    # The plan, group or learner it shows, and its name then.
    object_key: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    object_label: str = ""
    # The date range asked for and the dates it covered.
    range: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    note: str = ""
    captured_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    # Whose learners it counts: the whole organization (See reports) or the capturer's own.
    whole_org: bool = True
    learners: int = 0
    cards: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    results: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    attachments: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # A read-only link anyone can open, with small numbers hidden; none when it's off.
    link_token: str | None = Field(default=None, sa_column=Column(String, nullable=True, unique=True, index=True))
    link_expires_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    creation_date: str = ""
    update_date: str = ""
