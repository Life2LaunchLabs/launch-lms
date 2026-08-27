from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from sqlalchemy import JSON, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class PlanStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class PlanObjectiveStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    CHANGES_REQUESTED = "changes_requested"
    COMPLETED = "completed"
    CANCELED = "canceled"


class PlanInvitationKind(str, Enum):
    SUBJECT = "subject"
    COLLABORATOR = "collaborator"


class PlanInvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    REVOKED = "revoked"


DEFAULT_ROLE_DEFINITIONS = (
    {
        "key": "subject",
        "name": "Subject",
        "capabilities": [
            "view_plan", "comment", "contribute_fields", "update_progress",
            "request_collaborators",
        ],
    },
    {
        "key": "reviewer",
        "name": "Reviewer",
        "capabilities": [
            "view_plan", "comment", "contribute_fields", "update_progress",
            "contribute_reviewer_fields", "review_objectives", "review_badge_submissions",
        ],
    },
    {
        "key": "plan_admin",
        "name": "Plan admin",
        "capabilities": [
            "view_plan", "comment", "contribute_fields", "update_progress",
            "contribute_reviewer_fields", "review_objectives", "review_badge_submissions",
            "edit_plan_details", "edit_structure", "edit_schedule", "complete_plan",
            "archive_plan", "manage_collaborators", "manage_roles",
        ],
    },
    {"key": "viewer", "name": "Viewer", "capabilities": ["view_plan"]},
)


class Plan(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("plan_uuid"), UniqueConstraint("slug"))

    id: int | None = Field(default=None, primary_key=True)
    plan_uuid: str = Field(index=True)
    slug: str = Field(index=True)
    name: str
    description: str = ""
    status: PlanStatus = Field(default=PlanStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True))
    priority: int = Field(default=1)
    subject_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    owner_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="RESTRICT"), index=True))
    source_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    source_program_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("program.id", ondelete="SET NULL"), nullable=True, index=True))
    source_assignment_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("programassignment.id", ondelete="SET NULL"), nullable=True, index=True))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanRole(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("role_uuid"), UniqueConstraint("plan_id", "key"))

    id: int | None = Field(default=None, primary_key=True)
    role_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    key: str
    name: str
    capabilities: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    grantable_role_keys: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class PlanCollaborator(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("collaborator_uuid"), UniqueConstraint("plan_id", "user_id"))

    id: int | None = Field(default=None, primary_key=True)
    collaborator_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("planrole.id", ondelete="RESTRICT"), index=True))
    active: bool = True
    creation_date: str = ""
    update_date: str = ""


class PlanPhase(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("phase_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    phase_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    position: int = 0
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanObjective(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("objective_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    objective_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    phase_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("planphase.id", ondelete="SET NULL"), nullable=True, index=True))
    source_objective_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("objective.id", ondelete="SET NULL"), nullable=True, index=True))
    title: str
    description: str = ""
    kind: str = Field(default="custom", index=True)
    position: int = 0
    priority: int = 1
    badge_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True, index=True))
    badge_major_version: int | None = None
    fields: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    start_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    due_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True, index=True))
    allow_late: bool = False
    blocked: bool = False
    creation_date: str = ""
    update_date: str = ""


class PlanObjectiveProgress(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("progress_uuid"), UniqueConstraint("plan_objective_id"))

    id: int | None = Field(default=None, primary_key=True)
    progress_uuid: str = Field(index=True)
    plan_objective_id: int = Field(sa_column=Column(Integer, ForeignKey("planobjective.id", ondelete="CASCADE"), index=True))
    status: PlanObjectiveStatus = Field(default=PlanObjectiveStatus.NOT_STARTED, sa_column=Column(String, nullable=False, index=True))
    field_values: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    subject_note: str = ""
    reviewer_note: str = ""
    feedback_history: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanInvitation(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("invitation_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    invitation_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    kind: PlanInvitationKind = Field(sa_column=Column(String, nullable=False, index=True))
    email: str
    email_normalized: str = Field(index=True)
    target_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("planrole.id", ondelete="CASCADE"), index=True))
    status: PlanInvitationStatus = Field(default=PlanInvitationStatus.PENDING, sa_column=Column(String, nullable=False, index=True))
    invited_by_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    viewed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    responded_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    expires_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanAttachment(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("plan_id", "asset_id"),)

    id: int | None = Field(default=None, primary_key=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    asset_id: int = Field(sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="CASCADE"), index=True))
    added_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""


class PlanActivity(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("activity_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    activity_uuid: str = Field(index=True)
    plan_id: int = Field(sa_column=Column(Integer, ForeignKey("plan.id", ondelete="CASCADE"), index=True))
    actor_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    action: str = Field(index=True)
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""


class PlanCreate(SQLModel):
    name: str
    description: str = ""
    priority: int = 1
    start_date: date | None = None
    due_date: date | None = None


class PlanUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    priority: int | None = None
    start_date: date | None = None
    due_date: date | None = None


class PlanPhaseCreate(SQLModel):
    name: str
    description: str = ""
    start_date: date | None = None
    due_date: date | None = None


class PlanObjectiveCreate(SQLModel):
    phase_uuid: str | None = None
    title: str
    description: str = ""
    kind: str = "custom"
    priority: int = 1
    badge_uuid: str | None = None
    fields: list[dict] = Field(default_factory=list)
    start_date: date | None = None
    due_date: date | None = None
    allow_late: bool = False


class PlanObjectiveProgressUpdate(SQLModel):
    status: PlanObjectiveStatus
    field_values: dict | None = None
    note: str | None = None


class PlanInvitationCreate(SQLModel):
    email: str
    role_key: str
    kind: PlanInvitationKind = PlanInvitationKind.COLLABORATOR


class PlanInvitationResponse(SQLModel):
    accept: bool


class PlanRoleCreate(SQLModel):
    key: str
    name: str
    capabilities: list[str] = Field(default_factory=list)
    grantable_role_keys: list[str] = Field(default_factory=list)


class PlanCollaboratorUpdate(SQLModel):
    role_key: str


class PlanOwnershipTransfer(SQLModel):
    user_id: int
