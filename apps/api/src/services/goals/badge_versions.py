"""Badge steps pin the badge's major version; a new major version leaves them outdated until an admin moves them on."""

from __future__ import annotations

from copy import deepcopy

from sqlmodel import Session, select

from src.db.goals import GoalTemplate
from src.db.learning import LearningBadge, LearningBadgeAward, LearningBadgeVersion
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.document import iter_steps


def _major(version: str | None) -> int:
    try:
        return int(str(version or "1").split(".")[0])
    except (TypeError, ValueError):
        return 1


def _published(db: Session, badge_id: int) -> list[LearningBadgeVersion]:
    return list(db.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge_id, LearningBadgeVersion.state == "published")).all())


def latest_major(db: Session, badge_id: int) -> int:
    return max((_major(version.semantic_version) for version in _published(db, badge_id)), default=1)


def _badge(db: Session, badge_uuid: str | None) -> LearningBadge | None:
    return db.exec(select(LearningBadge).where(LearningBadge.badge_uuid == badge_uuid)).first() if badge_uuid else None


def _side(version: LearningBadgeVersion | None, major: int, fallback: str) -> dict:
    return {
        "semantic_version": version.semantic_version if version else f"{major}.x",
        "title": version.title if version else fallback, "description": version.description if version else "",
    }


def outdated_badge_steps(db: Session, template: GoalTemplate) -> list[dict]:
    """Draft badge steps pinned to an older major version than the badge's latest."""
    outdated = []
    for stage, step in iter_steps(template.document or {}):
        config = step.get("config") or {}
        pinned = config.get("major_version")
        badge = _badge(db, config.get("badge_uuid")) if step.get("type") == "badge" and pinned else None
        if not badge:
            continue
        latest = latest_major(db, int(badge.id))  # type: ignore[arg-type]
        if latest <= int(pinned):
            continue
        versions = _published(db, int(badge.id))  # type: ignore[arg-type]
        holders = set(db.exec(select(LearningBadgeAward.user_id).where(LearningBadgeAward.badge_id == badge.id, LearningBadgeAward.major_version < latest)).all())
        outdated.append({
            "stage_key": stage["key"], "step_key": step["key"], "title": step["title"], "badge_uuid": badge.badge_uuid, "badge_name": badge.name,
            "major_version": int(pinned), "latest_major_version": latest, "earlier_version_holder_count": len(holders),
            "version_comparison": {
                "previous": _side(next((item for item in versions if _major(item.semantic_version) == int(pinned)), None), int(pinned), "Earlier version"),
                "latest": _side(next((item for item in versions if _major(item.semantic_version) == latest), None), latest, "New version"),
            },
        })
    return outdated


def update_badge_versions(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, accept_previous_major_versions: bool = False) -> dict:
    """Move every badge step of the draft to its badge's latest major version; publishing hands it out."""
    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    document = deepcopy(template.document or {})
    changed = False
    for _, step in iter_steps(document):
        config = step.get("config") or {}
        badge = _badge(db, config.get("badge_uuid")) if step.get("type") == "badge" else None
        if not badge:
            continue
        latest = latest_major(db, int(badge.id))  # type: ignore[arg-type]
        if config.get("major_version") != latest:
            config["major_version"] = latest
            config["accept_previous_major_versions"] = accept_previous_major_versions
            step["config"] = config
            changed = True
    if changed:
        templates._store(db, template, templates._validated(db, template, document))
        db.commit()
        db.refresh(template)
    return {**templates.template_dict(db, template), "outdated_badge_steps": outdated_badge_steps(db, template)}
