"""Typed models for learning page content, activity sequences and (older) flows.

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

from src.services.learning_content.activity_models import (  # noqa: F401  re-exported
    ConditionOperand,
    Comparison,
    AllOf,
    Negation,
    Condition,
    FlowNode,
    FlowEdge,
    Flow,
    SequencePage,
    BranchPath,
    SequenceBranch,
    SequenceItem,
    Sequence,
    TRANSITIONS,
    PageDesign,
    ActivityDesign,
    CaptionPosition,
    CaptionChunk,
    VideoCaptions,
    VideoPageContent,
)

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
    entrance: Literal["rise", "fade", "none"] | None = Field(default=None, description="How the block enters; blocks rise in, staggered in page order, by default.")
    placement: Literal["inline", "footer"] | None = Field(default=None, description="Continue buttons only: `footer` draws the button beside Continue as a secondary action.")
    style: Literal["list", "pills", "scale", "cards"] | None = Field(default=None, description="Choice questions only: how options are drawn. Cards show each option's `icon` and `description`.")
    motion: Literal["rise", "fade", "pop", "slide_left", "slide_right", "zoom", "none"] | None = Field(default=None, description="Version 3: how the block comes in. Replaces `entrance`; blocks rise in, staggered in page order, by default.")
    motion_delay: float | None = Field(default=None, ge=0, le=10, description="Version 3: seconds to wait before the block comes in.")


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
    icon: str | None = Field(default=None, description="An emoji or short mark shown on pills, scale steps and cards.")
    description: str | None = Field(default=None, description="A line under the option on cards.")


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


class OptionsSource(BaseModel):
    """Where a choice question's options come from when they aren't typed in."""

    model_config = STRICT

    kind: Literal["goal_templates"] = Field(description="`goal_templates`: plan templates the learner can start from, ranked by the goal's wording, with a search for more. The run must belong to a goal.")
    limit: int = Field(default=3, ge=1, le=6, description="How many options show before \"See more\".")


class QuestionContent(BaseModel):
    """Choice kinds use ``options`` (+ ``categories`` for categorized
    selection); ``text_input`` uses ``inputs``; ``image_upload`` only a label."""

    model_config = OPEN

    label: str | None = None
    options: list[ChoiceOption] | None = None
    options_source: OptionsSource | None = Field(default=None, description="Options come from this source instead of `options`; bind the choice with `variable_bindings.selected`.")
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


class StatItem(BaseModel):
    model_config = STRICT

    value: float | str | None = Field(default=None, description="The number to show; counts up when it is a number.")
    label: str = Field(default="", max_length=80)
    binding: DisplayBinding | None = Field(default=None, description="Read the value from a variable instead, such as `goal.stats.steps_done`.")


class StatContent(BaseModel):
    model_config = STRICT

    items: list[StatItem] = Field(min_length=1, max_length=4)


class StatBlock(_Block):
    """A row of up to four numbers that count up as the page opens."""

    type: Literal["stat"]
    content: StatContent


class QuoteContent(BaseModel):
    model_config = STRICT

    text: str = Field(default="", max_length=600)
    attribution: str = Field(default="", max_length=120)
    binding: DisplayBinding | None = Field(default=None, description="Read the quote from an earlier answer or a variable, such as `goal.why`.")


class QuoteBlock(_Block):
    """A pull quote that fades in line by line."""

    type: Literal["quote"]
    content: QuoteContent


class ChartContent(BaseModel):
    model_config = STRICT

    kind: Literal["bars"] = "bars"
    title: str = Field(default="", max_length=120)
    values: list[float] = Field(default_factory=list, max_length=52)
    labels: list[str] = Field(default_factory=list, max_length=52)
    binding: DisplayBinding | None = Field(default=None, description="Read the values from a list variable instead, such as `goal.stats.weekly`.")


class ChartBlock(_Block):
    """Bars that grow in, such as steps done each week."""

    type: Literal["chart"]
    content: ChartContent


class MedalContent(BaseModel):
    model_config = STRICT

    title: str = Field(default="", max_length=120)
    subtitle: str = Field(default="", max_length=160)
    image: str = Field(default="", max_length=2000, description="An image for the medal's face, such as a badge's; a star when empty.")


class MedalBlock(_Block):
    """A medal that lands on the page."""

    type: Literal["medal"]
    content: MedalContent


class HeadingContent(BaseModel):
    model_config = STRICT

    text: str = Field(default="", max_length=300)
    size: Literal["s", "m", "l", "xl"] | None = None


class HeadingBlock(_Block):
    """Version 3: the page's one heading. Every version 3 page has exactly one."""

    type: Literal["heading"]
    content: HeadingContent


class NumberContent(BaseModel):
    model_config = STRICT

    value: float | str | None = Field(default=None, description="Counts up as the page opens when it is a number.")
    prefix: str = Field(default="", max_length=12)
    suffix: str = Field(default="", max_length=24)
    label: str = Field(default="", max_length=120)
    binding: DisplayBinding | None = Field(default=None, description="Read the value from a variable or an earlier answer instead.")


class NumberBlock(_Block):
    """Version 3: one big number with a label, such as \"3 in 4 teens\"."""

    type: Literal["number"]
    content: NumberContent


class DeckCard(BaseModel):
    model_config = STRICT

    id: str = Field(min_length=1)
    title: str = Field(default="", max_length=160)
    body: str = Field(default="", max_length=1200)
    image: str = Field(default="", max_length=2000)


class CardDeckContent(BaseModel):
    model_config = STRICT

    cards: list[DeckCard] = Field(min_length=1, max_length=12)


class CardDeckBlock(_Block):
    """Version 3: cards the learner swipes or taps through."""

    type: Literal["card_deck"]
    content: CardDeckContent


class ColumnBreakBlock(_Block):
    """Version 3: on two-column pages, blocks after it go in the second column."""

    type: Literal["column_break"]


Block = Annotated[
    Union[
        TextBlock, ImageBlock, ButtonBlock, QuestionBlock, PortfolioPreviewBlock, StatBlock, QuoteBlock, ChartBlock, MedalBlock,
        HeadingBlock, NumberBlock, CardDeckBlock, ColumnBreakBlock,
    ],
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
    """Standard page content. Version 2 is the older shape; version 3 adds the
    page heading (exactly one) and new blocks, with layout in the page's
    ``design`` (``PageDesign``). In version 3 buttons only continue and pages
    have no variants: branches do that job."""

    model_config = OPEN

    version: Literal[2, 3] = 2
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
        if self.version == 3:
            if sum(block.type == "heading" for block in self.blocks) != 1:
                raise ValueError("A version 3 page has exactly one heading block")
            if sum(block.type == "column_break" for block in self.blocks) > 1:
                raise ValueError("A page has at most one column break")
            if self.variants is not None:
                raise ValueError("Version 3 pages have no variants; use a branch")
            if any(block.type == "button" and block.content and block.content.action == "revisit" for block in self.blocks):
                raise ValueError("Version 3 buttons only continue")
        return self


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
