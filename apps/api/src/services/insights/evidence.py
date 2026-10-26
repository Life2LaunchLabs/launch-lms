"""The requirement evidence a capture can carry: one row per credit, so a requirement two steps credited shows
both. It names learners, so a read-only link never shows it.
"""

from __future__ import annotations

from sqlmodel import col, select

from src.db.goals import GoalTemplate
from src.db.insights import InsightCapture
from src.db.users import User
from src.services.insights.captures import ATTACHMENTS, Attachment
from src.services.insights.context import Ctx
from src.services.insights.dimensions import PERSONAL
from src.services.insights.measures_requirements import _enrollments, _sources, categories_of, credited_on, source_plans

COLUMNS = [
    {"key": "learner", "label": "Learner"}, {"key": "framework", "label": "Framework"}, {"key": "category", "label": "Category"},
    {"key": "code", "label": "Code"}, {"key": "requirement", "label": "Requirement"}, {"key": "plan", "label": "Plan"},
    {"key": "step", "label": "Step"}, {"key": "credited_on", "label": "Credited on"}, {"key": "verified_by", "label": "Verified by"},
]


def _name(user: User | None) -> str:
    if not user:
        return ""
    return " ".join(part for part in (user.first_name, user.last_name) if part) or user.username


def evidence(ctx: Ctx, capture: InsightCapture) -> dict:
    """Every standing credit for the learners the capture counts, by learner, then framework, then requirement order."""
    enrollments, sources, plans = _enrollments(ctx), _sources(ctx), source_plans(ctx)
    people = ctx.pop.learners(("active", "alumni"))
    enrollments = [(enrollment, uuid) for enrollment, uuid in enrollments if int(enrollment.user_id) in people]
    user_ids = {int(enrollment.user_id) for enrollment, _ in enrollments}
    verifier_ids = {int(source.verified_by_user_id) for items in sources.values() for source in items if source.verified_by_user_id}
    users = {int(user.id): user for user in ctx.db.exec(select(User).where(col(User.id).in_(user_ids | verifier_ids))).all()} if user_ids else {}  # type: ignore[arg-type]
    plan_uuids = set(plans.values()) - {PERSONAL}
    titles = dict(ctx.db.exec(select(GoalTemplate.template_uuid, GoalTemplate.title).where(col(GoalTemplate.template_uuid).in_(plan_uuids))).all()) if plan_uuids else {}
    rows = []
    for enrollment, _ in sorted(enrollments, key=lambda item: (_name(users.get(int(item[0].user_id))).lower(), (item[0].framework_snapshot or {}).get("name", ""))):
        snapshot = enrollment.framework_snapshot or {}
        nodes = {node["node_uuid"]: node for node in snapshot.get("nodes") or []}
        order = {uuid: index for index, uuid in enumerate(snapshot.get("leaf_node_uuids") or [])}
        category = categories_of(snapshot)
        credits = sorted((source for source in sources.get(int(enrollment.id), []) if source.node_uuid in order),  # type: ignore[arg-type]
                         key=lambda source: (order[source.node_uuid], str(credited_on(source) or "")))
        for source in credits:
            node, top = nodes.get(source.node_uuid, {}), nodes.get(category.get(source.node_uuid, ""), {})
            plan = plans.get(int(source.step_progress_id)) if source.step_progress_id else None
            day = credited_on(source)
            rows.append({
                "learner": _name(users.get(int(enrollment.user_id))), "framework": snapshot.get("name", ""),
                "category": " ".join(part for part in (top.get("code"), top.get("title")) if part) if top is not node else "",
                "code": node.get("code") or "", "requirement": node.get("title") or "",
                "plan": "Personal goal" if plan == PERSONAL else titles.get(plan or "", ""), "step": source.objective_title,
                "credited_on": day.isoformat() if day else "", "verified_by": _name(users.get(int(source.verified_by_user_id))) if source.verified_by_user_id else "",
            })
    return {"columns": COLUMNS, "rows": rows}


ATTACHMENTS["requirement_evidence"] = Attachment("Requirement evidence", evidence, scopes=("framework", "group", "learner"))
