"""Requests for goal template extras: assigning with a full schedule and staff."""

from __future__ import annotations

from datetime import date

from sqlmodel import Field, SQLModel

from src.db.goals import GoalAssignmentCreate


class AssignmentCollaborator(SQLModel):
    user_id: int
    # A role of the template; defaults to its staff role.
    role_key: str | None = None


class StageSchedule(SQLModel):
    stage_key: str
    start_date: date | None = None
    due_date: date | None = None


class StepSchedule(SQLModel):
    step_key: str
    due_date: date | None = None
    allow_late: bool | None = None


class AssignmentSchedule(SQLModel):
    stages: list[StageSchedule] = Field(default_factory=list)
    steps: list[StepSchedule] = Field(default_factory=list)


class GoalAssignmentRequest(GoalAssignmentCreate):
    """Hand a template to one person, one group, or someone invited by email."""

    subject_email: str | None = Field(default=None, max_length=320)
    collaborators: list[AssignmentCollaborator] = Field(default_factory=list)
    owner_user_id: int | None = None
    schedule: AssignmentSchedule | None = None
