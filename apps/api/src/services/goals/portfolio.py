"""What a learner's portfolio already shows, for portfolio steps that finish on their own."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.goals import Goal, GoalSource
from src.db.portfolio import Portfolio, PortfolioContentStatus, PortfolioVisibility, ProfileTrait, ProjectItem, TimelineEntry


def done_checks(db: Session, user_id: int) -> set[str]:
    """The portfolio checks the learner passes: welcome, timeline, project, traits, launch, badges."""
    done: set[str] = set()
    if db.exec(select(Goal.id).where(Goal.subject_user_id == user_id, Goal.source == GoalSource.BADGE)).first():
        done.add("badges")
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return done
    if portfolio.display_name:
        done.add("welcome")
    if db.exec(select(TimelineEntry.id).where(TimelineEntry.portfolio_id == portfolio.id, TimelineEntry.status != PortfolioContentStatus.ARCHIVED)).first():
        done.add("timeline")
    if db.exec(select(ProjectItem.id).where(ProjectItem.portfolio_id == portfolio.id, ProjectItem.status != PortfolioContentStatus.ARCHIVED)).first():
        done.add("project")
    traits = {getattr(item, "value", item) for item in db.exec(select(ProfileTrait.trait_type).where(ProfileTrait.portfolio_id == portfolio.id)).all()}
    if {"strength", "value"} <= traits:
        done.add("traits")
    if portfolio.visibility == PortfolioVisibility.PUBLIC:
        done.add("launch")
    return done
