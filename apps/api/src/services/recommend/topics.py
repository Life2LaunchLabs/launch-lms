"""Topics: what a context is about, and how a resource shows it is about the same thing.

A topic matches a resource by its tags or by the name of a channel it sits in (case does not matter), so
the resources already in Resources work without new tagging; tagging a resource with a topic's tag is how
staff steer it in. ``phase_topics`` is the rules version of reading a phase: a later, smarter version (Coach
reading the person's goals) returns the same shape.
"""

from __future__ import annotations

COLLEGE_LEVELS = {"trade", "cc", "uni", "grad"}

TOPICS: dict[str, dict] = {
    "paying_for_school": {"title": "Paying for school", "tags": ["fafsa", "financial aid", "grants", "scholarships", "aid", "student loans"], "channels": ["paying for school"]},
    "college": {"title": "College and training", "tags": ["college", "college applications", "admissions", "applying to college", "community college"], "channels": ["college and training"]},
    "free_credit": {"title": "Free college credit", "tags": ["clep", "college credit"], "channels": ["free college credit"]},
    "apprenticeships": {"title": "Apprenticeship options", "tags": ["apprenticeship", "apprenticeships", "trades", "trade school"], "channels": []},
    "finding_work": {"title": "Finding work", "tags": ["jobs", "job search", "resume", "résumé", "interview", "interviews", "first job"], "channels": ["work and jobs"]},
    "money": {"title": "Money and budgeting", "tags": ["budgeting", "budget", "money", "banking", "credit"], "channels": ["money and budgeting"]},
    "housing": {"title": "Finding a place to live", "tags": ["housing", "renting", "rent", "roommates", "moving out"], "channels": []},
    "gap_year": {"title": "Making the most of a gap year", "tags": ["gap year", "volunteering", "service year"], "channels": []},
    "caregiving": {"title": "Caring for family", "tags": ["caregiving", "childcare", "parenting"], "channels": []},
}


def phase_topics(phase: dict) -> dict[str, tuple[float, str]]:
    """The topics a phase implies, each with a weight and the reason, strongest reason kept per topic."""
    out: dict[str, tuple[float, str]] = {}

    def add(key: str, weight: float, why: str) -> None:
        if key not in out or out[key][0] < weight:
            out[key] = (weight, why)

    for activity in phase.get("activities") or []:
        if not isinstance(activity, dict):
            continue
        kind, level = activity.get("kind"), activity.get("level")
        if kind == "learning" and level in COLLEGE_LEVELS:
            add("paying_for_school", 3, "Because this phase has school")
            add("college", 2.5, "Because this phase has school")
            if level in {"cc", "uni"}:
                add("free_credit", 1.5, "Could save you a class")
            if level == "trade":
                add("apprenticeships", 2, "Ways into the trades")
        if activity.get("apprentice"):
            add("apprenticeships", 3, "You're planning an apprenticeship")
        if kind == "looking":
            add("finding_work", 3, "You're looking for work here")
        if kind == "working":
            add("finding_work", 1.5, "You're working here")
        if kind == "gap":
            add("gap_year", 3, "This phase is a gap year")
        if kind == "caring":
            add("caregiving", 3, "You're caring for someone here")
    living = phase.get("living")
    if living in {"own", "roommates", "partner"}:
        add("housing", 2, "You'll need a place to live")
        add("money", 2, "Living on your own")
    elif living == "dorm":
        add("housing", 1, "You'll live in a dorm")
    if phase.get("lines"):
        add("money", 1, "This phase has a budget")
    return out
