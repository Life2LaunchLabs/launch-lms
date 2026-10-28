"""Requests for goal template extras: assigning with a full schedule and staff."""

from __future__ import annotations

from datetime import date
from typing import Literal

from sqlmodel import Field, SQLModel

from src.db.goals import GOAL_ICONS, PLAN_COLORS, GoalAssignmentCreate


class AssignmentCollaborator(SQLModel):
    user_id: int
    # lead, review or comment; unset reviews (or leads, when nobody else does).
    role_key: str | None = None


class StageSchedule(SQLModel):
    stage_key: str
    start_date: date | None = None


class StepSchedule(SQLModel):
    """One step's own dates on an assignment; without them it follows its stage (or the template's due week)."""

    step_key: str
    start_date: date | None = None
    due_date: date | None = None
    # With a start date: learners may still start it once its stage opens. Off locks it until the start date.
    open_early: bool = True
    # Off closes the step at its due date: learners who haven't handed it in can't any more.
    allow_late: bool = True


class AssignmentSchedule(SQLModel):
    stages: list[StageSchedule] = Field(default_factory=list)
    steps: list[StepSchedule] = Field(default_factory=list)


class GoalAssignmentRequest(GoalAssignmentCreate):
    """Hand a template to one person, one group, or someone invited by email."""

    subject_email: str | None = Field(default=None, max_length=320)
    collaborators: list[AssignmentCollaborator] = Field(default_factory=list)
    owner_user_id: int | None = None
    schedule: AssignmentSchedule | None = None
    # Handing a plan to an alumnus makes them active again only when this says so (services/orgs/member_status.py).
    reactivate: bool = False


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


class AssignmentScheduleSave(SQLModel):
    """An assignment's whole schedule at once (services/goals/assignments.save_schedule).

    Self-paced: no stage or step dates, and the end date is optional. On a schedule (any stage or step
    date set) the end date is required.
    """

    start_date: date | None = None
    due_date: date | None = None
    stages: list[StageSchedule] = Field(default_factory=list)
    steps: list[StepSchedule] = Field(default_factory=list)


class StepDue(SQLModel):
    """When one step of a running assignment is due; None goes back to the template's date (or its stage's end)."""

    due_date: date | None = None


class StepRemind(SQLModel):
    """Remind learners who haven't handed a step in. No user_uuids: everyone it's waiting on."""

    user_uuids: list[str] = Field(default_factory=list, max_length=1000)
    message: str = Field(default="", max_length=2000)


class StepSettle(SQLModel):
    """Mark a staff-confirmed step done for everyone in the assignment except these learners."""

    except_user_uuids: list[str] = Field(default_factory=list, max_length=1000)
    message: str = Field(default="", max_length=10000)


class TemplateCover(SQLModel):
    """A plan's cover: its image, else the icon on the color."""
    icon: Literal[GOAL_ICONS] | None = None  # type: ignore[valid-type]
    color: Literal[PLAN_COLORS] | None = None  # type: ignore[valid-type]
    # An uploaded image (/content/...) or an https address; "" goes back to the icon.
    thumbnail_image: str | None = Field(default=None, max_length=1000)
