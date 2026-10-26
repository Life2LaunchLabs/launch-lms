"""Requirement Framework Document v1: one requirement framework (its working version) as JSON.

Structure has no levels: the framework says how its top-level categories are numbered, each node with children says how
they are numbered and when it is met, and fields are defined once. `framework.levels` (the old shape) is still accepted
and turned into numbering and fields on save.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DOCUMENT_FORMAT = "launch-lms.requirement-framework"
DOCUMENT_FORMAT_VERSION = 1
MAX_NODES = 2000
GUIDE_PATH = Path(__file__).with_name("authoring_guide.md")

CodeStyle = Literal["upper_alpha", "lower_alpha", "decimal", "upper_roman", "lower_roman"]
Numbering = Literal["upper_alpha", "lower_alpha", "decimal", "upper_roman", "lower_roman", "custom", "none"]


class RequirementField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_uuid: str | None = Field(default=None, description="Keep it for existing fields; omit it for new ones.")
    name: str = Field(min_length=1, max_length=200)
    type: Literal["text", "number", "link", "date", "boolean"] = "text"
    applies: Literal["all", "groups", "requirements"] = Field(default="all", description="Which nodes carry it: every node, nodes with children, or requirements (leaves).")
    required: bool = False


class RequirementRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["all", "any"] = "all"
    count: int | None = Field(default=None, ge=1, description="For `any`: how many of the node's children must be met.")


class RequirementMetadataField(BaseModel):
    model_config = ConfigDict(extra="allow")

    field_uuid: str | None = Field(default=None, description="Keep it for existing fields; omit it for new ones.")
    name: str = Field(min_length=1, max_length=200)
    type: str = "text"
    required: bool = False


class RequirementLevel(BaseModel):
    """Deprecated: one numbering per depth. Accepted on input and turned into numbering and fields."""

    model_config = ConfigDict(extra="allow")

    level_uuid: str | None = Field(default=None, description="Keep it for existing levels; omit it for new ones.")
    name: str = Field(min_length=1, max_length=200)
    code_style: CodeStyle | None = Field(default=None, description="How sibling codes are numbered at this depth. Defaults by depth.")
    metadata_fields: list[RequirementMetadataField] = Field(default_factory=list)


class RequirementNodeDoc(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_uuid: str | None = Field(
        default=None,
        description="Keep it for existing nodes. New nodes omit it, or use a short placeholder (e.g. `new-communication`) that children reference in parent_node_uuid; it is replaced on save.",
    )
    parent_node_uuid: str | None = None
    code: str = Field(default="", description="Used when the parent's numbering (the framework's, for top-level nodes) is `custom`; otherwise generated.")
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    numbering: Numbering | None = Field(default=None, description="How this node's children are numbered. Default `custom`: each child keeps its own code.")
    rule: RequirementRule | None = Field(default=None, description="When a node with children is met. Default: all of them.")
    metadata: dict = Field(default_factory=dict, description="Values for the framework's fields, keyed by field_uuid.")


class RequirementFrameworkMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    numbering: Numbering = Field(default="custom", description="How the top-level categories are numbered. `custom`: each keeps its own code (e.g. SB3, CCL).")
    fields: list[RequirementField] = Field(default_factory=list, description="Extra values nodes record in `metadata`, keyed by field_uuid.")
    levels: list[RequirementLevel] = Field(default_factory=list, description="Deprecated. Old per-depth numbering; turned into numbering and fields on save. Leave empty.")


class RequirementFrameworkDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["launch-lms.requirement-framework"] = DOCUMENT_FORMAT
    format_version: Literal[1] = DOCUMENT_FORMAT_VERSION
    framework: RequirementFrameworkMeta
    nodes: list[RequirementNodeDoc] = Field(default_factory=list, max_length=MAX_NODES, description="Every node, parents before or after children; siblings keep document order.")


def requirement_framework_json_schema() -> dict:
    return RequirementFrameworkDocument.model_json_schema()


def authoring_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")
