"""Staff review across goals: the inbox, review queues, decisions and staff notes.

Everything here works on live goals issued by an organization's assignments.
Staff see the goals on which they hold the review capability, whether as the
assigner (owner) or as assigned staff. Decisions go through
``completion.set_status``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, or_, select

from src.db.goals import (
    DONE_STEP_STATUSES,
    CompletionMethod,
    Goal,
    GoalAssignment,
    GoalStage,
    GoalStatus,
    GoalStep,
    GoalTemplate,
    GoalTemplateVersion,
    StepCompleter,
    StepEntry,
    StepProgress,
    StepStatus,
)
from src.db.media import MediaAsset
from src.db.goal_sharing import PlanCollaborator
from src.db.requirements import RequirementFramework
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_membership
from src.services.goals import access, completion, schedule
from src.services.goals.activity_reviews import activity_reviews
from src.services.goals.document import iter_steps
from src.services.goals.types import StepState, step_type

REVIEW = "complete_restricted_objectives"
STALL_DAYS = 14
OPEN_STATUSES = {StepStatus.NOT_STARTED.value, StepStatus.IN_PROGRESS.value, StepStatus.CHANGES_REQUESTED.value, StepStatus.SUBMITTED.value}


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def person(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image, "user_uuid": user.user_uuid}


def staff_goals(db: Session, user_id: int, org_id: int, assignment_id: int | None = None) -> list[Goal]:
    """Active assignment goals in this org on which the user can review (never their own)."""
    member = select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == user_id, PlanCollaborator.active == True, PlanCollaborator.goal_id.is_not(None))  # type: ignore[union-attr]  # noqa: E712
    statement = select(Goal).where(
        Goal.org_id == org_id, Goal.assignment_id.is_not(None), Goal.status == GoalStatus.ACTIVE,  # type: ignore[union-attr]
        or_(Goal.owner_user_id == user_id, Goal.id.in_(member)),  # type: ignore[union-attr]
    )
    if assignment_id is not None:
        statement = statement.where(Goal.assignment_id == assignment_id)
    goals = db.exec(statement.order_by(Goal.id)).all()  # type: ignore[arg-type]
    return [goal for goal in goals if goal.subject_user_id != user_id and REVIEW in access.capabilities(db, goal, user_id)]


def assignment_context(db: Session, assignment: GoalAssignment, cache: dict | None = None) -> dict:
    cache = cache if cache is not None else {}
    if assignment.id not in cache:
        template = db.get(GoalTemplate, assignment.template_id)
        group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
        cache[assignment.id] = {
            "assignment_uuid": assignment.assignment_uuid,
            "template": {"template_uuid": template.template_uuid, "title": template.title} if template else None,
            "group": {"id": group.id, "name": group.name} if group else None,
        }
    return cache[assignment.id]


def waiting(step: GoalStep, progress: StepProgress, started: bool = True) -> bool:
    """Waiting on staff: a submitted learner step, or a staff step not yet done in a stage that has started.

    ``started`` says whether the step's stage has started (see ``stage_started``); a staff step in a
    stage still to come isn't waiting on anyone yet.
    """
    status = _value(progress.status)
    if _value(step.completed_by) == StepCompleter.STAFF.value:
        return started and status not in DONE_STEP_STATUSES and not step.held
    return status == StepStatus.SUBMITTED.value


def stage_started(db: Session, step: GoalStep, cache: dict[int, set[int]] | None = None) -> bool:
    """Whether the goal has reached the step's stage. Steps outside a stage always have."""
    if step.stage_id is None:
        return True
    cache = cache if cache is not None else {}
    goal_id = int(step.goal_id)
    if goal_id not in cache:
        cache[goal_id] = schedule.started_stage_ids(list(db.exec(select(GoalStage).where(GoalStage.goal_id == goal_id)).all()))
    return int(step.stage_id) in cache[goal_id]


def _progress_by_step(db: Session, steps: list[GoalStep]) -> dict[int, StepProgress]:
    ids = [step.id for step in steps]
    return {int(row.step_id): row for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_(ids))).all()} if ids else {}  # type: ignore[union-attr]


def entry_view(db: Session, entry: StepEntry) -> dict:
    asset = db.get(MediaAsset, entry.asset_id) if entry.asset_id else None
    return {
        "entry_uuid": entry.entry_uuid, "kind": _value(entry.kind), "slot": entry.slot, "title": entry.title,
        "url": asset.url if asset else entry.url, "filename": asset.filename if asset else None,
        "mime_type": asset.mime_type if asset else None, "asset_uuid": asset.asset_uuid if asset else None,
        "note": entry.note, "done": entry.done, "data": entry.data or {},
    }


def staff_notes(db: Session, progress: StepProgress) -> list[dict]:
    return [{**note, "author": person(db.get(User, note.get("user_id")) if note.get("user_id") else None)} for note in progress.staff_notes or []]


def review_item(db: Session, goal: Goal, step: GoalStep, progress: StepProgress) -> dict:
    """What a reviewer needs to judge one learner's step."""
    entries = completion.entries(db, step)
    history = progress.feedback_history or []
    return {
        "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "step_key": step.template_key, "status": _value(progress.status),
        "user": person(db.get(User, goal.subject_user_id)) if goal.subject_user_id else None,
        # Every kind of evidence: files, links and items, and the notes, resources and logs of explore and routine steps.
        "entries": [entry_view(db, entry) for entry in entries],
        "submission": progress.submission or {}, "answer": progress.answer,
        "result": step_type(step.type).result(StepState(step, progress, entries)),
        "learner_note": progress.learner_note, "feedback_history": history,
        "attempt": 1 + sum(1 for item in history if item.get("action", "changes_requested") == "changes_requested"),
        "staff_notes": staff_notes(db, progress), "submitted_at": progress.update_date or goal.creation_date,
    }


def node_labels(db: Session, links: list[dict]) -> list[dict]:
    from src.services.requirements import _nodes, _version

    by_framework: dict[int, list[str]] = {}
    for link in links or []:
        if link.get("framework_id") is not None:
            by_framework.setdefault(int(link["framework_id"]), []).append(str(link.get("node_uuid")))
    labels: list[dict] = []
    for framework_id, node_uuids in by_framework.items():
        framework = db.get(RequirementFramework, framework_id)
        if not framework:
            continue
        nodes = {node.node_uuid: node for node in _nodes(db, int(_version(db, framework).id))}  # type: ignore[arg-type]
        for node_uuid in node_uuids:
            node = nodes.get(node_uuid)
            labels.append({"node_uuid": node_uuid, "framework_uuid": framework.framework_uuid, "framework_name": framework.name,
                           "code": node.code if node else "", "title": node.title if node else "Removed requirement"})
    return labels


# Inbox -----------------------------------------------------------------------------------

def inbox(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Work waiting on staff, grouped by template step: review, grade, confirm, then learners to nudge."""
    require_org_membership(current_user.id, org_id, db)
    goals = staff_goals(db, current_user.id, org_id)
    contexts: dict = {}
    assignments = {int(row.id): row for row in db.exec(select(GoalAssignment).where(GoalAssignment.id.in_({goal.assignment_id for goal in goals}))).all()} if goals else {}  # type: ignore[union-attr, arg-type]
    grades = activity_reviews(db, goals)
    grading_steps = {review["step_uuid"] for review in grades}
    groups: dict[tuple, dict] = {}
    stalled: list[dict] = []
    stall_cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=STALL_DAYS)).isoformat()
    for goal in goals:
        assignment = assignments.get(int(goal.assignment_id))  # type: ignore[arg-type]
        if not assignment:
            continue
        context = assignment_context(db, assignment, contexts)
        subject = person(db.get(User, goal.subject_user_id)) if goal.subject_user_id else None
        steps = list(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all())
        stages = {stage.id: stage for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}
        progress = _progress_by_step(db, steps)
        started = schedule.started_stage_ids(list(stages.values()))
        last_touch = goal.creation_date or ""
        open_count = 0
        for step in steps:
            row = progress.get(int(step.id)) or completion.progress_view(db, step)  # type: ignore[arg-type]
            status = _value(row.status)
            if row.update_date and row.update_date > last_touch and row.updated_by_user_id == goal.subject_user_id:
                last_touch = row.update_date
            learner_step = _value(step.completed_by) == StepCompleter.LEARNER.value
            if learner_step and status in OPEN_STATUSES:
                open_count += 1
            if not waiting(step, row, step.stage_id is None or int(step.stage_id) in started) or step.step_uuid in grading_steps:
                continue
            kind = "review" if learner_step else "confirm"
            key = (kind, assignment.assignment_uuid, step.template_key, None if step.template_key else step.step_uuid)
            stage = stages.get(step.stage_id)
            group = groups.setdefault(key, {
                "kind": kind, **context, "step_key": key[2], "step_uuid": key[3], "activity_uuid": None,
                "step": {"title": step.title, "stage_title": stage.title if stage else None, "type": step.type},
                "items": [],
            })
            group["items"].append({"goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "user": subject, "submitted_at": row.update_date or goal.creation_date})
        if open_count and last_touch and last_touch < stall_cutoff:
            stalled.append({"goal_uuid": goal.goal_uuid, "user": subject, "last_active": last_touch, "open_count": open_count, **context})
    goal_by_uuid = {goal.goal_uuid: goal for goal in goals}
    for review in grades:
        goal = goal_by_uuid.get(review["goal_uuid"])
        assignment = assignments.get(int(goal.assignment_id)) if goal else None  # type: ignore[arg-type]
        if not assignment:
            continue
        activity = review.get("activity") or {}
        key = ("grade", assignment.assignment_uuid, activity.get("activity_uuid"), None)
        group = groups.setdefault(key, {
            "kind": "grade", **assignment_context(db, assignment, contexts), "step_key": None, "step_uuid": None,
            "activity_uuid": activity.get("activity_uuid"),
            "step": {"title": activity.get("title") or "Activity", "stage_title": None, "type": "activity"},
            "items": [],
        })
        group["items"].append({"goal_uuid": review["goal_uuid"], "step_uuid": review["step_uuid"], "review_id": review["review_id"], "user": review["user"], "submitted_at": review["submitted_at"]})
    result = []
    for group in groups.values():
        group["items"].sort(key=lambda item: str(item.get("submitted_at") or ""))
        group["count"] = len(group["items"])
        group["oldest_at"] = group["items"][0]["submitted_at"] if group["items"] else None
        result.append(group)
    order = {"review": 0, "grade": 1, "confirm": 2}
    result.sort(key=lambda item: (order[item["kind"]], str(item["oldest_at"] or "")))
    if stalled:
        stalled.sort(key=lambda item: item["last_active"])
        result.append({"kind": "nudge", "step": {"title": f"No progress in {STALL_DAYS}+ days", "stage_title": None, "type": None},
                       "assignment_uuid": None, "template": None, "group": None, "step_key": None, "step_uuid": None, "activity_uuid": None,
                       "items": stalled, "count": len(stalled), "oldest_at": stalled[0]["last_active"]})
    counts = {kind: sum(group["count"] for group in result if group["kind"] == kind) for kind in ("review", "grade", "confirm", "nudge")}
    return {"groups": result, "counts": counts, "total": sum(counts.values())}


# Review queue ----------------------------------------------------------------------------

def review_queue(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, step_key: str | None = None, step_uuid: str | None = None) -> dict:
    """Work waiting on staff for one step of one assignment, oldest first, with what a reviewer needs."""
    require_org_membership(current_user.id, org_id, db)
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid, GoalAssignment.org_id == org_id)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not step_key and not step_uuid:
        raise HTTPException(status_code=422, detail="Choose the step to review")
    version = db.get(GoalTemplateVersion, assignment.version_id)
    spec, stage_spec = None, None
    if step_key:
        stage_spec, spec = next(((stage, step) for stage, step in iter_steps(version.document if version else {}) if step.get("key") == step_key), (None, None))
        if not spec:
            raise HTTPException(status_code=404, detail="Step not found in this assignment")
    goals = staff_goals(db, current_user.id, org_id, int(assignment.id))  # type: ignore[arg-type]
    grades: dict[str, list[dict]] = {}
    for review in activity_reviews(db, goals):
        grades.setdefault(review["step_uuid"], []).append(review)
    items: list[dict] = []
    definition: GoalStep | None = None
    reached: dict[int, set[int]] = {}
    for goal in goals:
        statement = select(GoalStep).where(GoalStep.goal_id == goal.id)
        statement = statement.where(GoalStep.template_key == step_key) if step_key else statement.where(GoalStep.step_uuid == step_uuid)
        step = db.exec(statement).first()
        if not step:
            continue
        progress = completion.progress_view(db, step)
        if not waiting(step, progress, stage_started(db, step, reached)):
            continue
        definition = definition or step
        items.append({**review_item(db, goal, step, progress), "activity_reviews": grades.get(step.step_uuid, [])})
    items.sort(key=lambda item: str(item["submitted_at"] or ""))
    if not definition and step_uuid:
        definition = db.exec(select(GoalStep).join(Goal, Goal.id == GoalStep.goal_id).where(GoalStep.step_uuid == step_uuid, Goal.assignment_id == assignment.id)).first()
    stage = db.get(GoalStage, definition.stage_id) if definition and definition.stage_id else None
    spec = spec or {}
    return {
        **assignment_context(db, assignment),
        "step": {
            "step_key": step_key, "step_uuid": step_uuid,
            "title": (definition.title if definition else None) or spec.get("title") or "Step",
            "description": (definition.description if definition else None) or spec.get("description") or "",
            "type": definition.type if definition else spec.get("type"),
            "stage_title": stage.title if stage else (stage_spec or {}).get("title"),
            "reviewer_guidance": (definition.reviewer_guidance if definition else "") or spec.get("reviewer_guidance") or "",
            "requirements": node_labels(db, definition.requirement_links if definition else []),
            "confirm_only": _value(definition.completed_by if definition else spec.get("completed_by") or "learner") == StepCompleter.STAFF.value,
        },
        "items": items,
    }


# Decisions --------------------------------------------------------------------------------

def _reviewable(db: Session, current_user: PublicUser, org_id: int, step_uuid: str) -> tuple[Goal, GoalStep]:
    step = db.exec(select(GoalStep).where(GoalStep.step_uuid == step_uuid)).first()
    goal = db.get(Goal, step.goal_id) if step else None
    if not step or not goal or goal.org_id != org_id:
        raise HTTPException(status_code=404, detail="Step not found")
    if REVIEW not in access.capabilities(db, goal, current_user.id):
        raise HTTPException(status_code=403, detail="You cannot review this goal")
    return goal, step


def _apply(db: Session, current_user: PublicUser, goal: Goal, step: GoalStep, action: str, message: str) -> StepProgress:
    access.log(db, goal, current_user.id, "step.reviewed", {"step_uuid": step.step_uuid, "action": action})
    if action == "flag":
        return completion.set_status(db, goal, step, StepStatus.CHANGES_REQUESTED, actor_user_id=current_user.id, method=CompletionMethod.STAFF, note=message)
    if message:
        progress = completion.progress_for(db, step)
        progress.feedback_history = [*(progress.feedback_history or []), {"message": message, "action": "confirmed", "user_id": current_user.id, "created_at": _now()}]
        db.add(progress)
    return completion.set_status(db, goal, step, StepStatus.COMPLETED, actor_user_id=current_user.id, method=CompletionMethod.STAFF, note=message or None)


def decide(db: Session, current_user: PublicUser, org_id: int, step_uuid: str, action: str, message: str = "") -> dict:
    """Approve a step, or send a submission back with what to change."""
    if action not in {"confirm", "flag"}:
        raise HTTPException(status_code=422, detail="Action must be confirm or flag")
    message = (message or "").strip()
    if action == "flag" and not message:
        raise HTTPException(status_code=422, detail="Tell the learner what needs to change")
    require_org_membership(current_user.id, org_id, db)
    goal, step = _reviewable(db, current_user, org_id, step_uuid)
    progress = completion.progress_view(db, step)
    if not waiting(step, progress) or (action == "flag" and _value(progress.status) != StepStatus.SUBMITTED.value):
        raise HTTPException(status_code=409, detail="This step is no longer waiting for review")
    progress = _apply(db, current_user, goal, step, action, message)
    return {"goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "status": _value(progress.status)}


def confirm_many(db: Session, current_user: PublicUser, org_id: int, step_uuids: list[str], message: str = "") -> dict:
    """Confirm a batch of steps. Ones no longer waiting (or not reviewable) are skipped."""
    require_org_membership(current_user.id, org_id, db)
    confirmed, skipped = [], []
    for step_uuid in dict.fromkeys(step_uuids):
        try:
            goal, step = _reviewable(db, current_user, org_id, step_uuid)
        except HTTPException:
            skipped.append(step_uuid)
            continue
        if not waiting(step, completion.progress_view(db, step)):
            skipped.append(step_uuid)
            continue
        _apply(db, current_user, goal, step, "confirm", (message or "").strip())
        confirmed.append(step_uuid)
    return {"confirmed": confirmed, "skipped": skipped}


def add_staff_note(db: Session, current_user: PublicUser, org_id: int, step_uuid: str, message: str) -> dict:
    """A note between staff on a learner's step; learners never see these."""
    message = (message or "").strip()
    if not message:
        raise HTTPException(status_code=422, detail="Write the note first")
    require_org_membership(current_user.id, org_id, db)
    _, step = _reviewable(db, current_user, org_id, step_uuid)
    progress = completion.progress_for(db, step)
    note = {"note_uuid": f"staff_note_{uuid4()}", "user_id": current_user.id, "message": message[:2000], "created_at": _now()}
    progress.staff_notes = [*(progress.staff_notes or []), note]
    db.add(progress)
    db.commit()
    return {"step_uuid": step.step_uuid, "staff_notes": staff_notes(db, progress)}
