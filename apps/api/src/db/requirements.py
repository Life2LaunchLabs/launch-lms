from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class RequirementVersionStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class RequirementEnrollmentStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    WITHDRAWN = "withdrawn"


class RequirementFramework(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("framework_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    framework_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    source_framework_uuid: str | None = Field(default=None, nullable=True, index=True)
    source_version: int | None = None
    source_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    current_version: int = 1
    published_version: int | None = None
    archived: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class RequirementFrameworkVersion(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("version_uuid"),
        UniqueConstraint("framework_id", "version_number"),
    )

    id: int | None = Field(default=None, primary_key=True)
    version_uuid: str = Field(index=True)
    framework_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframework.id", ondelete="CASCADE"), index=True))
    version_number: int
    status: RequirementVersionStatus = Field(default=RequirementVersionStatus.DRAFT, sa_column=Column(String, nullable=False, index=True))
    published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    published_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class RequirementNode(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("node_version_uuid"),
        UniqueConstraint("version_id", "node_uuid"),
    )

    id: int | None = Field(default=None, primary_key=True)
    node_version_uuid: str = Field(index=True)
    node_uuid: str = Field(index=True)
    version_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframeworkversion.id", ondelete="CASCADE"), index=True))
    parent_node_uuid: str | None = Field(default=None, nullable=True, index=True)
    code: str = ""
    title: str
    description: str = ""
    position: int = 0
    metadata_json: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON, nullable=False))
    creation_date: str = ""
    update_date: str = ""


class ProgramObjectiveRequirement(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("program_objective_id", "framework_id", "node_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    mapping_uuid: str = Field(index=True, unique=True)
    program_objective_id: int = Field(sa_column=Column(Integer, ForeignKey("programobjective.id", ondelete="CASCADE"), index=True))
    framework_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframework.id", ondelete="CASCADE"), index=True))
    node_uuid: str = Field(index=True)
    creation_date: str = ""


class RequirementAssignmentBatch(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("batch_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    batch_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    framework_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframework.id", ondelete="CASCADE"), index=True))
    version_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframeworkversion.id", ondelete="RESTRICT"), index=True))
    usergroup_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""


class RequirementEnrollment(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("enrollment_uuid"),
        UniqueConstraint("batch_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    enrollment_uuid: str = Field(index=True)
    batch_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementassignmentbatch.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    framework_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframework.id", ondelete="CASCADE"), index=True))
    version_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementframeworkversion.id", ondelete="RESTRICT"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    status: RequirementEnrollmentStatus = Field(default=RequirementEnrollmentStatus.ACTIVE, sa_column=Column(String, nullable=False, index=True))
    framework_snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class RequirementAttainmentSource(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("source_uuid"),
        UniqueConstraint("enrollment_id", "node_uuid", "plan_objective_progress_id"),
        UniqueConstraint("enrollment_id", "node_uuid", "objective_progress_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    source_uuid: str = Field(index=True)
    enrollment_id: int = Field(sa_column=Column(Integer, ForeignKey("requirementenrollment.id", ondelete="CASCADE"), index=True))
    node_uuid: str = Field(index=True)
    plan_objective_progress_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("planobjectiveprogress.id", ondelete="CASCADE"), nullable=True, index=True))
    objective_progress_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("objectiveprogress.id", ondelete="CASCADE"), nullable=True, index=True))
    objective_title: str = ""
    evidence_snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    verified_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    verified_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    revoked_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True, index=True))
    creation_date: str = ""
    update_date: str = ""


class RequirementNodeInput(SQLModel):
    node_uuid: str | None = None
    parent_node_uuid: str | None = None
    code: str = ""
    title: str
    description: str = ""
    position: int = 0
    metadata_json: dict = Field(default_factory=dict, alias="metadata")


class RequirementFrameworkCreate(SQLModel):
    org_id: int
    name: str
    description: str = ""
    source_framework_uuid: str | None = None
    source_version: int | None = None
    source_metadata: dict = Field(default_factory=dict)
    nodes: list[RequirementNodeInput] = Field(default_factory=list)


class RequirementFrameworkUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    source_metadata: dict | None = None
    nodes: list[RequirementNodeInput] | None = None


class RequirementAssignmentCreate(SQLModel):
    user_id: int | None = None
    usergroup_id: int | None = None


class RequirementEnrollmentMigrate(SQLModel):
    enrollment_uuids: list[str] | None = None


class RequirementMappingUpdate(SQLModel):
    node_uuids: list[str] = Field(default_factory=list)
