"""Learners joining a plan an organization offers in Discover.

An organization offers a plan it runs to learners ``open`` (they start it at once) or by
``request`` (``GoalTemplateLearnerAccess``). A request waits here until the organization
accepts it (the learner gets the plan) or declines it.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class JoinRequestStatus(str, Enum):
    REQUESTED = "requested"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class PlanJoinRequest(SQLModel, table=True):
    __tablename__ = "plan_join_request"
    __table_args__ = (UniqueConstraint("request_uuid"), UniqueConstraint("template_id", "org_id", "user_id"))

    id: int | None = Field(default=None, primary_key=True)
    request_uuid: str = Field(index=True)
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False, index=True))
    # The organization running the plan, which decides.
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    status: str = Field(default=JoinRequestStatus.REQUESTED.value, sa_column=Column(String, nullable=False, index=True))
    message: str = ""
    decided_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    # The plan an accepted request gave the learner.
    goal_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanJoin(SQLModel):
    org_id: int
    message: str = Field(default="", max_length=1000)
