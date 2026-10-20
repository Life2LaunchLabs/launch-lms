"""Coach notes: what Coach noticed on a goal at a check-in, and what to do about it."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class CoachNoteStatus(str, Enum):
    OPEN = "open"
    ACTED = "acted"
    DISMISSED = "dismissed"
    EXPIRED = "expired"


class CoachNote(SQLModel, table=True):
    """Something Coach noticed on one goal at a check-in, with one to three things to do about it."""

    __tablename__ = "coach_note"
    __table_args__ = (UniqueConstraint("note_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    note_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    # The signal that raised it ("stalled", "plan_stage", ...) and its key, so one signal raises one note.
    kind: str = Field(sa_column=Column(String, nullable=False))
    signal_key: str = Field(sa_column=Column(String, nullable=False, index=True))
    title: str
    body: str = ""
    # [{"id", "kind": "ask"|"session"|"step"|"dismiss", "label", "prompt"?, "step_uuid"?}].
    actions: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    status: CoachNoteStatus = Field(default=CoachNoteStatus.OPEN, sa_column=Column(String, nullable=False, index=True))
    # "check_in" (scheduled) or "event" (the goal was created or a stage finished).
    source: str = "check_in"
    model: str = ""
    expires_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    acted_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
