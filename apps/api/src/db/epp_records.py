"""Frozen Education Plan and Profile records: what a school reviewed with a learner, kept as it was.

Each record holds the whole report JSON at the moment it was frozen. Records are never edited: a
correction is a new version that points at the one it replaces. They belong to the school, so they
outlive the learner's account (the learner link is set to null) and the support link; the learner's
name and student ID are kept on the record.
"""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Text
from sqlmodel import Field, SQLModel

# annual: the yearly review. final: before graduating. transfer: going to another school.
# exit: made automatically when a supported learner leaves the organization or deletes their account.
RECORD_KINDS = ("annual", "final", "transfer", "exit")


class EppRecord(SQLModel, table=True):
    __tablename__ = "epprecord"

    id: int | None = Field(default=None, primary_key=True)
    record_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    learner_name: str = Field(sa_column=Column(String, nullable=False))
    student_id: str | None = None
    school_year: str = Field(sa_column=Column(String, nullable=False))
    kind: str = Field(default="annual", sa_column=Column(String, nullable=False, server_default="annual"))
    version: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    # The record this one corrects. The first version has none.
    supersedes_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("epprecord.id", ondelete="SET NULL"), nullable=True))
    schema_version: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    outcome: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    staff_comment: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    learner_comment: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    reviewed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    reviewed_by_name: str = ""
    reviewed_at: str = ""
    creation_date: str = ""
    update_date: str = ""


class EppRecordCreate(BaseModel):
    kind: str = "annual"
    outcome: str = PydanticField(default="", max_length=2000)
    staff_comment: str = PydanticField(default="", max_length=4000)
    learner_comment: str = PydanticField(default="", max_length=4000)


class EppRecordCorrection(BaseModel):
    """What a correction changes. The report itself stays as frozen; fields left out are kept."""

    reason: str = PydanticField(min_length=1, max_length=500)
    outcome: str | None = PydanticField(default=None, max_length=2000)
    staff_comment: str | None = PydanticField(default=None, max_length=4000)
    learner_comment: str | None = PydanticField(default=None, max_length=4000)
    student_id: str | None = PydanticField(default=None, max_length=64)
