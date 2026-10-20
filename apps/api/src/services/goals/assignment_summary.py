"""An assignment as staff see it: who it went to, its schedule and staff, and how far its learners are."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalAssignment, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress, StepStatus
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.goals.document import iter_steps

WAITING = {StepStatus.SUBMITTED.value, StepStatus.CHANGES_REQUESTED.value}


def _value(item) -> str:
    return getattr(item, "value", item)


def status_fields(assignment: GoalAssignment) -> dict:
    """Where an assignment stands: active, paused or ended, and since when."""
    return {"status": _value(assignment.status), "paused_at": assignment.paused_at, "ended_at": assignment.ended_at}


def collaborators_of(assignment: GoalAssignment) -> list[dict]:
    return list(assignment.collaborators or []) or [{"user_id": user_id, "role_key": None} for user_id in assignment.staff_user_ids or []]


def _person(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "user_uuid": user.user_uuid, "username": user.username, "first_name": user.first_name,
            "last_name": user.last_name, "avatar_image": user.avatar_image}


def _progress(db: Session, goals: list[Goal]) -> tuple[dict[int, tuple[int, int]], int]:
    """Per goal (done, total), and how many steps wait on staff."""
    steps = db.exec(select(GoalStep.id, GoalStep.goal_id).where(GoalStep.goal_id.in_([goal.id for goal in goals]))).all() if goals else []  # type: ignore[union-attr]
    statuses = {
        int(row.step_id): _value(row.status)
        for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_([step_id for step_id, _ in steps]))).all()  # type: ignore[union-attr]
    } if steps else {}
    counts: dict[int, list[int]] = {int(goal.id): [0, 0] for goal in goals}  # type: ignore[arg-type]
    for step_id, goal_id in steps:
        counts[int(goal_id)][1] += 1
        counts[int(goal_id)][0] += statuses.get(int(step_id)) in DONE_STEP_STATUSES
    return {goal_id: (done, total) for goal_id, (done, total) in counts.items()}, sum(status in WAITING for status in statuses.values())


def assignment_dict(db: Session, assignment: GoalAssignment) -> dict:
    from src.services.goals.badge_authority import version_status

    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    goals = list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(Goal.id)).all())  # type: ignore[arg-type]
    progress, waiting = _progress(db, goals)
    done = sum(item[0] for item in progress.values())
    total = sum(item[1] for item in progress.values())
    percents = [round(item[0] * 100 / item[1]) if item[1] else 0 for item in progress.values()]
    lifecycle = {status: 0 for status in ("pending", "active", "finished", "archived")}
    for goal in goals:
        lifecycle[_value(goal.status)] = lifecycle.get(_value(goal.status), 0) + 1
    staff = db.exec(select(User).where(User.id.in_(assignment.staff_user_ids))).all() if assignment.staff_user_ids else []  # type: ignore[union-attr]
    external = bool(assignment.subject_email) and not assignment.user_id and not assignment.usergroup_id
    return {
        "assignment_uuid": assignment.assignment_uuid, "org_id": assignment.org_id,
        "template_uuid": template.template_uuid if template else "", "template_title": template.title if template else "Deleted template",
        "version": version.number if version else None, "usergroup_id": assignment.usergroup_id, "user_id": assignment.user_id,
        "subject_email": assignment.subject_email, "welcome_message": assignment.welcome_message,
        "staff_user_ids": assignment.staff_user_ids or [], "collaborators": collaborators_of(assignment),
        "staff": [_person(user) for user in staff], "owner": _person(db.get(User, assignment.owner_user_id) if assignment.owner_user_id else None),
        "schedule": {
            "stages": [{"stage_key": key, **value} for key, value in (assignment.stage_dates or {}).items()],
            "steps": [{"step_key": key, **value} for key, value in (assignment.step_dates or {}).items()],
        },
        "start_date": assignment.start_date, "due_date": assignment.due_date, **status_fields(assignment), "creation_date": assignment.creation_date,
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "user": _person(db.get(User, assignment.user_id) if assignment.user_id else None),
        "assignment_type": "group" if group else ("external" if external else "individual"),
        "learner_count": len(goals), "goal_uuid": goals[0].goal_uuid if len(goals) == 1 else None,
        "lifecycle_counts": lifecycle,
        "step_count": sum(1 for _ in iter_steps(version.document or {})) if version else 0,
        "completed_count": done, "ready_for_review_count": waiting,
        "progress_percent": round(done * 100 / total) if total else 0, **version_status(db, assignment),
        "min_progress_percent": min(percents) if percents else 0, "max_progress_percent": max(percents) if percents else 0,
    }
