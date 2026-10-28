"""Typed models for video pages, activity sequences, (older) flows and page and activity design.

Split from ``models`` (which re-exports them); see its docstring.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

STRICT = ConfigDict(extra="forbid")
OPEN = ConfigDict(extra="allow")


class CaptionPosition(BaseModel):
    model_config = STRICT

    x: float = Field(default=50, ge=0, le=100, description="Percent from the left.")
    y: float = Field(default=82, ge=0, le=100, description="Percent from the top.")


class CaptionChunk(BaseModel):
    """A few words shown together, from ``start`` (seconds) until the next chunk or ``end``."""

    model_config = STRICT

    id: str = Field(min_length=1)
    start: float = Field(ge=0)
    end: float | None = Field(default=None, ge=0)
    words: str = Field(default="", max_length=400)
    text: dict[str, Any] | None = Field(default=None, description="The words as Tiptap JSON when some of them are styled.")


class VideoCaptions(BaseModel):
    model_config = STRICT

    chunks: list[CaptionChunk] = Field(default_factory=list, max_length=2000)
    look: dict[str, Any] = Field(default_factory=dict, description="Font, size, colour and backdrop shared by every chunk.")
    phone: CaptionPosition | None = None
    desktop: CaptionPosition | None = None
    language: str | None = Field(default=None, max_length=20)
    source: Literal["generated", "edited", "manual"] | None = None


class VideoPageContent(BaseModel):
    model_config = OPEN

    video_url: str | None = None
    heading: str | None = None
    allow_scrubbing: bool | None = None
    captions: VideoCaptions | None = None


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


# Sequence -------------------------------------------------------------------

class SequencePage(BaseModel):
    model_config = STRICT

    type: Literal["page"]
    page_uuid: str = Field(min_length=1)


class BranchPath(BaseModel):
    """One way through a branch. ``rule`` empty: the Default path, taken when no other rule matches."""

    model_config = STRICT

    id: str = Field(min_length=1)
    label: str | None = Field(default=None, max_length=120)
    rule: Condition | None = None
    pages: list[str] = Field(default_factory=list, description="Page uuids, in order. No branches inside a path.")


class SequenceBranch(BaseModel):
    model_config = STRICT

    type: Literal["branch"]
    id: str = Field(min_length=1)
    label: str | None = Field(default=None, max_length=120)
    on: ConditionOperand | None = Field(default=None, description="Editor hint: what the paths' rules look at.")
    paths: list[BranchPath] = Field(min_length=1)


SequenceItem = Annotated[Union[SequencePage, SequenceBranch], Field(discriminator="type")]


class Sequence(BaseModel):
    """The order of an activity's pages: a stack of pages and branches, one
    level deep. At a branch the first path whose rule matches is taken, else
    the Default path; then the activity carries on after the branch. Replaces
    ``flow`` (older activities are converted when they are read)."""

    model_config = STRICT

    version: Literal[1] = 1
    items: list[SequenceItem] = Field(default_factory=list)


TRANSITIONS = Literal["slide", "fade", "rise", "none"]


class PageDesign(BaseModel):
    """A page's look (the page's ``design``)."""

    model_config = OPEN

    background: dict[str, Any] | None = Field(default=None, description="`color`, `gradient_to`, `image`, `scene`, `intensity`.")
    valign: Literal["top", "middle", "bottom"] | None = Field(default=None, description="Where the blocks sit; middle by default.")
    columns: Literal[1, 2] | None = Field(default=None, description="Two columns on wide screens, split at the column break.")
    transition: TRANSITIONS | None = Field(default=None, description="How the page comes in; the activity's when empty.")
    celebrate: bool | None = None
    auto_advance_ms: int | None = Field(default=None, ge=0)


class ActivityDesign(BaseModel):
    """How the player presents an activity (``settings.design``)."""

    model_config = OPEN

    progress: Literal["bar", "line", "segments", "dots", "count", "none"] | None = Field(default=None, description="`line` (the default; `bar` is its older name), `segments` (one per page), `dots`, `count` (\"3 of 8\") or `none`.")
    allow_back: bool | None = Field(default=None, description="Learners can go back a page; on by default.")
    resume: bool | None = Field(default=None, description="Reopening continues where they left off; on by default.")
    transition: TRANSITIONS | None = Field(default=None, description="How pages come in; `slide` by default.")
    background: dict[str, Any] | None = None
    exit: dict[str, Any] | None = None
