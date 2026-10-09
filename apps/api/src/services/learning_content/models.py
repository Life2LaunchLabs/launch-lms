"""Typed models for learning page content and activity flows.

These are the single source for the shape of standard-page content and the
branching flow: the page API and Activity Documents validate with them, the
published JSON Schema is generated from them, and the web app's TypeScript
types are generated from that schema (see ``typescript.py``). Semantic rules
that need more than one page (flow reachability, button targets, condition
order) stay in ``learning_flow`` and the document validator.

Stored content is kept as plain dicts; these models validate it but are never
dumped back, so unknown-but-harmless keys inside open objects survive.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

STRICT = ConfigDict(extra="forbid")
OPEN = ConfigDict(extra="allow")
BINDING_PATH = r"^[A-Za-z0-9_.-]*$"
PORTFOLIO_PREVIEW_VARIANTS = (
    "timeline_card",
    "project_card",
    "identity_header",
    "traits_panel",
    "links_strip",
    "portfolio_frame",
    "share_panel",
)


class DisplayBinding(BaseModel):
    """Shows a learner's earlier answer or a profile variable in place."""

    model_config = STRICT

    source: Literal["answer", "variable"]
    path: str = Field(default="", pattern=BINDING_PATH, description="Answer path (`<page>.result…`) or variable key. May be empty while drafting.")
    fallback: str | None = None
    fallback_binding: DisplayBinding | None = None

    @model_validator(mode="before")
    @classmethod
    def _source_and_path(cls, value: Any) -> Any:
        if isinstance(value, dict) and (
            value.get("source") not in ("answer", "variable") or not re.fullmatch(BINDING_PATH, str(value.get("path") or ""))
        ):
            raise ValueError("Display binding uses an unsupported source or path")
        return value


class BlockDesign(BaseModel):
    model_config = STRICT

    width: float | None = Field(default=None, ge=0, le=100)
    align: Literal["left", "center", "right"] | None = None
    height: float | None = None
    fit: Literal["contain", "cover"] | None = None
    text_color: str | None = None
    shape: Literal["rounded", "circle"] | None = None
    variant: Literal["primary", "secondary"] | None = None
    group: str | None = Field(default=None, description="Buttons sharing a group render side by side.")


class BlockSystem(BaseModel):
    """Set by the platform on system activities; not editable by admins."""

    model_config = STRICT

    locked: bool | None = None
    reason: str | None = None


class _Block(BaseModel):
    model_config = STRICT

    id: str = Field(min_length=1, description="Unique within the page.")
    design: BlockDesign | None = None
    system: BlockSystem | None = None


def _walk_bindings(nodes: Any) -> None:
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "displayBinding":
            DisplayBinding.model_validate((node.get("attrs") or {}).get("binding") or {})
        _walk_bindings(node.get("content"))


class TextContent(BaseModel):
    """Tiptap/ProseMirror JSON. ``nodes`` is the list of top-level nodes
    (paragraph, heading, bulletList, …); inline ``displayBinding`` nodes insert
    answers or variables."""

    model_config = OPEN

    nodes: list[dict[str, Any]] | None = None
    node: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _bindings(self) -> TextContent:
        _walk_bindings(self.nodes or [self.node])
        return self


class TextBlock(_Block):
    type: Literal["text"]
    content: TextContent | None = None


class ImageContent(BaseModel):
    model_config = OPEN

    src: str | None = None
    alt: str | None = None
    binding: DisplayBinding | None = None


class ImageBlock(_Block):
    type: Literal["image"]
    content: ImageContent | None = None


class ButtonContent(BaseModel):
    """``continue`` completes the page (the flow can route on
    ``<page_uuid>.button``); ``revisit`` jumps back to an earlier page."""

    model_config = STRICT

    label: str | None = None
    action: Literal["continue", "revisit"] = "continue"
    revisit_page_uuid: str | None = Field(default=None, description="revisit only: an earlier page on the route (uuid or new-page placeholder).")

    @model_validator(mode="before")
    @classmethod
    def _routing(cls, value: Any) -> Any:
        if isinstance(value, dict):
            if "destination_page_uuid" in value:
                raise ValueError("Route buttons with flow edges on '<page>.button'; destination_page_uuid is no longer supported")
            if value.get("action", "continue") not in ("continue", "revisit") or (value.get("action") == "revisit" and not value.get("revisit_page_uuid")):
                raise ValueError("Buttons either continue along the flow or revisit an earlier page")
        return value


class ButtonBlock(_Block):
    type: Literal["button"]
    content: ButtonContent | None = None


class ChoiceOption(BaseModel):
    model_config = OPEN

    id: str = Field(min_length=1)
    text: str = ""
    category: str | None = None


class TextInputField(BaseModel):
    model_config = OPEN

    id: str = Field(min_length=1)
    label: str | None = None
    placeholder: str | None = None
    variant: Literal["short_answer", "long_answer", "single_line"] | None = None
    input_type: Literal["text", "number", "email", "url", "tel", "month", "select"] | None = None
    section_id: str | None = None
    width: Literal["full", "half"] | None = None
    height: float | None = None


class QuestionContent(BaseModel):
    """Choice kinds use ``options`` (+ ``categories`` for categorized
    selection); ``text_input`` uses ``inputs``; ``image_upload`` only a label."""

    model_config = OPEN

    label: str | None = None
    options: list[ChoiceOption] | None = None
    categories: list[dict[str, Any]] | None = None
    inputs: list[TextInputField] | None = None


class QuestionScoring(BaseModel):
    """Choices: ``{mode: points, points, score_policy: select_all,
    correct_option_ids}`` or a survey ``{mode: off, points: 0}``. Text:
    ``completion | manual | accepted_answers`` (+ ``accepted_answers``,
    ``rubric``). Image upload: ``manual``."""

    model_config = OPEN

    mode: Literal["points", "off", "completion", "manual", "accepted_answers"] | None = None
    points: float | None = Field(default=None, ge=0)
    score_policy: str | None = None
    correct_option_ids: list[str] | None = None
    accepted_answers: list[str] | None = None
    rubric: str | None = None


class QuestionCompletion(BaseModel):
    """``min_selections``/``max_selections`` for choices; ``inputs`` keyed by
    input id for text; ``required`` for image upload. ``variable_bindings``
    copy answers into learner variables."""

    model_config = OPEN

    required: bool | None = None
    min_selections: int | None = Field(default=None, ge=0)
    max_selections: int | None = Field(default=None, ge=0)
    question_mode: str | None = None
    inputs: dict[str, dict[str, Any]] | None = None
    variable_bindings: dict[str, Any] | None = None


class QuestionBlock(_Block):
    type: Literal["question"]
    kind: Literal["multiple_choice", "categorized_multi_select", "text_input", "image_upload"]
    content: QuestionContent | None = None
    scoring: QuestionScoring | None = None
    completion: QuestionCompletion | None = None


class PortfolioPreviewContent(BaseModel):
    """Restricted to trusted system activities."""

    model_config = STRICT

    variant: Literal[PORTFOLIO_PREVIEW_VARIANTS]  # type: ignore[valid-type]
    bindings: dict[str, DisplayBinding] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _variant(cls, value: Any) -> Any:
        if isinstance(value, dict) and value.get("variant") not in PORTFOLIO_PREVIEW_VARIANTS:
            raise ValueError("Unsupported portfolio preview variant")
        return value


class PortfolioPreviewBlock(_Block):
    type: Literal["portfolio_preview"]
    content: PortfolioPreviewContent


Block = Annotated[
    Union[TextBlock, ImageBlock, ButtonBlock, QuestionBlock, PortfolioPreviewBlock],
    Field(discriminator="type"),
]


class VariantSource(BaseModel):
    model_config = OPEN

    page_uuid: str | None = None
    block_id: str | None = None


class VariantOverride(BaseModel):
    model_config = OPEN

    blocks: list[Block] = Field(default_factory=list)


class PageVariants(BaseModel):
    """Show different blocks depending on an earlier question's answer."""

    model_config = OPEN

    source: VariantSource | None = None
    overrides: dict[str, VariantOverride] = Field(default_factory=dict, description="Keyed by option id, `correct` or `incorrect`.")


class StandardPageContent(BaseModel):
    """Standard page content (version 2)."""

    model_config = OPEN

    version: Literal[2] = 2
    blocks: list[Block] = Field(default_factory=list)
    action_label: str | None = Field(default=None, description="Label for the page's continue action.")
    variants: PageVariants | None = None

    @model_validator(mode="after")
    def _page_rules(self) -> StandardPageContent:
        stacks = [self.blocks, *(override.blocks for override in (self.variants.overrides.values() if self.variants else []))]
        seen: set[str] = set()
        for block in (block for stack in stacks for block in stack):
            if block.id in seen:
                raise ValueError("Block ids must be unique within a page")
            seen.add(block.id)
        if self.variants is not None:
            if any(block.type == "question" for stack in stacks for block in stack):
                raise ValueError("Pages with variants cannot contain a question block")
            if self.variants.overrides and not (self.variants.source and self.variants.source.page_uuid):
                raise ValueError("Variants need a source question page")
        return self


class VideoPageContent(BaseModel):
    model_config = OPEN

    video_url: str | None = None
    heading: str | None = None
    allow_scrubbing: bool | None = None


# Flow -----------------------------------------------------------------------

class ConditionOperand(BaseModel):
    model_config = STRICT

    source: Literal["answer", "variable", "fact", "context"]
    key: str = Field(description="Answer keys start with the page uuid, e.g. `<page>.result.option_ids`, `<page>.result.questions.<block>.inputs.<input>.text` or `<page>.button`.")


class Comparison(BaseModel):
    model_config = STRICT

    op: Literal["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "exists"]
    left: ConditionOperand
    right: Any = None


class AllOf(BaseModel):
    model_config = STRICT

    op: Literal["and", "or"]
    conditions: list[Condition]


class Negation(BaseModel):
    model_config = STRICT

    op: Literal["not"]
    condition: Condition


Condition = Annotated[Union[Comparison, AllOf, Negation], Field(union_mode="left_to_right")]


class FlowNode(BaseModel):
    model_config = STRICT

    id: str = Field(min_length=1)
    type: Literal["page", "split", "join", "complete"]
    page_uuid: str | None = None


class FlowEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    priority: int = 0
    condition: Condition | None = None
    merge: bool | None = Field(default=None, description="Editor hint: the edge rejoins a branch.")
    order: int | None = Field(default=None, description="Editor hint: branch display order.")


class Flow(BaseModel):
    """Optional branching graph. Without it pages run in order. Must be
    acyclic with exactly one ``complete`` node; a node with several outgoing
    edges needs exactly one edge without a condition (the default) and
    distinct priorities (higher wins)."""

    model_config = STRICT

    version: Literal[1] = 1
    entry: str
    nodes: list[FlowNode]
    edges: list[FlowEdge]


def content_error(model: type[BaseModel], value: Any) -> str | None:
    """Validate ``value`` and return a short, human message for the first error."""
    try:
        model.model_validate(value)
    except ValidationError as error:
        first = error.errors()[0]
        message = str(first.get("msg") or "Invalid content").removeprefix("Value error, ")
        if first.get("type") == "value_error":
            return message
        location = ".".join(str(part) for part in first.get("loc") or ())
        return f"{location}: {message}" if location else message
    return None
