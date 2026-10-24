"""Plan templates in the marketplace: a listing per template, and which organizations may use it.

Permission is to use a plan, not a badge. A creator lists any template (with or
without a badge or requirements) and says how others use it:

- mode ``locked``: others run the creator's template as-is. It stays the
  creator's, read-only for them, and new versions come from the creator.
- mode ``open``: others copy it into a template of their own (with provenance)
  and change it as they like.

Access is ``open`` (anyone may add it) or ``request`` (the creator approves each
organization). ``GoalTemplateAuthorization`` records each organization's
request and the decision. Permission to run a plan that earns a badge is also
permission to award that badge (``services/badges/awards.runs_plan``).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class TemplateListingMode(str, Enum):
    LOCKED = "locked"
    OPEN = "open"


class TemplateListingAccess(str, Enum):
    OPEN = "open"
    REQUEST = "request"


class TemplateAuthorizationStatus(str, Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"


class GoalTemplateListing(SQLModel, table=True):
    """How a template is offered in the marketplace. No row, or ``listed`` false: not offered."""

    __tablename__ = "goal_template_listing"
    __table_args__ = (UniqueConstraint("template_id"),)

    id: int | None = Field(default=None, primary_key=True)
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    listed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    mode: str = Field(default=TemplateListingMode.LOCKED.value, sa_column=Column(String, nullable=False, server_default="locked"))
    access: str = Field(default=TemplateListingAccess.REQUEST.value, sa_column=Column(String, nullable=False, server_default="request"))
    listed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class GoalTemplateAuthorization(SQLModel, table=True):
    """An organization's permission to use another organization's listed template."""

    __tablename__ = "goal_template_authorization"
    __table_args__ = (UniqueConstraint("template_id", "issuer_org_id"), UniqueConstraint("authorization_uuid"))

    id: int | None = Field(default=None, primary_key=True)
    authorization_uuid: str = Field(default="", index=True)
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False, index=True))
    creator_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    issuer_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    status: str = Field(default=TemplateAuthorizationStatus.REQUESTED.value, sa_column=Column(String, nullable=False, index=True))
    message: str | None = ""
    # Open-mode copies made under this authorization (the newest one).
    copied_template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="SET NULL"), nullable=True))
    requested_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class GoalTemplateLearnerAccess(SQLModel, table=True):
    """Who may start a plan an organization runs: its own template, or another organization's it may run.

    ``open`` (anyone starts), ``request`` (learners ask, the organization accepts) or ``invite``
    (only learners it adds). No row means ``invite``.
    """

    __tablename__ = "goal_template_learner_access"
    __table_args__ = (UniqueConstraint("template_id", "org_id"),)

    id: int | None = Field(default=None, primary_key=True)
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    access: str = Field(default="invite", sa_column=Column(String, nullable=False, server_default="invite"))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


# Payloads -------------------------------------------------------------------------------------

class TemplateListingUpdate(SQLModel):
    listed: bool = True
    mode: Literal["locked", "open"] = "locked"
    access: Literal["open", "request"] = "request"


class TemplateAuthorizationRequest(SQLModel):
    template_uuid: str
    issuer_org_id: int
    message: str | None = ""


class TemplateInvite(SQLModel):
    issuer_org_slug: str = Field(min_length=1)


class TemplateLearnerAccessUpdate(SQLModel):
    access: Literal["open", "request", "invite"] = "invite"
