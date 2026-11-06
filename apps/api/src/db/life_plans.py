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


class CareerEntry(SQLModel, table=True):
    """One occupation from the O*NET database, as published.

    `code` is the O*NET-SOC code (`15-1252.00`); `soc` is the six-digit SOC code it rolls
    up to (`15-1252`), which is how BLS pay facts are keyed. `interests` holds the
    occupation's RIASEC profile ({"R": 2.1, "I": 6.3, ...}, O*NET's 1 to 7 scale).
    Only reviewed entries are shown.
    """

    __tablename__ = "careerentry"
    __table_args__ = (UniqueConstraint("code", "source_id"),)

    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(sa_column=Column(String(16), nullable=False, index=True))
    soc: str = Field(sa_column=Column(String(8), nullable=False, index=True))
    title: str = ""
    description: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    job_zone: int | None = None
    interests: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    alt_titles: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # What people in the job do most: O*NET's core task statements, most important first.
    tasks: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    # What people in the job say it takes: [{"level": 6, "pct": 55.9}], O*NET's required level of education
    # (1 less than high school ... 12 post-doctoral), the share of workers at each level.
    education: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    # O*NET's related occupations, closest first, by O*NET-SOC code.
    related: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    source_id: int = Field(sa_column=Column(Integer, ForeignKey("estimatesource.id", ondelete="CASCADE"), index=True))
    status: str = Field(default="draft", sa_column=Column(String(16), nullable=False, index=True, server_default="draft"))
    creation_date: str = ""


class CareerSkip(SQLModel, table=True):
    """A career a learner swiped past in Career swipe. Skips only push it back in later decks; nothing is disliked."""

    __tablename__ = "careerskip"
    __table_args__ = (UniqueConstraint("user_id", "code"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    code: str = Field(sa_column=Column(String(16), nullable=False))
    count: int = 1
    update_date: str = ""


class SchoolEntry(SQLModel, table=True):
    """One college or training school from the College Scorecard, as published.

    `unitid` is the federal (IPEDS) school id. Rates are fractions (0.62), earnings are
    yearly dollars. Tuition is not kept here: it loads as `tuition` facts, so the budget
    finds it the same way it finds rent and pay. Only reviewed entries are shown.
    """

    __tablename__ = "schoolentry"
    __table_args__ = (UniqueConstraint("unitid", "source_id"),)

    id: int | None = Field(default=None, primary_key=True)
    unitid: str = Field(sa_column=Column(String(12), nullable=False, index=True))
    name: str = ""
    city: str = ""
    state: str = Field(default="", sa_column=Column(String(4), nullable=False, index=True, server_default=""))
    url: str = ""
    control: str = ""
    degree: str = ""
    students: int | None = None
    admission_rate: float | None = None
    completion_rate: float | None = None
    median_earnings: float | None = None
    source_id: int = Field(sa_column=Column(Integer, ForeignKey("estimatesource.id", ondelete="CASCADE"), index=True))
    status: str = Field(default="draft", sa_column=Column(String(16), nullable=False, index=True, server_default="draft"))
    creation_date: str = ""


class ProgramEntry(SQLModel, table=True):
    """One program at one school from the College Scorecard's field-of-study file, as published.

    `cip` is the 4-digit program family ("51.38", Registered Nursing) and `credential` the Scorecard's
    credential level (1 certificate, 2 associate, 3 bachelor's, 4 post-bacc certificate, 5 master's,
    6 doctoral, 7 first professional, 8 graduate certificate). Earnings are yearly medians for graduates
    working one and five years after finishing; `in_state` is the share of those graduates working in the
    school's state five years on. `debt` is the median federal loan debt at graduation. Only reviewed
    entries are shown.
    """

    __tablename__ = "programentry"
    __table_args__ = (UniqueConstraint("unitid", "cip", "credential", "source_id"),)

    id: int | None = Field(default=None, primary_key=True)
    unitid: str = Field(sa_column=Column(String(12), nullable=False, index=True))
    school: str = ""
    cip: str = Field(sa_column=Column(String(8), nullable=False, index=True))
    title: str = ""
    credential: int = Field(default=0, sa_column=Column(Integer, nullable=False, index=True))
    graduates: int | None = None
    earnings_1yr: float | None = None
    earnings_5yr: float | None = None
    in_state: float | None = None
    debt: float | None = None
    online: bool = False
    source_id: int = Field(sa_column=Column(Integer, ForeignKey("estimatesource.id", ondelete="CASCADE"), index=True))
    status: str = Field(default="draft", sa_column=Column(String(16), nullable=False, index=True, server_default="draft"))
    creation_date: str = ""
