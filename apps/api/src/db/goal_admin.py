"""Requests for the staff views across goals (review inbox, assignment matrices)."""

from __future__ import annotations

from sqlmodel import Field, SQLModel

from src.db.goals import StepStatus


class StepDecision(SQLModel):
    step_uuid: str
    action: str
    message: str = Field(default="", max_length=10000)


class StepConfirmMany(SQLModel):
    step_uuids: list[str] = Field(default_factory=list, max_length=500)
    message: str = Field(default="", max_length=10000)


class StaffNote(SQLModel):
    step_uuid: str
    message: str


class StepProgressBulk(SQLModel):
    """Set one template step for many learners: by goal, or by learner (optionally within one assignment)."""

    template_key: str
    assignment_uuid: str | None = None
    user_ids: list[int] = Field(default_factory=list, max_length=1000)
    goal_uuids: list[str] = Field(default_factory=list, max_length=1000)
    status: StepStatus = StepStatus.COMPLETED
    staff_note: str | None = Field(default=None, max_length=10000)


# The admin Home's widgets, in their default order (see services/goals/admin_home.py).
ADMIN_HOME_WIDGETS = ("waiting", "today", "messages", "attention", "creator", "requirements")


class AdminHomeLayout(SQLModel):
    """A member's own Home: widgets in the order they want, and the ones they hid."""

    order: list[str] = Field(default_factory=list, max_length=20)
    hidden: list[str] = Field(default_factory=list, max_length=20)


