"""What a learner's portfolio already shows, for portfolio steps that finish on their own."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.badges import BadgeAward
from src.db.goals import Goal, GoalSource
from src.db.portfolio import Portfolio, PortfolioContentStatus, PortfolioVisibility, ProjectItem, TimelineEntry


def done_checks(db: Session, user_id: int) -> set[str]:
    """The portfolio checks the learner passes: welcome, timeline, project, traits, launch, badges."""
    done: set[str] = set()
    # Badges: the learner started a plan from Discover, or holds a badge.
    if (db.exec(select(Goal.id).where(Goal.subject_user_id == user_id, Goal.source == GoalSource.JOINED)).first()
            or db.exec(select(BadgeAward.id).where(BadgeAward.user_id == user_id)).first()):
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
    # Strengths and values: picked as traits, or tapped in the portfolio's "Skills and values" (DEV-210).
    from src.services.goals.portfolio_steps import items

    if all(items(db, user_id, "traits", kind) for kind in ("strength", "value")):
        done.add("traits")
    if portfolio.visibility == PortfolioVisibility.PUBLIC:
        done.add("launch")
    return done
