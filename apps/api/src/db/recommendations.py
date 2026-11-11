"""Suggestions: what people were shown and did with it, and the Library list each life-plan phase saves into.

``RecommendationEvent`` is the engine's memory. Every suggestion shown, opened, saved or hidden is one row,
with where it was (the context, like ``phase:<id>``), which shelf and position it came from. Hidden ones are
left out of that context from then on; the rest is what smarter ranking learns from later.

``PhaseResourceList`` ties a phase of a person's life plan to the personal Library list (a user channel)
that "Save to this phase" fills, so renaming the phase or the list never loses the link.
"""

from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class RecommendationEvent(SQLModel, table=True):
    __tablename__ = "recommendationevent"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=True))
    resource_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), nullable=True, index=True))
    # shown, open, save, unsave, hide
    kind: str = Field(sa_column=Column(String(16), nullable=False))
    context: str = Field(default="", sa_column=Column(String(80), nullable=False, index=True, server_default=""))
    shelf: str = Field(default="", sa_column=Column(String(80), nullable=False, server_default=""))
    position: int | None = None
    creation_date: str = ""


class PhaseResourceList(SQLModel, table=True):
    __tablename__ = "phaseresourcelist"
    __table_args__ = (UniqueConstraint("user_id", "phase_id", name="uq_phase_resource_list"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    phase_id: str = Field(sa_column=Column(String(40), nullable=False))
    user_channel_id: int = Field(sa_column=Column(Integer, ForeignKey("userresourcechannel.id", ondelete="CASCADE"), nullable=False))
    creation_date: str = ""
