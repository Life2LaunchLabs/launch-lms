"""Explore: a question plus the evidence that answers it.

The learner collects entries of any kind (a library resource, a link, a file or
photo, a plain note), each with an optional one-line takeaway in its note, and
the step completes when a one-sentence answer is saved. Staff or Coach can
seed suggested resources; they show as entries the learner hasn't opened yet.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import Field
from sqlmodel import Session, select

from src.db.goals import GoalStep
from src.db.resources import Resource
from src.services.goals.types.base import Config, StepState, StepType

EVIDENCE_KINDS = ("resource", "link", "file", "note")


class Suggestion(Config):
    resource_uuid: str = Field(min_length=1, max_length=64)
    title: str = Field(default="", max_length=300)


class ExploreConfig(Config):
    question: str = Field(default="", max_length=1000)
    suggestions: list[Suggestion] = Field(default_factory=list, max_length=12)


def resource_or_422(db: Session, resource_uuid: str) -> Resource:
    resource = db.exec(select(Resource).where(Resource.resource_uuid == resource_uuid)).first()
    if not resource:
        raise HTTPException(status_code=422, detail=f"Resource not found: {resource_uuid}")
    return resource


def resource_entry_fields(resource: Resource) -> dict:
    """What an entry copies from the library resource it points at, so it still reads if the resource changes."""
    return {
        "title": (resource.title or "Resource")[:500],
        "url": resource.external_url or resource.provider_url or "",
        "data": {"image": resource.cover_image_url or "", "resource_type": str(getattr(resource.resource_type, "value", resource.resource_type) or "")},
    }


class Explore(StepType):
    key = "explore"
    label = "Explore"
    config_model = ExploreConfig
    entry_kinds = frozenset(EVIDENCE_KINDS)

    def validate_config(self, config: dict | None) -> dict:
        data = super().validate_config(config)
        keys = [item["resource_uuid"] for item in data.get("suggestions") or []]
        if len(keys) != len(set(keys)):
            raise HTTPException(status_code=422, detail="Explore step: each suggested resource only once")
        return data

    def resolve(self, db: Session, config: dict, org_id: int | None) -> dict:
        for item in config.get("suggestions") or []:
            resource_or_422(db, item["resource_uuid"])
        return {}

    def prepare_entry(self, db: Session, step: GoalStep, done: bool, entry_kind: str, payload) -> dict:
        if done:
            raise HTTPException(status_code=409, detail="This step is done; reopen it to add more")
        if entry_kind == "resource":
            if not payload.resource_uuid:
                raise HTTPException(status_code=422, detail="Pick a resource")
            return resource_entry_fields(resource_or_422(db, payload.resource_uuid))
        if entry_kind == "link" and not payload.url.strip():
            raise HTTPException(status_code=422, detail="Paste a link")
        if entry_kind == "note" and not payload.note.strip():
            raise HTTPException(status_code=422, detail="Write the note first")
        return {}

    def completion_blocker(self, state: StepState) -> str | None:
        return None if str(state.progress.answer or "").strip() else "Write your answer first"

    def fraction(self, state: StepState) -> float:
        if str(state.progress.answer or "").strip():
            return 0.75
        return min(0.5, 0.15 * len(state.entries_of(*EVIDENCE_KINDS)))

    def result(self, state: StepState) -> dict | None:
        entries = state.entries_of(*EVIDENCE_KINDS)
        answer = str(state.progress.answer or "").strip()
        if not answer and not entries:
            return None
        return {
            "kind": "explore", "answer": answer, "count": len(entries),
            "thumbs": [{"kind": str(getattr(entry.kind, "value", entry.kind)), "title": entry.title or entry.note[:80], "url": entry.url, "image": (entry.data or {}).get("image") or ""} for entry in entries[:4]],
        }
