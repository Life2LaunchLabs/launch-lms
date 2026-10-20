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


class StepSchedule(SQLModel):
    step_key: str
    due_date: date | None = None


class AssignmentSchedule(SQLModel):
    stages: list[StageSchedule] = Field(default_factory=list)
    steps: list[StepSchedule] = Field(default_factory=list)


class GoalAssignmentRequest(GoalAssignmentCreate):
    """Hand a template to one person, one group, or someone invited by email."""

    subject_email: str | None = Field(default=None, max_length=320)
    collaborators: list[AssignmentCollaborator] = Field(default_factory=list)
    owner_user_id: int | None = None
    schedule: AssignmentSchedule | None = None
    # The badge its learners earn: required to run another organization's badge route; optional for your own.
    badge_uuid: str | None = None


class ApplyVersion(SQLModel):
    """Move an assignment to another published version of its template (services/goals/assignment_versions.py)."""

    version_uuid: str = Field(min_length=1)


class GoalAssignmentUpdate(SQLModel):
    """Edit an assignment: only the fields sent change (see services/goals/assignments.update)."""

    welcome_message: str | None = Field(default=None, max_length=10000)
    start_date: date | None = None
    due_date: date | None = None
    # Replaces the whole schedule: stage start dates and step close dates.
    schedule: AssignmentSchedule | None = None
    # Replaces the staff: each person with a role of the template.
    collaborators: list[AssignmentCollaborator] | None = None


class StepRemind(SQLModel):
    """Remind learners who haven't handed a step in. No user_uuids: everyone it's waiting on."""

    user_uuids: list[str] = Field(default_factory=list, max_length=1000)
    message: str = Field(default="", max_length=2000)


class StepSettle(SQLModel):
    """Mark a staff-confirmed step done for everyone in the assignment except these learners."""

    except_user_uuids: list[str] = Field(default_factory=list, max_length=1000)
    message: str = Field(default="", max_length=10000)
