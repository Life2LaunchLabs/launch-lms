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


class Cover(Doc):
    """A photo the learner chose for a phase: one they uploaded to their media library."""
    url: str = Field(max_length=1000, pattern=r"^(https?://|/)")


class Tax(Doc):
    """How the phase's taxes are worked out: the filing status for the estimate, or the learner's own effective rate."""
    filing: Literal["single", "joint"] = "single"
    rate: float | None = Field(default=None, ge=0, le=100)


class Phase(Doc):
    id: str = Field(max_length=40)
    title: str = Field(max_length=120)
    kind: str = Field(default="other", max_length=40)
    place: str | None = Field(default=None, max_length=64)
    place_label: str = Field(default="", max_length=120)
    months: int = Field(default=12, ge=1, le=1200)
    lines: list[Line] = Field(default_factory=list, max_length=200)
    # The learner's goals for this phase, by goal_uuid. A goal in no phase belongs to the current one.
    goals: list[str] = Field(default_factory=list, max_length=100)
    # The learner's own cover photo; without one, the place's photo (or a drawing) shows.
    cover: Cover | None = None
    tax: Tax | None = None


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


def shared_plans(db: Session, user: PublicUser) -> list[dict]:
    """The people who switched on "plans" for this person in their My people."""
    from src.db.portfolio import Portfolio
    from src.db.portfolio_people import PortfolioPerson
    from src.services.connect import people as connect_people

    owners = db.exec(
        select(Portfolio.user_id).join(PortfolioPerson, PortfolioPerson.portfolio_id == Portfolio.id)
        .where(PortfolioPerson.user_id == user.id, PortfolioPerson.plans == True)  # noqa: E712
    ).all()
    return [p for p in (connect_people.person(db, owner) for owner in owners if not connect_people.blocked(db, owner, int(user.id))) if p]  # type: ignore[arg-type]


def shared_plan(db: Session, user: PublicUser, user_uuid: str) -> dict:
    """Someone else's life plan, read-only, when they shared their plans with this person."""
    from src.db.users import User
    from src.services.connect import people as connect_people
    from src.services.portfolio_people import shares_plans

    owner = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    if not owner or not shares_plans(db, int(owner.id), int(user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail="Plan not found")
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == owner.id)).first()
    return {"person": connect_people.person(db, owner.id), "plan": _view(plan) if plan else None}


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


class PlaceGoal(BaseModel):
    goal_uuid: str = Field(max_length=80)
    phase_id: str | None = Field(default=None, max_length=40)


def place_goal(db: Session, user: PublicUser, body: PlaceGoal) -> dict:
    """Put one of the learner's goals in a phase (or in none, so it follows the current phase)."""
    from src.db.goals import Goal

    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user.id)).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Start your life plan first")
    goal = db.exec(select(Goal).where(Goal.goal_uuid == body.goal_uuid)).first()
    if goal is None or user.id not in (goal.subject_user_id, goal.owner_user_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    document = dict(plan.document or {})
    phases = [dict(phase) for phase in document.get("phases") or []]
    if body.phase_id is not None and not any(phase.get("id") == body.phase_id for phase in phases):
        raise HTTPException(status_code=404, detail="Phase not found")
    for phase in phases:
        goals = [uuid for uuid in phase.get("goals") or [] if uuid != body.goal_uuid]
        if phase.get("id") == body.phase_id:
            goals.append(body.goal_uuid)
        phase["goals"] = goals
    plan.document = {**document, "phases": phases}
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


def _month_index(value: str) -> int:
    year, month = value.split("-")
    return int(year) * 12 + int(month) - 1


def _month_label(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def headed(db: Session, user_id: int, today: datetime | None = None) -> dict:
    """Where the learner is headed, for their portfolio: the phase they're in now and the next one.

    Phases run one after another from the plan's start month. Before the plan starts, the
    first phase is next and nothing is now; past the end, the last phase stays now. Only
    titles, kinds, places and months: never the budget.
    """
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user_id)).first()
    document = (plan.document if plan else None) or {}
    phases = [phase for phase in document.get("phases") or [] if isinstance(phase, dict) and phase.get("title")]
    if not phases or not document.get("start"):
        return {"now": None, "next": []}
    today = today or datetime.now(UTC)
    current = today.year * 12 + today.month - 1
    begins = _month_index(str(document["start"]))
    cards = []
    for phase in phases:
        months = max(1, int(phase.get("months") or 1))
        cards.append({"id": phase.get("id"), "title": phase["title"], "kind": phase.get("kind") or "other", "place": phase.get("place_label") or "", "starts": _month_label(begins), "ends": _month_label(begins + months - 1), "months": months, "begins": begins})
        begins += months
    now = next((card for card in cards if card["begins"] <= current < card["begins"] + card["months"]), None)
    if now is None and cards[-1]["begins"] + cards[-1]["months"] <= current:
        now = cards[-1]
    upcoming = [card for card in cards if card["begins"] > current][:2]
    for card in cards:
        card.pop("begins")
    return {"now": now, "next": upcoming}
