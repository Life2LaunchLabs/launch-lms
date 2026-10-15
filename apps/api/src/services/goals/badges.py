"""Earning a badge through a goal.

Starting a badge issues the learner's own goal from one of the badge's routes
(goal templates its creator publishes with it), offered by an issuer
organization whose staff join as reviewers. The learner owns it but can't
restructure it; finishing every step awards the badge (see completion).
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalSource, GoalStatus, GoalStep, GoalTemplate, StepProgress
from src.db.learning import LearningBadge
from src.db.programs import Program
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


def _routes(db: Session, badge: LearningBadge) -> list[tuple[BadgeRoute, str]]:
    """The badge's routes with their template uuids (templates keep their legacy template's uuid)."""
    return [(route, uuid) for route, uuid in db.exec(
        select(BadgeRoute, Program.program_uuid).join(Program, Program.id == BadgeRoute.program_id)
        .where(BadgeRoute.badge_id == badge.id).order_by(BadgeRoute.position, BadgeRoute.id)  # type: ignore[arg-type]
    ).all()]


def start_badge_goal(db: Session, user: PublicUser, badge: LearningBadge, template_uuid: str | None, issuer_org_id: int | None) -> Goal:
    """The learner's goal for a badge (committed): their existing one, or a new one from the chosen route."""
    from src.services.badge_routes import _offered, _offers
    from src.services.learning_issuers import validate_issuer_start

    user_id = int(user.id)
    existing = active_badge_goal(db, badge, user_id)
    if existing:
        return existing
    routes = _routes(db, badge)
    if not routes:
        raise HTTPException(status_code=409, detail="This badge has no way to earn it yet")
    if template_uuid:
        chosen = next(((route, uuid) for route, uuid in routes if uuid == template_uuid), None)
    else:
        chosen = next(((route, uuid) for route, uuid in routes if route.recommended), routes[0])
    if not chosen:
        raise HTTPException(status_code=404, detail="This goal template is not a way to earn this badge")
    route, uuid = chosen
    issuer = issuer_org_id or int(badge.org_id)
    if not _offers(_offered(db, badge), issuer, route):
        raise HTTPException(status_code=403, detail="This organization doesn't offer that way of earning the badge")
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == uuid)).first()
    if not template:
        raise HTTPException(status_code=409, detail="This way of earning the badge isn't ready yet")
    version = templates.issuable_version(db, template)
    link = validate_issuer_start(db, badge, issuer, user_id, set())
    goal = issue_goal(
        db, template, version, subject_user_id=user_id, owner_user_id=user_id, org_id=issuer, source=GoalSource.BADGE,
        badge_id=badge.id, title=badge.name, staff_user_ids=[int(item) for item in (link.staff_user_ids if link else [])], actor_user_id=user_id,
    )
    db.commit()
    db.refresh(goal)
    return goal


def goal_summaries(db: Session, user_id: int | None, badge_ids: list[int]) -> dict[int, dict]:
    """Badge id -> the learner's active badge goal as {goal_uuid, done, total, status}, for badge pages."""
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
        badge_id: {"goal_uuid": goal.goal_uuid, "done": counts.get(int(goal.id), [0, 0])[0], "total": counts.get(int(goal.id), [0, 0])[1],  # type: ignore[arg-type]
                   "status": _value(goal.status)}
        for badge_id, goal in by_badge.items()
    }


def goal_summary(db: Session, user_id: int | None, badge: LearningBadge) -> dict | None:
    return goal_summaries(db, user_id, [int(badge.id)]).get(int(badge.id))  # type: ignore[arg-type]
