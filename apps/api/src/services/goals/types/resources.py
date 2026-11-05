"""Resources: staff hand the learner a few resources to check out.

Each resource the learner opens from the step is one ``resource`` entry, with when they first and
last opened it (``data.first_opened_at``, ``data.last_opened_at``) and how often (``data.opens``),
and their note on it in ``note``. Staff see all of it on the step.

Who finishes it follows the step's ``completed_by``: a learner step finishes on its own once the
learner has opened enough of the resources (``required``, 0 meaning all of them); a staff step
waits for staff to mark it done, whatever was opened.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.services.goals.types.base import Config, StepState, StepType
from src.services.goals.types.explore import Suggestion, resource_or_422

MAX_RESOURCES = 8


class StepResourceVisit(BaseModel):
    """A learner opening one of the step's resources, or writing their note on it."""

    opened: bool = False
    note: str | None = Field(default=None, max_length=10000)


class ResourcesConfig(Config):
    resources: list[Suggestion] = Field(min_length=1, max_length=MAX_RESOURCES)
    # How many must be opened to finish; 0 means every one.
    required: int = Field(default=0, ge=0, le=MAX_RESOURCES)


def needed(config: dict) -> int:
    total = len(config.get("resources") or [])
    required = int(config.get("required") or 0)
    return min(required, total) if required else total


def opened(state: StepState) -> list:
    picked = {item["resource_uuid"] for item in state.config.get("resources") or []}
    return [entry for entry in state.entries_of("resource") if entry.resource_uuid in picked and int((entry.data or {}).get("opens") or 0) > 0]


class Resources(StepType):
    key = "resources"
    label = "Resources"
    config_model = ResourcesConfig
    # Opens and notes come through the step's own resource endpoint, never as free entries.
    entry_kinds = frozenset()

    def validate_config(self, config: dict | None) -> dict:
        data = super().validate_config(config)
        keys = [item["resource_uuid"] for item in data.get("resources") or []]
        if len(keys) != len(set(keys)):
            raise HTTPException(status_code=422, detail="Resources step: each resource only once")
        if int(data.get("required") or 0) > len(keys):
            raise HTTPException(status_code=422, detail="Resources step: required can't be more than the resources it has")
        return data

    def resolve(self, db: Session, config: dict, org_id: int | None) -> dict:
        for item in config.get("resources") or []:
            resource_or_422(db, item["resource_uuid"])
        return {}

    def completion_blocker(self, state: StepState) -> str | None:
        left = needed(state.config) - len(opened(state))
        if left <= 0:
            return None
        return "Open the resource first" if needed(state.config) == 1 else f"Open {left} more first"

    def fraction(self, state: StepState) -> float:
        want = needed(state.config)
        return min(0.9, 0.9 * len(opened(state)) / want) if want else 0.0

    def result(self, state: StepState) -> dict | None:
        seen = opened(state)
        if not seen:
            return None
        return {"kind": "resources", "opened": len(seen), "total": len(state.config.get("resources") or []), "needed": needed(state.config),
                "notes": sum(1 for entry in state.entries_of("resource") if entry.note.strip())}
