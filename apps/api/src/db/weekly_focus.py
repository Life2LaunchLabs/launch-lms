"""A learner's week on Home: the undated goal steps picked into it.

The table keeps its plan name (planweeklyfocus) from before goals.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import JSON, Column, Date, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel


class PlanWeeklyFocus(SQLModel, table=True):
    """The undated steps picked into one learner's week, so the week stays stable."""

    __table_args__ = (UniqueConstraint("user_id", "week_start"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    week_start: date = Field(sa_column=Column(Date, nullable=False, index=True))
    objective_uuids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Plans the week was planned from. Plans started later wait for the learner to
    # pull them in instead of growing a week they may already have finished.
    plan_uuids: list[str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    target: int = 5
    # A goal the learner picked mid-week; the next week starts with it.
    next_target: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    boosts: int = 0
    creation_date: str = ""
    update_date: str = ""
