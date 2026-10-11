"""Requirement Framework Document v1: one requirement framework (its working version) as JSON."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DOCUMENT_FORMAT = "launch-lms.requirement-framework"
DOCUMENT_FORMAT_VERSION = 1
MAX_NODES = 2000
GUIDE_PATH = Path(__file__).with_name("authoring_guide.md")

CodeStyle = Literal["upper_alpha", "lower_alpha", "decimal", "upper_roman", "lower_roman"]


class RequirementMetadataField(BaseModel):
    model_config = ConfigDict(extra="allow")

    field_uuid: str | None = Field(default=None, description="Keep it for existing fields; omit it for new ones.")
    name: str = Field(min_length=1, max_length=200)
    type: str = "text"
    required: bool = False


class RequirementLevel(BaseModel):
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
    code: str = Field(default="", description="Ignored when the framework has levels: codes are numbered from the hierarchy.")
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    metadata: dict = Field(default_factory=dict, description="Values for the node's level metadata fields, keyed by field_uuid.")


class RequirementFrameworkMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    levels: list[RequirementLevel] = Field(default_factory=list, description="Hierarchy levels from the top down. Empty: a flat list with hand-written codes.")


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
