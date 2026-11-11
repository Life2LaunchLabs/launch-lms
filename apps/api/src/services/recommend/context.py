"""Where the person is, as facts the shelves can use: the topics it implies, the careers and schools in it, its state.

A context is built by an adapter per surface. Only the phase adapter exists so far; a budget line, a portfolio
section or Home adds its own adapter returning the same ``Context`` and every shelf works with it unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.life_plans import LifePlan
from src.services.life_plans.places import STATES, ladder

from .topics import phase_topics


@dataclass
class Context:
    key: str
    label: str
    # topic key -> (weight, why): why says what in the context brought the topic.
    topics: dict[str, tuple[float, str]] = field(default_factory=dict)
    # O*NET-SOC codes and College Scorecard unitids the context names, with the person's own words for them.
    careers: dict[str, str] = field(default_factory=dict)
    schools: dict[str, str] = field(default_factory=dict)
    picked_school: str | None = None
    state: str | None = None


def state_of(place: str | None) -> str | None:
    """The two-letter state a place key sits in, if it has one."""
    if not place:
        return None
    for key in ladder(place):
        if key.startswith("state:") and key.split(":", 1)[1] in STATES:
            return key.split(":", 1)[1]
    return None


def find_phase(db: Session, user_id: int, phase_id: str) -> dict:
    plan = db.exec(select(LifePlan).where(LifePlan.user_id == user_id)).first()
    phase = next((p for p in ((plan.document or {}).get("phases") or []) if isinstance(p, dict) and p.get("id") == phase_id), None) if plan else None
    if phase is None:
        raise HTTPException(status_code=404, detail={"message": "That phase isn't in your plan."})
    return phase


def phase_context(phase: dict) -> Context:
    activities = [a for a in (phase.get("activities") or []) if isinstance(a, dict)]
    careers: dict[str, str] = {}
    schools: dict[str, str] = {}
    picked = None
    for activity in activities:
        if activity.get("career"):
            careers.setdefault(activity["career"], activity.get("career_title") or "")
        if activity.get("school_id"):
            picked = picked or activity["school_id"]
            schools.setdefault(activity["school_id"], activity.get("school") or "")
        for unitid in activity.get("schools") or []:
            if isinstance(unitid, str) and unitid.isdigit():
                schools.setdefault(unitid, "")
    return Context(
        key=f"phase:{phase.get('id')}",
        label=phase.get("title") or "This phase",
        topics=phase_topics(phase),
        careers=careers,
        schools=schools,
        picked_school=picked,
        state=state_of(phase.get("place")),
    )
