"""A goal's lifecycle (archive, delete, finish, reopen, celebrated) and the organization page's goal invitations.

Finishing records how the learner says it went, for the goal's story.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalAssignment, GoalFinish, GoalOwnership, GoalStatus, GoalTemplate
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.goals import access
from src.services.goals.sharing_roles import _stamp, _value, org_summary

# user.details key: {goal_uuid: viewed_at} for org-issued goals still waiting for an answer.
VIEWED_GOAL_INVITATIONS_KEY = "viewed_goal_invitations"


def _personal(goal: Goal) -> bool:
    return _value(goal.ownership) == GoalOwnership.PERSONAL.value


def _set(db: Session, goal: Goal, user_id: int, status: GoalStatus, action: str) -> dict:
    goal.status = status
    goal.update_date = _stamp()
    db.add(goal)
    access.log(db, goal, user_id, action, {})
    db.commit()
    db.refresh(goal)
    return {"goal_uuid": goal.goal_uuid, "status": _value(goal.status), "finished_at": goal.finished_at}


def archive(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "archive_plan")
    return _set(db, goal, current_user.id, GoalStatus.ARCHIVED, "goal.archived")


def delete(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    if not _personal(goal):
        raise HTTPException(status_code=409, detail="Only personal goals can be deleted; archive this one instead")
    if goal.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the goal's owner can delete it")
    db.delete(goal)
    db.commit()
    return {"deleted": True, "goal_uuid": goal_uuid}


def _personal_edit(db: Session, current_user: PublicUser, goal_uuid: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "edit_plan_details")
    if not _personal(goal):
        raise HTTPException(status_code=409, detail="Goals handed to you finish when their steps are done")
    return goal


def finish(db: Session, current_user: PublicUser, goal_uuid: str, payload: GoalFinish | None = None) -> dict:
    goal = _personal_edit(db, current_user, goal_uuid)
    if _value(goal.status) != GoalStatus.ACTIVE.value:
        raise HTTPException(status_code=409, detail="Only active goals can be finished")
    if payload:
        # The goal's story quotes this back; a rename recorded earlier stays.
        said = {"reached": payload.reached, "what_happened": payload.what_happened.strip()}
        goal.finish = {**(goal.finish or {}), **{key: value for key, value in said.items() if value}}
    goal.finished_at = datetime.utcnow()
    return _set(db, goal, current_user.id, GoalStatus.FINISHED, "goal.finished")


def reopen(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = _personal_edit(db, current_user, goal_uuid)
    if _value(goal.status) not in {GoalStatus.FINISHED.value, GoalStatus.ARCHIVED.value}:
        raise HTTPException(status_code=409, detail="This goal is already open")
    goal.finished_at = None
    goal.celebrated_at = None
    return _set(db, goal, current_user.id, GoalStatus.ACTIVE, "goal.reopened")


def mark_celebrated(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    """The learner has seen the reward for a finished goal; it greets them once."""
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    if goal.subject_user_id == current_user.id and not goal.celebrated_at:
        goal.celebrated_at = datetime.utcnow()
        db.add(goal)
        db.commit()
    return {"goal_uuid": goal.goal_uuid, "celebration_pending": False, "celebrated_at": goal.celebrated_at}


# Organization page: goals an organization handed to the learner ---------------------------

def _org_goals(db: Session, user_id: int) -> list[Goal]:
    return list(db.exec(select(Goal).where(
        Goal.subject_user_id == user_id, Goal.ownership == GoalOwnership.EXTERNAL, Goal.assignment_id.is_not(None),  # type: ignore[union-attr]
        Goal.status.in_([GoalStatus.PENDING, GoalStatus.ACTIVE]),  # type: ignore[attr-defined]
    ).order_by(Goal.id.desc())).all())  # type: ignore[union-attr]


def _viewed(db: Session, user_id: int) -> dict:
    user = db.get(User, user_id)
    return dict(((user.details or {}).get(VIEWED_GOAL_INVITATIONS_KEY) or {}) if user else {})


def org_invitations(db: Session, current_user: PublicUser) -> list[dict]:
    """Pending goals waiting for the learner's answer, and the active ones they took on (answer with POST /goals/{uuid}/respond)."""
    viewed = _viewed(db, current_user.id)
    result = []
    for goal in _org_goals(db, current_user.id):
        assignment = db.get(GoalAssignment, goal.assignment_id)
        organization = org_summary(db, goal.org_id)
        if not assignment or not organization:
            continue
        template = db.get(GoalTemplate, goal.template_id) if goal.template_id else None
        group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
        pending = _value(goal.status) == GoalStatus.PENDING.value
        result.append({
            "goal_uuid": goal.goal_uuid, "org_id": goal.org_id, "status": _value(goal.status), "title": goal.title,
            "unread": pending and goal.goal_uuid not in viewed, "viewed_at": viewed.get(goal.goal_uuid), "created_at": goal.creation_date,
            "organization": organization,
            "template": {"template_uuid": template.template_uuid, "title": template.title, "description": template.description, "thumbnail_image": template.thumbnail_image} if template else None,
            "group": {"id": group.id, "name": group.name} if group else None,
            "assignment": {
                "assignment_uuid": assignment.assignment_uuid, "welcome_message": assignment.welcome_message,
                "start_date": assignment.start_date, "due_date": assignment.due_date, "status": getattr(assignment.status, "value", assignment.status),
            },
        })
    return result


def mark_org_invitations_viewed(db: Session, current_user: PublicUser) -> dict:
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    pending = [goal.goal_uuid for goal in _org_goals(db, current_user.id) if _value(goal.status) == GoalStatus.PENDING.value]
    viewed = _viewed(db, current_user.id)
    now = _stamp()
    updated = sum(1 for uuid in pending if uuid not in viewed)
    # Only goals still waiting are kept, so the map stays small.
    details = dict(user.details or {})
    details[VIEWED_GOAL_INVITATIONS_KEY] = {uuid: viewed.get(uuid) or now for uuid in pending}
    user.details = details
    db.add(user)
    db.commit()
    return {"detail": "Goal invitations marked as viewed", "updated": updated}
