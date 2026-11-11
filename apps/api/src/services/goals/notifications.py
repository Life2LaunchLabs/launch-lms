"""Which plan happenings become email notifications, and for whom (services/notifications does the sending).

- A step handed in for review: everyone who reviews that goal (its owner and staff holding the
  review capability), never the person who handed it in.
- A hand-in approved or sent back: the person whose goal it is, with the reviewer named as they see them.
- A plan an organization gives someone with an account: that person (people without one get the invitation email).
"""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.goal_sharing import PlanCollaborator
from src.db.goals import Goal, GoalAssignment, GoalStep, StepProgress, StepStatus
from src.services.goals import access
from src.services.goals.review import REVIEW
from src.services.goals.sharing_roles import user_summary
from src.services.notifications.outbox import notify


def _value(item) -> str:
    return getattr(item, "value", item)


def reviewers(db: Session, goal: Goal) -> list[int]:
    candidates = {int(goal.owner_user_id)} if goal.owner_user_id else set()
    candidates |= {int(user_id) for user_id in db.exec(select(PlanCollaborator.user_id).where(
        PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True,  # noqa: E712
    )).all() if user_id}
    candidates.discard(int(goal.subject_user_id or 0))
    return sorted(user_id for user_id in candidates if REVIEW in access.capabilities(db, goal, user_id))


def _name(db: Session, user_id: int | None) -> str | None:
    summary = user_summary(db, user_id)
    return summary["name"] if summary else None


def _base(goal: Goal, step: GoalStep) -> dict:
    return {"goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "step_key": step.template_key, "step_title": step.title, "plan_title": goal.title}


def on_step_status(db: Session, goal: Goal, step: GoalStep, progress: StepProgress, previous: str, actor_user_id: int | None, note: str | None) -> None:
    """Called by completion after every status change, inside its transaction."""
    current = _value(progress.status)
    if current == previous or not goal.org_id:
        return
    if current == StepStatus.SUBMITTED.value:
        assignment_uuid = db.exec(select(GoalAssignment.assignment_uuid).where(GoalAssignment.id == goal.assignment_id)).first() if goal.assignment_id else None
        data = {**_base(goal, step), "assignment_uuid": assignment_uuid, "person_name": _name(db, goal.subject_user_id)}
        for reviewer in reviewers(db, goal):
            notify(db, "step_submitted", reviewer, org_id=goal.org_id, data=data, actor_user_id=actor_user_id)
    elif previous == StepStatus.SUBMITTED.value and current in (StepStatus.COMPLETED.value, StepStatus.CHANGES_REQUESTED.value):
        from src.services.connect.people import learner_name

        reviewer = learner_name(db, actor_user_id, goal.org_id) or _name(db, actor_user_id)
        kind = "step_approved" if current == StepStatus.COMPLETED.value else "step_sent_back"
        notify(db, kind, goal.subject_user_id, org_id=goal.org_id, actor_user_id=actor_user_id,
               data={**_base(goal, step), "reviewer_name": reviewer, "note": (note or "")[:500]})


def on_plan_assigned(db: Session, goal: Goal) -> None:
    """A goal an assignment issued to someone who already has an account."""
    if goal.subject_user_id and goal.org_id:
        notify(db, "plan_assigned", goal.subject_user_id, org_id=goal.org_id, data={"goal_uuid": goal.goal_uuid, "plan_title": goal.title},
               dedupe_key=f"plan_assigned:{goal.goal_uuid}")
