"""Activity Document v1: the canonical, lossless JSON form of one learning activity.

The same document is used for single-activity export/import, the document API,
the Claude connector, and preview sessions.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.services.learning_content.models import Flow, StandardPageContent, VideoPageContent

DOCUMENT_FORMAT = "launch-lms.activity"
DOCUMENT_FORMAT_VERSION = 1
MAX_PAGES = 300
GUIDE_PATH = Path(__file__).with_name("authoring_guide.md")
NEW_PAGE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"

# Settings keys owned by the platform. They are hidden from documents and kept
# from the stored activity on save, so a document can never forge them.
HIDDEN_SETTINGS_KEYS = frozenset({"version_lineage_uuid", "system_required"})
HIDDEN_CONTENT_KEYS = frozenset({"version_lineage_uuid"})


class ActivityDocumentPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page_uuid: str = Field(
        min_length=1,
        max_length=80,
        description=(
            "Existing pages keep their `learning_page_…` uuid. New pages use a short "
            "placeholder id (letters, digits, `_`, `-`, e.g. `new-reflection`) that may be "
            "referenced elsewhere in the document; it is replaced by a real uuid on save."
        ),
    )
    page_type: Literal["standard", "video"] = "standard"
    title: str = Field(min_length=1, max_length=200)
    required: bool = True
    content: dict[str, Any] = Field(default_factory=dict)
    design: dict[str, Any] = Field(default_factory=dict)


class ActivityDocumentActivity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity_uuid: str | None = Field(
        default=None,
        description="Identity of the stored activity. Read-only; omit when creating.",
    )
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    icon: str | None = None
    thumbnail_image: str = ""
    required: bool = True
    settings: dict[str, Any] = Field(
        default_factory=dict,
        description="Activity settings: `flow` (branching graph), `grading`, `outcomes`, …",
    )


class ActivityDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["launch-lms.activity"] = DOCUMENT_FORMAT
    format_version: Literal[1] = DOCUMENT_FORMAT_VERSION
    activity: ActivityDocumentActivity
    pages: list[ActivityDocumentPage] = Field(min_length=1, max_length=MAX_PAGES)


class DocumentIssue(BaseModel):
    path: str
    message: str


class ActivityDocumentSave(BaseModel):
    document: ActivityDocument
    base_etag: str = Field(
        min_length=1,
        description="The etag returned when the document was read. Saves against a stale etag fail with 409.",
    )


class ActivityDocumentCreate(BaseModel):
    badge_uuid: str
    version_uuid: str | None = Field(
        default=None, description="Draft version to add to; defaults to the badge's newest draft."
    )
    document: ActivityDocument


def _inline(model: type[BaseModel], defs: dict) -> dict:
    schema = model.model_json_schema(ref_template="#/$defs/{model}")
    defs.update(schema.pop("$defs", {}))
    return schema


def activity_document_json_schema() -> dict:
    """The published schema; block, content and flow shapes come from the
    typed models in ``learning_content`` that also validate saves."""
    schema = ActivityDocument.model_json_schema()
    defs = schema.setdefault("$defs", {})
    defs["StandardPageContent"] = _inline(StandardPageContent, defs)
    defs["VideoPageContent"] = _inline(VideoPageContent, defs)
    defs["Flow"] = _inline(Flow, defs)
    page = defs["ActivityDocumentPage"]["properties"]
    page["content"] = {
        "description": "StandardPageContent for standard pages, VideoPageContent for video pages.",
        "anyOf": [{"$ref": "#/$defs/StandardPageContent"}, {"$ref": "#/$defs/VideoPageContent"}],
    }
    settings = defs["ActivityDocumentActivity"]["properties"]["settings"]
    settings["properties"] = {
        "flow": {"$ref": "#/$defs/Flow"},
        "grading": {
            "type": "object",
            "properties": {
                "minimum_score_percent": {"type": "number"},
                "success_message": {"type": "string"},
                "failure_message": {"type": "string"},
            },
        },
    }
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://launch-lms.dev/schemas/activity-document-v1.json"
    schema["title"] = "Launch LMS Activity Document v1"
    return schema


def authoring_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")
