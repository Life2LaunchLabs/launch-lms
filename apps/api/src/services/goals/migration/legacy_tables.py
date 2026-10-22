"""The plan and program tables as they stood when plans moved to goals (revision g1b2c3d4e5f6).

The app no longer has these tables; the move-plans-to-goals migration still
reads them on an install that upgrades through it. The classes live on their
own registry, so the app's ``create_all`` never creates them, and they carry no
foreign keys or indexes: the migration only reads and re-keys rows. Shared
tables that kept their rows but lost their plan columns are described in
``SHARED`` with just the columns the move touches.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Column, Date, DateTime, Integer, MetaData, String, Table
from sqlalchemy.orm import registry
from sqlmodel import Field, SQLModel


class LegacyTable(SQLModel, registry=registry()):
    pass


class Program(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    program_uuid: str = Field(default="")
    slug: str = Field(default="", sa_column=Column(String, nullable=False))
    org_id: int = Field(sa_column=Column(Integer))
    name: str
    description: str = ""
    thumbnail_image: str = ""
    instructions: str = ""
    role_definitions: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    default_subject_role_key: str = "subject"
    default_staff_role_key: str = "reviewer"
    status: str = Field(default="active", sa_column=Column(String, nullable=False))
    version: int = 1
    source_program_uuid: str | None = Field(default=None, nullable=True)
    source_version: int | None = None
    library_snapshot: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    library_published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    # Copied onto live plans: "any", "in_order" or "by_chapter".
    step_order: str = Field(default="any", sa_column=Column(String, nullable=False, server_default="any"))
    # "starter" for the Launch Ready starter plan, kept in sync from data; its activities may change the learner's portfolio.
    system_type: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    # The published version new plans are issued from. The template's own rows are the working draft.
    published_version_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))  # ProgramTemplateVersion.id
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramObjective(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    program_id: int = Field(sa_column=Column(Integer))
    phase_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    objective_id: int = Field(sa_column=Column(Integer))
    position: int = 0
    target_days: int | None = None
    suggested_due_week: int | None = None
    badge_major_version: int | None = None
    accept_previous_major_versions: bool = False
    default_start_rule: str = Field(default="any_time", sa_column=Column(String, nullable=False))
    default_due_rule: str = Field(default="phase_end", sa_column=Column(String, nullable=False))
    default_allow_late: bool = False
    # Template objective uuids that must be finished before this step opens.
    after_objective_uuids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    creation_date: str = ""
    update_date: str = ""


class Objective(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    objective_uuid: str = Field(default="")
    org_id: int = Field(sa_column=Column(Integer))
    title: str
    description: str = ""
    kind: str = Field(default="custom", sa_column=Column(String, nullable=False))
    completion_policy: str = Field(default="staff", sa_column=Column(String, nullable=False))
    evidence_policy: str = Field(default="none", sa_column=Column(String, nullable=False))
    allow_learner_confirmation: bool = False
    custom_fields: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    # What a reviewer should look for; shown beside submissions, never to learners.
    reviewer_guidance: str = ""
    archived: bool = False
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramAssignment(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    assignment_uuid: str = Field(default="")
    org_id: int = Field(sa_column=Column(Integer))
    program_id: int = Field(sa_column=Column(Integer))
    usergroup_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    subject_email: str | None = Field(default=None, nullable=True)
    program_version: int = 1
    # The published template version this assignment's plans are made from (pinned for its lifetime).
    template_version_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    definition_version: int = 1
    objective_snapshot: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    definition_audit: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    welcome_message: str = ""
    initiate_date: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    staff_user_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    collaborators: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    schedule: dict = Field(default_factory=dict, sa_column=Column(JSON))
    start_date: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    due_date: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    active: bool = True
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    owner_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramPhase(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    phase_uuid: str = Field(default="")
    program_id: int = Field(sa_column=Column(Integer))
    name: str
    description: str = ""
    position: int = 0
    target_days: int | None = None
    suggested_duration_weeks: int | None = None
    creation_date: str = ""
    update_date: str = ""


class ProgramTemplateVersion(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    version_uuid: str = Field(default="")
    program_id: int = Field(sa_column=Column(Integer))
    org_id: int = Field(sa_column=Column(Integer))
    number: int = 1
    snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # Fingerprint of the draft it was published from, to tell whether the draft has changed since.
    content_hash: str = ""
    note: str = ""
    restored_from_number: int | None = None
    published_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""


class FrozenActivity(LegacyTable, table=True):
    activity_id: int = Field(sa_column=Column(Integer, primary_key=True))
    # The editable activity it was copied from, and that activity's content hash at the time.
    source_activity_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    source_hash: str = Field(default="")
    creation_date: str = ""


class Plan(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    plan_uuid: str = ""
    slug: str = ""
    name: str
    description: str = ""
    status: str = Field(default="active", sa_column=Column(String, nullable=False))
    priority: int = Field(default=1)
    subject_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    owner_user_id: int = Field(sa_column=Column(Integer))
    source_org_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    source_program_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    source_assignment_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    source_badge_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    # Which steps a learner can start: "any", "in_order" or "by_chapter".
    step_order: str = Field(default="any", sa_column=Column(String, nullable=False, server_default="any"))
    creation_date: str = ""
    update_date: str = ""


class PlanPhase(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    phase_uuid: str = ""
    plan_id: int = Field(sa_column=Column(Integer))
    name: str
    description: str = ""
    position: int = 0
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanObjective(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    objective_uuid: str = ""
    plan_id: int = Field(sa_column=Column(Integer))
    phase_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    source_objective_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    title: str
    description: str = ""
    kind: str = Field(default="custom")
    position: int = 0
    priority: int = 1
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    badge_major_version: int | None = None
    fields: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    allow_late: bool = False
    blocked: bool = False
    completion_restricted: bool = False
    # Requirement nodes this objective counts toward: [{framework_id, framework_uuid, node_uuid}].
    requirement_mappings: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    reviewer_guidance: str = ""
    # The interactive activity this step plays (kind "activity").
    activity_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    # Steps in this plan that must be finished before this one opens.
    after_objective_uuids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    creation_date: str = ""
    update_date: str = ""


class PlanObjectiveProgress(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    progress_uuid: str = ""
    plan_objective_id: int = Field(sa_column=Column(Integer))
    status: str = Field(default="not_started", sa_column=Column(String, nullable=False))
    field_values: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    subject_note: str = ""
    reviewer_note: str = ""
    feedback_history: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Notes staff keep about this learner's step: [{note_uuid, user_id, message, created_at}].
    # Never returned to the learner.
    staff_notes: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramObjectiveRequirement(LegacyTable, table=True):
    id: int | None = Field(default=None, primary_key=True)
    mapping_uuid: str = ""
    program_objective_id: int = Field(sa_column=Column(Integer))
    framework_id: int = Field(sa_column=Column(Integer))
    node_uuid: str = ""
    creation_date: str = ""


SHARED = MetaData()


def _shared(name: str, *legacy: str, rekeyed: tuple[str, ...] = ("goal_id",)) -> Table:
    return Table(name, SHARED, Column("id", Integer, primary_key=True), *(Column(column, Integer) for column in (*legacy, *rekeyed)))


LEARNING_RUN = _shared("learningrun", "plan_id", "plan_objective_id", rekeyed=("goal_id", "goal_step_id"))
REQUIREMENT_SOURCE = _shared("requirementattainmentsource", "plan_objective_progress_id", "objective_progress_id", rekeyed=("step_progress_id",))
LEARNING_ACTIVITY = _shared("learningactivity", "objective_id", rekeyed=())
REKEYED = tuple(_shared(name, "plan_id") for name in ("planrole", "plancollaborator", "planinvitation", "plancollaboratorrequest", "planattachment", "planactivity"))
