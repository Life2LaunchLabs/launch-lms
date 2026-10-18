"""A school's side of collaborators: staff on a group, and staff-only notes about a student."""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Text, UniqueConstraint
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


class StaffNote(SQLModel, table=True):
    """A note about a student that only the school's staff can read."""

    __tablename__ = "staffnote"

    id: int | None = Field(default=None, primary_key=True)
    note_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    subject_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    author_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    body: str = Field(sa_column=Column(Text, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class GroupStaffSet(BaseModel):
    """Add a staff member to a group, or change their role and goals."""

    user_id: int
    role_key: str = "commenter"
    assignment_uuids: list[str] = []


class StaffNoteCreate(BaseModel):
    body: str = PydanticField(min_length=1, max_length=5000)
