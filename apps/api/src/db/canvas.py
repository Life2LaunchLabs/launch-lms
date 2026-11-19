"""Canvas (LTI 1.3) connections: one per organization, plus the Canvas user ids we've seen.

Design: Confluence LLMS › v0.11.0 › v0.11.0 Canvas design (LTI 1.3).
"""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import JSON, Field, SQLModel

# Canvas Cloud (instructure.com) signs every school's launches as this issuer.
CANVAS_CLOUD_ISSUER = "https://canvas.instructure.com"


class CanvasConnection(SQLModel, table=True):
    """A school's Canvas, registered once as an LTI 1.3 tool (OP-1 edits it in organization settings)."""

    __tablename__ = "canvasconnection"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), unique=True, index=True)
    )
    # The school's Canvas address, e.g. school.instructure.com: the only site allowed to frame the org's pages.
    canvas_host: str = Field(default="", sa_column=Column(String, nullable=False, server_default=""))
    issuer: str = Field(default=CANVAS_CLOUD_ISSUER, sa_column=Column(String, nullable=False, index=True))
    # The developer key's client id Canvas shows after the tool is added.
    client_id: str = Field(default="", sa_column=Column(String, nullable=False, index=True, server_default=""))
    deployment_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    enabled: bool = False
    # The admin confirmed the courses using Life2Launch are for students 13 and over (Privacy Policy).
    ages_confirmed_by: int | None = Field(
        default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    )
    ages_confirmed_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class CanvasUserLink(SQLModel, table=True):
    """Canvas's stable user id for an account, per connection. Deleted with the account."""

    __tablename__ = "canvasuserlink"
    __table_args__ = (UniqueConstraint("connection_id", "canvas_user_id", name="uq_canvasuserlink_connection_user"),)

    id: int | None = Field(default=None, primary_key=True)
    connection_id: int = Field(
        sa_column=Column(Integer, ForeignKey("canvasconnection.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    canvas_user_id: str = Field(sa_column=Column(String, nullable=False))
    creation_date: str = ""


class CanvasCourseGroup(SQLModel, table=True):
    """The organization's group for one Canvas course, keyed by Canvas's course id (OP-2). People join it when
    they first launch from that course, and its class list arrives as invitations (DEV-193); the group goes if
    the course's group is deleted."""

    __tablename__ = "canvascoursegroup"
    __table_args__ = (UniqueConstraint("connection_id", "canvas_course_id", name="uq_canvascoursegroup_connection_course"),)

    id: int | None = Field(default=None, primary_key=True)
    connection_id: int = Field(
        sa_column=Column(Integer, ForeignKey("canvasconnection.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    canvas_course_id: str = Field(sa_column=Column(String, nullable=False))
    usergroup_id: int = Field(
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=False, unique=True)
    )
    # Canvas's class list address for the course (LTI Names and Role Provisioning Services), from a launch.
    memberships_url: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    # The last class list pull: when it finished, and a plain sentence when it couldn't.
    roster_pulled_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    roster_error: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    # Names Canvas gave for the students still invited, by normalized email, so staff see who they are.
    # Rebuilt on every pull; a student's entry goes once they join or leave the course.
    invited_names: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    creation_date: str = ""
    update_date: str = ""
