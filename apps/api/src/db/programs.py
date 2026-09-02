from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class ProgramStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class ObjectiveKind(str, Enum):
    CUSTOM = "custom"
    BADGE = "badge"


class CompletionPolicy(str, Enum):
    LEARNER = "learner"
    STAFF = "staff"
    EITHER = "either"
    BOTH = "both"
    AUTOMATIC = "automatic"


class EvidencePolicy(str, Enum):
    NONE = "none"
    LEARNER = "learner"
    STAFF = "staff"
    BOTH = "both"


class ObjectiveStartRule(str, Enum):
    ANY_TIME = "any_time"
    PHASE_START = "phase_start"
    SPECIFIC_DATE = "specific_date"


class ObjectiveDueRule(str, Enum):
    OPTIONAL = "optional"
    PHASE_END = "phase_end"
    SPECIFIC_DATE = "specific_date"


class ParticipantStatus(str, Enum):
    INVITED = "invited"
    ACTIVE = "active"
    COMPLETED = "completed"
    DECLINED = "declined"
    LEFT = "left"


class ObjectiveProgressStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    READY_FOR_REVIEW = "ready_for_review"
    FLAGGED = "flagged"
    COMPLETED = "completed"


class Program(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("program_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    program_uuid: str = Field(default="", index=True)
    slug: str = Field(default="", sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    thumbnail_image: str = ""
    instructions: str = ""
    role_definitions: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    default_subject_role_key: str = "subject"
    default_staff_role_key: str = "reviewer"
    status: ProgramStatus = Field(default=ProgramStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True))
    version: int = 1
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramObjective(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("program_id", "objective_id"),)

    id: int | None = Field(default=None, primary_key=True)
    program_id: int = Field(sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), index=True))
    phase_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("programphase.id", ondelete="CASCADE"), nullable=True, index=True))
    objective_id: int = Field(sa_column=Column(Integer, ForeignKey("objective.id", ondelete="CASCADE"), index=True))
    position: int = 0
    target_days: int | None = None
    badge_major_version: int | None = None
    accept_previous_major_versions: bool = False
    default_start_rule: ObjectiveStartRule = Field(default=ObjectiveStartRule.ANY_TIME, sa_column=Column(String, nullable=False))
    default_due_rule: ObjectiveDueRule = Field(default=ObjectiveDueRule.OPTIONAL, sa_column=Column(String, nullable=False))
    default_allow_late: bool = False
    creation_date: str = ""
    update_date: str = ""


class Objective(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("objective_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    objective_uuid: str = Field(default="", index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: str = ""
    kind: ObjectiveKind = Field(default=ObjectiveKind.CUSTOM, sa_column=Column(String, nullable=False, index=True))
    completion_policy: CompletionPolicy = Field(default=CompletionPolicy.STAFF, sa_column=Column(String, nullable=False))
    evidence_policy: EvidencePolicy = Field(default=EvidencePolicy.NONE, sa_column=Column(String, nullable=False))
    allow_learner_confirmation: bool = False
    custom_fields: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True, index=True))
    archived: bool = False
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramAssignment(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("assignment_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    assignment_uuid: str = Field(default="", index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    program_id: int = Field(sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), index=True))
    usergroup_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=True, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    subject_email: str | None = Field(default=None, nullable=True, index=True)
    program_version: int = 1
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
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    owner_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramParticipant(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("participant_uuid"),
        UniqueConstraint("assignment_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    participant_uuid: str = Field(default="", index=True)
    assignment_id: int = Field(sa_column=Column(Integer, ForeignKey("programassignment.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    status: ParticipantStatus = Field(default=ParticipantStatus.INVITED, sa_column=Column(String, nullable=False, index=True))
    viewed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    responded_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ObjectiveProgress(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("progress_uuid"),
        UniqueConstraint("org_id", "objective_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    progress_uuid: str = Field(default="", index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    objective_id: int = Field(sa_column=Column(Integer, ForeignKey("objective.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    status: ObjectiveProgressStatus = Field(default=ObjectiveProgressStatus.NOT_STARTED, sa_column=Column(String, nullable=False, index=True))
    evidence: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    learner_note: str = ""
    staff_note: str = ""
    feedback_history: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    completed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramCreate(SQLModel):
    org_id: int
    name: str
    description: str = ""
    instructions: str = ""
    role_definitions: list[dict] = Field(default_factory=list)
    default_subject_role_key: str = "subject"
    default_staff_role_key: str = "reviewer"


class ProgramUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    instructions: str | None = None
    status: ProgramStatus | None = None
    role_definitions: list[dict] | None = None
    default_subject_role_key: str | None = None
    default_staff_role_key: str | None = None


class ObjectiveCreate(SQLModel):
    objective_uuid: str | None = None
    title: str | None = None
    description: str = ""
    kind: ObjectiveKind = ObjectiveKind.CUSTOM
    completion_policy: CompletionPolicy = CompletionPolicy.STAFF
    evidence_policy: EvidencePolicy = EvidencePolicy.NONE
    custom_fields: list[dict] = Field(default_factory=list)
    badge_uuid: str | None = None
    target_days: int | None = None
    phase_uuid: str | None = None
    allow_learner_confirmation: bool = False
    default_start_rule: ObjectiveStartRule = ObjectiveStartRule.ANY_TIME
    default_due_rule: ObjectiveDueRule = ObjectiveDueRule.OPTIONAL
    default_allow_late: bool = False
    requirement_node_uuids: list[str] = Field(default_factory=list)


class ProgramObjectiveScheduleUpdate(SQLModel):
    default_start_rule: ObjectiveStartRule
    default_due_rule: ObjectiveDueRule
    default_allow_late: bool = False


class ProgramObjectiveUpdate(ProgramObjectiveScheduleUpdate):
    title: str
    description: str = ""
    custom_fields: list[dict] = Field(default_factory=list)
    allow_learner_confirmation: bool = False
    requirement_node_uuids: list[str] | None = None


class ProgramPhase(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("phase_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    phase_uuid: str = Field(default="", index=True)
    program_id: int = Field(sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    position: int = 0
    target_days: int | None = None
    suggested_duration_weeks: int | None = None
    creation_date: str = ""
    update_date: str = ""


class ProgramPhaseCreate(SQLModel):
    name: str
    description: str = ""
    target_days: int | None = None
    suggested_duration_weeks: int | None = None


class ProgramPhaseUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    target_days: int | None = None
    suggested_duration_weeks: int | None = None


class ProgramPhaseOrder(SQLModel):
    phase_uuid: str
    objective_uuids: list[str] = Field(default_factory=list)


class ProgramReorder(SQLModel):
    phases: list[ProgramPhaseOrder]


class ProgramAssignmentCreate(SQLModel):
    usergroup_id: int | None = None
    user_id: int | None = None
    subject_email: str | None = None
    welcome_message: str = ""
    initiate_date: datetime | None = None
    staff_user_ids: list[int] = Field(default_factory=list)
    collaborators: list[dict] = Field(default_factory=list)
    schedule: dict = Field(default_factory=dict)
    start_date: datetime | None = None
    due_date: datetime | None = None
    owner_user_id: int | None = None


class ObjectiveProgressUpdate(SQLModel):
    objective_uuid: str
    user_ids: list[int]
    plan_uuids: list[str] = Field(default_factory=list)
    override_customized: bool = False
    status: ObjectiveProgressStatus = ObjectiveProgressStatus.COMPLETED
    staff_note: str = ""
    evidence: list[dict] | None = None
    field_values: dict | None = None
    completion_date: datetime | None = None


class ProgramAssignmentObjectiveUpdate(SQLModel):
    definition_version: int
    title: str
    description: str = ""
    fields: list[dict] = Field(default_factory=list)
    completion_restricted: bool = False
    allow_late: bool = False


class ParticipantResponse(SQLModel):
    accept: bool


class LearnerObjectiveUpdate(SQLModel):
    objective_uuid: str
    status: ObjectiveProgressStatus = ObjectiveProgressStatus.SUBMITTED
    learner_note: str = ""
    evidence: list[dict] = Field(default_factory=list)


class LearnerProgramEnrollmentView(SQLModel):
    participant_uuid: str
    status: str
    created_at: str = ""
    program: dict
    organization: dict
    assignment: dict
    objectives: list[dict] = Field(default_factory=list)
    enrollment: dict
    run: dict
    enrollment_count: int = 1


class LearnerProgramDetailView(SQLModel):
    program: dict
    organization: dict
    current_enrollment: LearnerProgramEnrollmentView
    enrollments: list[LearnerProgramEnrollmentView]


class ObjectiveReviewDecision(SQLModel):
    objective_uuid: str
    user_id: int
    plan_uuid: str | None = None
    plan_objective_uuid: str | None = None
    action: str
    message: str = ""
