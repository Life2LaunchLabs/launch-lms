"""A school's side of collaborators: staff on a group."""

from pydantic import BaseModel
from sqlalchemy import JSON, Column, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class UserGroupStaff(SQLModel, table=True):
    """A staff member on a group, with one role on the group's goals: all of them, or the ones listed."""

    __tablename__ = "usergroupstaff"
    __table_args__ = (UniqueConstraint("usergroup_id", "user_id", name="uq_usergroupstaff_group_user"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    usergroup_id: int = Field(sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    role_key: str = Field(default="commenter", sa_column=Column(String, nullable=False))
    # Assignment uuids this person covers; empty means every goal assigned to the group.
    assignment_uuids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class GroupStaffSet(BaseModel):
    """Add a staff member to a group, or change their role and goals."""

    user_id: int
    role_key: str = "commenter"
    assignment_uuids: list[str] = []
