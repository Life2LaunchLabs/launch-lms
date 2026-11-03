"""People a learner has added to their portfolio, and the comments they leave on it."""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, UniqueConstraint, false, true
from sqlmodel import Field, SQLModel


class PortfolioPerson(SQLModel, table=True):
    """Someone who may see a portfolio even while it's private, as a Viewer or a Commenter.

    Two switches say what they see: the portfolio itself, and the learner's plans (budget included). A row
    with only plans on gives no portfolio access.
    """

    __tablename__ = "portfolioperson"
    __table_args__ = (UniqueConstraint("portfolio_id", "user_id", name="uq_portfolioperson_portfolio_user"),)

    id: int | None = Field(default=None, primary_key=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    role: str = Field(default="viewer", sa_column=Column(String, nullable=False))
    added_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    portfolio: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default=true()))
    plans: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=false()))
    creation_date: str = ""
    update_date: str = ""


class PortfolioComment(SQLModel, table=True):
    """A comment on a portfolio, or on one project or experience in it. Replies point at the first comment."""

    __tablename__ = "portfoliocomment"

    id: int | None = Field(default=None, primary_key=True)
    comment_uuid: str = Field(index=True, unique=True)
    portfolio_id: int = Field(sa_column=Column(Integer, ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False, index=True))
    # "portfolio", "project" or "timeline"; item_uuid names the project or experience.
    item_kind: str = Field(default="portfolio", sa_column=Column(String, nullable=False))
    item_uuid: str | None = Field(default=None, index=True)
    parent_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("portfoliocomment.id", ondelete="CASCADE"), nullable=True, index=True))
    author_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    body: str = Field(sa_column=Column(Text, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class PortfolioPersonCreate(BaseModel):
    handle: str = PydanticField(min_length=1, max_length=320)
    role: str = "viewer"


class PortfolioPersonUpdate(BaseModel):
    role: str


class PortfolioCommentCreate(BaseModel):
    body: str = PydanticField(min_length=1, max_length=5000)
    item_kind: str = "portfolio"
    item_uuid: str | None = None
    parent_uuid: str | None = None


class PersonAccess(BaseModel):
    """The two switches on someone in My people."""

    portfolio: bool = False
    plans: bool = False


class PersonLink(BaseModel):
    """Find someone's account by username or email, to link a person in My people or add them."""

    handle: str = PydanticField(min_length=1, max_length=320)
