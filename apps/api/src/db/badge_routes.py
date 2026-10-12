from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel


class BadgeRoute(SQLModel, table=True):
    """A plan template the badge's creator publishes as a way to earn the badge."""

    __table_args__ = (UniqueConstraint("route_uuid"), UniqueConstraint("badge_id", "program_id"))

    id: int | None = Field(default=None, primary_key=True)
    route_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    program_id: int = Field(sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), index=True))
    recommended: bool = False
    position: int = 0
    creation_date: str = ""
    update_date: str = ""


class BadgeRouteOffer(SQLModel, table=True):
    """An issuer organization offering a route. An issuer with no offers offers every route."""

    __table_args__ = (UniqueConstraint("route_id", "issuer_org_id"),)

    id: int | None = Field(default=None, primary_key=True)
    route_id: int = Field(sa_column=Column(Integer, ForeignKey("badgeroute.id", ondelete="CASCADE"), index=True))
    issuer_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    creation_date: str = ""


class BadgeRouteOffersUpdate(SQLModel):
    route_uuids: list[str] = Field(default_factory=list, description="Routes this issuer offers; empty offers every route.")


class BadgeRouteInput(SQLModel):
    program_uuid: str
    recommended: bool = False


class BadgeRoutesUpdate(SQLModel):
    routes: list[BadgeRouteInput]


class BadgePlanStart(SQLModel):
    program_uuid: str | None = Field(default=None, description="The route to earn it by; defaults to the recommended route.")
    issuer_org_id: int | None = Field(default=None, description="The organization to earn it with; defaults to the badge's creator.")
