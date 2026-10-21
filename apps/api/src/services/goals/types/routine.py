"""Routine: an action the learner repeats on a cadence.

The cadence says when it comes round (every day, some weekdays, some days of the
month); each time is a trigger, named by its date. The action is what each trigger
asks for: a list of items (three job openings), a number (today's weight, maybe for
a few named series) or just doing it. Every log is a step entry stamped with the
trigger it belongs to (``period_start``), so the chart and the streak come from
entries, and an earlier trigger can still be filled in. A routine is never done
while it runs: it ends when the learner ends it or when its close date or its
stage's end passes.
"""

from __future__ import annotations

import calendar
import datetime as dt
from typing import Literal

from fastapi import HTTPException
from pydantic import Field, model_validator
from sqlmodel import Session

from src.db.goals import GoalStep, StepEntry
from src.services.goals.types.base import Config, StepState, StepType

# Triggers shown in the chart.
HISTORY = {"daily": 14, "weekly": 8, "monthly": 6}


class RoutineAction(Config):
    # "list": add `target` named items; "number": one value per series; "check": just do it.
    kind: Literal["list", "number", "check"] = "list"
    target: int = Field(default=1, ge=1, le=50)
    # What one item is called ("job opening"), or what the number measures ("Weight").
    label: str = Field(default="", max_length=60)
    unit: str = Field(default="", max_length=20)
    # Number actions: named lines, such as ["Me", "Rex"]. None means one unnamed line.
    series: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def clean(self):
        self.series = list(dict.fromkeys(name.strip()[:40] for name in self.series if name.strip()))
        if self.kind != "list":
            self.target = 1
        return self


class RoutineConfig(Config):
    cadence: Literal["daily", "weekly", "monthly"] = "weekly"
    # Weekly: weekdays, 0 for Sunday to 6 for Saturday. Monthly: days of the month, 1 to 31
    # (a day past the month's end falls on its last day). Daily: none.
    days: list[int] = Field(default_factory=lambda: [0], max_length=31)
    action: RoutineAction = Field(default_factory=RoutineAction)

    @model_validator(mode="after")
    def check_days(self):
        if self.cadence == "daily":
            self.days = []
            return self
        low, high = (0, 6) if self.cadence == "weekly" else (1, 31)
        self.days = sorted({day for day in self.days if low <= day <= high})
        if not self.days:
            raise ValueError(f"pick at least one {'weekday' if self.cadence == 'weekly' else 'day of the month'}")
        return self


def upgrade_config(config: dict) -> dict:
    """An older routine config (a weekly count, logged by Monday-started weeks) in today's shape."""
    if not isinstance(config, dict) or "action" in config:
        return config
    target = int(config.get("target") or 1)
    named = config.get("entry_kind", "named") == "named"
    kind = "list" if named or target > 1 else "check"
    label = str(config.get("item_label") or ("" if named else "time"))[:60]
    return {"cadence": "weekly", "days": [1], "action": {"kind": kind, "target": target if kind == "list" else 1, "label": label}}


def _triggers_on(config: dict, day: dt.date) -> bool:
    cadence = config.get("cadence") or "weekly"
    days = set(config.get("days") or [])
    if cadence == "daily":
        return True
    if cadence == "weekly":
        return (day.weekday() + 1) % 7 in days
    last = calendar.monthrange(day.year, day.month)[1]
    return day.day in days or (day.day == last and any(wanted > last for wanted in days))


def trigger_on(config: dict, day: dt.date) -> dt.date:
    """The trigger a day belongs to: the latest one on or before it."""
    for back in range(0, 62):
        candidate = day - dt.timedelta(days=back)
        if _triggers_on(config, candidate):
            return candidate
    return day


def triggers_back(config: dict, until: dt.date, count: int) -> list[dt.date]:
    """The last ``count`` triggers up to the one ``until`` belongs to, oldest first."""
    found = [trigger_on(config, until)]
    while len(found) < count:
        found.append(trigger_on(config, found[-1] - dt.timedelta(days=1)))
    return found[::-1]


def logs(state_or_entries: StepState | list[StepEntry]) -> list[StepEntry]:
    entries = state_or_entries.entries_of("log") if isinstance(state_or_entries, StepState) else [
        entry for entry in state_or_entries if str(getattr(entry.kind, "value", entry.kind)) == "log"
    ]
    return [entry for entry in entries if entry.period_start is not None]


def logged_in(config: dict, entries: list[StepEntry], trigger: dt.date) -> list[StepEntry]:
    """The logs that count toward a trigger: those stamped with any day it covers, so a
    changed cadence folds earlier logs into its own times rather than dropping them."""
    return [entry for entry in logs(entries) if trigger_on(config, entry.period_start) == trigger]  # type: ignore[arg-type]


def _series(action: dict) -> list[str]:
    return list(action.get("series") or []) or [""]


def progress_in(config: dict, entries: list[StepEntry], trigger: dt.date) -> tuple[int, int]:
    """How much of a trigger's action is done, and how much it asks for."""
    action = config.get("action") or {}
    found = logged_in(config, entries, trigger)
    if action.get("kind") == "number":
        named = {str((entry.data or {}).get("series") or "") for entry in found}
        return len([name for name in _series(action) if name in named]), len(_series(action))
    return min(len(found), int(action.get("target") or 1)), int(action.get("target") or 1)


def met(config: dict, entries: list[StepEntry], trigger: dt.date) -> bool:
    done, wanted = progress_in(config, entries, trigger)
    return done >= wanted


def check_update(changes: dict) -> None:
    """A logged number can be corrected, but only to another number."""
    if "value" in (changes.get("data") or {}):
        value = changes["data"]["value"]
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise HTTPException(status_code=422, detail="Enter a number")


def ends_on(step: GoalStep, stage_end: dt.date | None) -> dt.date | None:
    """The last day the routine runs: its close date or its stage's end, whichever is first."""
    candidates = [day for day in (step.due_date, stage_end) if day]
    return min(candidates) if candidates else None


def _created(step: GoalStep) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(step.creation_date)[:10])
    except ValueError:
        return None


class Routine(StepType):
    key = "routine"
    label = "Routine"
    config_model = RoutineConfig
    entry_kinds = frozenset({"log"})

    def prepare_entry(self, db: Session, step: GoalStep, done: bool, entry_kind: str, payload) -> dict:
        if done:
            raise HTTPException(status_code=409, detail="This routine has ended; reopen it to log more")
        config = step.config or {}
        action = config.get("action") or {}
        today = dt.date.today()
        trigger = trigger_on(config, today)
        if payload.period:
            if payload.period > today or trigger_on(config, payload.period) != payload.period:
                raise HTTPException(status_code=422, detail="That isn't one of the routine's days")
            trigger = payload.period
        kind = action.get("kind") or "list"
        if kind == "list" and not payload.title.strip():
            raise HTTPException(status_code=422, detail="Say what you added")
        if kind == "number":
            value = (payload.data or {}).get("value")
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise HTTPException(status_code=422, detail="Enter a number")
            series = str((payload.data or {}).get("series") or "")
            if series not in _series(action):
                raise HTTPException(status_code=422, detail="Pick one of the routine's lines")
            if any(str((entry.data or {}).get("series") or "") == series for entry in logged_in(config, self._entries(db, step), trigger)):
                raise HTTPException(status_code=409, detail="That's already logged; change it instead")
        if kind == "check" and logged_in(config, self._entries(db, step), trigger):
            raise HTTPException(status_code=409, detail="That's already done")
        return {"period_start": trigger}

    @staticmethod
    def _entries(db: Session, step: GoalStep) -> list[StepEntry]:
        from sqlmodel import select

        return list(db.exec(select(StepEntry).where(StepEntry.step_id == step.id)).all())

    def fraction(self, state: StepState) -> float:
        # The current trigger's progress; the ring never closes while the routine runs.
        done, wanted = progress_in(state.config, state.entries, trigger_on(state.config, dt.date.today()))
        return min(0.99, done / wanted) if wanted else 0.0

    def result(self, state: StepState) -> dict | None:
        config = state.config
        today = dt.date.today()
        entries = logs(state)
        history = triggers_back(config, today, HISTORY.get(config.get("cadence") or "weekly", 8))
        # Start the chart at the routine's first trigger, or its first log if that came earlier.
        first = min([trigger_on(config, entry.period_start) for entry in entries] + [trigger_on(config, _created(state.step) or today)])  # type: ignore[arg-type]
        history = [trigger for trigger in history if trigger >= first] or history[-1:]
        periods = []
        for trigger in history:
            done, wanted = progress_in(config, entries, trigger)
            found = logged_in(config, entries, trigger)
            values = {str((entry.data or {}).get("series") or ""): (entry.data or {}).get("value") for entry in found if "value" in (entry.data or {})}
            periods.append({"start": trigger.isoformat(), "count": len(found), "done": done, "wanted": wanted, "values": values})
        streak = 0
        for period in reversed(periods[:-1] if periods and periods[-1]["done"] < periods[-1]["wanted"] else periods):
            if period["done"] < period["wanted"]:
                break
            streak += 1
        current = periods[-1]
        return {"kind": "routine", "current": current["start"], "done": current["done"], "wanted": current["wanted"], "streak": streak, "total": len(entries), "periods": periods}
