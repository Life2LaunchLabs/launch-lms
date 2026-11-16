"""Portfolio steps that count: "have at least N of these in your portfolio" (DEV-115).

A step names a part of the portfolio (projects, timeline entries, results such as a strengths test,
traits, credentials, recommendations, badges) and how many it needs. The learner's portfolio decides
it: one that already has enough finishes the step when the learner gets to it, otherwise the step
fills as items are added. The learner can hide items from the step (and so from staff) while enough
stay showing. Staff see the items that count and open each one.

Older steps name a one-off ``check`` (write your welcome, launch your portfolio...) and still finish
through ``goals/portfolio.done_checks``.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.db.badges import BadgeAward
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStatus, GoalStep, StepProgress
from src.db.media import MediaAsset
from src.db.portfolio import (
    Portfolio,
    PortfolioContentStatus,
    PortfolioVisibility,
    ProfileTrait,
    ProjectItem,
    ProjectItemBlock,
    TimelineEntry,
)
from src.db.portfolio_records import Credential, PortfolioContact, PortfolioQuote, PortfolioResult, QuoteStatus

# The parts a step can count, with the filters each takes (a result's kind, a timeline entry's type, a credential's kind).
PARTS = ("projects", "timeline", "results", "traits", "credentials", "recommendations", "badges", "welcome", "launch")
FILTERS: dict[str, tuple[str, ...]] = {
    "results": ("strengths", "interests", "personality", "values", "skills", "other"),
    "timeline": ("employment", "education", "volunteering", "training", "experience", "work_career", "leadership_service",
                 "learning_experiences", "teams_activities", "awards_recognition", "challenges_milestones", "other"),
    "credentials": ("card", "certificate", "diploma", "test_score"),
    "traits": ("strength", "value"),
}
# Parts that are there or not: the count is always one.
SINGLE = {"welcome", "launch"}


class PortfolioItemsHidden(BaseModel):
    """The items the learner hides from a step (PUT /goals/{goal}/steps/{step}/portfolio-hidden)."""

    hidden: list[str] = Field(default_factory=list, max_length=500)


def _value(item) -> str:
    return str(getattr(item, "value", item) or "")


@dataclass
class Item:
    key: str
    title: str
    subtitle: str = ""
    summary: str = ""
    date: str = ""
    image_url: str = ""
    detail: list[str] | None = None

    def view(self, hidden: bool | None = None) -> dict:
        data = {"key": self.key, "title": self.title, "subtitle": self.subtitle, "summary": self.summary, "date": self.date,
                "image_url": self.image_url, "detail": self.detail or []}
        return data if hidden is None else {**data, "hidden": hidden}


def spec(config: dict) -> tuple[str, int, str | None] | None:
    """The part, count and filter a counting step asks for, or None for an older one-off check."""
    part = config.get("part")
    if part not in PARTS:
        return None
    count = 1 if part in SINGLE else max(1, int(config.get("count") or 1))
    return part, count, config.get("filter") or None


def _asset_url(db: Session, asset_id: int | None) -> str:
    asset = db.get(MediaAsset, asset_id) if asset_id else None
    return asset.url if asset else ""


def _span(start: str | None, end: str | None, current: bool = False) -> str:
    if not start and not end:
        return ""
    return f"{(start or '')[:7]} – {'now' if current else (end or '')[:7]}".strip(" –")


def _project_detail(db: Session, project: ProjectItem) -> list[str]:
    """The project's own words, in order, for staff opening it."""
    lines: list[str] = []
    for block in db.exec(select(ProjectItemBlock).where(ProjectItemBlock.project_item_id == project.id).order_by(ProjectItemBlock.sort_order)).all():  # type: ignore[arg-type]
        data = block.data or {}
        for key in ("text", "body", "caption", "title"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                lines.append(value.strip()[:2000])
    return lines[:20]


def items(db: Session, user_id: int, part: str, kind: str | None = None) -> list[Item]:
    """The learner's portfolio items that count toward a part, newest first."""
    if part == "badges":
        awards = db.exec(select(BadgeAward).where(BadgeAward.user_id == user_id, BadgeAward.status == "active").order_by(BadgeAward.id.desc())).all()  # type: ignore[union-attr]
        return [Item(f"badge:{award.award_uuid}", str((award.achievement or {}).get("name") or "Badge"), date=str(award.earned_on or ""),
                     summary=str((award.achievement or {}).get("description") or "")[:600]) for award in awards]
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return []
    pid = portfolio.id
    if part == "welcome":
        return [Item("welcome", portfolio.display_name, portfolio.headline, portfolio.short_bio[:600])] if portfolio.display_name else []
    if part == "launch":
        return [Item("launch", "Your portfolio is live", date=(portfolio.published_at or "")[:10])] if _value(portfolio.visibility) == PortfolioVisibility.PUBLIC.value else []
    if part == "projects":
        rows = db.exec(select(ProjectItem).where(ProjectItem.portfolio_id == pid, ProjectItem.status != PortfolioContentStatus.ARCHIVED.value).order_by(ProjectItem.update_date.desc())).all()  # type: ignore[arg-type]
        return [Item(f"project:{row.project_uuid}", row.title, row.subtitle or row.role_label, row.summary[:600], _span(row.start_date, row.end_date, row.is_ongoing),
                     _asset_url(db, row.cover_asset_id), _project_detail(db, row)) for row in rows]
    if part == "timeline":
        statement = select(TimelineEntry).where(TimelineEntry.portfolio_id == pid, TimelineEntry.status != PortfolioContentStatus.ARCHIVED.value)
        if kind:
            statement = statement.where(TimelineEntry.entry_type == kind)
        rows = db.exec(statement.order_by(TimelineEntry.start_date.desc())).all()  # type: ignore[arg-type, union-attr]
        return [Item(f"timeline:{row.timeline_uuid}", row.title, row.organization, row.summary[:600], _span(row.start_date, row.end_date, row.is_current),
                     _asset_url(db, row.cover_asset_id)) for row in rows]
    if part == "results":
        statement = select(PortfolioResult).where(PortfolioResult.portfolio_id == pid)
        if kind:
            statement = statement.where(PortfolioResult.kind == kind)
        rows = db.exec(statement.order_by(PortfolioResult.sort_order, PortfolioResult.id)).all()  # type: ignore[arg-type]
        return [Item(f"result:{row.result_uuid}", row.name, row.kind.capitalize(), row.summary[:600], (row.taken_on or "")[:10]) for row in rows]
    if part == "traits":
        statement = select(ProfileTrait).where(ProfileTrait.portfolio_id == pid)
        if kind:
            statement = statement.where(ProfileTrait.trait_type == kind)
        rows = db.exec(statement.order_by(ProfileTrait.sort_order, ProfileTrait.id)).all()  # type: ignore[arg-type]
        return [Item(f"trait:{row.trait_uuid}", row.label, _value(row.trait_type).capitalize(), row.description[:600]) for row in rows]
    if part == "credentials":
        statement = select(Credential).where(Credential.portfolio_id == pid)
        if kind:
            statement = statement.where(Credential.kind == kind)
        rows = db.exec(statement.order_by(Credential.sort_order, Credential.id)).all()  # type: ignore[arg-type]
        return [Item(f"credential:{row.credential_uuid}", row.name, row.issuer, row.score, (row.issued_on or row.expected_on or "")[:10], _asset_url(db, row.photo_asset_id)) for row in rows]
    if part == "recommendations":
        rows = db.exec(select(PortfolioQuote).where(PortfolioQuote.portfolio_id == pid, PortfolioQuote.status != QuoteStatus.REQUESTED.value).order_by(PortfolioQuote.id)).all()  # type: ignore[arg-type]
        contacts = {row.id: row for row in db.exec(select(PortfolioContact).where(PortfolioContact.portfolio_id == pid)).all()}
        return [Item(f"quote:{row.quote_uuid}", contacts[row.contact_id].name if row.contact_id in contacts else "Recommendation",
                     contacts[row.contact_id].role_label if row.contact_id in contacts else "", row.body[:1200], (row.confirmed_at or "")[:10]) for row in rows]
    return []


def _hidden(progress: StepProgress | None) -> set[str]:
    return {str(key) for key in ((progress.submission or {}).get("hidden") or [])} if progress else set()


def evaluate(db: Session, step: GoalStep, user_id: int | None, progress: StepProgress | None) -> dict | None:
    """What a counting step has: the items that count, which the learner hid, how many it needs."""
    asked = spec(step.config or {})
    if not asked or not user_id:
        return None
    part, count, kind = asked
    hidden = _hidden(progress)
    found = items(db, user_id, part, kind)
    shown = [item for item in found if item.key not in hidden]
    return {"part": part, "filter": kind, "needed": count, "have": len(shown), "met": len(shown) >= count, "found": found, "hidden": hidden}


def reference(state: dict | None, learner: bool) -> dict | None:
    """The step card's view: the learner sees every item with what they hid; anyone else only what counts."""
    if not state:
        return None
    rows = [item.view(item.key in state["hidden"]) for item in state["found"]] if learner else [item.view() for item in state["found"] if item.key not in state["hidden"]]
    return {"part": state["part"], "filter": state["filter"], "needed": state["needed"], "have": state["have"], "items": rows}


def check_goal(db: Session, goal: Goal) -> None:
    """Counting steps the learner's portfolio already meets are done: on arrival, and whenever it changes."""
    from src.services.goals import completion
    from src.db.goals import StepStatus

    if not goal.subject_user_id or _value(goal.status) != GoalStatus.ACTIVE.value:
        return
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.type == "portfolio")).all():
        if not spec(step.config or {}):
            continue
        progress = completion.progress_view(db, step)
        if _value(progress.status) in DONE_STEP_STATUSES:
            continue
        state = evaluate(db, step, int(goal.subject_user_id), progress)
        if state and state["met"]:
            completion._auto(db, step, StepStatus.COMPLETED)


def check_learner(db: Session, user_id: int) -> None:
    for goal in db.exec(select(Goal).where(Goal.subject_user_id == user_id, Goal.status == GoalStatus.ACTIVE)).all():
        check_goal(db, goal)


def set_hidden(db: Session, goal: Goal, step: GoalStep, user_id: int, hidden: list[str]) -> None:
    """The learner hides items from a step, or shows them again. Enough must stay showing to meet it."""
    from src.services.goals import completion

    if step.type != "portfolio" or not spec(step.config or {}):
        raise HTTPException(status_code=409, detail="Only portfolio steps that count items can hide them")
    if user_id != goal.subject_user_id:
        raise HTTPException(status_code=403, detail="Only the learner chooses what counts on their step")
    progress = completion.progress_for(db, step)
    state = evaluate(db, step, user_id, progress)
    known = {item.key for item in state["found"]} if state else set()
    keep = sorted({key for key in hidden if key in known})
    showing = len(known) - len(keep)
    done = _value(progress.status) in DONE_STEP_STATUSES
    if done and state and showing < state["needed"]:
        raise HTTPException(status_code=409, detail=f"Keep at least {state['needed']} showing, or the step isn't met")
    progress.submission = {**(progress.submission or {}), "hidden": keep}
    progress.updated_by_user_id = user_id
    db.add(progress)
    db.commit()
    check_goal(db, goal)


def attach(db: Session, goal: Goal, steps: list[GoalStep], progress: dict[int, StepProgress], views: dict[int, dict], learner: bool) -> None:
    """Add what a counting portfolio step has to its view, as ``reference``."""
    for step in steps:
        if step.type == "portfolio" and spec(step.config or {}):
            state = evaluate(db, step, goal.subject_user_id, progress.get(int(step.id)))  # type: ignore[arg-type]
            views[int(step.id)]["reference"] = reference(state, learner)  # type: ignore[arg-type]
