"""An assignment's template version: what a newer one changes, and applying it.

When the owner changes a template's live version, the owner's own active
assignments move to it (``drafts.move_assignments``). Organizations running
another's badge template review what a version changes and decide per
assignment whether to apply it. Applying rewrites only the steps nobody has started in each
learner's plan (see ``versions``) and records the version on the assignment;
learners' answers and started steps stay as they are.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import AssignmentStatus, Goal, GoalAssignment, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion
from src.db.users import PublicUser
from src.services.goals import badge_authority, templates, versions
from src.services.goals.assignment_summary import assignment_dict

# Plans still being worked on; finished and archived plans keep the version they finished on.
OPEN_GOALS = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value)


def _managed(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> GoalAssignment:
    from src.services.goals.assignments import require_assignment_runner

    return require_assignment_runner(db, current_user, org_id, assignment_uuid)


def _target(db: Session, assignment: GoalAssignment, version_uuid: str | None) -> GoalTemplateVersion:
    """A published version of the assignment's template: the one named, else the newest."""
    if version_uuid:
        version = db.exec(select(GoalTemplateVersion).where(
            GoalTemplateVersion.version_uuid == version_uuid, GoalTemplateVersion.template_id == assignment.template_id,
            GoalTemplateVersion.private == False,  # noqa: E712
        )).first()
    else:
        template = db.get(GoalTemplate, assignment.template_id)
        version = templates.published_version(db, template) if template else None
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


def _open_goals(db: Session, assignment: GoalAssignment) -> list[Goal]:
    return list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id, col(Goal.status).in_(OPEN_GOALS)).order_by(col(Goal.id))).all())


def _started_by_key(db: Session, goals: list[Goal]) -> dict[str, int]:
    """Template step key -> how many learners have started that step."""
    steps = list(db.exec(select(GoalStep).where(col(GoalStep.goal_id).in_([goal.id for goal in goals]))).all()) if goals else []
    started = versions.started_step_ids(db, [int(step.id) for step in steps])  # type: ignore[arg-type]
    counts: dict[str, int] = {}
    for step in steps:
        if step.template_key and step.id in started:
            counts[step.template_key] = counts.get(step.template_key, 0) + 1
    return counts


def version_changes(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, version_uuid: str | None = None) -> dict:
    """What moving an assignment to a version (default: the newest) would change, and for how many learners."""
    assignment = _managed(db, current_user, org_id, assignment_uuid)
    current = db.get(GoalTemplateVersion, assignment.version_id)
    target = _target(db, assignment, version_uuid)
    goals = _open_goals(db, assignment)
    started = _started_by_key(db, goals)
    stages = versions.changes((current.document if current else None) or {}, target.document or {})
    for stage in stages:
        for step in stage["steps"]:
            # Learners who started a step the new version changes or removes keep their own copy of it.
            step["started_count"] = started.get(step["step_key"], 0) if step["change"] != "added" else 0
    status = badge_authority.version_status(db, assignment)
    route = badge_authority.route_for(db, assignment.badge_id, assignment.template_id)
    latest = status["latest_version"]
    return {
        "assignment_uuid": assignment.assignment_uuid,
        "current": {"version_uuid": current.version_uuid, "number": current.number, "published_at": current.published_at} if current else None,
        "target": {"version_uuid": target.version_uuid, "number": target.number, "note": target.note, "published_at": target.published_at,
                   "eligible": badge_authority.eligible(route, target.number, latest) if assignment.badge_id else None},
        "badge": status["badge"], "current_eligible": status["version_eligible"],
        "open_plans": len(goals), "stages": stages,
        "has_changes": any(stage["change"] != "same" for stage in stages),
    }


def apply_version(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, version_uuid: str) -> dict:
    """Move an assignment, and its learners' open plans, to a published version of its template."""
    assignment = _managed(db, current_user, org_id, assignment_uuid)
    if getattr(assignment.status, "value", assignment.status) == AssignmentStatus.ENDED.value:
        raise HTTPException(status_code=409, detail="An ended assignment can't change version")
    current = db.get(GoalTemplateVersion, assignment.version_id)
    target = _target(db, assignment, version_uuid)
    if current and target.id == current.id:
        raise HTTPException(status_code=409, detail="The assignment is already on this version")
    totals = move(db, assignment, target, current_user.id)
    db.commit()
    return {**assignment_dict(db, assignment), "applied": totals}


def move(db: Session, assignment: GoalAssignment, target: GoalTemplateVersion, user_id: int | None) -> dict:
    """Move an assignment and its open plans to ``target`` (flushed, not committed): finished plans keep
    their version, open ones get the target's unstarted steps."""
    from src.services.goals.assignments import _planned

    current = db.get(GoalTemplateVersion, assignment.version_id)
    planned = _planned(assignment, target.document or {})
    totals = {"plans": 0, "rewritten": 0, "added": 0, "removed": 0, "kept_started": 0}
    for goal in _open_goals(db, assignment):
        counts = versions.apply_to_goal(db, goal, current, target, planned, user_id)
        totals["plans"] += 1
        for key, value in counts.items():
            totals[key] += value
    assignment.version_id, assignment.update_date = int(target.id), datetime.now().isoformat()  # type: ignore[arg-type]
    db.add(assignment)
    db.flush()
    return totals
