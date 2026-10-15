"""What every step type provides.

A step type owns its config schema, its submission schema, when it may be
completed, how far along it is and what its row shows. The registry is the
only validator of steps: template documents, live edits, Coach proposals and
the connector all go through it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlmodel import Session

from src.db.goals import GoalStep, StepEntry, StepProgress


class Config(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass
class StepState:
    """A step with what the learner has done on it, as the type sees it."""

    step: GoalStep
    progress: StepProgress
    entries: list[StepEntry] = field(default_factory=list)

    @property
    def config(self) -> dict:
        return self.step.config or {}

    @property
    def submission(self) -> dict:
        return self.progress.submission or {}

    def entries_of(self, *kinds: str) -> list[StepEntry]:
        return [entry for entry in self.entries if str(getattr(entry.kind, "value", entry.kind)) in kinds]


def _validation_message(error: ValidationError) -> str:
    first = error.errors()[0]
    where = ".".join(str(part) for part in first.get("loc", ()))
    return f"{where}: {first.get('msg')}" if where else str(first.get("msg"))


class StepType:
    key: str = ""
    label: str = ""
    config_model: type[Config] = Config
    submission_model: type[Submission] | None = None
    # Entry kinds the learner can add to this step.
    entry_kinds: frozenset[str] = frozenset()
    # False when the step finishes on its own (an activity run, a badge award) or by staff.
    learner_can_complete: bool = True

    def validate_config(self, config: dict | None) -> dict:
        try:
            return self.config_model.model_validate(config or {}).model_dump(exclude_none=True)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=f"{self.label} step: {_validation_message(error)}") from error

    def resolve(self, db: Session, config: dict, org_id: int | None) -> dict:
        """Check what the config points at and return the step's reference columns (activity_id, badge_id)."""
        return {}

    def validate_submission(self, data: dict | None) -> dict:
        if self.submission_model is None:
            if data:
                raise HTTPException(status_code=422, detail=f"{self.label} steps take no submission")
            return {}
        try:
            return self.submission_model.model_validate(data or {}).model_dump(exclude_none=True)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=f"{self.label}: {_validation_message(error)}") from error

    def completion_blocker(self, state: StepState) -> str | None:
        """Why the learner can't finish the step yet, or None."""
        return None

    def fraction(self, state: StepState) -> float:
        """How far along an unfinished step is, from 0 to 1."""
        return 0.0

    def result(self, state: StepState) -> dict | None:
        """What the step's row shows once there is something to show."""
        return None
