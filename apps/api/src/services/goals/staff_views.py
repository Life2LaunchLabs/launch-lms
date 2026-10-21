"""Staff views of assignments: the org-wide list, the learner × step matrix, bulk progress,
review lists, cohorts and one managed learner's goals."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goal_admin import StepProgressBulk
from src.db.goals import (
    CURRENT_ASSIGNMENT_STATUSES,
    DONE_STEP_STATUSES,
    CompletionMethod,
    Goal,
    GoalAssignment,
    GoalStage,
    GoalStep,
    GoalTemplate,
    GoalTemplateVersion,
    StepEntry,
    StepCompleter,
    StepProgress,
    StepStatus,
)
from src.db.planning import PlanCollaborator, PlanRole
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.services.goals import access, completion, schedule
from src.services.goals.activity_reviews import activity_reviews
from src.services.goals.assignment_summary import status_fields
from src.services.goals.availability import availability
from src.services.goals.document import iter_steps
from src.services.goals.issue import _step_due, stage_schedule
from src.services.goals.review import REVIEW, person, review_item
from src.services.goals.types import StepState, step_type

LIFECYCLE = ("pending", "active", "finished", "archived")


def _value(item) -> str:
    return getattr(item, "value", item)


def _assignment_or_404(db: Session, org_id: int, assignment_uuid: str) -> GoalAssignment:
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid, GoalAssignment.org_id == org_id)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


def _is_staff(db: Session, user: PublicUser, org_id: int, assignment: GoalAssignment) -> bool:
    return bool(user.is_superadmin) or is_org_admin(user.id, org_id, db) or user.id in (assignment.staff_user_ids or [])


def _loaded(db: Session, goals: list[Goal]) -> tuple[dict[int, list[GoalStep]], dict[int, StepProgress]]:
    ids = [goal.id for goal in goals]
    steps: dict[int, list[GoalStep]] = {}
    for step in (db.exec(select(GoalStep).where(GoalStep.goal_id.in_(ids))).all() if ids else []):  # type: ignore[union-attr]
        steps.setdefault(int(step.goal_id), []).append(step)
    step_ids = [step.id for rows in steps.values() for step in rows]
    progress = {int(row.step_id): row for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_(step_ids))).all()} if step_ids else {}  # type: ignore[union-attr]
    return steps, progress


def _status(progress: dict[int, StepProgress], step: GoalStep) -> str:
    row = progress.get(int(step.id))  # type: ignore[arg-type]
    return _value(row.status) if row else StepStatus.NOT_STARTED.value


def _goal_progress(steps: list[GoalStep], progress: dict[int, StepProgress]) -> dict:
    done = sum(1 for step in steps if _status(progress, step) in DONE_STEP_STATUSES)
    return {"done": done, "total": len(steps), "percent": round(done * 100 / len(steps)) if steps else 0}


def _short(user: User | None) -> dict | None:
    return {"id": user.id, "user_uuid": user.user_uuid, "username": user.username, "first_name": user.first_name, "last_name": user.last_name,
            "avatar_image": user.avatar_image} if user else None


def assignment_summary(db: Session, assignment: GoalAssignment) -> dict:
    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    goals = list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(Goal.id)).all())  # type: ignore[arg-type]
    steps, progress = _loaded(db, goals)
    statuses = [_status(progress, step) for rows in steps.values() for step in rows]
    lifecycle = {status: 0 for status in LIFECYCLE}
    for goal in goals:
        lifecycle[_value(goal.status)] = lifecycle.get(_value(goal.status), 0) + 1
    percents = [_goal_progress(steps.get(int(goal.id), []), progress)["percent"] for goal in goals]  # type: ignore[arg-type]
    done = sum(status in DONE_STEP_STATUSES for status in statuses)
    staff = db.exec(select(User).where(User.id.in_(assignment.staff_user_ids))).all() if assignment.staff_user_ids else []  # type: ignore[union-attr]
    return {
        "assignment_uuid": assignment.assignment_uuid, "org_id": assignment.org_id,
        "template_uuid": template.template_uuid if template else "", "template_title": template.title if template else "Deleted template",
        "version": version.number if version else None, "usergroup_id": assignment.usergroup_id, "user_id": assignment.user_id,
        "subject_email": assignment.subject_email, "welcome_message": assignment.welcome_message,
        "staff_user_ids": assignment.staff_user_ids or [], "staff": [_short(user) for user in staff],
        "owner": _short(db.get(User, assignment.owner_user_id) if assignment.owner_user_id else None),
        "start_date": assignment.start_date, "due_date": assignment.due_date, "stage_dates": assignment.stage_dates or {},
        **status_fields(assignment), "creation_date": assignment.creation_date,
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "user": _short(db.get(User, assignment.user_id) if assignment.user_id else None),
        "learner_count": len(goals), "goal_uuid": goals[0].goal_uuid if len(goals) == 1 else None,
        "assignment_type": "group" if group else ("external" if assignment.subject_email and not assignment.user_id else "individual"),
        "lifecycle_counts": lifecycle,
        "step_count": sum(1 for _ in iter_steps(version.document if version else {})),
        "completed_count": done, "review_count": sum(status in {StepStatus.SUBMITTED.value, StepStatus.CHANGES_REQUESTED.value} for status in statuses),
        "progress_percent": round(done * 100 / len(statuses)) if statuses else 0,
        "min_progress_percent": min(percents) if percents else 0, "max_progress_percent": max(percents) if percents else 0,
    }


def list_assignments(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Active assignments in the org: all of them for admins, the ones they staff for everyone else."""
    require_org_membership(current_user.id, org_id, db)
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id, col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES))
                   .order_by(GoalAssignment.creation_date.desc(), GoalAssignment.id.desc())).all()  # type: ignore[union-attr, attr-defined]
    return [assignment_summary(db, row) for row in rows if _is_staff(db, current_user, org_id, row)]


# Matrix --------------------------------------------------------------------------------

# What's left for staff on a step, per learner. Every learner on a step is in at most one bucket.
BUCKETS = ("done", "handed_in", "to_grade", "not_handed_in", "needs_settle")
OPEN = {StepStatus.NOT_STARTED.value, StepStatus.IN_PROGRESS.value, StepStatus.CHANGES_REQUESTED.value}


def bucket(step: GoalStep, status: str, started: bool, to_grade: bool, today: date | None = None) -> str | None:
    """Where one learner's step stands for staff.

    - ``done``: completed or excused.
    - ``to_grade``: activity answers wait on a grade.
    - ``handed_in``: turned in, waiting on review.
    - ``not_handed_in``: a learner step still open once its stage has started or its close date has passed (not held).
    - ``needs_settle``: a step staff confirm (an event), not done, once its stage has started (not held).
    - None: nothing to do yet (its stage hasn't started).
    """
    today = today or date.today()
    if status in DONE_STEP_STATUSES:
        return "done"
    if to_grade:
        return "to_grade"
    if status == StepStatus.SUBMITTED.value:
        return "handed_in"
    if step.held:
        return None
    if _value(step.completed_by) == StepCompleter.STAFF.value:
        return "needs_settle" if started else None
    if status in OPEN and (started or bool(step.due_date and step.due_date < today)):
        return "not_handed_in"
    return None


def _cell(step: GoalStep, row: StepProgress, entries: list[StepEntry], lock: dict, kind: str | None = None) -> dict:
    status = _value(row.status)
    fraction = 1.0 if status in DONE_STEP_STATUSES else step_type(step.type).fraction(StepState(step, row, entries))
    return {
        "bucket": kind, "last_reminded_at": row.last_reminded_at,
        "step_uuid": step.step_uuid, "status": status, "locked": lock["locked"], "locked_reason": lock["reason"],
        "held": step.held, "due_date": step.due_date, "fraction": round(fraction, 3), "learner_note": row.learner_note,
        "reviewer_note": row.reviewer_note, "feedback_history": row.feedback_history or [], "completed_at": row.completed_at,
        "completion_method": _value(row.completion_method) if row.completion_method else None,
    }


def _aggregate(cells: list[dict], learner_count: int, learners: list[dict] | None = None) -> dict:
    """A step across learners: counts by status, and what's left for staff, with who is in each bucket.

    ``learners`` lines up with ``cells`` (each cell's learner); the buckets list their user uuids,
    so a screen can say "Noah and Aisha". Learners invited by email without an account are counted
    but not listed.
    """
    today = date.today()
    statuses = [cell["status"] for cell in cells]
    percents = [round(cell["fraction"] * 100) for cell in cells]
    who: dict[str, list[str]] = {name: [] for name in BUCKETS}
    counts = {name: 0 for name in BUCKETS}
    for index, cell in enumerate(cells):
        if cell.get("bucket") in counts:
            counts[cell["bucket"]] += 1
            uuid = (learners[index] if learners else {}).get("user_uuid")
            if uuid:
                who[cell["bucket"]].append(uuid)
    return {
        **{f"{name}_count": counts[name] for name in BUCKETS}, "buckets": who,
        "learner_count": learner_count, "completed_count": statuses.count("completed"), "excused_count": statuses.count("excused"),
        "review_count": statuses.count("submitted"), "held_count": sum(cell["held"] for cell in cells),
        "locked_count": sum(cell["locked"] for cell in cells),
        "overdue_count": sum(bool(cell["due_date"] and cell["due_date"] < today and cell["status"] not in DONE_STEP_STATUSES) for cell in cells),
        "min_progress_percent": min(percents) if percents else 0, "max_progress_percent": max(percents) if percents else 0,
    }


def assignment_matrix(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """Learners × template steps for one assignment, grouped by stage, with per-step aggregates."""
    assignment = _assignment_or_404(db, org_id, assignment_uuid)
    require_org_membership(current_user.id, org_id, db)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    document = version.document if version else {}
    goals = list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(Goal.id)).all())  # type: ignore[arg-type]
    granted = {int(goal.id): access.capabilities(db, goal, current_user.id) for goal in goals}  # type: ignore[arg-type]
    visible = [goal for goal in goals if "view_plan" in granted[int(goal.id)]]  # type: ignore[arg-type]
    if goals and not visible:
        raise HTTPException(status_code=403, detail="You cannot view this assignment")
    # Staff see how to run and review each step; a learner looking at their own row never does.
    staff = current_user.id in (assignment.staff_user_ids or []) or current_user.id in {assignment.created_by_user_id, assignment.owner_user_id} \
        or is_org_admin(current_user.id, org_id, db) or any(goal.subject_user_id != current_user.id and REVIEW in granted[int(goal.id)] for goal in visible)  # type: ignore[arg-type]
    steps, progress = _loaded(db, visible)
    step_ids = [step.id for rows in steps.values() for step in rows]
    entries: dict[int, list[StepEntry]] = {}
    for entry in (db.exec(select(StepEntry).where(StepEntry.step_id.in_(step_ids)).order_by(StepEntry.position, StepEntry.id)).all() if step_ids else []):  # type: ignore[union-attr, arg-type]
        entries.setdefault(int(entry.step_id), []).append(entry)
    template_keys = [step["key"] for _, step in iter_steps(document)]
    grading = {review["step_uuid"] for review in activity_reviews(db, visible)}
    helpers = _people(db, [int(goal.id) for goal in visible])  # type: ignore[arg-type]
    learners = []
    for goal in visible:
        goal_steps = steps.get(int(goal.id), [])  # type: ignore[arg-type]
        stages = list(db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all())
        locks = availability(goal, stages, goal_steps, {int(step.id): _status(progress, step) for step in goal_steps})  # type: ignore[arg-type]
        started = schedule.started_stage_ids(stages)
        cells, custom = {}, []
        for step in goal_steps:
            row = progress.get(int(step.id)) or completion.progress_view(db, step)  # type: ignore[arg-type]
            if step.template_key and step.template_key in template_keys and step.template_key not in cells:
                kind = bucket(step, _value(row.status), step.stage_id is None or int(step.stage_id) in started, step.step_uuid in grading)
                cells[step.template_key] = _cell(step, row, entries.get(int(step.id), []), locks[int(step.id)], kind)  # type: ignore[arg-type]
            else:
                custom.append({"step_uuid": step.step_uuid, "title": step.title, "type": step.type, "status": _value(row.status)})
        user = db.get(User, goal.subject_user_id) if goal.subject_user_id else None
        done = sum(cell["status"] in DONE_STEP_STATUSES for cell in cells.values())
        learners.append({
            **(_short(user) or {"id": -int(goal.id), "username": assignment.subject_email or "Invited learner", "first_name": "", "last_name": "", "avatar_image": None}),  # type: ignore[arg-type]
            "goal_uuid": goal.goal_uuid, "status": _value(goal.status), "update_date": goal.update_date,
            "progress_percent": round(done * 100 / len(template_keys)) if template_keys else 0,
            "capabilities": sorted(granted[int(goal.id)]), "custom_steps": custom, "cells": cells,  # type: ignore[arg-type]
            # Everyone else on the learner's plan, with their role: staff, and helpers such as a parent.
            "people": [item for item in helpers.get(int(goal.id), []) if item["id"] != goal.subject_user_id],  # type: ignore[arg-type]
        })
    dates = stage_schedule(document, assignment.start_date, assignment.stage_dates)
    # A stage has no end of its own: it runs until the next one starts, the last until the assignment's due date.
    starts = [dates.get(stage["key"], (None, None))[0] for stage in document.get("stages") or []]
    stages_out = []
    for position, stage in enumerate(document.get("stages") or []):
        start = starts[position]
        following = next((day for day in starts[position + 1:] if day), None)
        due = following - timedelta(days=1) if following else assignment.due_date
        columns = []
        for spec in stage.get("steps") or []:
            given = ((assignment.step_dates or {}).get(spec["key"]) or {}).get("due_date")
            on_step = [learner for learner in learners if spec["key"] in learner["cells"]]
            cells = [learner["cells"][spec["key"]] for learner in on_step]
            columns.append({
                "template_key": spec["key"], "title": spec.get("title"), "type": spec.get("type"), "description": spec.get("description") or "",
                "completed_by": spec.get("completed_by") or "learner", "review_required": bool(spec.get("review_required")),
                # What staff prepare from: the step's setup (an activity to try), its materials, the staff guide and how to review it.
                "config": spec.get("config") or {}, "materials": spec.get("materials") or [],
                "reviewer_guidance": (spec.get("reviewer_guidance") or "") if staff else "",
                "staff_guide": (spec.get("staff_guide") or "") if staff else "", "staff_materials": (spec.get("staff_materials") or []) if staff else [],
                "aggregate": _aggregate(cells, len(learners), on_step),
                # When the assignment has it due: a date staff set on it, else the template's; due_set says staff set it.
                "due_date": date.fromisoformat(given) if given else _step_due(spec, start, dates.get(stage["key"], (None, None))[1]), "due_set": bool(given),
            })
        stages_out.append({"stage_key": stage["key"], "title": stage.get("title"), "position": position, "start_date": start, "due_date": due, "steps": columns})
    siblings = []
    if assignment.usergroup_id:
        siblings = [assignment_summary(db, row) for row in db.exec(select(GoalAssignment).where(
            GoalAssignment.usergroup_id == assignment.usergroup_id, col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES))).all()]
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    return {
        "assignment": assignment_summary(db, assignment), "assignments": siblings,
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "version": version.number if version else None, "stages": stages_out, "learners": learners,
        # Whoever runs assignments can move a step's due date on this one.
        "can_reschedule": is_org_admin(current_user.id, org_id, db, "run_assignments"),
    }


def update_progress(db: Session, current_user: PublicUser, org_id: int, payload: StepProgressBulk) -> list[dict]:
    """Set one template step for many learners at once (staff completion, excusing, reopening)."""
    require_org_membership(current_user.id, org_id, db)
    if not payload.user_ids and not payload.goal_uuids:
        raise HTTPException(status_code=422, detail="Choose the learners")
    statement = select(GoalStep, Goal).join(Goal, Goal.id == GoalStep.goal_id).where(Goal.org_id == org_id, GoalStep.template_key == payload.template_key)
    if payload.assignment_uuid:
        statement = statement.where(Goal.assignment_id == _assignment_or_404(db, org_id, payload.assignment_uuid).id)
    statement = statement.where(Goal.goal_uuid.in_(list(set(payload.goal_uuids)))) if payload.goal_uuids else statement.where(Goal.subject_user_id.in_(list(set(payload.user_ids))))  # type: ignore[attr-defined, union-attr]
    rows = db.exec(statement.order_by(Goal.id)).all()  # type: ignore[arg-type]
    if not rows:
        raise HTTPException(status_code=404, detail="No selected goals have this step")
    results, permitted = [], False
    for step, goal in rows:
        if REVIEW not in access.capabilities(db, goal, current_user.id):
            continue
        permitted = True
        base = {"user_id": goal.subject_user_id, "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid}
        try:
            row = completion.set_status(db, goal, step, payload.status, actor_user_id=current_user.id, method=CompletionMethod.STAFF, note=payload.staff_note)
        except HTTPException as refused:
            results.append({**base, "status": "skipped", "reason": refused.detail})
            continue
        results.append({**base, "status": _value(row.status)})
    if not permitted:
        raise HTTPException(status_code=403, detail="You cannot update the selected goals")
    return results


# Reviews ---------------------------------------------------------------------------------

def _step_reviews(db: Session, goals: list[Goal]) -> list[dict]:
    steps, progress = _loaded(db, goals)
    stage_titles = {stage.id: stage.title for stage in db.exec(select(GoalStage).where(GoalStage.goal_id.in_([goal.id for goal in goals]))).all()} if goals else {}  # type: ignore[union-attr]
    reviews = []
    for goal in goals:
        for step in steps.get(int(goal.id), []):  # type: ignore[arg-type]
            row = progress.get(int(step.id))  # type: ignore[arg-type]
            if row and _value(row.status) == StepStatus.SUBMITTED.value:
                reviews.append({"review_type": "step", "progress_uuid": row.progress_uuid, **review_item(db, goal, step, row),
                                "step": {"title": step.title, "type": step.type, "stage_title": stage_titles.get(step.stage_id), "reviewer_guidance": step.reviewer_guidance}})
    reviews.sort(key=lambda item: str(item["submitted_at"] or ""))
    return reviews


def assignment_reviews(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    assignment = _assignment_or_404(db, org_id, assignment_uuid)
    require_org_membership(current_user.id, org_id, db)
    goals = [goal for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(Goal.id)).all()  # type: ignore[arg-type]
             if REVIEW in access.capabilities(db, goal, current_user.id)]
    return {"assignment_uuid": assignment_uuid, "step_reviews": _step_reviews(db, goals), "activity_reviews": activity_reviews(db, goals)}


def goal_reviews(db: Session, current_user: PublicUser, org_id: int, goal_uuid: str) -> dict:
    """Everything on one goal waiting on a reviewer: submitted steps and activity answers to grade."""
    goal = access.goal_or_404(db, goal_uuid)
    if goal.org_id != org_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    access.require(db, goal, current_user.id, REVIEW)
    return {"goal_uuid": goal.goal_uuid, "step_reviews": _step_reviews(db, [goal]), "activity_reviews": activity_reviews(db, [goal])}


# Cohorts and learners ----------------------------------------------------------------------

def cohort(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int) -> dict:
    require_org_admin(current_user.id, org_id, db)
    group = db.get(UserGroup, usergroup_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    learner_count = len(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == usergroup_id)).all())
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.usergroup_id == usergroup_id, GoalAssignment.org_id == org_id)
                   .order_by(GoalAssignment.due_date, GoalAssignment.id)).all()  # type: ignore[arg-type]
    return {
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name, "description": group.description, "thumbnail_image": group.thumbnail_image},
        "learner_count": learner_count,
        "assignments": [assignment_summary(db, row) for row in rows if _value(row.status) in CURRENT_ASSIGNMENT_STATUSES],
        "completed_assignments": [assignment_summary(db, row) for row in rows if _value(row.status) not in CURRENT_ASSIGNMENT_STATUSES],
    }


def _people(db: Session, goal_ids: list[int], learner_id: int | None = None) -> dict[int, list[dict]]:
    """Who helps on each goal besides ``learner_id``, with their role, for the goal cards."""
    if not goal_ids:
        return {}
    statement = select(PlanCollaborator, PlanRole).join(PlanRole, PlanRole.id == PlanCollaborator.role_id)  # type: ignore[arg-type]
    statement = statement.where(PlanCollaborator.goal_id.in_(goal_ids), PlanCollaborator.active == True)  # type: ignore[union-attr]  # noqa: E712
    if learner_id is not None:
        statement = statement.where(PlanCollaborator.user_id != learner_id)
    rows = db.exec(statement.order_by(PlanCollaborator.id)).all()
    found: dict[int, list[dict]] = {}
    for collaborator, role in rows:
        who = person(db.get(User, collaborator.user_id))
        if who:
            found.setdefault(int(collaborator.goal_id), []).append({**who, "role": role.name})  # type: ignore[arg-type]
    return found


def managed_user(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """One learner's assignments (that the viewer staffs or administers) and the org goals the viewer can see."""
    require_org_membership(current_user.id, org_id, db)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    goals = list(db.exec(select(Goal).where(Goal.org_id == org_id, Goal.subject_user_id == user_id).order_by(Goal.id)).all())  # type: ignore[arg-type]
    steps, progress = _loaded(db, goals)
    assignments, visible = [], []
    helpers = _people(db, [int(goal.id) for goal in goals], user_id)  # type: ignore[arg-type]
    for goal in goals:
        assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
        summary = {"goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status), "source": _value(goal.source),
                   "target_date": goal.target_date, "progress": _goal_progress(steps.get(int(goal.id), []), progress), "people": helpers.get(int(goal.id), [])}  # type: ignore[arg-type]
        if assignment and _is_staff(db, current_user, org_id, assignment):
            assignments.append({**assignment_summary(db, assignment), "goal": summary})
        if "view_plan" in access.capabilities(db, goal, current_user.id):
            visible.append(summary)
    return {"user": person(user), "assignments": assignments, "goals": visible}
