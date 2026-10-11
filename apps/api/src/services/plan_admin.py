"""Staff-side plan work: the review inbox and review queues.

Everything here operates on live plans materialized from organization assignments.
Access follows plan roles: staff see the plans on which they hold the review
capability, whether they got it as the assigner (owner) or as assigned staff.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, or_, select

from src.db.planning import (
    Plan,
    PlanCollaborator,
    PlanObjective,
    PlanObjectiveProgress,
    PlanObjectiveStatus,
    PlanStatus,
)
from src.db.programs import Program, ProgramAssignment
from src.db.requirements import (
    RequirementFramework,
)
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_membership
from src.services.planning import _activity, capabilities_for

REVIEW = "complete_restricted_objectives"
STALL_DAYS = 14
OPEN_STATUSES = {PlanObjectiveStatus.NOT_STARTED, PlanObjectiveStatus.IN_PROGRESS, PlanObjectiveStatus.CHANGES_REQUESTED, PlanObjectiveStatus.SUBMITTED}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _person(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image, "user_uuid": user.user_uuid}


def _staff_plans(db: Session, current_user: PublicUser, org_id: int) -> list[Plan]:
    """Active assignment plans in this org on which the current user can review."""
    collaborating = select(PlanCollaborator.plan_id).where(
        PlanCollaborator.user_id == current_user.id, PlanCollaborator.active == True,  # noqa: E712
    )
    plans = db.exec(select(Plan).where(
        Plan.source_org_id == org_id,
        Plan.source_assignment_id.is_not(None),  # type: ignore[union-attr]
        Plan.status == PlanStatus.ACTIVE,
        or_(Plan.owner_user_id == current_user.id, Plan.id.in_(collaborating)),  # type: ignore[union-attr]
    ).order_by(Plan.id)).all()
    return [plan for plan in plans if plan.subject_user_id != current_user.id and REVIEW in capabilities_for(db, plan, current_user.id)]


def _learner_fills(fields: list[dict]) -> bool:
    """Whether the learner hands in something a reviewer looks at (not just a check-in)."""
    return any(not field.get("restricted") and str(field.get("type") or "") != "badge" for field in fields or [])


def _snapshot_for(assignment: ProgramAssignment | None, objective: PlanObjective) -> dict | None:
    if not assignment or not objective.source_objective_id:
        return None
    return next((item for item in (assignment.objective_snapshot or []) if item.get("id") == objective.source_objective_id), None)


def _group_key(assignment: ProgramAssignment, objective: PlanObjective, snapshot: dict | None) -> tuple[str, str | None, str | None]:
    """(assignment_uuid, template objective uuid, plan objective uuid). Learner-only steps get their own group."""
    if snapshot:
        return assignment.assignment_uuid, snapshot.get("objective_uuid"), None
    return assignment.assignment_uuid, None, objective.objective_uuid


def _assignment_context(db: Session, assignment: ProgramAssignment, cache: dict) -> dict:
    if assignment.id in cache:
        return cache[assignment.id]
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    context = {
        "assignment_uuid": assignment.assignment_uuid,
        "template": {"program_uuid": program.program_uuid, "name": program.name} if program else None,
        "group": {"id": group.id, "name": group.name} if group else None,
    }
    cache[assignment.id] = context
    return context


def inbox(db: Session, current_user: PublicUser, org_id: int) -> dict:
    require_org_membership(current_user.id, org_id, db)
    plans = _staff_plans(db, current_user, org_id)
    contexts: dict = {}
    assignments: dict[int, ProgramAssignment] = {}
    groups: dict[tuple, dict] = {}
    stalled: list[dict] = []
    stall_cutoff = (_now() - timedelta(days=STALL_DAYS)).isoformat()
    for plan in plans:
        assignment = assignments.get(plan.source_assignment_id) or db.get(ProgramAssignment, plan.source_assignment_id)
        if not assignment:
            continue
        assignments[int(assignment.id)] = assignment
        context = _assignment_context(db, assignment, contexts)
        subject = _person(db.get(User, plan.subject_user_id)) if plan.subject_user_id else None
        objectives = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all()
        progresses = {
            item.plan_objective_id: item for item in db.exec(select(PlanObjectiveProgress).where(
                PlanObjectiveProgress.plan_objective_id.in_([int(item.id) for item in objectives]),  # type: ignore[union-attr]
            )).all()
        } if objectives else {}
        last_touch = plan.creation_date or ""
        open_count = 0
        for objective in objectives:
            progress = progresses.get(int(objective.id))
            if not progress:
                continue
            if progress.update_date and progress.update_date > last_touch and progress.updated_by_user_id == plan.subject_user_id:
                last_touch = progress.update_date
            if progress.status in OPEN_STATUSES:
                open_count += 1
            if progress.status != PlanObjectiveStatus.SUBMITTED:
                continue
            snapshot = _snapshot_for(assignment, objective)
            key = _group_key(assignment, objective, snapshot)
            kind = "review" if _learner_fills(objective.fields or []) else "confirm"
            group = groups.setdefault((kind, *key), {
                "kind": kind, **context,
                "objective_uuid": key[1], "plan_objective_uuid": key[2],
                "objective": {"title": objective.title, "phase_name": (snapshot or {}).get("phase_name"), "step_types": sorted({str(field.get("type") or "text") for field in objective.fields or []})},
                "items": [],
            })
            group["items"].append({
                "plan_uuid": plan.plan_uuid, "plan_objective_uuid": objective.objective_uuid,
                "user": subject, "submitted_at": progress.update_date,
            })
        if open_count and last_touch and last_touch < stall_cutoff:
            stalled.append({"plan_uuid": plan.plan_uuid, "user": subject, "last_active": last_touch, "open_count": open_count, **context})
    # Badge activities waiting on a grade come from the badge runtime, grouped per activity.
    from src.services.programs import _assignment_activity_reviews
    plan_users: dict[int, dict[int, User]] = {}
    for plan in plans:
        if plan.subject_user_id:
            user = db.get(User, plan.subject_user_id)
            if user:
                plan_users.setdefault(int(plan.source_assignment_id), {})[int(user.id)] = user
    for assignment_id, users in plan_users.items():
        assignment = assignments[assignment_id]
        context = _assignment_context(db, assignment, contexts)
        for review in _assignment_activity_reviews(db, assignment, users):
            activity = review.get("activity") or {}
            key = ("grade", assignment.assignment_uuid, activity.get("activity_uuid"), None)
            group = groups.setdefault(key, {
                "kind": "grade", **context, "objective_uuid": None, "plan_objective_uuid": None,
                "activity_uuid": activity.get("activity_uuid"),
                "objective": {"title": activity.get("title") or "Badge activity", "phase_name": (review.get("badge") or {}).get("name"), "step_types": ["badge"]},
                "items": [],
            })
            group["items"].append({"plan_uuid": review.get("plan_uuid"), "review_id": review["review_id"], "user": review["user"], "submitted_at": review["submitted_at"]})
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
        result.append({"kind": "nudge", "objective": {"title": f"No progress in {STALL_DAYS}+ days", "phase_name": None, "step_types": []},
                       "assignment_uuid": None, "template": None, "group": None, "objective_uuid": None, "plan_objective_uuid": None,
                       "items": stalled, "count": len(stalled), "oldest_at": stalled[0]["last_active"]})
    counts = {kind: sum(group["count"] for group in result if group["kind"] == kind) for kind in ("review", "grade", "confirm", "nudge")}
    return {"groups": result, "counts": counts, "total": sum(counts.values())}


def _node_labels(db: Session, mappings: list[dict]) -> list[dict]:
    from src.services.requirements import _nodes, _version

    labels: list[dict] = []
    by_framework: dict[int, list[str]] = {}
    for mapping in mappings or []:
        if mapping.get("framework_id") is not None:
            by_framework.setdefault(int(mapping["framework_id"]), []).append(str(mapping.get("node_uuid")))
    for framework_id, node_uuids in by_framework.items():
        framework = db.get(RequirementFramework, framework_id)
        if not framework:
            continue
        nodes = {node.node_uuid: node for node in _nodes(db, int(_version(db, framework).id))}
        for node_uuid in node_uuids:
            node = nodes.get(node_uuid)
            labels.append({"node_uuid": node_uuid, "framework_uuid": framework.framework_uuid, "framework_name": framework.name,
                           "code": node.code if node else "", "title": node.title if node else "Removed requirement"})
    return labels


def _staff_notes(db: Session, progress: PlanObjectiveProgress) -> list[dict]:
    notes = []
    for note in progress.staff_notes or []:
        author = db.get(User, note.get("user_id")) if note.get("user_id") else None
        notes.append({**note, "author": _person(author)})
    return notes


def review_queue(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, objective_uuid: str | None = None, plan_objective_uuid: str | None = None) -> dict:
    """Submissions waiting on review for one step of one assignment, oldest first, with what a reviewer needs."""
    require_org_membership(current_user.id, org_id, db)
    assignment = db.exec(select(ProgramAssignment).where(ProgramAssignment.assignment_uuid == assignment_uuid, ProgramAssignment.org_id == org_id)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not objective_uuid and not plan_objective_uuid:
        raise HTTPException(status_code=422, detail="Choose the step to review")
    snapshot = next((item for item in (assignment.objective_snapshot or []) if item.get("objective_uuid") == objective_uuid), None) if objective_uuid else None
    if objective_uuid and not snapshot:
        raise HTTPException(status_code=404, detail="Step not found in this assignment")
    plans = [plan for plan in _staff_plans(db, current_user, org_id) if plan.source_assignment_id == assignment.id]
    items = []
    definition: PlanObjective | None = None
    for plan in plans:
        statement = select(PlanObjective).where(PlanObjective.plan_id == plan.id)
        statement = statement.where(PlanObjective.source_objective_id == snapshot["id"]) if snapshot else statement.where(PlanObjective.objective_uuid == plan_objective_uuid)
        objective = db.exec(statement).first()
        if not objective:
            continue
        progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
        if not progress or progress.status != PlanObjectiveStatus.SUBMITTED:
            continue
        definition = definition or objective
        history = progress.feedback_history or []
        items.append({
            "plan_uuid": plan.plan_uuid, "plan_slug": plan.slug, "plan_objective_uuid": objective.objective_uuid,
            "user": _person(db.get(User, plan.subject_user_id)) if plan.subject_user_id else None,
            "fields": objective.fields or [], "field_values": progress.field_values or {},
            "learner_note": progress.subject_note, "feedback_history": history,
            "attempt": 1 + sum(1 for entry in history if entry.get("action") == "changes_requested"),
            "staff_notes": _staff_notes(db, progress), "submitted_at": progress.update_date,
        })
    items.sort(key=lambda item: str(item["submitted_at"] or ""))
    source = definition
    program = db.get(Program, assignment.program_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    return {
        "assignment_uuid": assignment.assignment_uuid,
        "template": {"program_uuid": program.program_uuid, "name": program.name} if program else None,
        "group": {"id": group.id, "name": group.name} if group else None,
        "objective": {
            "objective_uuid": objective_uuid, "plan_objective_uuid": plan_objective_uuid,
            "title": (snapshot or {}).get("title") or (source.title if source else "Step"),
            "description": (snapshot or {}).get("description") or (source.description if source else ""),
            "phase_name": (snapshot or {}).get("phase_name"),
            "reviewer_guidance": (source.reviewer_guidance if source else "") or (snapshot or {}).get("reviewer_guidance") or "",
            "requirements": _node_labels(db, source.requirement_mappings if source else []),
            "confirm_only": bool(source) and not _learner_fills(source.fields or []),
        },
        "items": items,
    }


def _reviewable_objective(db: Session, current_user: PublicUser, org_id: int, plan_objective_uuid: str) -> tuple[Plan, PlanObjective, PlanObjectiveProgress]:
    objective = db.exec(select(PlanObjective).where(PlanObjective.objective_uuid == plan_objective_uuid)).first()
    plan = db.get(Plan, objective.plan_id) if objective else None
    if not objective or not plan or plan.source_org_id != org_id:
        raise HTTPException(status_code=404, detail="Plan objective not found")
    if REVIEW not in capabilities_for(db, plan, current_user.id):
        raise HTTPException(status_code=403, detail="You cannot review this plan")
    progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
    if not progress:
        raise HTTPException(status_code=404, detail="Nothing has been submitted for this step")
    return plan, objective, progress


def _record(db: Session, plan: Plan, actor_id: int, action: str, payload: dict) -> None:
    _activity(db, plan, actor_id, action, payload)


def decide(db: Session, current_user: PublicUser, org_id: int, plan_objective_uuid: str, action: str, message: str = "") -> dict:
    """Approve a submission, or send it back with what to change."""
    if action not in {"confirm", "flag"}:
        raise HTTPException(status_code=422, detail="Action must be confirm or flag")
    message = (message or "").strip()
    if action == "flag" and not message:
        raise HTTPException(status_code=422, detail="Tell the learner what needs to change")
    require_org_membership(current_user.id, org_id, db)
    plan, objective, progress = _reviewable_objective(db, current_user, org_id, plan_objective_uuid)
    if progress.status != PlanObjectiveStatus.SUBMITTED:
        raise HTTPException(status_code=409, detail="This submission is no longer waiting for review")
    _apply_decision(db, current_user, plan, objective, progress, action, message)
    db.commit()
    return {"plan_uuid": plan.plan_uuid, "plan_objective_uuid": objective.objective_uuid, "status": _value(progress.status)}


def _apply_decision(db: Session, current_user: PublicUser, plan: Plan, objective: PlanObjective, progress: PlanObjectiveProgress, action: str, message: str) -> None:
    from src.services.requirements import sync_live_progress

    now = _now()
    history = list(progress.feedback_history or [])
    if message:
        history.append({"message": message, "action": "confirmed" if action == "confirm" else "changes_requested", "created_at": now.isoformat(), "staff_user_id": current_user.id})
    progress.status = PlanObjectiveStatus.COMPLETED if action == "confirm" else PlanObjectiveStatus.CHANGES_REQUESTED
    progress.completed_at = now if action == "confirm" else None
    progress.reviewer_note = message
    progress.feedback_history = history
    progress.updated_by_user_id = current_user.id
    progress.update_date = now.isoformat()
    db.add(progress)
    db.flush()
    sync_live_progress(db, progress, objective, plan)
    _record(db, plan, int(current_user.id), "objective.reviewed", {"objective_uuid": objective.objective_uuid, "action": action})


def confirm_many(db: Session, current_user: PublicUser, org_id: int, plan_objective_uuids: list[str], message: str = "") -> dict:
    """Confirm a batch of submissions (sign-offs). Ones no longer waiting are skipped."""
    require_org_membership(current_user.id, org_id, db)
    confirmed, skipped = [], []
    for plan_objective_uuid in dict.fromkeys(plan_objective_uuids):
        try:
            plan, objective, progress = _reviewable_objective(db, current_user, org_id, plan_objective_uuid)
        except HTTPException:
            skipped.append(plan_objective_uuid)
            continue
        if progress.status != PlanObjectiveStatus.SUBMITTED:
            skipped.append(plan_objective_uuid)
            continue
        _apply_decision(db, current_user, plan, objective, progress, "confirm", (message or "").strip())
        confirmed.append(plan_objective_uuid)
    db.commit()
    return {"confirmed": confirmed, "skipped": skipped}


def add_staff_note(db: Session, current_user: PublicUser, org_id: int, plan_objective_uuid: str, message: str) -> dict:
    message = (message or "").strip()
    if not message:
        raise HTTPException(status_code=422, detail="Write the note first")
    require_org_membership(current_user.id, org_id, db)
    plan, objective, progress = _reviewable_objective(db, current_user, org_id, plan_objective_uuid)
    note = {"note_uuid": f"staff_note_{uuid4()}", "user_id": current_user.id, "message": message[:2000], "created_at": _now().isoformat()}
    progress.staff_notes = [*(progress.staff_notes or []), note]
    db.add(progress)
    db.commit()
    return {"plan_objective_uuid": objective.objective_uuid, "staff_notes": _staff_notes(db, progress)}
