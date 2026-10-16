"""The goal template document: a whole template as one JSON document.

Templates are stored as this document (the draft on ``goal_template``, each
published version on ``goal_template_version``), edited in one piece by the
admin editor and the connector, and validated here through the step registry.
Stages and steps carry stable ``key`` values so versions, assignments and
issued goals can refer back to them.
"""

from __future__ import annotations

from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlmodel import Session

from src.db.goal_sharing import ALL_CAPABILITIES, DEFAULT_ROLE_DEFINITIONS
from src.services.goals.types import step_type

DOCUMENT_FORMAT = "launch-lms.goal-template"
DOCUMENT_FORMAT_VERSION = 1
MAX_STAGES = 50
MAX_STEPS = 300


class TemplateStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str | None = Field(default=None, description="Keep it for existing steps; omit it for new ones.")
    type: str = Field(description="One of the step types: task, upload, write, activity, event, badge, portfolio, decision.")
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    config: dict = Field(default_factory=dict, description="The type's settings.")
    materials: list[dict] = Field(default_factory=list)
    completed_by: Literal["learner", "staff"] = "learner"
    review_required: bool = Field(default=False, description="Learner steps only: staff approve it before it counts as done.")
    reviewer_guidance: str = Field(default="", max_length=4000)
    after: list[str] = Field(default_factory=list, description="Keys of steps that must be finished before this one opens.")
    due_week: int | None = Field(default=None, ge=1, description="Week within the stage it is due; needs the stage's duration_weeks.")
    allow_late: bool = False
    requirement_node_uuids: list[str] = Field(default_factory=list)


class TemplateStage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    timing: str = Field(default="", max_length=120, description="Rough timing shown when there are no dates.")
    milestone: str = Field(default="", max_length=200, description="What reaching the end of the stage looks like.")
    duration_weeks: int | None = Field(default=None, ge=1)
    steps: list[TemplateStep] = Field(default_factory=list)


class TemplateRole(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=60)
    name: str = ""
    capabilities: list[str] = Field(default_factory=list)
    grantable_role_keys: list[str] = Field(default_factory=list)


class TemplateRoles(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definitions: list[TemplateRole]
    subject_role_key: str = "subject"
    staff_role_key: str = "reviewer"


class TemplateMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    instructions: str = Field(default="", description="Shown to staff when they assign the template.")
    step_order: Literal["any", "in_order", "by_stage"] = "any"


class GoalTemplateDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["launch-lms.goal-template"] = DOCUMENT_FORMAT
    format_version: Literal[1] = DOCUMENT_FORMAT_VERSION
    template: TemplateMeta
    roles: TemplateRoles | None = None
    stages: list[TemplateStage] = Field(min_length=1, max_length=MAX_STAGES)


def default_roles() -> dict:
    return TemplateRoles(definitions=[TemplateRole(**item) for item in DEFAULT_ROLE_DEFINITIONS]).model_dump()


def empty_document(title: str, description: str = "") -> dict:
    return {
        "format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"title": title, "description": description, "instructions": "", "step_order": "any"},
        "roles": default_roles(), "stages": [{"key": _key("stage"), "title": "Stage 1", "description": "", "timing": "", "steps": []}],
    }


def _key(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def json_schema() -> dict:
    return GoalTemplateDocument.model_json_schema()


def iter_steps(document: dict):
    for stage in document.get("stages") or []:
        for step in stage.get("steps") or []:
            yield stage, step


def validate_document(db: Session, raw: dict, org_id: int | None, *, requirement_nodes: set[str] | None = None) -> dict:
    """The document normalized: keys filled in, every step's config checked by its type.

    ``requirement_nodes`` is the set of node uuids steps may link to (None skips the check).
    """
    try:
        parsed = GoalTemplateDocument.model_validate(raw)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first.get("loc", ()))
        raise HTTPException(status_code=422, detail=f"{where}: {first.get('msg')}") from error
    document = parsed.model_dump()
    document["roles"] = document.get("roles") or default_roles()
    _validate_roles(document["roles"])

    stage_keys: set[str] = set()
    step_keys: set[str] = set()
    count = 0
    for stage in document["stages"]:
        stage["key"] = stage.get("key") or _key("stage")
        if stage["key"] in stage_keys:
            raise HTTPException(status_code=422, detail=f"Two stages share the key {stage['key']}")
        stage_keys.add(stage["key"])
        for step in stage["steps"]:
            count += 1
            step["key"] = step.get("key") or _key("step")
            if step["key"] in step_keys:
                raise HTTPException(status_code=422, detail=f"Two steps share the key {step['key']}")
            step_keys.add(step["key"])
    if count > MAX_STEPS:
        raise HTTPException(status_code=422, detail=f"A template can have at most {MAX_STEPS} steps")

    for stage, step in iter_steps(document):
        kind = step_type(step["type"])
        step["config"] = kind.validate_config(step["config"])
        kind.resolve(db, step["config"], org_id)
        if step["completed_by"] == "staff" and step["review_required"]:
            raise HTTPException(status_code=422, detail=f"{step['title']}: staff steps aren't reviewed; turn off review_required")
        if not kind.learner_can_complete and step["completed_by"] == "staff":
            raise HTTPException(status_code=422, detail=f"{step['title']}: {kind.label} steps finish on their own")
        step["after"] = list(dict.fromkeys(key for key in step["after"] if key != step["key"]))
        unknown = [key for key in step["after"] if key not in step_keys]
        if unknown:
            raise HTTPException(status_code=422, detail=f"{step['title']}: waits on a step that isn't in this template")
        if step["due_week"] and not stage.get("duration_weeks"):
            raise HTTPException(status_code=422, detail=f"{step['title']}: due_week needs the stage's duration_weeks")
        if step["due_week"] and stage.get("duration_weeks") and step["due_week"] > stage["duration_weeks"]:
            raise HTTPException(status_code=422, detail=f"{step['title']}: due_week is past the end of its stage")
        step["requirement_node_uuids"] = list(dict.fromkeys(step["requirement_node_uuids"]))
        if requirement_nodes is not None:
            missing = [node for node in step["requirement_node_uuids"] if node not in requirement_nodes]
            if missing:
                raise HTTPException(status_code=422, detail=f"{step['title']}: unknown requirement {missing[0]}")
    return document


def _validate_roles(roles: dict) -> None:
    keys = [item["key"] for item in roles["definitions"]]
    if len(keys) != len(set(keys)):
        raise HTTPException(status_code=422, detail="Role keys must be unique")
    for item in roles["definitions"]:
        unknown = set(item["capabilities"]) - ALL_CAPABILITIES
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown capabilities: {', '.join(sorted(unknown))}")
        if set(item["grantable_role_keys"]) - set(keys):
            raise HTTPException(status_code=422, detail="A grantable role does not exist")
    for key in (roles["subject_role_key"], roles["staff_role_key"]):
        if key not in keys:
            raise HTTPException(status_code=422, detail=f"Role {key} is not defined")
