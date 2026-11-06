"""What activity, badge and resources steps point at, for their cards: titles, images, page counts and links."""

from __future__ import annotations

from sqlmodel import Session, func, select

from src.db.goals import GoalStep, GoalTemplate
from src.db.learning import LearningActivity, LearningPage
from src.db.resources import Resource
from src.services.badges.definition import badge_summary


def attach(db: Session, steps: list[GoalStep], views: dict[int, dict]) -> None:
    """Add ``reference`` to each step view that points at an activity or a plan with a badge (one query per kind)."""
    activity_ids = {step.activity_id for step in steps if step.activity_id}
    template_ids = {step.badge_template_id for step in steps if step.badge_template_id}
    activities = {row.id: row for row in db.exec(select(LearningActivity).where(LearningActivity.id.in_(activity_ids))).all()} if activity_ids else {}  # type: ignore[union-attr]
    pages = dict(db.exec(select(LearningPage.activity_id, func.count()).where(LearningPage.activity_id.in_(activity_ids)).group_by(LearningPage.activity_id)).all()) if activity_ids else {}  # type: ignore[union-attr, arg-type]
    plans = {row.id: row for row in db.exec(select(GoalTemplate).where(GoalTemplate.id.in_(template_ids))).all()} if template_ids else {}  # type: ignore[union-attr]
    resource_uuids = {item.get("resource_uuid") for step in steps if step.type == "resources" for item in (step.config or {}).get("resources") or []}
    resources = {row.resource_uuid: row for row in db.exec(select(Resource).where(Resource.resource_uuid.in_(resource_uuids))).all()} if resource_uuids else {}  # type: ignore[attr-defined]
    for step in steps:
        view = views[int(step.id)]  # type: ignore[arg-type]
        if step.type == "resources":
            view["reference"] = {"resources": [_resource_card(resources.get(item.get("resource_uuid")), item) for item in (step.config or {}).get("resources") or []]}
            continue
        activity, plan = activities.get(step.activity_id), plans.get(step.badge_template_id)
        if activity:
            view["reference"] = {"activity_uuid": activity.activity_uuid, "title": activity.title, "page_count": int(pages.get(activity.id, 0))}
        elif plan:
            view["reference"] = {"template_uuid": plan.template_uuid, "title": plan.title, "thumbnail_image": plan.thumbnail_image,
                                 "badge": badge_summary(db, plan)}
        else:
            view["reference"] = None


def _resource_card(resource: Resource | None, item: dict) -> dict:
    """A Resources step's resource as its card shows it; one since removed keeps the title the step saved."""
    if not resource:
        return {"resource_uuid": item.get("resource_uuid"), "title": item.get("title") or "Resource", "url": "", "missing": True}
    return {
        "resource_uuid": resource.resource_uuid, "title": resource.title, "url": resource.external_url or resource.provider_url or "",
        "description": (resource.description or "")[:400], "resource_type": str(getattr(resource.resource_type, "value", resource.resource_type) or "other"),
        "provider_name": resource.provider_name or "", "cover_image_url": resource.cover_image_url or "", "estimated_time": resource.estimated_time, "missing": False,
    }
