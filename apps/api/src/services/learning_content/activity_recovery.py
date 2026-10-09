"""Admin-facing recovery for activities whose stored content predates the models."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import Request
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import access_rules, lookups
from src.services.learning_content.models import Flow, StandardPageContent
from src.services.learning_content.recovery import content_issues, repair

logger = logging.getLogger(__name__)


def _pages(db_session: Session, activity: LearningActivity) -> list[LearningPage]:
    return db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore[attr-defined]


def _issues(activity: LearningActivity, pages: list[LearningPage]) -> dict:
    flow = (activity.settings or {}).get("flow")
    return {
        "pages": {
            page.page_uuid: issues
            for page in pages
            if page.page_type == LearningPageType.STANDARD and (issues := content_issues(StandardPageContent, page.content))
        },
        "flow": content_issues(Flow, flow) if flow else [],
    }


async def get_activity_issues(request: Request, activity_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    """Content issues per page and in the flow. Pages with issues still work for
    learners and can still be saved; edits just cannot add new issues."""
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    return _issues(activity, _pages(db_session, activity))


async def repair_activity(request: Request, activity_uuid: str, apply: bool, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    """Fix what can be fixed mechanically. ``apply=False`` only reports the
    changes so the admin can review them first; applying requires a draft."""
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    version = lookups._assert_content_editable(db_session, activity.version_id) if apply else None
    pages = _pages(db_session, activity)
    changes: dict = {"pages": {}, "flow": []}
    for page in pages:
        if page.page_type != LearningPageType.STANDARD:
            continue
        fixed, page_changes = repair(StandardPageContent, page.content)
        if page_changes:
            changes["pages"][page.page_uuid] = page_changes
            if apply:
                page.content = fixed
                page.update_date = str(datetime.utcnow())
                db_session.add(page)
    flow = (activity.settings or {}).get("flow")
    if flow:
        fixed_flow, changes["flow"] = repair(Flow, flow)
        if apply and changes["flow"]:
            activity.settings = {**(activity.settings or {}), "flow": fixed_flow}
            db_session.add(activity)
    if apply and version and (changes["pages"] or changes["flow"]):
        lookups._bump_version(version)
        db_session.add(version)
        db_session.commit()
        logger.info("Repaired learning activity %s content: %s", activity.activity_uuid, changes)
    return {
        "applied": apply,
        "changes": changes,
        "remaining": _issues(activity, pages),
        "activity": lookups._serialize_activity(activity, pages) if apply else None,
    }
