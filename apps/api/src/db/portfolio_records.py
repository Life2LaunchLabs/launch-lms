"""Portfolio records beside projects and the timeline: credentials, the people in a learner's
corner and what they said, results ("What I'm like"), résumé versions, and private documents."""

from enum import Enum

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Text
from sqlmodel import Field, SQLModel

from src.db.portfolio import PortfolioVisibility


class CredentialKind(str, Enum):
    CARD = "card"
    CERTIFICATE = "certificate"
    DIPLOMA = "diploma"
    TEST_SCORE = "test_score"


class QuoteStatus(str, Enum):
    # The learner typed it in and said who it's from; shown as "added by" until confirmed.
    SELF_REPORTED = "self_reported"
    # Asked for by email and not answered yet; never shown.
    REQUESTED = "requested"
    CONFIRMED = "confirmed"


def _portfolio_fk() -> Column:
    return Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False, index=True)


def _optional_fk(target: str) -> Column:
    return Column(Integer, ForeignKey(target, ondelete="SET NULL"), nullable=True)


class Credential(SQLModel, table=True):
    """A card, certificate, diploma or test score. Badges stay in BadgeAward."""

    __tablename__ = "portfoliocredential"

    id: int | None = Field(default=None, primary_key=True)
    credential_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    kind: str = Field(sa_column=Column(String, nullable=False))
    name: str
    issuer: str = ""
    # Months as YYYY-MM. Diplomas still in progress use expected_on instead of issued_on.
    issued_on: str | None = None
    expires_on: str | None = None
    expected_on: str | None = None
    score: str = ""
    # "self_reported", "photo_on_file" or "verified" (from an issuer).
    verification_status: str = "self_reported"
    photo_asset_id: int | None = Field(default=None, sa_column=_optional_fk("mediaasset.id"))
    timeline_entry_id: int | None = Field(default=None, sa_column=_optional_fk("timelineentry.id"))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    featured: bool = False
    source: str = "manual"
    source_reference: str | None = None
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioContact(SQLModel, table=True):
    """Someone in a learner's corner, added by the learner. No account needed; one can be linked later."""

    __tablename__ = "portfoliocontact"

    id: int | None = Field(default=None, primary_key=True)
    contact_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    name: str
    role_label: str = ""
    # Private to the learner: how to reach them and why they matter.
    email: str = ""
    phone: str = ""
    note: str = Field(default="", sa_column=Column(Text, nullable=False))
    is_reference: bool = False
    linked_user_id: int | None = Field(default=None, sa_column=_optional_fk("user.id"))
    timeline_entry_id: int | None = Field(default=None, sa_column=_optional_fk("timelineentry.id"))
    source: str = "manual"
    source_reference: str | None = None
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioQuote(SQLModel, table=True):
    """What someone said about the learner, tied to an experience or project when it's about one."""

    __tablename__ = "portfolioquote"

    id: int | None = Field(default=None, primary_key=True)
    quote_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    contact_id: int = Field(sa_column=Column(Integer, ForeignKey("portfoliocontact.id", ondelete="CASCADE"), nullable=False, index=True))
    body: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: str = Field(default=QuoteStatus.SELF_REPORTED.value, sa_column=Column(String, nullable=False))
    timeline_entry_id: int | None = Field(default=None, sa_column=_optional_fk("timelineentry.id"))
    project_item_id: int | None = Field(default=None, sa_column=_optional_fk("projectitem.id"))
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    featured: bool = False
    requested_at: str | None = None
    confirmed_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class PortfolioResult(SQLModel, table=True):
    """A result about the learner: an interest type, strengths, work values. Typed in, imported, or written by
    a plan activity (the Spark quiz, the profiler) that updates its own row by ``source`` and ``source_reference``."""

    __tablename__ = "portfolioresult"

    id: int | None = Field(default=None, primary_key=True)
    result_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    # "interests" (RIASEC), "strengths", "values", "skills" or "other".
    kind: str = Field(sa_column=Column(String, nullable=False))
    name: str
    # The one line shown on the portfolio, like "Artistic · Social · Investigative".
    summary: str = ""
    # Whatever the source measured, such as {"R": 12, "I": 30, ...}; shown only in the result itself.
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    taken_on: str | None = None
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PUBLIC, sa_column=Column(String, nullable=False))
    featured: bool = False
    source: str = "manual"
    source_reference: str | None = None
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class ResumeVersion(SQLModel, table=True):
    """A named résumé: a layout and accent, and what's taken off it. The facts come from the portfolio."""

    __tablename__ = "resumeversion"

    id: int | None = Field(default=None, primary_key=True)
    version_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    name: str
    layout: str = "classic"
    accent: str = "blue"
    # Keys of what's off this version: "section:skills", "timeline:<uuid>", "credential:<uuid>".
    excluded: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class PortfolioDocument(SQLModel, table=True):
    """A file kept with the portfolio, private by default: uploads, imported résumés, an archived CIS PEP."""

    __tablename__ = "portfoliodocument"

    id: int | None = Field(default=None, primary_key=True)
    document_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    # "upload", "resume" or "archive".
    kind: str = "upload"
    title: str
    media_asset_id: int | None = Field(default=None, sa_column=_optional_fk("mediaasset.id"))
    source: str = "manual"
    visibility: PortfolioVisibility = Field(default=PortfolioVisibility.PRIVATE, sa_column=Column(String, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class PortfolioImport(SQLModel, table=True):
    """One import from another app (Oregon CIS, LinkedIn): what it added, and the raw rows of the sheets that belong
    to plans, kept so plans can bring them in later."""

    __tablename__ = "portfolioimport"

    id: int | None = Field(default=None, primary_key=True)
    import_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=_portfolio_fk())
    # "cis" or "linkedin".
    source: str = Field(sa_column=Column(String, nullable=False))
    filename: str = ""
    # Counts of what was added, by kind of record.
    added: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # Sheet name to its rows, each a dict of column to value.
    kept: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class CredentialWrite(BaseModel):
    kind: CredentialKind | None = None
    name: str | None = PydanticField(default=None, max_length=200)
    issuer: str | None = PydanticField(default=None, max_length=200)
    issued_on: str | None = None
    expires_on: str | None = None
    expected_on: str | None = None
    score: str | None = PydanticField(default=None, max_length=120)
    photo_asset_uuid: str | None = None
    timeline_uuid: str | None = None
    visibility: PortfolioVisibility | None = None
    featured: bool | None = None


class ContactWrite(BaseModel):
    name: str | None = PydanticField(default=None, max_length=160)
    role_label: str | None = PydanticField(default=None, max_length=200)
    email: str | None = PydanticField(default=None, max_length=320)
    phone: str | None = PydanticField(default=None, max_length=40)
    note: str | None = PydanticField(default=None, max_length=2000)
    is_reference: bool | None = None
    timeline_uuid: str | None = None


class QuoteWrite(BaseModel):
    contact_uuid: str | None = None
    body: str | None = PydanticField(default=None, max_length=2000)
    timeline_uuid: str | None = None
    project_uuid: str | None = None
    visibility: PortfolioVisibility | None = None
    featured: bool | None = None


class ResultWrite(BaseModel):
    kind: str | None = PydanticField(default=None, max_length=40)
    name: str | None = PydanticField(default=None, max_length=160)
    summary: str | None = PydanticField(default=None, max_length=300)
    data: dict | None = None
    taken_on: str | None = None
    visibility: PortfolioVisibility | None = None
    featured: bool | None = None


class ResumeVersionWrite(BaseModel):
    name: str | None = PydanticField(default=None, max_length=80)
    layout: str | None = None
    accent: str | None = None
    excluded: list[str] | None = None
    copy_from_uuid: str | None = None


class DocumentWrite(BaseModel):
    title: str | None = PydanticField(default=None, max_length=200)
    kind: str | None = None
    media_asset_uuid: str | None = None
    visibility: PortfolioVisibility | None = None


class IdentityUpdate(BaseModel):
    first_name: str | None = PydanticField(default=None, max_length=80)
    last_name: str | None = PydanticField(default=None, max_length=80)
    preferred_name: str | None = PydanticField(default=None, max_length=80)



class Highlight(BaseModel):
    value: str = PydanticField(min_length=1, max_length=24)
    label: str = PydanticField(min_length=1, max_length=60)


class HighlightsUpdate(BaseModel):
    """The numbers people notice first, shown in a band at the top of the portfolio."""

    highlights: list[Highlight] = PydanticField(default_factory=list, max_length=4)


class LayoutUpdate(BaseModel):
    header: str | None = None
    sections: str | None = None


RECORD_TABLES = (Credential, PortfolioContact, PortfolioQuote, PortfolioResult, ResumeVersion, PortfolioDocument, PortfolioImport)
