"""Stories: a cohort's script of stages, each persona's place in them, and what the run reports.

A stage has a goal written for the persona, and can wait for one persona to finish another
stage (for example, wait for Dana to send the invite). Personas report progress and findings
from their own session; the run board shows every persona against every stage.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, select
from src.db.user_tests import TestCohort, TestEvent, TestPersona
from src.db.users import User
from src.services.user_tests.cohorts import get_cohort, is_open

logger = logging.getLogger(__name__)

MAX_STAGES = 20
Status = Literal["not_started", "in_progress", "done", "stuck"]
# Stuck first, so the board shows who needs help.
ORDER = {"stuck": 0, "waiting": 1, "in_progress": 2, "not_started": 3, "done": 4}


class After(BaseModel):
    persona: str = Field(min_length=1, max_length=60, description="The handle of the persona to wait for.")
    stage: str = Field(min_length=1, max_length=60)


class Stage(BaseModel):
    key: str = Field(default="", max_length=60)
    title: str = Field(min_length=1, max_length=120)
    goal: str = Field(default="", max_length=2000)
    after: After | None = None

    @field_validator("title", "goal")
    @classmethod
    def trimmed(cls, value: str) -> str:
        return value.strip()


class SetStages(BaseModel):
    stages: list[Stage] = Field(max_length=MAX_STAGES)


class Progress(BaseModel):
    stage_key: str = Field(min_length=1, max_length=60)
    status: Status
    note: str = Field(default="", max_length=2000)


class Finding(BaseModel):
    kind: Literal["bug", "confusion", "wish"]
    severity: Literal["low", "medium", "high"] = "medium"
    stage_key: str | None = Field(default=None, max_length=60)
    page: str = Field(default="", max_length=1000)
    what_happened: str = Field(min_length=1, max_length=4000)
    what_wanted: str = Field(default="", max_length=4000)


def _key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "stage"


def set_stages(db: Session, cohort_uuid: str, body: SetStages) -> dict:
    cohort = get_cohort(db, cohort_uuid)
    handles = {persona.handle for persona in db.exec(select(TestPersona).where(TestPersona.cohort_id == cohort.id)).all()}
    stages: list[dict] = []
    for stage in body.stages:
        key = _key(stage.key or stage.title)
        while key in {item["key"] for item in stages}:
            key = f"{key[:36]}-{len(stages) + 1}"
        stages.append({"key": key, "title": stage.title, "goal": stage.goal, "after": stage.after.model_dump() if stage.after else None})
    keys = {item["key"] for item in stages}
    for stage in stages:
        after = stage["after"]
        if after and (after["stage"] not in keys or after["persona"] not in handles):
            raise HTTPException(422, f"\"{stage['title']}\" waits for a persona or stage that isn't in this cohort: {after['persona']} / {after['stage']}.")
    cohort.stages, cohort.update_date = stages, datetime.utcnow()
    flag_modified(cohort, "stages")
    db.add(cohort)
    db.commit()
    return board(db, cohort_uuid)


def _cells(cohort: TestCohort, persona: TestPersona, by_handle: dict[str, tuple[TestPersona, User]]) -> list[dict]:
    cells = []
    for stage in cohort.stages or []:
        state = (persona.stage_state or {}).get(stage["key"]) or {}
        status, waiting_on = state.get("status") or "not_started", None
        after = stage.get("after")
        if status == "not_started" and after and after["persona"] != persona.handle and after["persona"] in by_handle:
            other, other_user = by_handle[after["persona"]]
            if ((other.stage_state or {}).get(after["stage"]) or {}).get("status") != "done":
                title = next((item["title"] for item in cohort.stages if item["key"] == after["stage"]), after["stage"])
                status, waiting_on = "waiting", f"{other_user.first_name}: {title}"
        cells.append({"stage_key": stage["key"], "status": status, "note": state.get("note", ""), "updated_at": state.get("updated_at"), "waiting_on": waiting_on})
    return cells


def board(db: Session, cohort_uuid: str) -> dict:
    """Every persona against every stage. Stuck personas come first."""
    cohort = get_cohort(db, cohort_uuid)
    rows = db.exec(select(TestPersona, User).join(User, User.id == TestPersona.user_id).where(TestPersona.cohort_id == cohort.id).order_by(TestPersona.creation_date)).all()
    by_handle = {persona.handle: (persona, user) for persona, user in rows}
    personas = []
    for persona, user in rows:
        cells = _cells(cohort, persona, by_handle)
        personas.append({"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip(), "handle": persona.handle, "brief": persona.brief, "cells": cells,
                         "rank": min([ORDER[cell["status"]] for cell in cells] or [ORDER["not_started"]])})
    personas.sort(key=lambda item: item["rank"])
    counts = {status: sum(1 for row in personas for cell in row["cells"] if cell["status"] == status) for status in ORDER}
    return {"stages": cohort.stages or [], "personas": personas, "counts": counts}


def _record(db: Session, cohort_id: int, persona_user_id: int | None, kind: str, stage_key: str | None, payload: dict) -> TestEvent:
    event = TestEvent(cohort_id=cohort_id, persona_user_id=persona_user_id, kind=kind, stage_key=stage_key, payload=payload)
    db.add(event)
    return event


def _stage_keys(cohort: TestCohort) -> set[str]:
    return {stage["key"] for stage in cohort.stages or []}


def report_progress(db: Session, persona: TestPersona, body: Progress, by: str = "persona") -> dict:
    cohort = db.get(TestCohort, persona.cohort_id)
    if not cohort or body.stage_key not in _stage_keys(cohort):
        raise HTTPException(404, f"There is no stage \"{body.stage_key}\" in this run.")
    state = dict(persona.stage_state or {})
    state[body.stage_key] = {"status": body.status, "note": body.note.strip(), "updated_at": datetime.utcnow().isoformat() + "Z", "by": by}
    persona.stage_state = state
    flag_modified(persona, "stage_state")
    db.add(persona)
    _record(db, int(cohort.id), persona.user_id, "progress", body.stage_key, {"status": body.status, "note": body.note.strip(), "by": by})  # type: ignore[arg-type]
    db.commit()
    return state[body.stage_key]


def log_finding(db: Session, persona: TestPersona, body: Finding) -> dict:
    event = _record(db, persona.cohort_id, persona.user_id, "finding", body.stage_key, body.model_dump(exclude={"stage_key"}))
    db.commit()
    return serialize_event(event)


def record_blocked(message: str, detail: dict | None = None) -> None:
    """Log an action the seal or a persona session refused, so a blocked step shows in the report.

    Written on its own connection: the request that was refused is rolled back.
    """
    from src.core.events.database import engine
    from src.services.user_tests.sessions import current_test_persona

    persona_id = current_test_persona.get()
    if not persona_id:
        return
    try:
        with Session(engine) as db:
            persona = db.get(TestPersona, persona_id)
            if persona:
                _record(db, persona.cohort_id, persona_id, "blocked", None, {"message": message, **(detail or {})})
                db.commit()
    except Exception:
        logger.exception("Could not log a blocked test action")


def serialize_event(event: TestEvent) -> dict:
    return {"id": event.id, "kind": event.kind, "persona_user_id": event.persona_user_id, "stage_key": event.stage_key, "payload": event.payload or {}, "created_at": event.created_at.isoformat() + "Z"}


def events(db: Session, cohort_uuid: str, kind: str | None = None, persona_user_id: int | None = None, limit: int = 200) -> list[dict]:
    cohort = get_cohort(db, cohort_uuid)
    statement = select(TestEvent).where(TestEvent.cohort_id == cohort.id)
    if kind:
        statement = statement.where(TestEvent.kind == kind)
    if persona_user_id:
        statement = statement.where(TestEvent.persona_user_id == persona_user_id)
    return [serialize_event(event) for event in db.exec(statement.order_by(TestEvent.created_at.desc(), TestEvent.id.desc()).limit(min(limit, 1000))).all()]  # type: ignore[union-attr]


def report(db: Session, cohort_uuid: str) -> str:
    """The run's findings and refused actions as Markdown, grouped by kind, for the test report."""
    cohort = get_cohort(db, cohort_uuid)
    names = {user.id: f"{user.first_name} {user.last_name}".strip() for _, user in db.exec(select(TestPersona, User).join(User, User.id == TestPersona.user_id).where(TestPersona.cohort_id == cohort.id)).all()}
    titles = {stage["key"]: stage["title"] for stage in cohort.stages or []}
    rows = db.exec(select(TestEvent).where(TestEvent.cohort_id == cohort.id, TestEvent.kind.in_(["finding", "blocked"])).order_by(TestEvent.created_at)).all()  # type: ignore[attr-defined]
    lines = [f"# {cohort.name}: findings", ""]
    sections = (("bug", "Bugs"), ("confusion", "Confusing parts"), ("wish", "Wishes"), ("blocked", "Refused by the test seal"))
    for kind, heading in sections:
        items = [row for row in rows if (row.payload or {}).get("kind", row.kind) == kind or (kind == "blocked" and row.kind == "blocked")]
        if not items:
            continue
        lines += [f"## {heading} ({len(items)})", ""]
        for row in items:
            payload = row.payload or {}
            where = " · ".join(part for part in (names.get(row.persona_user_id or 0, ""), titles.get(row.stage_key or "", ""), payload.get("page", "")) if part)
            text = payload.get("what_happened") or payload.get("message") or ""
            severity = f"**{payload['severity']}** " if payload.get("severity") else ""
            lines.append(f"- {severity}{text}" + (f" ({where})" if where else ""))
            if payload.get("what_wanted"):
                lines.append(f"  - Wanted: {payload['what_wanted']}")
        lines.append("")
    if len(lines) == 2:
        lines.append("No findings yet.")
    return "\n".join(lines)


def persona_view(db: Session, persona: TestPersona, user: User) -> dict:
    """What a persona's own session sees: its stages and its unread mail, never other briefs."""
    from sqlalchemy import func
    from src.db.user_tests import TestMail

    cohort = db.get(TestCohort, persona.cohort_id)
    if not cohort or not is_open(cohort):
        raise HTTPException(401, "This test cohort is closed.")
    rows = db.exec(select(TestPersona, User).join(User, User.id == TestPersona.user_id).where(TestPersona.cohort_id == cohort.id)).all()
    cells = _cells(cohort, persona, {item.handle: (item, other) for item, other in rows})
    stages = [{"key": stage["key"], "title": stage["title"], "goal": stage["goal"], **{k: cell[k] for k in ("status", "note", "waiting_on")}} for stage, cell in zip(cohort.stages or [], cells)]
    unread = db.exec(select(func.count()).select_from(TestMail).where(TestMail.to_user_id == user.id, TestMail.opened_at.is_(None))).one()  # type: ignore[union-attr]
    return {"persona": {"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip(), "handle": persona.handle}, "cohort": {"name": cohort.name},
            "stages": stages, "unread_mail": unread}
