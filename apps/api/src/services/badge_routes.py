"""Legacy badge plans: finishing a plan (the old ``Plan`` model) awards its badge.

Badges are earned through plan templates now (``goals/badges``, ``goals/badge_routes``);
the legacy program routes that used to start these plans are gone. Plans already
running still finish and award here.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from src.db.learning import LearningBadge, LearningBadgeAward
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanStatus
from src.services.goals.badges import award_badge, badge_summary  # noqa: F401  (moved; re-exported for legacy plans)


def award_if_plan_complete(db: Session, plan: Plan) -> LearningBadgeAward | None:
    """Every step of a badge plan finished: the issuer awards the badge.

    Plans issued by an organization or template finish the same way, without a
    badge; plans learners write themselves stay open until they mark them done.
    """
    if not plan.subject_user_id or not (plan.source_badge_id or plan.source_org_id or plan.source_program_id):
        return None
    objective_count = len(db.exec(select(PlanObjective.id).where(PlanObjective.plan_id == plan.id)).all())
    rows = db.exec(
        select(PlanObjectiveProgress.status).join(PlanObjective, PlanObjective.id == PlanObjectiveProgress.plan_objective_id)
        .where(PlanObjective.plan_id == plan.id)
    ).all()
    statuses = [getattr(status, "value", status) for status in rows]
    if not statuses or len(statuses) < objective_count or any(status not in {"completed", "canceled"} for status in statuses) or "completed" not in statuses:
        return None
    if not plan.source_badge_id:
        if getattr(plan.status, "value", plan.status) == PlanStatus.ACTIVE.value:
            plan.status = PlanStatus.COMPLETED
            plan.completed_at = datetime.utcnow()
            db.add(plan)
            db.commit()
        return None
    badge = db.get(LearningBadge, plan.source_badge_id)
    if not badge:
        return None
    award = award_badge(db, badge, int(plan.subject_user_id), plan.source_org_id, {"plan_uuid": plan.plan_uuid})
    plan.status = PlanStatus.COMPLETED
    plan.completed_at = datetime.utcnow()
    db.add(plan)
    db.commit()
    db.refresh(award)
    return award
