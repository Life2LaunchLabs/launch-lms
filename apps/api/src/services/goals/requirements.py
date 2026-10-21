"""A learner's requirement status for the staff who support them, and framework coverage by template.

Read from goal steps: a step counts toward the requirement nodes in its
``requirement_links``. Counselors close a gap by adding a make-up step to the
learner's goal or by crediting the requirement with a note.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, func, select

from src.db.goals import (
    DONE_STEP_STATUSES,
    Goal,
    GoalOwnership,
    GoalStage,
    GoalStatus,
    GoalStep,
    GoalTemplate,
    GoalTemplateVersion,
    StepProgress,
    TemplateStatus,
)
from src.db.requirements import RequirementAttainmentSource, RequirementEnrollment, RequirementEnrollmentStatus
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_membership
from src.services.goals import access
from src.services.goals.document import iter_steps

REVIEW = "complete_restricted_objectives"


class MakeupStep(SQLModel):
    goal_uuid: str
    node_uuid: str
    template_uuid: str | None = None
    step_key: str | None = None
    title: str | None = None
    due_date: date | None = None


class RequirementCredit(SQLModel):
    enrollment_uuid: str
    node_uuid: str
    note: str


def _value(item) -> str:
    return getattr(item, "value", item)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _person(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image, "user_uuid": user.user_uuid}


def review_goals(db: Session, current_user: PublicUser, org_id: int, user_ids: list[int]) -> list[Goal]:
    """The learners' assigned goals this staff member can review."""
    return [goal for goal in db.exec(select(Goal).where(
        Goal.org_id == org_id, Goal.subject_user_id.in_(user_ids or [-1]), Goal.assignment_id.is_not(None),  # type: ignore[union-attr]
        Goal.ownership == GoalOwnership.EXTERNAL, Goal.status != GoalStatus.ARCHIVED,
    ).order_by(Goal.id)).all() if REVIEW in access.capabilities(db, goal, int(current_user.id))]


def managed_goals(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> list[Goal]:
    """The learner's goals this staff member can review. Admins may look even when there are none."""
    require_org_membership(current_user.id, org_id, db)
    found = review_goals(db, current_user, org_id, [user_id])
    if not found and not is_org_admin(current_user.id, org_id, db):
        raise HTTPException(status_code=403, detail="You do not support this learner")
    return found


def _planned_steps(db: Session, goals: list[Goal]) -> dict[str, list[dict]]:
    """Steps in these goals that count toward each requirement node, with their state."""
    planned: dict[str, list[dict]] = {}
    today = date.today()
    for goal in goals:
        for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position, GoalStep.id)).all():
            if not step.requirement_links:
                continue
            progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
            status = _value(progress.status) if progress else "not_started"
            due = step.due_date
            for link in step.requirement_links:
                planned.setdefault(str(link.get("node_uuid")), []).append({
                    "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "step_uuid": step.step_uuid,
                    "title": step.title, "status": status, "due_date": due,
                    "overdue": bool(due and due < today and status not in DONE_STEP_STATUSES),
                })
    return planned


def _enrollments(db: Session, org_id: int, user_ids: list[int]) -> list[RequirementEnrollment]:
    from src.services.requirements import sync_group_batches

    sync_group_batches(db, org_id)
    db.commit()
    return list(db.exec(select(RequirementEnrollment).where(
        RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id.in_(user_ids or [-1]),  # type: ignore[union-attr]
        RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN,
    ).order_by(RequirementEnrollment.id)).all())


def _framework_status(db: Session, enrollment: RequirementEnrollment, planned: dict[str, list[dict]]) -> dict:
    snapshot = enrollment.framework_snapshot or {}
    leaves = snapshot.get("leaf_node_uuids") or []
    source_by_node: dict[str, list] = {}
    for source in db.exec(select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id,
        RequirementAttainmentSource.revoked_at.is_(None),  # type: ignore[union-attr]
    )).all():
        source_by_node.setdefault(source.node_uuid, []).append(source)
    nodes = []
    for node in snapshot.get("nodes") or []:
        node_uuid = node["node_uuid"]
        is_leaf = node_uuid in leaves
        steps = planned.get(node_uuid, [])
        if not is_leaf:
            state = None
        elif source_by_node.get(node_uuid):
            state = "met"
        elif any(step["status"] not in DONE_STEP_STATUSES and not step["overdue"] for step in steps):
            state = "planned"
        else:
            state = "gap"
        nodes.append({
            **node, "leaf": is_leaf, "state": state, "steps": steps,
            "sources": [{
                "source_uuid": item.source_uuid, "title": item.objective_title,
                "note": (item.evidence_snapshot or {}).get("note"), "kind": (item.evidence_snapshot or {}).get("kind") or "step",
                "verified_by": _person(db.get(User, item.verified_by_user_id)) if item.verified_by_user_id else None,
                "verified_at": item.verified_at,
            } for item in source_by_node.get(node_uuid, [])],
        })
    return {
        "enrollment_uuid": enrollment.enrollment_uuid, "framework_uuid": snapshot.get("framework_uuid"),
        "name": snapshot.get("name"), "version": snapshot.get("version"),
        "status": _value(enrollment.status), "met": sum(1 for node in nodes if node["state"] == "met"), "total": len(leaves),
        "gaps": sum(1 for node in nodes if node["state"] == "gap"), "nodes": nodes,
    }


def learner_requirements(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    goals = managed_goals(db, current_user, org_id, user_id)
    planned = _planned_steps(db, goals)
    return {
        "user_id": user_id,
        "frameworks": [_framework_status(db, enrollment, planned) for enrollment in _enrollments(db, org_id, [user_id])],
        "goals": [{"goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status)} for goal in goals],
    }


def group_requirements(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int, framework_uuid: str | None = None) -> dict:
    """Learners by requirement for one group, one framework at a time."""
    require_org_membership(current_user.id, org_id, db)
    group = db.get(UserGroup, usergroup_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    member_ids = list(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == usergroup_id)).all())
    goals = review_goals(db, current_user, org_id, member_ids)
    if not is_org_admin(current_user.id, org_id, db):
        member_ids = sorted({int(goal.subject_user_id) for goal in goals if goal.subject_user_id})
        if not member_ids:
            raise HTTPException(status_code=403, detail="You do not support anyone in this group")
    enrollments = _enrollments(db, org_id, member_ids)
    frameworks: dict[str, dict] = {}
    for enrollment in enrollments:
        snapshot = enrollment.framework_snapshot or {}
        entry = frameworks.setdefault(str(snapshot.get("framework_uuid")), {"framework_uuid": snapshot.get("framework_uuid"), "name": snapshot.get("name"), "learner_count": 0})
        entry["learner_count"] += 1
    chosen = framework_uuid if framework_uuid in frameworks else next(iter(frameworks), None)
    chosen_enrollments = [item for item in enrollments if str((item.framework_snapshot or {}).get("framework_uuid")) == chosen]
    # Columns come from the newest version any learner is on; older versions just leave unknown cells empty.
    newest = max(chosen_enrollments, key=lambda item: int((item.framework_snapshot or {}).get("version") or 0), default=None)
    goals_by_user: dict[int, list[Goal]] = {}
    for goal in goals:
        goals_by_user.setdefault(int(goal.subject_user_id or 0), []).append(goal)
    learners = []
    for enrollment in chosen_enrollments:
        status = _framework_status(db, enrollment, _planned_steps(db, goals_by_user.get(enrollment.user_id, [])))
        learners.append({
            **(_person(db.get(User, enrollment.user_id)) or {}), "enrollment_uuid": enrollment.enrollment_uuid,
            "version": status["version"], "met": status["met"], "total": status["total"], "gaps": status["gaps"],
            "cells": {node["node_uuid"]: node["state"] for node in status["nodes"] if node["leaf"]},
        })
    learners.sort(key=lambda item: f"{item.get('first_name') or ''} {item.get('last_name') or ''} {item.get('username') or ''}".strip().lower())
    snapshot = (newest.framework_snapshot or {}) if newest else {}
    return {
        "group": {"id": group.id, "name": group.name}, "frameworks": list(frameworks.values()), "framework_uuid": chosen,
        "nodes": snapshot.get("nodes") or [], "leaf_node_uuids": snapshot.get("leaf_node_uuids") or [],
        "learners": learners,
        "not_enrolled": len(set(member_ids) - {item.user_id for item in enrollments}),
    }


def _published_templates(db: Session, org_id: int) -> list[tuple[GoalTemplate, GoalTemplateVersion | None]]:
    rows = db.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED).order_by(GoalTemplate.title, GoalTemplate.id)).all()
    return [(template, db.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None) for template in rows]


def makeup_options(db: Session, current_user: PublicUser, org_id: int, user_id: int, node_uuid: str) -> list[dict]:
    """Steps of this organization's published templates that also meet a requirement node."""
    managed_goals(db, current_user, org_id, user_id)
    return [{
        "template_uuid": template.template_uuid, "step_key": step.get("key"), "title": step.get("title"),
        "description": step.get("description") or "", "type": step.get("type"),
        "template": {"template_uuid": template.template_uuid, "title": template.title},
    } for template, version in _published_templates(db, org_id) if version
        for _, step in iter_steps(version.document or {}) if node_uuid in (step.get("requirement_node_uuids") or [])]


def _working_stage(db: Session, goal: Goal) -> GoalStage | None:
    """The stage the learner is working in: the first one with open work, else the last."""
    stages = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position, GoalStage.id)).all()
    open_stage_ids = set()
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
        if step.stage_id and (not progress or _value(progress.status) not in DONE_STEP_STATUSES):
            open_stage_ids.add(step.stage_id)
    return next((item for item in stages if item.id in open_stage_ids), stages[-1] if stages else None)


def add_makeup_step(db: Session, current_user: PublicUser, org_id: int, user_id: int, payload: MakeupStep) -> dict:
    """Add a step to one learner's goal that counts toward a requirement they are missing."""
    from src.services.goals.issue import build_step, issue_step
    from src.services.requirements import mappable_nodes

    goal = next((item for item in managed_goals(db, current_user, org_id, user_id) if item.goal_uuid == payload.goal_uuid), None)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found for this learner")
    framework = mappable_nodes(db, org_id).get(payload.node_uuid)
    if not framework:
        raise HTTPException(status_code=404, detail="Requirement not found")
    title = (payload.title or "").strip()
    stage = _working_stage(db, goal)
    link = {"framework_id": int(framework.id), "framework_uuid": framework.framework_uuid, "node_uuid": payload.node_uuid}  # type: ignore[arg-type]
    if payload.step_key:
        option = next((item for item in makeup_options(db, current_user, org_id, user_id, payload.node_uuid)
                       if item["step_key"] == payload.step_key and payload.template_uuid in {None, item["template_uuid"]}), None)
        if not option:
            raise HTTPException(status_code=404, detail="Step not found")
        template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == option["template_uuid"], GoalTemplate.org_id == org_id)).one()
        version = db.get(GoalTemplateVersion, template.published_version_id)
        step = issue_step(db, goal, version, payload.step_key, stage, int(current_user.id))  # type: ignore[arg-type]
        step.title = title or step.title
        if payload.node_uuid not in {item.get("node_uuid") for item in step.requirement_links}:
            step.requirement_links = [*step.requirement_links, link]
    else:
        if not title:
            raise HTTPException(status_code=422, detail="Name the make-up step")
        last = db.exec(select(func.max(GoalStep.position)).where(GoalStep.goal_id == goal.id, GoalStep.stage_id == (stage.id if stage else None))).one()
        position = 0 if last is None else last + 1
        step = build_step(db, goal, stage, {"type": "task", "title": title, "completed_by": "staff", "requirement_node_uuids": [payload.node_uuid]}, position)
        step.requirement_links = step.requirement_links or [link]
        db.flush()
        access.log(db, goal, int(current_user.id), "step.added", {"step_uuid": step.step_uuid, "makeup_for": payload.node_uuid})
    step.due_date = payload.due_date
    db.add(step)
    goal.update_date = _now().isoformat()
    db.add(goal)
    db.commit()
    return {"goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid, "title": step.title}


def credit_requirement(db: Session, current_user: PublicUser, org_id: int, user_id: int, enrollment_uuid: str, node_uuid: str, note: str) -> dict:
    """Staff attest that a learner meets a requirement, with the reason on record."""
    from src.services.requirements import _recompute_enrollment

    note = (note or "").strip()
    if not note:
        raise HTTPException(status_code=422, detail="Say why this counts")
    managed_goals(db, current_user, org_id, user_id)
    enrollment = db.exec(select(RequirementEnrollment).where(
        RequirementEnrollment.enrollment_uuid == enrollment_uuid, RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id == user_id,
    )).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Requirement enrollment not found")
    if node_uuid not in set((enrollment.framework_snapshot or {}).get("leaf_node_uuids") or []):
        raise HTTPException(status_code=422, detail="Only individual requirements can be credited")
    now = _now()
    source = db.exec(select(RequirementAttainmentSource).where(
        RequirementAttainmentSource.enrollment_id == enrollment.id, RequirementAttainmentSource.node_uuid == node_uuid,
        RequirementAttainmentSource.plan_objective_progress_id.is_(None), RequirementAttainmentSource.objective_progress_id.is_(None),  # type: ignore[union-attr]
        RequirementAttainmentSource.step_progress_id.is_(None),  # type: ignore[union-attr]
    )).first() or RequirementAttainmentSource(
        source_uuid=f"requirement_source_{uuid4()}", enrollment_id=int(enrollment.id), node_uuid=node_uuid, creation_date=now.isoformat(),  # type: ignore[arg-type]
    )
    source.objective_title = "Credited by staff"
    source.evidence_snapshot = {"kind": "staff_credit", "note": note[:2000]}
    source.verified_by_user_id = current_user.id
    source.verified_at = now
    source.revoked_at = None
    source.update_date = now.isoformat()
    db.add(source)
    db.flush()
    _recompute_enrollment(db, enrollment)
    db.commit()
    return {"source_uuid": source.source_uuid, "node_uuid": node_uuid}


def _template_coverage(db: Session, org_id: int, node_uuids: set[str]) -> tuple[dict[str, list[dict]], list[dict]]:
    """For the org's published templates: the steps that count toward each of these nodes, and each template with whether it maps to any."""
    by_node: dict[str, list[dict]] = {}
    templates = []
    for template, version in _published_templates(db, org_id):
        mapped = False
        for _, step in iter_steps(version.document or {} if version else {}):
            for node_uuid in dict.fromkeys(step.get("requirement_node_uuids") or []):
                if node_uuid in node_uuids:
                    mapped = True
                    by_node.setdefault(node_uuid, []).append({
                        "template_uuid": template.template_uuid, "step_key": step.get("key"), "title": step.get("title"),
                        "step_types": [step.get("type")],
                    })
        templates.append({"template_uuid": template.template_uuid, "title": template.title, "mapped": mapped})
    return by_node, templates


def coverage(db: Session, current_user: PublicUser, org_id: int, framework_uuid: str) -> dict:
    """The framework's current nodes, each with the published template steps that count toward it. Staff can read it."""
    from src.services.requirements import _framework_dict, _framework_or_404, _require_staff

    _require_staff(db, current_user, org_id)
    framework_view = _framework_dict(db, _framework_or_404(db, org_id, framework_uuid))
    by_node, templates = _template_coverage(db, org_id, {node["node_uuid"] for node in framework_view["nodes"]})
    return {
        "framework": {key: framework_view[key] for key in ("framework_uuid", "name", "description", "version", "status", "source_framework_uuid", "source_metadata")},
        "templates": templates,
        "nodes": [{**node, "covered_by": by_node.get(node["node_uuid"], [])} for node in framework_view["nodes"]],
    }


def coverage_summaries(db: Session, org_id: int, framework_views: list[dict]) -> dict[str, dict]:
    """Per framework (by uuid): how many of its requirements (leaf nodes) the org's published templates cover, and by how many templates.

    The caller has checked access; the templates are read once for every framework.
    """
    leaves = {view["framework_uuid"]: _leaf_uuids(view["nodes"]) for view in framework_views}
    all_nodes = {node["node_uuid"] for view in framework_views for node in view["nodes"]}
    by_node, _ = _template_coverage(db, org_id, all_nodes)
    summaries = {}
    for view in framework_views:
        nodes = {node["node_uuid"] for node in view["nodes"]}
        framework_leaves = leaves[view["framework_uuid"]]
        covered = sum(1 for node_uuid in framework_leaves if by_node.get(node_uuid))
        templates = {item["template_uuid"] for node_uuid in nodes for item in by_node.get(node_uuid, [])}
        total = len(framework_leaves)
        summaries[view["framework_uuid"]] = {
            "covered": covered, "total": total, "gaps": total - covered, "template_count": len(templates),
            "percent": round(covered * 100 / total) if total else 0,
        }
    return summaries


def _leaf_uuids(nodes: list[dict]) -> list[str]:
    parents = {node.get("parent_node_uuid") for node in nodes if node.get("parent_node_uuid")}
    return [node["node_uuid"] for node in nodes if node["node_uuid"] not in parents]
