"""Activity Document v1: the canonical, lossless JSON form of one learning activity.

The same document is used for single-activity export/import, the document API,
the Claude connector, and preview sessions.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DOCUMENT_FORMAT = "launch-lms.activity"
DOCUMENT_FORMAT_VERSION = 1
MAX_PAGES = 300
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
    scoring: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)


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


_BINDING = {
    "type": "object",
    "required": ["source", "path"],
    "properties": {
        "source": {"enum": ["answer", "variable"]},
        "path": {"type": "string", "pattern": r"^[A-Za-z0-9_.-]*$"},
        "fallback": {"type": "string"},
        "fallback_binding": {"$ref": "#/$defs/DisplayBinding"},
    },
}

_BLOCK_DESIGN = {
    "type": "object",
    "properties": {
        "width": {"type": "number", "minimum": 0, "maximum": 100},
        "align": {"enum": ["left", "center", "right"]},
        "height": {"type": "number"},
        "fit": {"enum": ["contain", "cover"]},
        "text_color": {"type": "string"},
        "shape": {"enum": ["rounded", "circle"]},
        "variant": {"enum": ["primary", "secondary"]},
        "group": {"type": "string"},
    },
}


def _block(type_name: str, content: dict, extra: dict | None = None) -> dict:
    properties = {
        "id": {"type": "string", "minLength": 1, "description": "Unique within the page."},
        "type": {"const": type_name},
        "design": {"$ref": "#/$defs/BlockDesign"},
        "content": content,
        **(extra or {}),
    }
    return {"type": "object", "required": ["id", "type"], "properties": properties}


_BLOCK_DEFS = {
    "DisplayBinding": _BINDING,
    "BlockDesign": _BLOCK_DESIGN,
    "TextBlock": _block(
        "text",
        {
            "type": "object",
            "description": "Tiptap/ProseMirror JSON. `nodes` is the list of top-level nodes (paragraph, heading, bulletList, …); `displayBinding` inline nodes insert answers or variables.",
            "properties": {"nodes": {"type": "array"}, "node": {"type": "object"}},
        },
    ),
    "ImageBlock": _block(
        "image",
        {
            "type": "object",
            "properties": {
                "src": {"type": "string"},
                "alt": {"type": "string"},
                "binding": {"$ref": "#/$defs/DisplayBinding"},
            },
        },
    ),
    "ButtonBlock": _block(
        "button",
        {
            "type": "object",
            "properties": {
                "label": {"type": "string"},
                "destination_page_uuid": {
                    "type": "string",
                    "description": "A page in this activity (uuid or new-page placeholder).",
                },
            },
        },
    ),
    "QuestionBlock": _block(
        "question",
        {
            "type": "object",
            "description": "multiple_choice / categorized_multi_select: `options: [{id, text}]` (+ `label`, `categories: [{id, label, option_ids}]`). text_input: `inputs: [{id, label, placeholder, variant: short_answer|long_answer, input_type: text|number|email|url|tel}]`. image_upload: `label`.",
        },
        {
            "kind": {"enum": ["multiple_choice", "categorized_multi_select", "text_input", "image_upload"]},
            "scoring": {
                "type": "object",
                "description": "Choice questions are scored {mode: points, points, score_policy: select_all, correct_option_ids} or a survey {mode: off, points: 0} (with completion.question_mode 'variable'). Text: mode completion|manual|accepted_answers (+ accepted_answers, rubric). Image upload: mode manual.",
            },
            "completion": {
                "type": "object",
                "description": "min_selections / max_selections for choices; `inputs: {<input id>: {required, min_words, max_words, points}}` for text; `required` for image upload.",
            },
        },
    ),
    "PortfolioPreviewBlock": _block(
        "portfolio_preview",
        {"type": "object", "description": "Restricted to trusted system activities."},
    ),
}

_BLOCKS = {
    "type": "array",
    "items": {
        "oneOf": [
            {"$ref": f"#/$defs/{name}"}
            for name in ("TextBlock", "ImageBlock", "ButtonBlock", "QuestionBlock", "PortfolioPreviewBlock")
        ]
    },
}

_STANDARD_CONTENT = {
    "type": "object",
    "description": "Standard page content (version 2). Video pages use {video_url, heading, allow_scrubbing} instead.",
    "properties": {
        "version": {"const": 2},
        "blocks": _BLOCKS,
        "action_label": {"type": "string", "description": "Label for the page's continue button."},
        "variants": {
            "type": "object",
            "description": "Response variants: show different blocks depending on an earlier question's answer. Pages with variants cannot contain a question.",
            "properties": {
                "source": {
                    "type": "object",
                    "properties": {"page_uuid": {"type": "string"}, "block_id": {"type": "string"}},
                },
                "overrides": {
                    "type": "object",
                    "description": "Keyed by option id, `correct` or `incorrect`.",
                    "additionalProperties": {"type": "object", "properties": {"blocks": _BLOCKS}},
                },
            },
        },
    },
}

_FLOW = {
    "type": "object",
    "description": "Optional branching graph. Without it pages run in order. Must be acyclic with exactly one `complete` node; every required page must be in it; a node with several outgoing edges needs exactly one edge without a condition (the default) and distinct priorities (higher wins).",
    "required": ["version", "entry", "nodes", "edges"],
    "properties": {
        "version": {"const": 1},
        "entry": {"type": "string"},
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "type"],
                "properties": {
                    "id": {"type": "string"},
                    "type": {"enum": ["page", "split", "join", "complete"]},
                    "page_uuid": {"type": "string"},
                },
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["from", "to"],
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "priority": {"type": "integer"},
                    "condition": {"$ref": "#/$defs/FlowCondition"},
                },
            },
        },
    },
}

_CONDITION = {
    "type": "object",
    "description": "{op: and|or, conditions: […]}, {op: not, condition}, or a comparison {op: eq|ne|gt|gte|lt|lte|in|contains|exists, left: {source: answer|variable|fact|context, key}, right}. Answer keys start with the page uuid, e.g. `<page>.result.option_ids` or `<page>.result.questions.<block>.inputs.<input>.text`.",
}


def activity_document_json_schema() -> dict:
    schema = ActivityDocument.model_json_schema()
    defs = schema.setdefault("$defs", {})
    defs.update(_BLOCK_DEFS)
    defs["FlowCondition"] = _CONDITION
    defs["Flow"] = _FLOW
    defs["StandardPageContent"] = _STANDARD_CONTENT
    page = defs["ActivityDocumentPage"]["properties"]
    page["content"] = {"$ref": "#/$defs/StandardPageContent"}
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
