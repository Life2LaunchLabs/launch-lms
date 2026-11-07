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
from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    # A running cost of something the learner owns (an asset id): it goes when the thing does.
    asset: str | None = Field(default=None, max_length=40)


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


class Household(Doc):
    """Who the phase's budget provides for besides the learner: a partner, and kids by age (0-17)."""
    partner: bool = False
    kids: list[int] = Field(default_factory=list, max_length=8)

    @field_validator("kids")
    @classmethod
    def _ages(cls, v: list[int]) -> list[int]:
        if any(a < 0 or a > 17 for a in v):
            raise ValueError("Kids' ages are 0 to 17.")
        return v


class Activity(Doc):
    """What the learner does in a phase: learning somewhere, working as something, and so on."""
    kind: Literal["learning", "working", "looking", "caring", "gap", "other"] = "other"
    level: str | None = Field(default=None, max_length=20)
    school: str | None = Field(default=None, max_length=160)
    school_id: str | None = Field(default=None, max_length=20)
    # Schools still being weighed; picking one keeps the others here.
    schools: list[str] = Field(default_factory=list, max_length=12)
    field: str | None = Field(default=None, max_length=120)
    career: str | None = Field(default=None, max_length=16)
    career_title: str | None = Field(default=None, max_length=160)
    employer: str | None = Field(default=None, max_length=160)
    apprentice: bool = False


class Starting(Doc):
    savings: dict[str, float] = Field(default_factory=dict, max_length=40)
    debts: dict[str, float] = Field(default_factory=dict, max_length=60)


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
    # When it starts (YYYY-MM). A phase lasts until the next one after it starts; `months` is
    # only the length of a phase nothing comes after. Old plans without dates run in order.
    starts: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    # The learner hasn't picked when it starts yet: `starts` is only where it sits on the map for now.
    undated: bool = False
    # The phases it comes after: none for the first, two or more where two ways join up.
    after: list[str] = Field(default_factory=list, max_length=8)
    # A dashed idea on the map: quick to add and remove, not yet part of the plan.
    idea: bool = False
    activities: list[Activity] = Field(default_factory=list, max_length=8)
    living: str | None = Field(default=None, max_length=20)
    # Who the budget provides for; None is just the learner.
    household: Household | None = None
    # Places still being weighed (place keys); `place` is the one picked.
    places: list[str] = Field(default_factory=list, max_length=12)
    # Where it sits among the options after the same phase: 0 is the learner's first choice.
    rank: int | None = Field(default=None, ge=0, le=100)
    # Real balances to start the phase from, by saving or debt id; without them it starts where the last one ended.
    starting: Starting | None = None


class Debt(Doc):
    id: str = Field(max_length=40)
    kind: str = Field(default="other", max_length=40)
    title: str = Field(max_length=120)
    balance: float = Field(ge=0, le=100_000_000)
    rate: float = Field(default=0, ge=0, le=100)
    payment: float = Field(default=0, ge=0, le=10_000_000)
    start: When | None = None
    # Taking the loan lands its money in savings; None means yes unless it pays for something bought.
    received: bool | None = None


class Saving(Doc):
    id: str = Field(max_length=40)
    kind: str = Field(default="savings", max_length=40)
    title: str = Field(max_length=120)
    balance: float = Field(default=0, ge=0, le=100_000_000)
    rate: float = Field(default=0, ge=0, le=100)
    monthly: float = Field(default=0, ge=0, le=10_000_000)
    main: bool = False
    # A 401(k): percent of pay put in, and the employer match up to this percent of pay.
    pct: float | None = Field(default=None, ge=0, le=100)
    match: float | None = Field(default=None, ge=0, le=100)


class Policy(Doc):
    """From a month on, until the next one for the same target: what is paid on a debt or put into an account."""
    id: str = Field(max_length=40)
    target: str = Field(max_length=40)
    phase: str = Field(max_length=40)
    month: int = Field(default=0, ge=0, le=1200)
    pay: float | None = Field(default=None, ge=0, le=10_000_000)
    full: bool | None = None
    put: float | None = Field(default=None, ge=0, le=10_000_000)
    pct: float | None = Field(default=None, ge=0, le=100)


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
    policies: list[Policy] = Field(default_factory=list, max_length=400)
    card_rate: float | None = Field(default=None, ge=0, le=100)
    # The learner said "don't ask": estimate changes from a new place, living or job apply on their own.
    auto_estimates: bool = False


def _check_links(doc: LifePlanDocument) -> None:
    """Links point at phases in the plan, only forward, and never in a loop."""
    ids = {phase.id for phase in doc.phases}
    if len(ids) != len(doc.phases):
        raise HTTPException(status_code=422, detail={"message": "Two phases share an id."})
    starts = {phase.id: phase.starts for phase in doc.phases}
    for phase in doc.phases:
        phase.after = [pid for pid in dict.fromkeys(phase.after) if pid in ids and pid != phase.id]
        for pid in phase.after:
            if phase.starts and starts[pid] and starts[pid] >= phase.starts:
                raise HTTPException(status_code=422, detail={"message": f"{phase.title} starts before a phase it comes after."})
    parents = {phase.id: phase.after for phase in doc.phases}
    seen: dict[str, int] = {}

    def walk(pid: str) -> None:
        if seen.get(pid) == 1:
            raise HTTPException(status_code=422, detail={"message": "Phases can't loop back on themselves."})
        if seen.get(pid) == 2:
            return
        seen[pid] = 1
        for parent in parents[pid]:
            walk(parent)
        seen[pid] = 2

    for pid in parents:
        walk(pid)


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
    _check_links(body.document)
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
    if any(phase.get("starts") for phase in phases):
        return _headed_on_map(phases, current)
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


def _headed_on_map(phases: list[dict], current: int) -> dict:
    """The same answer for a plan drawn as a map: the latest phase that has started is now, and
    what comes straight after it is next, real phases before ideas."""
    dated = [phase for phase in phases if phase.get("starts")]
    begins = {phase["id"]: _month_index(phase["starts"]) for phase in dated}
    after = {phase["id"]: [pid for pid in phase.get("after") or [] if pid in begins] for phase in dated}
    kids = {pid: sorted((p for p in dated if pid in after[p["id"]]), key=lambda p: (bool(p.get("idea")), begins[p["id"]])) for pid in begins}

    def card(phase: dict) -> dict:
        start = begins[phase["id"]]
        follow = [begins[k["id"]] for k in kids[phase["id"]]]
        end = min(follow) - 1 if follow else start + max(1, int(phase.get("months") or 1)) - 1
        return {"id": phase["id"], "title": phase["title"], "kind": phase.get("kind") or "other", "place": phase.get("place_label") or "", "starts": _month_label(start), "ends": _month_label(end), "months": end - start + 1}

    by_id = {p["id"]: p for p in dated}
    real: dict[str, bool] = {}

    def is_real(pid: str) -> bool:
        # Real: not an idea, and reached by real phases (a phase after an idea is still a maybe).
        if pid not in real:
            real[pid] = False
            real[pid] = not by_id[pid].get("idea") and (not after[pid] or any(is_real(parent) for parent in after[pid]))
        return real[pid]

    started = sorted((p for p in dated if begins[p["id"]] <= current and is_real(p["id"])), key=lambda p: begins[p["id"]])
    if not started:
        roots = sorted((p for p in dated if not after[p["id"]]), key=lambda p: begins[p["id"]])
        return {"now": None, "next": [card(p) for p in roots[:2]]}
    now = started[-1]
    return {"now": card(now), "next": [card(p) for p in kids[now["id"]][:2]]}
