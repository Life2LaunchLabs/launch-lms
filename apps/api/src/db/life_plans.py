"""Life plans: a learner's phases and budget, and the sourced facts behind estimates.

A learner has one life plan, stored as a document (phases, budget lines, debt, savings,
things they own, one-time events). Estimates never live in the document: they come
from facts, each tied to the source it was read from, and are looked up when shown.
"""

from __future__ import annotations

from sqlalchemy import JSON, Column, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class LifePlan(SQLModel, table=True):
    """One learner's life plan document."""

    __tablename__ = "lifeplan"
    __table_args__ = (UniqueConstraint("user_id"), UniqueConstraint("plan_uuid"))

    id: int | None = Field(default=None, primary_key=True)
    plan_uuid: str = Field(index=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    document: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    revision: int = 1
    creation_date: str = ""
    update_date: str = ""


class EstimateSource(SQLModel, table=True):
    """Where a set of facts was read from: one published table or dataset release."""

    __tablename__ = "estimatesource"
    __table_args__ = (UniqueConstraint("key"),)

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(sa_column=Column(String(120), nullable=False, index=True))
    publisher: str = ""
    title: str = ""
    dataset: str = ""
    url: str = ""
    released: str = ""
    retrieved: str = ""
    license: str = ""
    notes: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    creation_date: str = ""


class EstimateFact(SQLModel, table=True):
    """One number from one source: a metric for a place, broken down by dimensions.

    `place` is a place key (`us`, `state:OR`, `area:0021660`, `county:OR:lane`,
    `city:OR:eugene`). `dims` holds the breakdown (`{"bedrooms": 2}`, `{"soc": "29-2056"}`);
    an empty dict is the general figure. Only reviewed facts are used for estimates.
    """

    __tablename__ = "estimatefact"

    id: int | None = Field(default=None, primary_key=True)
    metric: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    place: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    dims: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    dims_key: str = Field(default="", sa_column=Column(String(200), nullable=False, index=True, server_default=""))
    label: str = ""
    value: float = Field(sa_column=Column(Float, nullable=False))
    percentiles: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    period: str = "mo"
    stat: str = ""
    dollar_year: int | None = None
    source_id: int = Field(sa_column=Column(Integer, ForeignKey("estimatesource.id", ondelete="CASCADE"), index=True))
    status: str = Field(default="draft", sa_column=Column(String(16), nullable=False, index=True, server_default="draft"))
    reviewed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    reviewed_at: str | None = None
    note: str = ""
    creation_date: str = ""
