"""What activity and badge steps point at, for their cards: titles, images and page counts."""

from __future__ import annotations

from sqlmodel import Session, func, select

from src.db.goals import GoalStep
from src.db.learning import LearningActivity, LearningBadge, LearningPage


def attach(db: Session, steps: list[GoalStep], views: dict[int, dict]) -> None:
    """Add ``reference`` to each step view that points at an activity or a badge (one query per kind)."""
    activity_ids = {step.activity_id for step in steps if step.activity_id}
    badge_ids = {step.badge_id for step in steps if step.badge_id}
    activities = {row.id: row for row in db.exec(select(LearningActivity).where(LearningActivity.id.in_(activity_ids))).all()} if activity_ids else {}  # type: ignore[union-attr]
    pages = dict(db.exec(select(LearningPage.activity_id, func.count()).where(LearningPage.activity_id.in_(activity_ids)).group_by(LearningPage.activity_id)).all()) if activity_ids else {}  # type: ignore[union-attr, arg-type]
    badges = {row.id: row for row in db.exec(select(LearningBadge).where(LearningBadge.id.in_(badge_ids))).all()} if badge_ids else {}  # type: ignore[union-attr]
    for step in steps:
        view = views[int(step.id)]  # type: ignore[arg-type]
        activity, badge = activities.get(step.activity_id), badges.get(step.badge_id)
        if activity:
            view["reference"] = {"activity_uuid": activity.activity_uuid, "title": activity.title, "page_count": int(pages.get(activity.id, 0))}
        elif badge:
            view["reference"] = {"badge_uuid": badge.badge_uuid, "title": badge.name, "thumbnail_image": badge.thumbnail_image}
        else:
            view["reference"] = None
