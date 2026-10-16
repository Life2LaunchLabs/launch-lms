"""Routine: something the learner does a number of times each week, logged as it happens.

Every log is a step entry stamped with the week it was logged in, so the week
history and this week's count come from entries. A routine is never done while
it runs: it ends when the learner ends it, when its own end date or its stage's
end passes, or when it reaches its total count, whichever comes first.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from fastapi import HTTPException
from pydantic import Field, model_validator

from src.db.goals import GoalStage, GoalStep, StepEntry
from src.services.goals.types.base import Config, StepState, StepType

HISTORY_WEEKS = 8


def week_start_of(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


class FollowUp(Config):
    after_days: int = Field(default=7, ge=1, le=90)
    statuses: list[str] = Field(default_factory=lambda: ["No reply", "Replied", "Interview", "No"], min_length=1, max_length=10)

    @model_validator(mode="after")
    def clean_statuses(self):
        self.statuses = list(dict.fromkeys(status.strip()[:60] for status in self.statuses if status.strip()))
        if not self.statuses:
            raise ValueError("give follow-up at least one status")
        return self


class RoutineConfig(Config):
    cadence: Literal["weekly"] = "weekly"
    target: int = Field(default=3, ge=1, le=50)
    # "named": each log is an item with a title and a note (an application sent). "count": a plain "log one".
    entry_kind: Literal["named", "count"] = "named"
    # What one log is called, for the card's wording ("application").
    item_label: str = Field(default="", max_length=60)
    end_date: dt.date | None = None
    # Ends once this many have been logged in total.
    end_after: int | None = Field(default=None, ge=1, le=10000)
    follow_up: FollowUp | None = None


def logs(state_or_entries: StepState | list[StepEntry]) -> list[StepEntry]:
    entries = state_or_entries.entries_of("log") if isinstance(state_or_entries, StepState) else [
        entry for entry in state_or_entries if str(getattr(entry.kind, "value", entry.kind)) == "log"
    ]
    return [entry for entry in entries if entry.period_start is not None]


def count_in_week(entries: list[StepEntry], week_start: dt.date) -> int:
    return sum(1 for entry in logs(entries) if entry.period_start == week_start)


def follow_ups_due(entries: list[StepEntry], today: dt.date) -> list[StepEntry]:
    """Logs whose follow-up date has come and that have no follow-up status yet."""
    return [entry for entry in logs(entries) if entry.follow_up_due and entry.follow_up_due <= today and not entry.follow_up_status]


def ends_on(step: GoalStep, stage: GoalStage | None) -> dt.date | None:
    """The last day the routine runs: its own end date or its stage's end, whichever is first."""
    raw = (step.config or {}).get("end_date")
    own = dt.date.fromisoformat(raw) if isinstance(raw, str) else raw
    candidates = [day for day in (own, stage.due_date if stage else None) if day]
    return min(candidates) if candidates else None


def reached_total(step: GoalStep, entries: list[StepEntry]) -> bool:
    end_after = (step.config or {}).get("end_after")
    return bool(end_after) and len(logs(entries)) >= int(end_after)


def check_follow_up_status(step: GoalStep, status: str | None) -> None:
    """A follow-up status must be one the routine offers; None clears it."""
    if status is None:
        return
    follow_up = (step.config or {}).get("follow_up")
    if not follow_up:
        raise HTTPException(status_code=422, detail="This routine has no follow-up")
    if status not in follow_up.get("statuses") or []:
        raise HTTPException(status_code=422, detail="Pick one of the routine's follow-up statuses")


class Routine(StepType):
    key = "routine"
    label = "Routine"
    config_model = RoutineConfig
    entry_kinds = frozenset({"log"})

    def validate_config(self, config: dict | None) -> dict:
        data = super().validate_config(config)
        return {key: value.isoformat() if isinstance(value, dt.date) else value for key, value in data.items()}

    def fraction(self, state: StepState) -> float:
        # This week's progress toward the target; the ring never closes while the routine runs.
        target = int(state.config.get("target") or 1)
        return min(0.99, count_in_week(state.entries, week_start_of(dt.date.today())) / target)

    def result(self, state: StepState) -> dict | None:
        today = dt.date.today()
        this_week = week_start_of(today)
        entries = logs(state)
        first = min((entry.period_start for entry in entries), default=this_week)  # type: ignore[type-var]
        start = max(first, this_week - dt.timedelta(weeks=HISTORY_WEEKS - 1))  # type: ignore[type-var, operator]
        weeks = []
        while start <= this_week:
            weeks.append({"start": start.isoformat(), "count": count_in_week(entries, start)})
            start += dt.timedelta(weeks=1)
        return {
            "kind": "routine", "target": int(state.config.get("target") or 1), "this_week": count_in_week(entries, this_week),
            "total": len(entries), "weeks": weeks, "follow_ups_due": len(follow_ups_due(entries, today)),
        }
