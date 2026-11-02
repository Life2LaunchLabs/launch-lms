"""A learner's life plan document: read it, start it, save it.

The document is the learner's own: phases with their budget lines, and the debt,
savings, things they own and one-time events that run across phases. Amounts in it
are only ever the learner's own numbers; estimates are looked up when shown.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, select

from src.db.life_plans import LifePlan
from src.db.users import PublicUser

Unit = Literal["hr", "wk", "mo", "yr"]


class Doc(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Own(Doc):
    unit: Unit = "mo"
    value: float = Field(ge=0, le=10_000_000)
    hours: float | None = Field(default=None, ge=0, le=168)


class Line(Doc):
    id: str = Field(max_length=40)
    cat: str = Field(max_length=40)
    item: str | None = Field(default=None, max_length=40)
    title: str = Field(max_length=120)
    side: Literal["in", "out"]
    own: Own | None = None
    hours: float | None = Field(default=None, ge=0, le=168)
    settings: dict = Field(default_factory=dict)
    start: int = Field(default=0, ge=0, le=1200)
    end: int | None = Field(default=None, ge=0, le=1200)


class When(Doc):
    phase: str = Field(max_length=40)
    month: int = Field(default=0, ge=0, le=1200)


class Phase(Doc):
    id: str = Field(max_length=40)
    title: str = Field(max_length=120)
    kind: str = Field(default="other", max_length=40)
    place: str | None = Field(default=None, max_length=64)
    place_label: str = Field(default="", max_length=120)
    months: int = Field(default=12, ge=1, le=1200)
    lines: list[Line] = Field(default_factory=list, max_length=200)


class Debt(Doc):
    id: str = Field(max_length=40)
    kind: str = Field(default="other", max_length=40)
    title: str = Field(max_length=120)
    balance: float = Field(ge=0, le=100_000_000)
    rate: float = Field(default=0, ge=0, le=100)
    payment: float = Field(default=0, ge=0, le=10_000_000)
    start: When | None = None


class Saving(Doc):
    id: str = Field(max_length=40)
    kind: str = Field(default="savings", max_length=40)
    title: str = Field(max_length=120)
    balance: float = Field(default=0, ge=0, le=100_000_000)
    rate: float = Field(default=0, ge=0, le=100)
    monthly: float = Field(default=0, ge=0, le=10_000_000)
    main: bool = False


class Sale(Doc):
    phase: str = Field(max_length=40)
    month: int = Field(default=0, ge=0, le=1200)
    price: float = Field(default=0, ge=0, le=100_000_000)


class Asset(Doc):
    id: str = Field(max_length=40)
    kind: str = Field(default="other", max_length=40)
    title: str = Field(max_length=120)
    value: float = Field(ge=0, le=100_000_000)
    change: float = Field(default=0, ge=-100, le=100)
    bought: When | None = None
    down: float | None = Field(default=None, ge=0, le=100_000_000)
    loan_id: str | None = Field(default=None, max_length=40)
    sold: Sale | None = None


class Event(Doc):
    id: str = Field(max_length=40)
    phase: str = Field(max_length=40)
    month: int = Field(default=0, ge=0, le=1200)
    title: str = Field(max_length=120)
    amount: float = Field(ge=-100_000_000, le=100_000_000)


class LifePlanDocument(Doc):
    version: int = 1
    start: str = Field(pattern=r"^\d{4}-\d{2}$")
    phases: list[Phase] = Field(default_factory=list, max_length=40)
    debts: list[Debt] = Field(default_factory=list, max_length=40)
    savings: list[Saving] = Field(default_factory=list, max_length=20)
    assets: list[Asset] = Field(default_factory=list, max_length=40)
    events: list[Event] = Field(default_factory=list, max_length=200)


class SavePlan(BaseModel):
    document: LifePlanDocument
    revision: int | None = None


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _view(plan: LifePlan) -> dict:
    return {"plan_uuid": plan.plan_uuid, "revision": plan.revision, "document": plan.document, "update_date": plan.update_date}


def get_plan(db: Session, user: PublicUser) -> dict | None:
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user.id)).first()
    return _view(plan) if plan else None


def save_plan(db: Session, user: PublicUser, body: SavePlan) -> dict:
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user.id)).first()
    doc = body.document.model_dump(mode="json")
    if plan is None:
        plan = LifePlan(plan_uuid=f"lifeplan_{uuid4()}", user_id=user.id, document=doc, revision=1, creation_date=_now(), update_date=_now())
    else:
        if body.revision is not None and body.revision != plan.revision:
            raise HTTPException(status_code=409, detail={"message": "Your life plan changed in another window.", "revision": plan.revision})
        plan.document = doc
        plan.revision += 1
        plan.update_date = _now()
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _view(plan)


def delete_plan(db: Session, user: PublicUser) -> None:
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user.id)).first()
    if plan:
        db.delete(plan)
        db.commit()
