"""What activity and badge steps point at, for their cards: titles, images and page counts."""

from __future__ import annotations

from sqlmodel import Session, func, select

from src.db.goals import GoalStep, GoalTemplate
from src.db.learning import LearningActivity, LearningPage
from src.services.badges.definition import badge_summary


def attach(db: Session, steps: list[GoalStep], views: dict[int, dict]) -> None:
    """Add ``reference`` to each step view that points at an activity or a plan with a badge (one query per kind)."""
    activity_ids = {step.activity_id for step in steps if step.activity_id}
    template_ids = {step.badge_template_id for step in steps if step.badge_template_id}
    activities = {row.id: row for row in db.exec(select(LearningActivity).where(LearningActivity.id.in_(activity_ids))).all()} if activity_ids else {}  # type: ignore[union-attr]
    pages = dict(db.exec(select(LearningPage.activity_id, func.count()).where(LearningPage.activity_id.in_(activity_ids)).group_by(LearningPage.activity_id)).all()) if activity_ids else {}  # type: ignore[union-attr, arg-type]
    plans = {row.id: row for row in db.exec(select(GoalTemplate).where(GoalTemplate.id.in_(template_ids))).all()} if template_ids else {}  # type: ignore[union-attr]
    for step in steps:
        view = views[int(step.id)]  # type: ignore[arg-type]
        activity, plan = activities.get(step.activity_id), plans.get(step.badge_template_id)
        if activity:
            view["reference"] = {"activity_uuid": activity.activity_uuid, "title": activity.title, "page_count": int(pages.get(activity.id, 0))}
        elif plan:
            view["reference"] = {"template_uuid": plan.template_uuid, "title": plan.title, "thumbnail_image": plan.thumbnail_image,
                                 "badge": badge_summary(db, plan)}
        else:
            view["reference"] = None
