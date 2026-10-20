"""How an org's own plan templates and badges are doing: starts, completions, awards and recent edits.

"Own" means made here: not the system starter and not a copy from the library. Starts count every
goal issued from one of them, in any org (library copies of a template count for its maker too).
The metrics are part of the analytics package, so they come back only when the org has it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, func, select

from src.db.goals import Goal, GoalStatus, GoalTemplate
from src.db.learning import LearningBadge, LearningBadgeAward
from src.db.organization_config import OrganizationConfig
from src.security.features_utils.resolve import resolve_feature

FEATURE = "analytics"
RECENT_DAYS = 30
EDITS = 5
STARTED = (GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)


def _value(item) -> str:
    return getattr(item, "value", item)


def _own_templates(org_id: int):
    return select(GoalTemplate).where(GoalTemplate.org_id == org_id, col(GoalTemplate.system_type).is_(None), col(GoalTemplate.source_template_uuid).is_(None))


def creates(db: Session, org_id: int) -> bool:
    """Whether the org makes its own templates or badges."""
    return bool(db.exec(_own_templates(org_id).limit(1)).first() or db.exec(select(LearningBadge.id).where(LearningBadge.org_id == org_id).limit(1)).first())


def unlocked(db: Session, org_id: int) -> bool:
    config = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    return bool(resolve_feature(FEATURE, (config.config if config else None) or {}, org_id).get("enabled"))


def _count(db: Session, statement) -> int:
    return int(db.exec(select(func.count()).select_from(statement.subquery())).one())


def _goal_counts(db: Session, column, ids: list[int], since: str) -> dict:
    if not ids:
        return {"starts": 0, "recent_starts": 0, "completions": 0, "active": 0}
    goals = select(Goal.id).where(col(column).in_(ids), col(Goal.status).in_(STARTED))
    return {
        "starts": _count(db, goals),
        "recent_starts": _count(db, goals.where(Goal.creation_date >= since)),
        "completions": _count(db, goals.where(Goal.status == GoalStatus.FINISHED.value)),
        "active": _count(db, goals.where(Goal.status == GoalStatus.ACTIVE.value)),
    }


def metrics(db: Session, org_id: int) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)).replace(tzinfo=None).isoformat()
    templates = list(db.exec(_own_templates(org_id)).all())
    copies = list(db.exec(select(GoalTemplate).where(col(GoalTemplate.source_template_uuid).in_([row.template_uuid for row in templates]))).all()) if templates else []
    badges = list(db.exec(select(LearningBadge).where(LearningBadge.org_id == org_id)).all())
    badge_ids = [int(row.id) for row in badges]  # type: ignore[arg-type]
    awards = select(LearningBadgeAward.id).where(col(LearningBadgeAward.badge_id).in_(badge_ids)) if badge_ids else None
    edits = [
        *({"kind": "template", "uuid": row.template_uuid, "title": row.title, "status": "published" if row.published_version_id else "draft", "update_date": row.update_date} for row in templates),
        *({"kind": "badge", "uuid": row.badge_uuid, "title": row.name, "status": _value(row.status), "update_date": row.update_date} for row in badges),
    ]
    edits.sort(key=lambda item: item["update_date"] or "", reverse=True)
    return {
        "recent_days": RECENT_DAYS,
        "templates": {"count": len(templates), "orgs_using": len({row.org_id for row in copies}),
                      **_goal_counts(db, Goal.template_id, [int(row.id) for row in [*templates, *copies]], since)},  # type: ignore[arg-type]
        "badges": {"count": len(badges), **_goal_counts(db, Goal.badge_id, badge_ids, since),
                   "awards": _count(db, awards) if awards is not None else 0,
                   "recent_awards": _count(db, awards.where(LearningBadgeAward.issued_at >= datetime.fromisoformat(since))) if awards is not None else 0},
        "recent_edits": edits[:EDITS],
    }
