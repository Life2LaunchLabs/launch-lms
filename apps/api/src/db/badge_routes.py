from __future__ import annotations

from typing import Literal

from sqlalchemy import Boolean, Column, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel


class BadgeRoute(SQLModel, table=True):
    """A template the badge's creator publishes as a way to earn the badge (a goal template; ``program_id`` is legacy)."""

    __table_args__ = (UniqueConstraint("route_uuid"), UniqueConstraint("badge_id", "program_id"), UniqueConstraint("badge_id", "goal_template_id"))

    id: int | None = Field(default=None, primary_key=True)
    route_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    program_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), nullable=True, index=True))
    goal_template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=True, index=True))
    recommended: bool = False
    position: int = 0
    # Which template versions earn the badge on an assignment: every version (neither set), the newest only, or from a number on.
    latest_only: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    eligible_from_version: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    # Unused (to drop in the pruning migration): who runs a route is who is approved on its plan template (GoalTemplateAuthorization).
    trusted_only: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    creation_date: str = ""
    update_date: str = ""


class BadgeRouteEligibilityUpdate(SQLModel):
    """The badge owner's rule for which versions of a route's template earn the badge."""

    rule: Literal["any", "latest", "from"] = "any"
    from_version: int | None = Field(default=None, ge=1, description="With rule 'from': the first version that earns the badge.")


class BadgeRouteOffer(SQLModel, table=True):
    """An issuer organization offering a route. An issuer with no offers offers every route."""

    __table_args__ = (UniqueConstraint("route_id", "issuer_org_id"),)

    id: int | None = Field(default=None, primary_key=True)
    route_id: int = Field(sa_column=Column(Integer, ForeignKey("badgeroute.id", ondelete="CASCADE"), index=True))
    issuer_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    creation_date: str = ""


class BadgeRouteOffersUpdate(SQLModel):
    route_uuids: list[str] = Field(default_factory=list, description="Routes this issuer offers; empty offers every route.")
