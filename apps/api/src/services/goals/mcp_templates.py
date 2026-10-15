"""The connector's plan template tools, on goal templates.

Drop-in replacements for the plan template handlers in ``services/mcp/handlers``:
same tool names, arguments and handler signature, reading and writing the goal
template document (stages of typed steps). Saving needs the etag that was read;
a stale etag is refused with the current envelope to merge into.
"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, Request
from sqlalchemy import inspect
from sqlmodel import Session, func, select

from src.db.goals import GoalAssignment, GoalTemplate, GoalTemplateVersion
from src.db.learning import LearningActivity, LearningPage
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.badge_versions import outdated_badge_steps
from src.services.goals.document import iter_steps, json_schema
from src.services.goals.mcp_template_checks import check_document, reject
from src.services.oauth.server import AccessContext

GUIDE_PATH = Path(__file__).with_name("mcp_authoring_guide.md")
SCHEMA_VERSION = "launch-lms.goal-template/1"


def authoring_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")


def _org_slug(db: Session, org_id: int) -> str:
    from src.services import learning

    return learning._get_org(db, org_id).slug


def template_editor_url(db: Session, org_id: int, template_uuid: str) -> str:
    from src.services.oauth.config import frontend_url

    return f"{frontend_url()}/orgs/{_org_slug(db, org_id)}/admin/plans/{quote(template_uuid)}"


def activity_editor_url(db: Session, org_id: int, template_uuid: str, activity_uuid: str) -> str:
    return f"{template_editor_url(db, org_id, template_uuid)}/activity/{activity_uuid.removeprefix('learning_activity_')}"


def _counts(document: dict) -> tuple[int, int]:
    stages = document.get("stages") or []
    return len(stages), sum(len(stage.get("steps") or []) for stage in stages)


def earns_badges(db: Session, template: GoalTemplate) -> list[dict]:
    """Badges this template is a way to earn."""
    from src.db.badge_routes import BadgeRoute
    from src.db.learning import LearningBadge

    if not inspect(db.get_bind()).has_table("badgeroute"):
        return []
    rows = db.exec(
        select(BadgeRoute, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
        .where(BadgeRoute.goal_template_id == template.id, LearningBadge.deleted_at.is_(None))  # type: ignore[union-attr]
    ).all()
    return [{"badge_uuid": badge.badge_uuid, "name": badge.name, "recommended": route.recommended} for route, badge in rows]


# Versions ------------------------------------------------------------------------------

def _version_summary(version: GoalTemplateVersion, template: GoalTemplate) -> dict:
    steps = [step for _, step in iter_steps(version.document or {})]
    return {
        "version_uuid": version.version_uuid, "number": version.number, "note": version.note,
        "published_at": version.published_at.isoformat() if version.published_at else None,
        "restored_from_number": version.restored_from_number, "is_published": version.id == template.published_version_id,
        "step_count": len(steps), "activity_count": sum(1 for step in steps if step.get("type") == "activity"),
    }


def version_status(db: Session, template: GoalTemplate) -> dict:
    current = templates.published_version(db, template)
    assigned = dict(db.exec(
        select(GoalAssignment.version_id, func.count(GoalAssignment.id))  # type: ignore[arg-type]
        .where(GoalAssignment.template_id == template.id).group_by(GoalAssignment.version_id)
    ).all())
    return {
        "versioned": not template.system_type,
        "published_version": _version_summary(current, template) if current else None,
        "has_unpublished_changes": bool(not template.system_type and (current is None or current.content_hash != templates.fingerprint(db, template))),
        "versions": [{**_version_summary(item, template), "assignment_count": assigned.get(item.id, 0)} for item in templates._versions(db, template)],
    }


def envelope(db: Session, template: GoalTemplate) -> dict:
    """The document, its etag and what an admin needs to know about the template."""
    assignment_count = db.exec(select(func.count(GoalAssignment.id)).where(GoalAssignment.template_id == template.id)).one()  # type: ignore[arg-type]
    return {
        "document": template.document,
        "etag": templates.etag(template),
        "context": {
            "template_uuid": template.template_uuid, "title": template.title,
            "status": getattr(template.status, "value", template.status), "system_type": template.system_type,
            "assignment_count": assignment_count, "published_to_library": template.library_published_at is not None,
            "earns_badges": earns_badges(db, template), "versioning": version_status(db, template),
            "outdated_badge_steps": outdated_badge_steps(db, template),
        },
        "editor_url": template_editor_url(db, template.org_id, template.template_uuid),
    }


def _template(db: Session, ctx: AccessContext, template_uuid: str) -> GoalTemplate:
    require_org_admin(ctx.user.id, ctx.org_id, db)
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid, GoalTemplate.org_id == ctx.org_id)).first()
    if not template:
        raise HTTPException(status_code=404, detail="Plan template not found in the connected organization")
    return template


# Handlers --------------------------------------------------------------------------------

async def list_plan_templates(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    query = str(args.get("query") or "").strip().lower()
    rows = db_session.exec(select(GoalTemplate).where(GoalTemplate.org_id == ctx.org_id).order_by(GoalTemplate.title)).all()
    assigned = dict(db_session.exec(
        select(GoalAssignment.template_id, func.count(GoalAssignment.id)).group_by(GoalAssignment.template_id)  # type: ignore[arg-type]
    ).all())
    items = []
    for template in rows:
        if query and query not in f"{template.title} {template.description}".lower():
            continue
        stage_count, step_count = _counts(template.document or {})
        live = templates.published_version(db_session, template)
        items.append({
            "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
            "status": getattr(template.status, "value", template.status), "stage_count": stage_count, "step_count": step_count,
            "assignment_count": assigned.get(template.id, 0), "published_version": live.number if live else None,
            "updated": template.update_date, "editor_url": template_editor_url(db_session, ctx.org_id, template.template_uuid),
        })
    return {"templates": items}


async def get_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return envelope(db_session, _template(db_session, ctx, args["template_uuid"]))


async def get_plan_template_schema(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"format_version": SCHEMA_VERSION, "guide": authoring_guide(), "schema": json_schema()}


async def validate_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    template = _template(db_session, ctx, args["template_uuid"]) if args.get("template_uuid") else None
    return check_document(db_session, ctx.org_id, args["document"], template)


async def save_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    template = _template(db_session, ctx, args["template_uuid"])
    current = envelope(db_session, template)
    if args["base_etag"] != current["etag"]:
        raise HTTPException(status_code=409, detail={"message": "The template changed since it was read; merge your edit into `current` and save again", "current": current})
    report = check_document(db_session, ctx.org_id, args["document"], template)
    if not report["valid"]:
        raise reject(report)
    if args["document"] == current["document"]:
        return {**current, "changed": False, "warnings": report["warnings"]}
    templates.save_template(db_session, ctx.user, ctx.org_id, template.template_uuid, args["document"], current["etag"])
    db_session.refresh(template)
    saved = envelope(db_session, template)
    return {**saved, "changed": saved["etag"] != current["etag"], "warnings": report["warnings"]}


async def create_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    document = deepcopy(args["document"])
    # A document read from another template is a copy: its activities and keys get made anew.
    for stage in document.get("stages") or [] if isinstance(document, dict) else []:
        for step in stage.get("steps") or []:
            if step.get("type") == "activity":
                step["config"] = {}
    report = check_document(db_session, ctx.org_id, document, None)
    if not report["valid"]:
        raise reject(report)
    created = templates.create_template(db_session, ctx.user, ctx.org_id, document)
    template = templates.template_or_404(db_session, ctx.org_id, created["template_uuid"])
    return {**envelope(db_session, template), "changed": True, "warnings": report["warnings"]}


async def list_plan_template_versions(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    template = _template(db_session, ctx, args["template_uuid"])
    return {"template_uuid": template.template_uuid, **version_status(db_session, template)}


def _version_result(db: Session, ctx: AccessContext, template: GoalTemplate) -> dict:
    db.refresh(template)
    live = templates.published_version(db, template)
    return {
        "template_uuid": template.template_uuid, "published": _version_summary(live, template) if live else None,
        **version_status(db, template), "editor_url": template_editor_url(db, ctx.org_id, template.template_uuid),
    }


async def publish_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    template = _template(db_session, ctx, args["template_uuid"])
    current = templates.published_version(db_session, template)
    if current is not None and current.content_hash == templates.fingerprint(db_session, template):
        raise HTTPException(status_code=409, detail=f"Nothing to publish: the draft matches version {current.number}")
    templates.publish(db_session, ctx.user, ctx.org_id, template.template_uuid, str(args.get("note") or ""))
    return _version_result(db_session, ctx, template)


async def restore_plan_template_version(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    template = _template(db_session, ctx, args["template_uuid"])
    number = int(args["number"])
    live = templates.published_version(db_session, template)
    if live is not None and live.number == number:
        raise HTTPException(status_code=409, detail=f"Version {number} is already the published version")
    templates.restore(db_session, ctx.user, ctx.org_id, template.template_uuid, number, str(args.get("note") or ""))
    return _version_result(db_session, ctx, template)


def _save_draft(db: Session, ctx: AccessContext, template: GoalTemplate, document: dict) -> None:
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates are updated with each release")
    templates.save_template(db, ctx.user, ctx.org_id, template.template_uuid, document, templates.etag(template))
    db.refresh(template)


async def set_objective_requirements(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    """Replace the requirement nodes one step counts toward. ``objective_uuid`` is accepted as the step key (migrated keys equal it)."""
    from src.services.goals.credit import requirement_links
    from src.services.requirements import mappable_nodes, parent_node_uuids

    template = _template(db_session, ctx, args["template_uuid"])
    step_key = str(args.get("step_key") or args.get("objective_uuid") or "")
    document = deepcopy(template.document or {})
    step = next((item for _, item in iter_steps(document) if item.get("key") == step_key), None)
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found in this template")
    requested = list(dict.fromkeys(str(node) for node in args.get("node_uuids") or []))
    if set(requested) - (set(mappable_nodes(db_session, ctx.org_id)) - parent_node_uuids(db_session, ctx.org_id)):
        raise HTTPException(status_code=422, detail="One or more requirement nodes are unavailable")
    if requested != list(step.get("requirement_node_uuids") or []):
        step["requirement_node_uuids"] = requested
        _save_draft(db_session, ctx, template, document)
    return {"step_key": step_key, "requirement_links": requirement_links(db_session, ctx.org_id, requested), "template_etag": templates.etag(template)}


async def update_template_badge_versions(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    """Point the draft's badge steps at each badge's newest major version (``goals.badge_versions``)."""
    from src.services.goals.badge_versions import update_badge_versions

    template = _template(db_session, ctx, args["template_uuid"])
    before = templates.etag(template)
    update_badge_versions(db_session, ctx.user, ctx.org_id, template.template_uuid, bool(args.get("accept_previous_major_versions")))
    db_session.refresh(template)
    return {**envelope(db_session, template), "changed": templates.etag(template) != before}


async def list_activities(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    template = _template(db_session, ctx, args["template_uuid"])
    keys = {(step.get("config") or {}).get("activity_uuid"): step.get("key") for _, step in iter_steps(template.document or {}) if step.get("type") == "activity"}
    rows = db_session.exec(
        select(LearningActivity).where(LearningActivity.goal_template_id == template.id, LearningActivity.frozen_from_id.is_(None))  # type: ignore[union-attr]
    ).all()
    order = list(keys)
    rows = sorted((row for row in rows if row.activity_uuid in keys), key=lambda row: order.index(row.activity_uuid))
    counts = dict(db_session.exec(
        select(LearningPage.activity_id, func.count(LearningPage.id))  # type: ignore[arg-type]
        .where(LearningPage.activity_id.in_([row.id for row in rows] or [0])).group_by(LearningPage.activity_id)  # type: ignore[union-attr]
    ).all())
    return {
        "template": {"template_uuid": template.template_uuid, "title": template.title},
        "activities": [
            {"activity_uuid": row.activity_uuid, "step_key": keys[row.activity_uuid], "title": row.title,
             "page_count": counts.get(row.id, 0), "branching": bool((row.settings or {}).get("flow")),
             "editor_url": activity_editor_url(db_session, ctx.org_id, template.template_uuid, row.activity_uuid)}
            for row in rows
        ],
    }


def summary(name: str, result: dict) -> str | None:
    """The text line for save and create (``services/mcp/tools._summary`` reads the legacy shape)."""
    if name not in {"save_plan_template", "create_plan_template"}:
        return None
    document = result["document"]
    stage_count, step_count = _counts(document)
    verb = "Saved" if result.get("changed") else "No changes to"
    warnings = "".join(f"\nWarning at {item['path']}: {item['message']}" for item in result.get("warnings") or [])
    return (
        f"{verb} plan template \"{document['template']['title']}\" ({stage_count} stages, {step_count} steps). "
        f"New etag: {result['etag']}. Review in Launch LMS: {result['editor_url']}{warnings}"
    )
