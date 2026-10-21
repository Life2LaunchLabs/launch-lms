"""Plans › Assignments: the organization's plan templates as a stack of cards, each with its assignments here.

Admins get every plan they can hand out (their own published templates, and other organizations'
badge templates they're authorized to run) plus any plan that has assignments here; on their own
plans they also see which other organizations run them, as counts only. Staff get only the plans
of assignments they staff. The whole stack loads in a fixed number of queries: assignments are
summarized together (``assignment_summaries``) and progress is counted per goal in one grouped
query, never per assignment × learner.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, col, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import CURRENT_ASSIGNMENT_STATUSES, Goal, GoalAssignment, GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.db.learning import LearningBadge
from src.db.organizations import Organization
from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_membership
from src.services.goals import badge_authority
from src.services.goals.assignment_summary import _person, assignment_summaries
from src.services.goals.badges import badge_routes
from src.services.goals.plan_issuers import issued_badge_ids
from src.services.goals.document import iter_steps
from src.services.school.roles import is_staff


def _value(item) -> str:
    return getattr(item, "value", item)


def _org_ref(org: Organization | None) -> dict | None:
    return {"id": org.id, "name": org.name, "slug": org.slug} if org else None


def _runnable(db: Session, org_id: int) -> dict[int, list[LearningBadge]]:
    """Other organizations' templates this one may run, by template id, with the badges they earn
    (the routes ``badge_templates.issuer_routes`` lists)."""
    badges = db.exec(
        select(LearningBadge).where(col(LearningBadge.id).in_(issued_badge_ids(db, [org_id]) or {0}), col(LearningBadge.deleted_at).is_(None))
        .order_by(LearningBadge.name)
    ).all()
    result: dict[int, list[LearningBadge]] = {}
    for badge in badges:
        for route, template in badge_routes(db, badge):
            if badge_authority.may_run(db, badge, org_id, route):
                result.setdefault(int(template.id), []).append(badge)  # type: ignore[arg-type]
    return result


def _route_badges(db: Session, template_ids: list[int]) -> dict[int, list[LearningBadge]]:
    """The live badges each template is a way to earn."""
    if not template_ids:
        return {}
    result: dict[int, list[LearningBadge]] = {}
    for template_id, badge in db.exec(
        select(BadgeRoute.goal_template_id, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
        .where(col(BadgeRoute.goal_template_id).in_(template_ids), col(LearningBadge.deleted_at).is_(None))
        .order_by(BadgeRoute.position, BadgeRoute.id)  # type: ignore[arg-type]
    ).all():
        result.setdefault(int(template_id), []).append(badge)
    return result


def _frameworks(db: Session, documents: dict[int, dict]) -> dict[int, list[dict]]:
    """Per template, the requirement frameworks its steps count toward, with how many of each one's requirements."""
    nodes_by_template = {template_id: {node for _, step in iter_steps(document) for node in step.get("requirement_node_uuids") or []}
                         for template_id, document in documents.items()}
    wanted = {node for nodes in nodes_by_template.values() for node in nodes}
    if not wanted:
        return {}
    frameworks: dict[str, dict] = {}
    node_framework: dict[str, str] = {}
    for node_uuid, framework in db.exec(
        select(RequirementNode.node_uuid, RequirementFramework)
        .join(RequirementFrameworkVersion, RequirementFrameworkVersion.id == RequirementNode.version_id)
        .join(RequirementFramework, RequirementFramework.id == RequirementFrameworkVersion.framework_id)
        .where(col(RequirementNode.node_uuid).in_(list(wanted)))
    ).all():
        frameworks[framework.framework_uuid] = {"framework_uuid": framework.framework_uuid, "name": framework.name, "org_id": framework.org_id}
        node_framework.setdefault(node_uuid, framework.framework_uuid)
    result: dict[int, list[dict]] = {}
    for template_id, nodes in nodes_by_template.items():
        counts: dict[str, int] = {}
        for node in nodes:
            if node in node_framework:
                counts[node_framework[node]] = counts.get(node_framework[node], 0) + 1
        result[template_id] = sorted(({**frameworks[uuid], "node_count": count} for uuid, count in counts.items()), key=lambda item: item["name"].lower())
    return result


def _authorized_orgs(db: Session, org_id: int, template_ids: list[int]) -> dict[int, list[dict]]:
    """Other organizations running these templates now: counts only, never their learners."""
    if not template_ids:
        return {}
    rows = db.exec(
        select(GoalAssignment.template_id, GoalAssignment.org_id, func.count(func.distinct(GoalAssignment.id)), func.count(Goal.id), func.min(GoalAssignment.creation_date))
        .select_from(GoalAssignment).join(Goal, Goal.assignment_id == GoalAssignment.id, isouter=True)  # type: ignore[arg-type]
        .where(col(GoalAssignment.template_id).in_(template_ids), GoalAssignment.org_id != org_id,
               col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES))
        .group_by(GoalAssignment.template_id, GoalAssignment.org_id)
    ).all()
    orgs = {int(org.id): org for org in db.exec(select(Organization).where(col(Organization.id).in_({int(row[1]) for row in rows}))).all()} if rows else {}
    result: dict[int, list[dict]] = {}
    for template_id, other_id, assignment_count, learner_count, since in rows:
        result.setdefault(int(template_id), []).append({
            "org": _org_ref(orgs.get(int(other_id))), "assignment_count": int(assignment_count), "learner_count": int(learner_count), "since": since,
        })
    for items in result.values():
        items.sort(key=lambda item: -item["learner_count"])
    return result


def _badge(badge: LearningBadge, owners: dict[int, Organization]) -> dict:
    return {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or "",
            "org_id": badge.org_id, "owner_org": _org_ref(owners.get(int(badge.org_id)))}


def list_plans(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The Assignments tab: ``{"plans": [...], "learners": [...]}``, one plan per template, each with its
    assignments here (ended ones too), newest first; ``learners`` names everyone on them, for filters."""
    require_org_membership(current_user.id, org_id, db)
    admin = bool(current_user.is_superadmin) or is_org_admin(current_user.id, org_id, db)
    rows = list(db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id)
                        .order_by(col(GoalAssignment.creation_date).desc(), col(GoalAssignment.id).desc())).all())
    if not admin:
        rows = [row for row in rows if current_user.id in (row.staff_user_ids or [])]
        if not rows and not is_staff(db, org_id, current_user.id):
            raise HTTPException(status_code=403, detail="Only the organization's staff can see its plans")
    summaries = assignment_summaries(db, rows)

    template_ids = list(dict.fromkeys(int(row.template_id) for row in rows))
    runnable: dict[int, list[LearningBadge]] = {}
    if admin:
        # The org's own templates it can hand out: published, not archived, not the platform's starter plan.
        own = db.exec(select(GoalTemplate.id).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED,
                                                   col(GoalTemplate.published_version_id).is_not(None), col(GoalTemplate.system_type).is_(None))).all()
        runnable = _runnable(db, org_id)
        template_ids = list(dict.fromkeys([*template_ids, *(int(item) for item in own), *runnable]))
    templates = {int(row.id): row for row in db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_(template_ids))).all()} if template_ids else {}  # type: ignore[arg-type]
    live_ids = [row.published_version_id for row in templates.values() if row.published_version_id]
    live = {int(row.id): row for row in db.exec(select(GoalTemplateVersion).where(col(GoalTemplateVersion.id).in_(live_ids))).all()} if live_ids else {}  # type: ignore[arg-type]
    # What a card describes: the published version, else (for the org's own draft-only template) the draft.
    documents = {template_id: (live[int(row.published_version_id)].document if row.published_version_id and int(row.published_version_id) in live
                               else (row.document if row.org_id == org_id else {})) or {} for template_id, row in templates.items()}
    route_badges = _route_badges(db, [template_id for template_id, row in templates.items() if row.org_id == org_id])
    frameworks = _frameworks(db, documents)
    authorized_orgs = _authorized_orgs(db, org_id, [template_id for template_id, row in templates.items() if row.org_id == org_id]) if admin else {}
    badges_of: dict[int, list[LearningBadge]] = {}
    for template_id, row in templates.items():
        found = route_badges.get(template_id, []) if row.org_id == org_id else list(runnable.get(template_id, []))
        badges_of[template_id] = list({int(badge.id): badge for badge in found}.values())  # type: ignore[arg-type]
    owners = {int(org.id): org for org in db.exec(select(Organization).where(col(Organization.id).in_(
        {int(row.org_id) for row in templates.values()} | {int(badge.org_id) for items in badges_of.values() for badge in items}))).all()} if templates else {}

    by_template: dict[int, list[dict]] = {}
    for row in rows:
        by_template.setdefault(int(row.template_id), []).append(summaries[int(row.id)])  # type: ignore[arg-type]
    plans = []
    for template_id, template in templates.items():
        document = documents.get(template_id) or {}
        version = live.get(int(template.published_version_id)) if template.published_version_id else None
        own = int(template.org_id) == int(org_id)
        assignments = by_template.get(template_id, [])
        plans.append({
            "template": {
                "template_uuid": template.template_uuid, "title": template.title, "status": _value(template.status),
                "version": version.number if version else None, "stage_count": len(document.get("stages") or []),
                "step_count": sum(1 for _ in iter_steps(document)), "owner_org": _org_ref(owners.get(int(template.org_id))),
                "own": own, "run_with_permission": not own and template_id in runnable,
            },
            "badges": [_badge(badge, owners) for badge in badges_of.get(template_id, [])],
            "frameworks": frameworks.get(template_id, []),
            "assignments": assignments,
            "authorized_orgs": authorized_orgs.get(template_id, []) if own and admin else [],
        })
    plans.sort(key=lambda plan: (not any(item["status"] in CURRENT_ASSIGNMENT_STATUSES for item in plan["assignments"]), plan["template"]["title"].lower()))

    learner_ids = {int(user_id) for summary in summaries.values() for user_id in summary["learner_ids"]}
    learners = db.exec(select(User).where(col(User.id).in_(learner_ids))).all() if learner_ids else []
    return {"plans": plans, "learners": sorted((_person(user) for user in learners), key=lambda person: ((person or {}).get("first_name") or (person or {}).get("username") or "").lower())}
