"""Who can see and work on a goal: roles, collaborators, invitations and requests, attachments and the activity log.

The tables keep their plan names (planrole, plancollaborator, ...) from before
goals; every row belongs to a goal.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class PlanInvitationKind(str, Enum):
    SUBJECT = "subject"
    COLLABORATOR = "collaborator"


class PlanInvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    REVOKED = "revoked"


class PlanCollaboratorRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


ALL_CAPABILITIES = {
    "view_plan", "comment", "contribute_fields", "update_progress",
    "request_collaborators", "contribute_restricted_fields", "complete_restricted_objectives",
    "review_badge_submissions", "edit_plan_details", "edit_structure",
    "edit_schedule", "complete_plan", "archive_plan", "manage_collaborators",
    "manage_roles",
}

DEFAULT_ROLE_DEFINITIONS = (
    {
        "key": "subject",
        "name": "Learner",
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
            "contribute_restricted_fields", "complete_restricted_objectives", "review_badge_submissions",
        ],
    },
    {
        "key": "plan_admin",
        "name": "Plan admin",
        "capabilities": [
            "view_plan", "comment", "contribute_fields", "update_progress",
            "contribute_restricted_fields", "complete_restricted_objectives", "review_badge_submissions",
            "edit_plan_details", "edit_structure", "edit_schedule", "complete_plan",
            "archive_plan", "manage_collaborators", "manage_roles",
        ],
    },
    {"key": "viewer", "name": "Viewer", "capabilities": ["view_plan"]},
    {"key": "commenter", "name": "Commenter", "capabilities": ["view_plan", "comment"]},
    {
        "key": "editor",
        "name": "Editor",
        "capabilities": [
            "view_plan", "comment", "contribute_fields", "update_progress",
            "contribute_restricted_fields", "complete_restricted_objectives", "review_badge_submissions",
            "edit_plan_details", "edit_structure", "edit_schedule",
        ],
    },
)
# The roles people pick when sharing a goal; the others stay for staff and older goals.
SHARING_ROLE_KEYS = ("viewer", "commenter", "editor")


class OrganizationPlanRole(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("role_uuid"), UniqueConstraint("org_id", "key"))

    id: int | None = Field(default=None, primary_key=True)
    role_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    key: str
    name: str
    capabilities: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class PlanRole(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("role_uuid"), UniqueConstraint("goal_id", "key"))

    id: int | None = Field(default=None, primary_key=True)
    role_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
    key: str
    name: str
    capabilities: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    grantable_role_keys: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class PlanCollaborator(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("collaborator_uuid"), UniqueConstraint("goal_id", "user_id"))

    id: int | None = Field(default=None, primary_key=True)
    collaborator_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("planrole.id", ondelete="RESTRICT"), index=True))
    active: bool = True
    creation_date: str = ""
    update_date: str = ""


class PlanInvitation(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("invitation_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    invitation_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
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


class PlanCollaboratorRequest(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("request_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    request_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
    requested_by_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    email: str
    email_normalized: str = Field(index=True)
    role_key: str
    message: str = ""
    status: PlanCollaboratorRequestStatus = Field(default=PlanCollaboratorRequestStatus.PENDING, sa_column=Column(String, nullable=False, index=True))
    resolved_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    responded_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class PlanAttachment(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("goal_id", "asset_id"),)

    id: int | None = Field(default=None, primary_key=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
    asset_id: int = Field(sa_column=Column(Integer, ForeignKey("mediaasset.id", ondelete="CASCADE"), index=True))
    added_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""


class PlanActivity(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("activity_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    activity_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True))
    actor_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    action: str = Field(index=True)
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    creation_date: str = ""


class PlanInvitationCreate(SQLModel):
    email: str
    role_key: str
    kind: PlanInvitationKind = PlanInvitationKind.COLLABORATOR


class PlanInvitationResponse(SQLModel):
    accept: bool


class PlanRoleUpdate(SQLModel):
    name: str | None = None
    capabilities: list[str] | None = None
    grantable_role_keys: list[str] | None = None


class OrganizationPlanRoleCreate(SQLModel):
    name: str
    capabilities: list[str] = Field(default_factory=list)


class OrganizationPlanRoleUpdate(SQLModel):
    name: str | None = None
    capabilities: list[str] | None = None


class PlanCollaboratorUpdate(SQLModel):
    role_key: str


class PlanOwnershipTransfer(SQLModel):
    user_id: int


class PlanCommentCreate(SQLModel):
    body: str


class PlanAttachmentCreate(SQLModel):
    asset_uuid: str


class PlanCollaboratorRequestCreate(SQLModel):
    email: str
    role_key: str = "viewer"
    message: str = ""


class PlanCollaboratorRequestResponse(SQLModel):
    approve: bool
