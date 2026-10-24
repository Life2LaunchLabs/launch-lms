"""The assignments screens: the list, one assignment's steps, and its people.

Each says where learners are (services/goals/assignment_status.py) and what needs the viewer.
Admins see every assignment; other staff see the ones they're on.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalAssignment, GoalTemplate, GoalTemplateVersion
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_membership
from src.services.goals import assignment_status
from src.services.goals.assignment_staff import assignment_role, can_manage
from src.services.goals.assignment_summary import collaborators_of, status_fields
from src.services.goals.assignments import _planned, scheduled
from src.services.goals.issue import stage_schedule
from src.services.goals.review import person


def _visible(db: Session, user: PublicUser, assignment: GoalAssignment) -> bool:
    return bool(user.is_superadmin) or is_org_admin(user.id, assignment.org_id, db) or user.id in (assignment.staff_user_ids or [])


def _assignment(db: Session, user: PublicUser, org_id: int, assignment_uuid: str) -> GoalAssignment:
    require_org_membership(user.id, org_id, db)
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid, GoalAssignment.org_id == org_id)).first()
    if not assignment or not _visible(db, user, assignment):
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def _target(db: Session, assignment: GoalAssignment) -> dict:
    """Who it went to: a group, a person, or an email invitation."""
    if assignment.usergroup_id:
        group = db.get(UserGroup, assignment.usergroup_id)
        return {"type": "group", "id": assignment.usergroup_id, "uuid": group.usergroup_uuid if group else None, "name": group.name if group else "Deleted group"}
    if assignment.user_id:
        user = db.get(User, assignment.user_id)
        name = " ".join(part for part in (user.first_name, user.last_name) if part) or user.username if user else "Deleted person"
        return {"type": "person", "person": person(user), "name": name}
    return {"type": "email", "email": assignment.subject_email, "name": assignment.subject_email}


def _plan(db: Session, assignment: GoalAssignment) -> dict:
    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    return {
        "template_uuid": template.template_uuid if template else "", "title": template.title if template else "Deleted plan",
        "thumbnail_image": template.thumbnail_image if template else "", "icon": template.icon if template else None,
        "color": template.color if template else None, "version": version.number if version else None,
    }


def _staff(db: Session, assignment: GoalAssignment) -> list[dict]:
    items = collaborators_of(assignment)
    users = {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_([int(item["user_id"]) for item in items]))).all()} if items else {}  # type: ignore[arg-type]
    return [{"person": person(users.get(int(item["user_id"]))), "role": assignment_role(item.get("role_key")) or "review"} for item in items
            if int(item["user_id"]) in users]


def _summary(db: Session, user: PublicUser, assignment: GoalAssignment, board: assignment_status.Board) -> dict:
    return {
        "assignment_uuid": assignment.assignment_uuid, "target": _target(db, assignment), "plan": _plan(db, assignment),
        "start_date": assignment.start_date, "due_date": assignment.due_date, "scheduled": scheduled(assignment),
        **status_fields(assignment), "creation_date": assignment.creation_date,
        "learner_count": len(board.learners), "step_count": len(board.step_keys()),
        "counts": board.counts(), "needs": board.needs(),
    }


def list_assignments(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Every assignment the viewer can see, newest first, with where its learners are and what needs them."""
    require_org_membership(current_user.id, org_id, db)
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id).order_by(col(GoalAssignment.id).desc())).all()
    return [_summary(db, current_user, row, assignment_status.board(db, row, int(current_user.id))) for row in rows if _visible(db, current_user, row)]


def _stage_rows(assignment: GoalAssignment, board: assignment_status.Board, staff: bool) -> list[dict]:
    """The plan's stages with their dates and counts, and each step's dates, switches and counts."""
    document = board.document
    dates = stage_schedule(document, assignment.start_date, assignment.stage_dates)
    planned = _planned(assignment, document)["steps"]
    starts = [dates.get(stage["key"], (None, None))[0] for stage in document.get("stages") or []]
    out = []
    for position, stage in enumerate(document.get("stages") or []):
        following = next((day for day in starts[position + 1:] if day), None)
        ends: date | None = following - timedelta(days=1) if following else assignment.due_date
        keys = [spec["key"] for spec in stage.get("steps") or []]
        steps = []
        for spec in stage.get("steps") or []:
            plan = planned.get(spec["key"]) or {}
            own = (assignment.step_dates or {}).get(spec["key"]) or {}
            steps.append({
                "key": spec["key"], "title": spec.get("title"), "type": spec.get("type"), "description": spec.get("description") or "",
                "completed_by": spec.get("completed_by") or "learner", "review_required": bool(spec.get("review_required")),
                "config": spec.get("config") or {}, "materials": spec.get("materials") or [],
                "staff_guide": (spec.get("staff_guide") or "") if staff else "", "staff_materials": (spec.get("staff_materials") or []) if staff else [],
                "reviewer_guidance": (spec.get("reviewer_guidance") or "") if staff else "",
                # When it opens and closes for this assignment; own says staff set dates on the step itself.
                "start_date": plan.get("start_date"), "due_date": plan.get("due_date") or ends, "own": bool(own),
                "open_early": plan.get("open_early", True), "allow_late": plan.get("allow_late", True),
                **board.step(spec["key"]),
            })
        out.append({"key": stage["key"], "title": stage.get("title"), "position": position, "start_date": starts[position],
                    "end_date": ends, "counts": board.stage(keys), "steps": steps})
    return out


def assignment_detail(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """One assignment's Steps tab: its summary, staff, stages and steps, each with where learners are."""
    assignment = _assignment(db, current_user, org_id, assignment_uuid)
    board = assignment_status.board(db, assignment, int(current_user.id))
    others = []
    if assignment.usergroup_id:
        others = [row for row in db.exec(select(GoalAssignment).where(
            GoalAssignment.usergroup_id == assignment.usergroup_id, GoalAssignment.id != assignment.id)).all() if _visible(db, current_user, row)]
    learners = {int(goal.subject_user_id): goal for goal in (item.goal for item in board.learners) if goal.subject_user_id}
    users = {int(user.id): person(user) for user in db.exec(select(User).where(col(User.id).in_(list(learners)))).all()} if learners else {}  # type: ignore[arg-type]
    return {
        **_summary(db, current_user, assignment, board), "welcome_message": assignment.welcome_message, "staff": _staff(db, assignment),
        "can_manage": can_manage(db, int(current_user.id), assignment),
        "can_change_version": is_org_admin(current_user.id, org_id, db, "run_assignments"),
        "stages": _stage_rows(assignment, board, True), "people": users,
        "others": [{"assignment_uuid": row.assignment_uuid, "plan": _plan(db, row), "target": _target(db, row), **status_fields(row)} for row in others],
    }


def _learner_row(learner: assignment_status.Learner, user: User | None, assignment: GoalAssignment, step_count: int) -> dict:
    counts = learner.counts
    goal: Goal = learner.goal
    return {
        "person": person(user), "email": None if user else assignment.subject_email, "goal_uuid": goal.goal_uuid,
        "goal_status": getattr(goal.status, "value", goal.status), "counts": counts,
        "needs": {"questions": learner.question_count, "review": counts["review"], "behind": counts["behind"]},
        "progress_percent": round(counts["done"] * 100 / step_count) if step_count else 0, "update_date": goal.update_date,
    }


def assignment_people(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """One assignment's People tab: each learner with where they are and what they need."""
    assignment = _assignment(db, current_user, org_id, assignment_uuid)
    board = assignment_status.board(db, assignment, int(current_user.id))
    ids = [int(item.goal.subject_user_id) for item in board.learners if item.goal.subject_user_id]
    users = {int(user.id): user for user in db.exec(select(User).where(col(User.id).in_(ids))).all()} if ids else {}  # type: ignore[arg-type]
    step_count = len(board.step_keys())
    rows = [_learner_row(item, users.get(int(item.goal.subject_user_id)) if item.goal.subject_user_id else None, assignment, step_count) for item in board.learners]
    return {"assignment_uuid": assignment.assignment_uuid, "step_count": step_count, "needs": board.needs(), "learners": rows}
