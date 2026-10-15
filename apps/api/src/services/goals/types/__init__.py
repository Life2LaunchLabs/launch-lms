"""The step type registry: one module per type, the only place steps are validated."""

from __future__ import annotations

from fastapi import HTTPException

from src.services.goals.types.base import StepState, StepType
from src.services.goals.types.linked import Activity, Badge, Decision, Portfolio
from src.services.goals.types.simple import Event, Task, Upload, Write

TYPES: dict[str, StepType] = {step_type.key: step_type for step_type in (Task(), Upload(), Write(), Activity(), Event(), Badge(), Portfolio(), Decision())}


def step_type(key: str) -> StepType:
    found = TYPES.get(str(key or ""))
    if not found:
        raise HTTPException(status_code=422, detail=f"Unknown step type: {key}")
    return found


__all__ = ["TYPES", "StepState", "StepType", "step_type"]
