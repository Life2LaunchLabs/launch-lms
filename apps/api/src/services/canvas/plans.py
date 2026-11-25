"""Opening a plan from a Canvas module item or assignment (PF-4, DEV-228).

A link a teacher added with the plan picker carries the plan in its `plan` custom parameter. A student who
opens it lands on their own goal from that plan, started for them if they don't have it yet; a teacher lands
on the plan's staff view. A plan that was removed, or that the school can no longer hand out, shows a plain
message instead.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalSource, GoalStatus, GoalTemplate
from src.services.canvas.launch import LaunchError

GONE = "This plan isn't in Life2Launch any more. Ask your teacher to check the link in Canvas."
# A plan the student is doing, or finished: opening the link again shows that one.
SHOWN_GOALS = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)


def school_template(db: Session, org_id: int, template_uuid: str) -> GoalTemplate:
    """The plan, when this school may hand it out as it is; otherwise a plain message."""
    from src.services.goals import plan_issuers, templates

    try:
        template = plan_issuers.runnable(db, org_id, template_uuid)
        templates.issuable_version(db, template)
    except HTTPException as error:
        raise LaunchError(GONE, 404) from error
    return template


def _student_goal(db: Session, template: GoalTemplate, org_id: int, user_id: int) -> Goal:
    from src.services.goals import templates
    from src.services.goals.issue import issue_goal

    goal = db.exec(select(Goal).where(Goal.template_id == template.id, Goal.subject_user_id == user_id,
                                      col(Goal.status).in_(SHOWN_GOALS)).order_by(col(Goal.id).desc())).first()
    if goal is not None:
        # One handed to them already and waiting for an answer opens as it is, where they accept it.
        return goal
    goal = issue_goal(db, template, templates.issuable_version(db, template), subject_user_id=user_id, owner_user_id=user_id,
                      org_id=org_id, source=GoalSource.JOINED, actor_user_id=user_id)
    db.commit()
    return goal


def landing(db: Session, org_id: int, template_uuid: str, user_id: int, staff: bool) -> str:
    """Where a launch from a plan's link opens: the plan's staff view, or the student's goal from it."""
    template = school_template(db, org_id, template_uuid)
    if staff:
        return f"/admin/plans/{template.template_uuid}"
    return f"/plans/{_student_goal(db, template, org_id, user_id).goal_uuid}"
