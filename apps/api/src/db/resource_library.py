"""Comment reports and the Library channels and resources an organization saved (services/resource_library.py)."""

from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel


class ResourceCommentReport(SQLModel, table=True):
    """Someone flagged a comment for the owning org's staff. One report per person."""

    __tablename__ = "resourcecommentreport"
    __table_args__ = (UniqueConstraint("comment_id", "user_id", name="uq_resourcecommentreport_comment_user"),)

    id: int | None = Field(default=None, primary_key=True)
    comment_id: int = Field(sa_column=Column(Integer, ForeignKey("resourcecomment.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    creation_date: str = ""


class OrgSavedChannel(SQLModel, table=True):
    """A Library channel an organization saved: a bookmark that follows the original, not a copy."""

    __tablename__ = "orgsavedchannel"
    __table_args__ = (UniqueConstraint("org_id", "channel_id", name="uq_orgsavedchannel_org_channel"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    channel_id: int = Field(sa_column=Column(Integer, ForeignKey("resourcechannel.id", ondelete="CASCADE"), index=True))
    saved_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""


class OrgSavedResource(SQLModel, table=True):
    """A Library resource an organization saved on its own, outside any saved channel."""

    __tablename__ = "orgsavedresource"
    __table_args__ = (UniqueConstraint("org_id", "resource_id", name="uq_orgsavedresource_org_resource"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    resource_id: int = Field(sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True))
    saved_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
