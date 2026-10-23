"""Goals: what a learner is working toward, as stages of typed steps.

A goal is personal (the learner writes and owns it) or external (issued from
a template by an assignment, a badge or the starter flow). Templates are
versioned JSON documents; only live goals are stored as rows.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class TemplateStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class GoalOwnership(str, Enum):
    PERSONAL = "personal"
    EXTERNAL = "external"


class GoalSource(str, Enum):
    NONE = "none"
    ASSIGNMENT = "assignment"
    BADGE = "badge"
    STARTER = "starter"
    # A learner started their own goal from a template.
    TEMPLATE = "template"


class GoalStatus(str, Enum):
    # A personal goal still being set up in the launch flow.
    DRAFT = "draft"
    # Issued to someone who hasn't accepted it yet.
    PENDING = "pending"
    ACTIVE = "active"
    FINISHED = "finished"
    ARCHIVED = "archived"


class StepStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    CHANGES_REQUESTED = "changes_requested"
    COMPLETED = "completed"
    # The learner is not expected to do this step.
    EXCUSED = "excused"


DONE_STEP_STATUSES = {StepStatus.COMPLETED.value, StepStatus.EXCUSED.value}


class AssignmentStatus(str, Enum):
    """Where an assignment stands. See services/goals/assignments.py for what pausing and ending do."""

    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


# Assignments staff still run: listed, staffed and shown with their learners.
CURRENT_ASSIGNMENT_STATUSES = (AssignmentStatus.ACTIVE.value, AssignmentStatus.PAUSED.value)


class StepCompleter(str, Enum):
    LEARNER = "learner"
    STAFF = "staff"


class CompletionMethod(str, Enum):
    LEARNER = "learner"
    STAFF = "staff"
    AUTO = "auto"


class GoalTemplate(SQLModel, table=True):
    __tablename__ = "goal_template"
    __table_args__ = (UniqueConstraint("template_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    template_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: str = ""
    thumbnail_image: str = ""
    status: TemplateStatus = Field(default=TemplateStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True))
    # "starter" for the system starter template, loaded from data with each release.
    system_type: str | None = Field(default=None, sa_column=Column(String, nullable=True, index=True))
    # The working draft, as a goal template document (see services/goals/document.py).
    document: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # The live version: what new assignments, badge starts and self-starts get. None = inactive.
    published_version_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    # The open draft, {semver, note, base_version_uuid, started_at, started_by_user_id}; None when
    # ``document`` is just the live version (see services/goals/drafts.py).
    draft: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Library copies remember where they came from.
    source_template_uuid: str | None = Field(default=None, sa_column=Column(String, nullable=True, index=True))
    source_version: int | None = None
    library_document: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    library_published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class GoalTemplateVersion(SQLModel, table=True):
    """An immutable published template document. Activity steps point at frozen activity copies."""

    __tablename__ = "goal_template_version"
    __table_args__ = (UniqueConstraint("version_uuid"), UniqueConstraint("template_id", "number"))

    id: int | None = Field(default=None, primary_key=True)
    version_uuid: str = Field(index=True)
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    number: int = 1
    # "2.1.0": strictly increasing per template, chosen when a draft starts. None on private versions.
    semver: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    document: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    content_hash: str = ""
    note: str = ""
    restored_from_number: int | None = None
    # Assignment-specific versions keep what a cohort was issued after group edits; never offered as "the" version.
    private: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    published_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""


class GoalAssignment(SQLModel, table=True):
    """A template version issued to a person or a group, with dates and staff."""

    __tablename__ = "goal_assignment"
    __table_args__ = (UniqueConstraint("assignment_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    assignment_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), index=True))
    version_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template_version.id", ondelete="RESTRICT"), index=True))
    usergroup_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=True, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    subject_email: str | None = Field(default=None, sa_column=Column(String, nullable=True, index=True))
    welcome_message: str = ""
    staff_user_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    # Start dates per stage key: {"<stage key>": {"start_date": "..."}}.
    stage_dates: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # Step key -> {"due_date"}: per-step close dates set when assigning.
    step_dates: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # [{"user_id", "role_key"}]: people added to each issued goal with a role.
    collaborators: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    status: AssignmentStatus = Field(default=AssignmentStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True, server_default="active"))
    paused_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    ended_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    ended_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    owner_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    # The badge its learners earn by finishing: another org's badge route it is authorized to run (services/goals/badge_authority.py).
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class Goal(SQLModel, table=True):
    __tablename__ = "goal"
    __table_args__ = (UniqueConstraint("goal_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    goal_uuid: str = Field(index=True)
    # The organization it belongs to; personal goals belong to the learner's org when they have one.
    org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    owner_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="RESTRICT"), index=True))
    subject_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    ownership: GoalOwnership = Field(default=GoalOwnership.PERSONAL, sa_column=Column(String, nullable=False, index=True))
    source: GoalSource = Field(default=GoalSource.NONE, sa_column=Column(String, nullable=False, index=True))
    template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="SET NULL"), nullable=True, index=True))
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template_version.id", ondelete="SET NULL"), nullable=True, index=True))
    assignment_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_assignment.id", ondelete="SET NULL"), nullable=True, index=True))
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True, index=True))
    title: str
    description: str = ""
    status: GoalStatus = Field(default=GoalStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True))
    # Higher comes first in This week.
    priority: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    target_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    finished_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    # Personal goals: {"reached": "yes"|"partly"|"changed", "what_happened": str, "renamed_from": str}.
    finish: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    celebrated_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    # Coach's check-ins on personal goals: "weekly" or "monthly", and when the next one is due.
    coach_cadence: str = Field(default="weekly", sa_column=Column(String, nullable=False, server_default="weekly"))
    next_check_in_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True, index=True))
    # What the learner said when they set it up: {"size", "starting_point", "template_uuid"} (see goals/launch.py).
    details: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    creation_date: str = ""
    update_date: str = ""


class GoalStage(SQLModel, table=True):
    __tablename__ = "goal_stage"
    __table_args__ = (UniqueConstraint("stage_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    stage_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), index=True))
    position: int = 0
    title: str
    description: str = ""
    # Rough timing in the learner's words ("this fall", "2 weeks"), shown when there are no dates.
    timing: str = ""
    # What reaching the end of the stage looks like ("Accepted to pre-vet"); stages end at milestones.
    milestone: str = ""
    # When it starts; it runs until the next stage starts (see services/goals/schedule.py).
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    # The template stage it was issued from.
    template_key: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class GoalStep(SQLModel, table=True):
    __tablename__ = "goal_step"
    __table_args__ = (UniqueConstraint("step_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    step_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), index=True))
    stage_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_stage.id", ondelete="SET NULL"), nullable=True, index=True))
    position: int = 0
    # One of the step registry's types (services/goals/types).
    type: str = Field(sa_column=Column(String, nullable=False, index=True))
    title: str
    description: str = ""
    # The type's own settings, validated by the registry.
    config: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # Things to read or watch: [{"kind": "resource"|"link"|"file", ...}].
    materials: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    completed_by: StepCompleter = Field(default=StepCompleter.LEARNER, sa_column=Column(String, nullable=False))
    # Learner steps that staff approve before they count as done.
    review_required: bool = False
    reviewer_guidance: str = ""
    # Opens and closes with its stage unless these are set (or it waits on other steps).
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True, index=True))
    # Staff put the step on hold.
    held: bool = False
    after_step_uuids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Requirement nodes this step counts toward: [{"framework_id", "framework_uuid", "node_uuid"}].
    requirement_links: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Kept as columns (not only in config) so activity runs and badge awards can find their steps.
    activity_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True, index=True))
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True, index=True))
    template_key: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class StepProgress(SQLModel, table=True):
    __tablename__ = "step_progress"
    __table_args__ = (UniqueConstraint("progress_uuid"), UniqueConstraint("step_id"))

    id: int | None = Field(default=None, primary_key=True)
    progress_uuid: str = Field(index=True)
    step_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_step.id", ondelete="CASCADE"), index=True))
    status: StepStatus = Field(default=StepStatus.NOT_STARTED, sa_column=Column(String, nullable=False, index=True))
    # The type's typed submission (a written answer, an RSVP, a decision).
    submission: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # The one-sentence answer an Explore step ends in.
    answer: str = ""
    learner_note: str = ""
    reviewer_note: str = ""
    feedback_history: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    staff_notes: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    completed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    completion_method: CompletionMethod | None = Field(default=None, sa_column=Column(String, nullable=True))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    # When staff last reminded the learner about this step; reminders wait out a cooldown.
    last_reminded_at: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class StepEntryKind(str, Enum):
    FILE = "file"
    LINK = "link"
    RESOURCE = "resource"
    NOTE = "note"
    ITEM = "item"
    LOG = "log"


class StepEntry(SQLModel, table=True):
    """One thing a step collected: a file, a link, a resource, a note, a list item or a routine log."""

    __tablename__ = "step_entry"
    __table_args__ = (UniqueConstraint("entry_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    entry_uuid: str = Field(index=True)
    step_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_step.id", ondelete="CASCADE"), index=True))
    kind: StepEntryKind = Field(sa_column=Column(String, nullable=False))
    # Upload steps: the slot the entry fills.
    slot: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    title: str = ""
    url: str = ""
    asset_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="SET NULL"), nullable=True, index=True))
    resource_uuid: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    note: str = ""
    done: bool = False
    # Routines: the trigger (the day it came round) the entry was logged for.
    period_start: date | None = Field(default=None, sa_column=Column(Date, nullable=True, index=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    position: int = 0
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class GoalStory(SQLModel, table=True):
    """A generated story of a finished personal goal. Reopening keeps earlier versions."""

    __tablename__ = "goal_story"
    __table_args__ = (UniqueConstraint("story_uuid"), UniqueConstraint("goal_id", "version"))

    id: int | None = Field(default=None, primary_key=True)
    story_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), index=True))
    version: int = 1
    # pending, ready, fallback (template story) or failed.
    status: str = "pending"
    slides: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    inputs_hash: str = ""
    model: str = ""
    error: str = ""
    creation_date: str = ""
    update_date: str = ""


# Requests ----------------------------------------------------------------------

class GoalCreate(SQLModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    org_id: int | None = None
    target_date: date | None = None


# The marks a learner can give their own goal; the web draws each one.
GOAL_ICONS = ("target", "book", "briefcase", "graduation", "heart", "dumbbell", "palette", "music", "code", "leaf", "home", "rocket")


class GoalFinish(SQLModel):
    """How the learner says it went, when they finish their own goal."""
    reached: Literal["yes", "partly", "changed"] | None = None
    what_happened: str = Field(default="", max_length=2000)


class GoalUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    target_date: date | None = None
    icon: Literal[GOAL_ICONS] | None = None  # type: ignore[valid-type]


class StageCreate(SQLModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    timing: str = Field(default="", max_length=120)
    milestone: str = Field(default="", max_length=200)
    position: int | None = Field(default=None, ge=0)


class StageUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    timing: str | None = Field(default=None, max_length=120)
    milestone: str | None = Field(default=None, max_length=200)
    start_date: date | None = None


class StepCreate(SQLModel):
    stage_uuid: str | None = None
    position: int | None = Field(default=None, ge=0)
    type: str
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    config: dict = Field(default_factory=dict)
    materials: list[dict] = Field(default_factory=list)
    completed_by: StepCompleter = StepCompleter.LEARNER
    review_required: bool = False
    reviewer_guidance: str = ""
    after_step_uuids: list[str] = Field(default_factory=list)
    start_date: date | None = None
    due_date: date | None = None


class StepUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    config: dict | None = None
    materials: list[dict] | None = None
    completed_by: StepCompleter | None = None
    review_required: bool | None = None
    reviewer_guidance: str | None = None
    after_step_uuids: list[str] | None = None
    start_date: date | None = None
    due_date: date | None = None
    held: bool | None = None


class StepMove(SQLModel):
    stage_uuid: str | None = None
    position: int = Field(ge=0)


class StepStatusChange(SQLModel):
    status: StepStatus
    note: str | None = Field(default=None, max_length=10000)


class StepSubmission(SQLModel):
    submission: dict = Field(default_factory=dict)
    answer: str | None = Field(default=None, max_length=2000)
    learner_note: str | None = Field(default=None, max_length=10000)


class StepNote(SQLModel):
    note: str = Field(default="", max_length=10000)


class StepEntryCreate(SQLModel):
    kind: StepEntryKind
    slot: str | None = None
    title: str = Field(default="", max_length=500)
    url: str = Field(default="", max_length=4000)
    asset_uuid: str | None = None
    resource_uuid: str | None = None
    note: str = Field(default="", max_length=10000)
    data: dict = Field(default_factory=dict)
    # Routines: an earlier trigger to log for; the current one when left out.
    period: date | None = None


class StepEntryUpdate(SQLModel):
    title: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=10000)
    done: bool | None = None
    # Merged into the entry's data, key by key.
    data: dict | None = None


class GoalAssignmentCreate(SQLModel):
    user_id: int | None = None
    usergroup_id: int | None = None
    staff_user_ids: list[int] = Field(default_factory=list)
    welcome_message: str = ""
    start_date: date | None = None
    due_date: date | None = None
    stage_dates: dict = Field(default_factory=dict)


class TemplateSave(SQLModel):
    document: dict
    etag: str | None = None


class TemplateCreate(SQLModel):
    title: str = ""
    document: dict | None = None


class TemplatePublish(SQLModel):
    note: str = Field(default="", max_length=1000)
    # Defaults to the draft's version; a template with no draft gets the next minor version.
    semver: str | None = None
    make_live: bool = True

