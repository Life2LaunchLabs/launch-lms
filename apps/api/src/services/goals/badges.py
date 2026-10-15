"""Earning a badge through a goal.

Starting a badge issues the learner's own goal from one of the badge's routes
(goal templates its creator publishes with it), offered by an issuer
organization whose staff join as reviewers. The learner owns it but can't
restructure it; finishing every step awards the badge (see completion).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalSource, GoalStatus, GoalStep, GoalTemplate, StepProgress
from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeVersion,
)
from src.db.users import PublicUser
from src.services.goals import templates
from src.services.goals.issue import issue_goal

LIVE = (GoalStatus.ACTIVE, GoalStatus.FINISHED)


def _value(item) -> str:
    return getattr(item, "value", item)


def active_badge_goal(db: Session, badge: LearningBadge, user_id: int) -> Goal | None:
    return db.exec(select(Goal).where(
        Goal.badge_id == badge.id, Goal.subject_user_id == user_id, Goal.source == GoalSource.BADGE, Goal.status.in_(LIVE),  # type: ignore[attr-defined]
    ).order_by(Goal.id.desc())).first()  # type: ignore[union-attr]


def badge_routes(db: Session, badge: LearningBadge) -> list[tuple[BadgeRoute, GoalTemplate]]:
    """The badge's routes with their goal templates, in order."""
    return list(db.exec(
        select(BadgeRoute, GoalTemplate).join(GoalTemplate, GoalTemplate.id == BadgeRoute.goal_template_id)
        .where(BadgeRoute.badge_id == badge.id).order_by(BadgeRoute.position, BadgeRoute.id)  # type: ignore[arg-type]
    ).all())


def start_badge_goal(db: Session, user: PublicUser, badge: LearningBadge, template_uuid: str | None, issuer_org_id: int | None, commit: bool = True) -> Goal:
    """The learner's goal for a badge: their existing one, or a new one from the chosen route (committed unless ``commit`` is false)."""
    from src.services.goals.badge_routes import offered, offers
    from src.services.learning_issuers import validate_issuer_start

    user_id = int(user.id)
    existing = active_badge_goal(db, badge, user_id)
    if existing:
        return existing
    routes = badge_routes(db, badge)
    if not routes:
        raise HTTPException(status_code=409, detail="This badge has no way to earn it yet")
    if template_uuid:
        chosen = next(((route, template) for route, template in routes if template.template_uuid == template_uuid), None)
    else:
        chosen = next(((route, template) for route, template in routes if route.recommended), routes[0])
    if not chosen:
        raise HTTPException(status_code=404, detail="This goal template is not a way to earn this badge")
    route, template = chosen
    issuer = issuer_org_id or int(badge.org_id)
    if not offers(offered(db, badge), issuer, route):
        raise HTTPException(status_code=403, detail="This organization doesn't offer that way of earning the badge")
    version = templates.issuable_version(db, template)
    link = validate_issuer_start(db, badge, issuer, user_id)
    goal = issue_goal(
        db, template, version, subject_user_id=user_id, owner_user_id=user_id, org_id=issuer, source=GoalSource.BADGE,
        badge_id=badge.id, title=badge.name, staff_user_ids=[int(item) for item in (link.staff_user_ids if link else [])], actor_user_id=user_id,
    )
    if not commit:
        db.flush()
        return goal
    db.commit()
    db.refresh(goal)
    return goal


def goal_summaries(db: Session, user_id: int | None, badge_ids: list[int]) -> dict[int, dict]:
    """Badge id -> the learner's active badge goal as {goal_uuid, title, done, total, status}, for badge pages."""
    if not user_id or not badge_ids:
        return {}
    goals = db.exec(select(Goal).where(
        Goal.subject_user_id == user_id, Goal.source == GoalSource.BADGE, Goal.badge_id.in_(badge_ids), Goal.status == GoalStatus.ACTIVE,  # type: ignore[union-attr]
    ).order_by(Goal.id)).all()  # type: ignore[arg-type]
    by_badge = {int(goal.badge_id): goal for goal in goals}  # type: ignore[arg-type]
    rows = db.exec(
        select(GoalStep.goal_id, StepProgress.status).outerjoin(StepProgress, StepProgress.step_id == GoalStep.id)
        .where(GoalStep.goal_id.in_([goal.id for goal in by_badge.values()]))  # type: ignore[union-attr]
    ).all() if by_badge else []
    counts: dict[int, list[int]] = {}
    for goal_id, status in rows:
        count = counts.setdefault(int(goal_id), [0, 0])
        count[1] += 1
        count[0] += _value(status) in DONE_STEP_STATUSES
    return {
        badge_id: {"goal_uuid": goal.goal_uuid, "title": goal.title, "done": counts.get(int(goal.id), [0, 0])[0], "total": counts.get(int(goal.id), [0, 0])[1],  # type: ignore[arg-type]
                   "status": _value(goal.status)}
        for badge_id, goal in by_badge.items()
    }


def goal_summary(db: Session, user_id: int | None, badge: LearningBadge) -> dict | None:
    return goal_summaries(db, user_id, [int(badge.id)]).get(int(badge.id))  # type: ignore[arg-type]


def badge_summary(db: Session, badge_id: int | None) -> dict | None:
    badge = db.get(LearningBadge, badge_id) if badge_id else None
    return {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or ""} if badge else None


def award_badge(db: Session, badge: LearningBadge, user_id: int, issuing_org_id: int | None, evidence: dict) -> LearningBadgeAward:
    """Award the badge's current major version for finishing a way to earn it (flushed, not committed)."""
    version = db.get(LearningBadgeVersion, badge.active_version_id) if badge.active_version_id else None
    major = int(str(version.semantic_version or "1.0.0").split(".")[0]) if version else 1
    award = db.exec(select(LearningBadgeAward).where(
        LearningBadgeAward.badge_id == badge.id, LearningBadgeAward.user_id == user_id, LearningBadgeAward.major_version == major,
    )).first()
    if award is None:
        now = datetime.utcnow()
        award = LearningBadgeAward(
            award_uuid=f"award_{uuid4()}", badge_id=badge.id, badge_version_id=version.id if version else None, major_version=major,
            org_id=badge.org_id, issuing_org_id=issuing_org_id if issuing_org_id != badge.org_id else None,
            user_id=user_id, source=LearningAwardSource.PLAN_COMPLETION, issued_at=now,
            evidence=evidence, creation_date=str(now), update_date=str(now),
        )
        db.add(award)
        for link in db.exec(select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.badge_id == badge.id, BadgeIssuerLearnerLink.user_id == user_id,
            BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
        )).all():
            link.status, link.end_reason, link.ended_at, link.update_date = BadgeIssuerLearnerLinkStatus.COMPLETED, "badge_completed", now, str(now)
            db.add(link)
    db.flush()
    return award
