"""A school's support link with one learner: asked for by staff, accepted by the learner, ended by either.

It's what lets a school's staff open a learner's school record (and later their Education Plan and
Profile report). Staff see nothing of the record without an active link. One row per organization
and learner; asking again after a decline or an end reuses it with a new request.
"""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel

# requested: waiting on the learner. active: they accepted. declined / ended: no access.
SUPPORT_STATUSES = ("requested", "active", "declined", "ended")
# Oregon's diplomas and certificate (ORS 329.451 and the modified/extended diploma rules).
DIPLOMA_TRACKS = ("standard", "modified", "extended", "alternative_certificate")


class LearnerSupport(SQLModel, table=True):
    __tablename__ = "learnersupport"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_learnersupport_org_user"),)

    id: int | None = Field(default=None, primary_key=True)
    support_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    # The learner. Removed with their account (the exit record that outlives it comes with the frozen reports).
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    status: str = Field(default="requested", sa_column=Column(String, nullable=False, server_default="requested", index=True))
    # Each ask gets its own id, so a consent card from an earlier ask can't be answered.
    request_uuid: str = Field(sa_column=Column(String, nullable=False))
    requested_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    requested_at: str = ""
    consent_at: str | None = None
    # The consent wording the learner accepted (services/school/support.CONSENT_VERSION).
    consent_version: str | None = None
    ended_at: str | None = None
    ended_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    # The school's own facts about the learner, set by its staff.
    student_id: str | None = None
    diploma_track: str | None = None
    graduation_year: int | None = None
    counselor_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class LearnerSupportUpdate(BaseModel):
    """The school's facts about a learner. Fields left out stay as they are; null clears one."""

    student_id: str | None = PydanticField(default=None, max_length=64)
    diploma_track: str | None = None
    graduation_year: int | None = PydanticField(default=None, ge=1990, le=2100)
    counselor_user_id: int | None = None


class SupportAnswer(BaseModel):
    """The learner's answer to a consent card: the ask it answers, so an old card can't answer a new one."""

    accept: bool
    request_uuid: str | None = None
