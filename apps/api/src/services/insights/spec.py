"""A card's spec: what to compute and how to show it.

Nothing in a spec names a plan, group or learner. A plan dashboard passes the plan it is showing as a
locked filter (``context.Scope``), so one spec answers for every plan. Library questions, templates, the
card editor and the MCP all produce specs, and ``check`` is the one place they are validated.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SPEC_VERSION = 1
Preset = Literal["28d", "90d", "12m", "all"]
PRESETS: tuple[str, ...] = ("28d", "90d", "12m", "all")
CHARTS: tuple[str, ...] = ("auto", "number", "line", "bars", "columns", "stacked", "heatmap", "table")
# Filters any measure takes, on top of its dimensions: which learners count (active members by default).
COMMON_FILTERS = ("learner_status",)
LEARNER_STATUSES = ("active", "alumni")
# The dimension a dashboard already pins: a plan dashboard shows one plan, so "by plan" has one row.
BOUND = {"plan": "plan", "group": "group", "framework": "framework"}


class CustomRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: date
    end: date

    @model_validator(mode="after")
    def _ordered(self) -> CustomRange:
        if self.end < self.start:
            raise ValueError("The range ends before it starts")
        return self


class Target(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: float


class CardFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str
    op: Literal["in", "not_in"] = "in"
    values: list[str] = Field(default_factory=list, max_length=100)


class Headline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["auto", "custom"] = "auto"
    text: str = Field(default="", max_length=200)


class CardSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: int = SPEC_VERSION
    measure: str
    by: str | None = None
    by2: str | None = None
    filters: list[CardFilter] = Field(default_factory=list, max_length=12)
    range: Literal["inherit", "28d", "90d", "12m", "all"] | CustomRange = "inherit"
    compare: Literal["prior", "year", "none"] | Target = "prior"
    chart: Literal["auto", "number", "line", "bars", "columns", "stacked", "heatmap", "table"] = "auto"
    headline: Headline = Field(default_factory=Headline)
    note: str = Field(default="", max_length=500)


def upgrade(raw: dict) -> dict:
    """Bring a stored spec up to SPEC_VERSION. Renamed or split measures get their step here."""
    return {**raw, "v": SPEC_VERSION}


def check(spec: CardSpec, scope: str, *, see_reports: bool) -> list[dict]:
    """What is wrong with ``spec`` on a ``scope`` dashboard for this viewer: [{field, message}], empty when it fits."""
    from src.services.insights.dimensions import DIMENSIONS
    from src.services.insights.measures import MEASURES

    measure = MEASURES.get(spec.measure)
    if measure is None:
        return [{"field": "measure", "message": f"There is no measure called {spec.measure!r}. Pick one from the registry."}]
    errors: list[dict] = []
    if measure.needs == "see_reports" and not see_reports:
        errors.append({"field": "measure", "message": f"{measure.label} needs the See reports permission."})
    if scope not in measure.scopes:
        errors.append({"field": "measure", "message": f"{measure.label} doesn't work on a {scope} dashboard. It works on: {', '.join(measure.scopes)}."})
    bound = BOUND.get(scope)
    for field in ("by", "by2"):
        key = getattr(spec, field)
        if key is None:
            continue
        if key not in measure.dims:
            errors.append({"field": field, "message": f"{measure.label} can't be broken down by {key!r}. It can by: {', '.join(measure.dims) or 'nothing'}."})
        elif key == bound:
            errors.append({"field": field, "message": f"This dashboard already shows one {key}, so breaking down by {key} has one row."})
        elif DIMENSIONS[key].scopes and scope not in DIMENSIONS[key].scopes:  # type: ignore[operator]
            errors.append({"field": field, "message": f"Breaking down by {DIMENSIONS[key].label.lower()} works on a {' or '.join(DIMENSIONS[key].scopes)} dashboard."})  # type: ignore[arg-type]
        elif DIMENSIONS[key].needs == "see_reports" and not see_reports:
            errors.append({"field": field, "message": f"Breaking down by {DIMENSIONS[key].label.lower()} needs the See reports permission."})
    if spec.by2 is not None:
        if spec.by is None:
            errors.append({"field": "by2", "message": "Set a first breakdown before a second one."})
        elif "time" in (spec.by, spec.by2):
            errors.append({"field": "by2", "message": "A second breakdown can't be time. Use time as the only breakdown."})
        elif spec.by == spec.by2:
            errors.append({"field": "by2", "message": "The second breakdown must differ from the first."})
    for item in spec.filters:
        if item.field in COMMON_FILTERS:
            bad = [value for value in item.values if value not in LEARNER_STATUSES]
            if bad:
                errors.append({"field": "filters", "message": f"Learner status is one of: {', '.join(LEARNER_STATUSES)}."})
        elif item.field not in measure.dims or item.field == "time":
            errors.append({"field": "filters", "message": f"{measure.label} can't be filtered by {item.field!r}."})
        elif item.field == bound:
            errors.append({"field": "filters", "message": f"This dashboard already picks the {item.field}."})
    if measure.implicit_by and spec.by2 is not None:
        errors.append({"field": "by2", "message": f"{measure.label} is already split by {measure.implicit_by}, so it takes one breakdown."})
    if not errors and spec.chart != "auto":
        from src.services.insights.engine import SHAPE_CHARTS, shape_of

        allowed = SHAPE_CHARTS[shape_of(spec, measure)]
        if spec.chart not in allowed:
            errors.append({"field": "chart", "message": f"This card can show as: {', '.join(allowed)}."})
    if isinstance(spec.compare, Target) and measure.snapshot:
        errors.append({"field": "compare", "message": f"{measure.label} is a count of today, so it has no target."})
    if spec.headline.mode == "custom" and not spec.headline.text.strip():
        errors.append({"field": "headline", "message": "Write the headline, or let it be written for you."})
    return errors
