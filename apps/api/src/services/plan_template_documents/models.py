"""Plan Template Document v1: the whole of one plan template as JSON.

Used by the Claude connector to read, validate, save and create plan templates
in one piece, the same way Activity Documents are used for badge activities.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.db.programs import ObjectiveDueRule, ObjectiveStartRule

DOCUMENT_FORMAT = "launch-lms.plan-template"
DOCUMENT_FORMAT_VERSION = 1
MAX_PHASES = 50
MAX_OBJECTIVES = 300
GUIDE_PATH = Path(__file__).with_name("authoring_guide.md")


class PlanTemplateStep(BaseModel):
    # Steps are stored as-is, so keys the editor adds (e.g. a badge display copy) survive a round trip.
    model_config = ConfigDict(extra="allow")

    field_uuid: str | None = Field(default=None, description="Keep it for existing steps; omit it for new ones.")
    title: str = Field(min_length=1, max_length=300)
    type: Literal["text", "media", "link", "checkbox", "badge"] = "text"
    restricted: bool = Field(default=False, description="true: a reviewer fills this step in. false: the learner does.")
    allowed_types: list[Literal["image", "video", "document"]] | None = Field(default=None, description="Media steps only.")
    badge_uuid: str | None = Field(default=None, description="Badge steps only: the badge the learner must earn.")
    accept_previous_major_versions: bool | None = Field(default=None, description="Badge steps only.")


class PlanTemplateSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_rule: ObjectiveStartRule = ObjectiveStartRule.ANY_TIME
    due_rule: ObjectiveDueRule = ObjectiveDueRule.PHASE_END
    allow_late: bool = False
    suggested_due_week: int | None = Field(default=None, ge=1, description="Week within the phase; needs the phase's suggested_duration_weeks.")


class PlanTemplateObjective(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objective_uuid: str | None = Field(default=None, description="Keep it for existing objectives; omit it for new ones.")
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    badge_uuid: str | None = Field(
        default=None,
        description="Badge objectives: the badge the learner earns to complete it. Set only when adding an objective; it cannot change later.",
    )
    badge_major_version: int | None = Field(default=None, description="Read-only: the badge major version this objective accepts.")
    allow_learner_confirmation: bool = Field(default=False, description="Learners may mark it complete themselves (new badge objectives always allow it).")
    steps: list[PlanTemplateStep] = Field(default_factory=list)
    schedule: PlanTemplateSchedule = Field(default_factory=PlanTemplateSchedule)
    requirement_node_uuids: list[str] = Field(default_factory=list, description="Requirement framework nodes this objective counts toward.")


class PlanTemplatePhase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase_uuid: str | None = Field(default=None, description="Keep it for existing phases; omit it for new ones.")
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    suggested_duration_weeks: int | None = Field(default=None, ge=1)
    objectives: list[PlanTemplateObjective] = Field(default_factory=list)


class PlanTemplateRole(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=60)
    name: str = ""
    capabilities: list[str] = Field(default_factory=list)
    grantable_role_keys: list[str] = Field(default_factory=list)


class PlanTemplateRoles(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definitions: list[PlanTemplateRole]
    default_subject_role_key: str = "subject"
    default_staff_role_key: str = "reviewer"


class PlanTemplateMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    instructions: str = Field(default="", description="Default instructions shown to staff when they assign the template.")


class PlanTemplateDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["launch-lms.plan-template"] = DOCUMENT_FORMAT
    format_version: Literal[1] = DOCUMENT_FORMAT_VERSION
    template: PlanTemplateMeta
    roles: PlanTemplateRoles | None = Field(default=None, description="Omit to keep the template's roles (or use the defaults when creating).")
    phases: list[PlanTemplatePhase] = Field(min_length=1, max_length=MAX_PHASES)


def plan_template_json_schema() -> dict:
    return PlanTemplateDocument.model_json_schema()


def authoring_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")
