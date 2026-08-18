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
    COMPLETED = "completed"


class Program(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("program_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    program_uuid: str = Field(default="", index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    instructions: str = ""
    status: ProgramStatus = Field(default=ProgramStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    version: int = 1
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramObjective(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("program_id", "objective_id"),)

    id: int | None = Field(default=None, primary_key=True)
    program_id: int = Field(sa_column=Column(Integer, ForeignKey("program.id", ondelete="CASCADE"), index=True))
    objective_id: int = Field(sa_column=Column(Integer, ForeignKey("objective.id", ondelete="CASCADE"), index=True))
    position: int = 0
    target_days: int | None = None
    badge_major_version: int | None = None
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
    program_version: int = 1
    objective_snapshot: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    welcome_message: str = ""
    start_date: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    due_date: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    active: bool = True
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
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
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    completed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class ProgramCreate(SQLModel):
    org_id: int
    name: str
    description: str = ""
    instructions: str = ""


class ProgramUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    status: ProgramStatus | None = None


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


class ProgramAssignmentCreate(SQLModel):
    usergroup_id: int | None = None
    user_id: int | None = None
    welcome_message: str = ""
    start_date: datetime | None = None
    due_date: datetime | None = None


class ObjectiveProgressUpdate(SQLModel):
    objective_uuid: str
    user_ids: list[int]
    status: ObjectiveProgressStatus = ObjectiveProgressStatus.COMPLETED
    staff_note: str = ""
    evidence: list[dict] | None = None
    completion_date: datetime | None = None


class ParticipantResponse(SQLModel):
    accept: bool


class LearnerObjectiveUpdate(SQLModel):
    objective_uuid: str
    status: ObjectiveProgressStatus = ObjectiveProgressStatus.SUBMITTED
    learner_note: str = ""
    evidence: list[dict] = Field(default_factory=list)
