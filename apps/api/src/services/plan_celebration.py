"""The one-time reward a learner sees when one of their plans is finished."""

from sqlmodel import Session, select

from src.db.planning import Plan, PlanStatus
from src.db.users import PublicUser, User

CELEBRATED_PLANS_KEY = "celebrated_plans"


def pending_celebrations(db: Session, user_id: int) -> list[str]:
    """The learner's finished plans that have not greeted them yet; each greets once."""
    user = db.get(User, user_id)
    seen = set(((user.details or {}).get(CELEBRATED_PLANS_KEY) or []) if user else [])
    finished = db.exec(select(Plan.plan_uuid).where(Plan.subject_user_id == user_id, Plan.status == PlanStatus.COMPLETED)).all()
    return [plan_uuid for plan_uuid in finished if plan_uuid not in seen]


def mark_plan_celebrated(db: Session, current_user: PublicUser, identifier: str) -> dict:
    from src.services.planning import _plan_or_404, _require

    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "view_plan")
    user = db.get(User, current_user.id)
    if user and plan.subject_user_id == current_user.id:
        details = dict(user.details or {})
        seen = [uuid for uuid in details.get(CELEBRATED_PLANS_KEY) or [] if uuid != plan.plan_uuid]
        details[CELEBRATED_PLANS_KEY] = [*seen, plan.plan_uuid][-200:]
        user.details = details
        db.add(user)
        db.commit()
    return {"plan_uuid": plan.plan_uuid, "celebration_pending": False}
