"""Task, Upload, Write and Event: steps the learner (or staff) finish by hand."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import Field, model_validator

from src.services.goals.types.base import Config, StepState, StepType, Submission


class TaskList(Config):
    label: str = Field(default="", max_length=200)
    # How many items finish the task; 0 means the list is optional.
    target: int = Field(default=0, ge=0, le=100)
    item_kind: Literal["text", "link"] = "text"


class TaskConfig(Config):
    list: TaskList | None = None


class Task(StepType):
    key = "task"
    label = "Task"
    config_model = TaskConfig
    entry_kinds = frozenset({"item"})

    def _target(self, state: StepState) -> int:
        return int(((state.config.get("list") or {}).get("target")) or 0)

    def completion_blocker(self, state: StepState) -> str | None:
        target = self._target(state)
        if target and len(state.entries_of("item")) < target:
            return f"Add {target} items first"
        return None

    def fraction(self, state: StepState) -> float:
        target = self._target(state)
        return min(1.0, len(state.entries_of("item")) / target) if target else 0.0

    def result(self, state: StepState) -> dict | None:
        items = state.entries_of("item")
        if not items:
            return None
        return {"kind": "items", "items": [{"title": item.title, "url": item.url, "done": item.done} for item in items]}


class UploadSlot(Config):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=200)
    kinds: list[Literal["image", "video", "document", "link"]] = Field(default_factory=lambda: ["image", "document"], min_length=1)
    # An optional slot doesn't hold the step back; a step whose slots are all optional needs one file in any of them.
    optional: bool = False


class UploadConfig(Config):
    slots: list[UploadSlot] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_keys(self):
        keys = [slot.key for slot in self.slots]
        if len(keys) != len(set(keys)):
            raise ValueError("slot keys must be unique")
        return self


class Upload(StepType):
    key = "upload"
    label = "Upload"
    config_model = UploadConfig
    entry_kinds = frozenset({"file", "link"})

    def _missing(self, state: StepState) -> list[dict]:
        filled = {entry.slot for entry in state.entries_of("file", "link")}
        return [slot for slot in state.config.get("slots") or [] if slot["key"] not in filled]

    def completion_blocker(self, state: StepState) -> str | None:
        missing = self._missing(state)
        required = [slot for slot in missing if not slot.get("optional")]
        if required:
            return f"Add {required[0]['label']} first"
        slots = state.config.get("slots") or []
        return "Add a file first" if slots and len(missing) == len(slots) else None

    def fraction(self, state: StepState) -> float:
        slots = state.config.get("slots") or []
        return (len(slots) - len(self._missing(state))) / len(slots) if slots else 0.0

    def result(self, state: StepState) -> dict | None:
        files = state.entries_of("file", "link")
        if not files:
            return None
        return {"kind": "files", "files": [{"slot": entry.slot, "title": entry.title, "url": entry.url, "asset_id": entry.asset_id} for entry in files]}


class WriteConfig(Config):
    prompt: str = Field(default="", max_length=4000)
    max_words: int | None = Field(default=None, ge=1, le=20000)


class WriteSubmission(Submission):
    text: str = Field(default="", max_length=100000)


class Write(StepType):
    key = "write"
    label = "Write"
    config_model = WriteConfig
    submission_model = WriteSubmission

    def completion_blocker(self, state: StepState) -> str | None:
        text = str(state.submission.get("text") or "").strip()
        if not text:
            return "Write something first"
        limit = state.config.get("max_words")
        if limit and len(text.split()) > limit:
            return f"Keep it under {limit} words"
        return None

    def fraction(self, state: StepState) -> float:
        return 0.5 if str(state.submission.get("text") or "").strip() else 0.0

    def result(self, state: StepState) -> dict | None:
        text = str(state.submission.get("text") or "").strip()
        return {"kind": "text", "text": text[:280]} if text else None


class EventConfig(Config):
    date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    place: str = Field(default="", max_length=300)
    url: str = Field(default="", max_length=2000)
    rsvp: bool = False
    reflection_prompt: str = Field(default="", max_length=2000)


class EventSubmission(Submission):
    rsvp: Literal["yes", "no", "maybe"] | None = None
    reflection: str = Field(default="", max_length=20000)


class Event(StepType):
    """Attended means completed. Who confirms it follows the step's completed_by, like any step."""

    key = "event"
    label = "Event"
    config_model = EventConfig
    submission_model = EventSubmission

    def validate_config(self, config: dict | None) -> dict:
        data = super().validate_config(config)
        # Dates and times are stored as ISO strings in JSON.
        return {key: value.isoformat() if hasattr(value, "isoformat") else value for key, value in data.items()}

    def fraction(self, state: StepState) -> float:
        return 0.5 if state.submission.get("rsvp") == "yes" else 0.0

    def result(self, state: StepState) -> dict | None:
        rsvp = state.submission.get("rsvp")
        return {"kind": "rsvp", "rsvp": rsvp} if rsvp else None
