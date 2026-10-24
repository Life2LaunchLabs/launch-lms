"""Badges: an optional part of a plan, and the awards learners earn.

A plan template may earn one badge. The badge is a block of the template
document (``services/badges/definition.py``), so it is drafted, versioned and
released with the plan; nearly everything about it (name, image, criteria,
alignment, creator, version) comes from the plan. ``BadgeAward`` is what a
learner earns: by finishing the plan, or awarded directly by staff who sign off
on equivalent work. Awards keep the achievement as it was when earned, so they
survive later releases and even the plan's deletion.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from sqlalchemy import JSON, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class AwardSource(str, Enum):
    PLAN_COMPLETION = "plan_completion"
    DIRECT_AWARD = "direct_award"


class BadgeAward(SQLModel, table=True):
    __tablename__ = "badge_award"
    __table_args__ = (UniqueConstraint("award_uuid"), UniqueConstraint("template_id", "user_id"))

    id: int | None = Field(default=None, primary_key=True)
    award_uuid: str = Field(index=True)
    # The plan whose badge it is; None once the plan is deleted (the award keeps its achievement).
    template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="SET NULL"), nullable=True, index=True))
    # The release it was earned against.
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template_version.id", ondelete="SET NULL"), nullable=True))
    semver: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    # The organization that ran the plan with the learner or awarded it; the plan's owner is the badge's creator.
    issuing_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    creator_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True))
    source: AwardSource = Field(default=AwardSource.PLAN_COMPLETION, sa_column=Column(String, nullable=False, index=True))
    # The learner's plan it was earned by (plan completions).
    goal_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal.id", ondelete="SET NULL"), nullable=True))
    # Direct awards: who signed off, what the learner did, a link to the work.
    awarded_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    statement: str = ""
    evidence_url: str = ""
    earned_on: date = Field(sa_column=Column(Date, nullable=False))
    # The achievement as it was when earned (see services/badges/definition.achievement).
    achievement: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    issued_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    creation_date: str = ""
    update_date: str = ""
