"""User tests: cohorts of test personas, the mail they cause, and one-use login links.

These are control records on the primary database. Demo checkpoints copy only the
tables they list, so none of these ever reach a visitor copy.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class TestCohort(SQLModel, table=True):
    """One test run's world. Personas can act only while it is open and unexpired."""

    __tablename__ = "test_cohort"
    __test__ = False  # not a pytest test class

    id: int | None = Field(default=None, primary_key=True)
    cohort_uuid: str = Field(index=True, unique=True)
    name: str
    # Short, URL-safe; part of every persona's address.
    slug: str = Field(index=True, unique=True)
    status: str = "open"  # open | closed
    created_by: int
    expires_at: datetime
    notes: str = ""
    creation_date: datetime = Field(default_factory=datetime.utcnow)
    update_date: datetime = Field(default_factory=datetime.utcnow)


class TestPersona(SQLModel, table=True):
    """A real account the console created. No existing account can ever become one."""

    __tablename__ = "test_persona"
    __test__ = False

    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    )
    cohort_id: int = Field(
        sa_column=Column(Integer, ForeignKey("test_cohort.id", ondelete="CASCADE"), index=True, nullable=False)
    )
    handle: str
    # Who they are: role, goals, tech comfort, starting situation.
    brief: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    start_state: str = "has_account"  # has_account | org_owner
    last_active_at: datetime | None = None
    creation_date: datetime = Field(default_factory=datetime.utcnow)


class TestCohortOrg(SQLModel, table=True):
    """An organization a persona created, so it belongs to the cohort."""

    __tablename__ = "test_cohort_org"
    __test__ = False

    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), primary_key=True)
    )
    cohort_id: int = Field(
        sa_column=Column(Integer, ForeignKey("test_cohort.id", ondelete="CASCADE"), index=True, nullable=False)
    )
    created_by_user_id: int | None = None
    creation_date: datetime = Field(default_factory=datetime.utcnow)


class TestMail(SQLModel, table=True):
    """An email the app would have sent, kept here instead of delivered."""

    __tablename__ = "test_mail"
    __test__ = False

    id: int | None = Field(default=None, primary_key=True)
    cohort_id: int | None = Field(default=None, index=True)
    to_address: str = Field(index=True)
    to_user_id: int | None = Field(default=None, index=True)
    from_user_id: int | None = None
    subject: str = ""
    html: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    links: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # test_address | persona_sender (to an outside address)
    reason: str = "test_address"
    captured_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    opened_at: datetime | None = None


class TestLoginTicket(SQLModel, table=True):
    """A one-use, short-lived login link for one persona. Only its hash is stored."""

    __tablename__ = "test_login_ticket"
    __test__ = False

    token_hash: str = Field(primary_key=True)
    persona_user_id: int = Field(index=True)
    operator_user_id: int
    target_path: str = "/"
    expires_at: datetime
    used_at: datetime | None = None
    creation_date: datetime = Field(default_factory=datetime.utcnow)
