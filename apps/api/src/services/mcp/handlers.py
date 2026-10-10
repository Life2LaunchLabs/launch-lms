"""Tool implementations for the Launch LMS MCP server.

Every handler runs as the connected admin, inside the single organization the
OAuth grant was issued for. Objects from any other organization are reported
as not found, even when the user is also an admin there.
"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException, Request
from sqlmodel import Session, func, select

from src.db.learning import (
    LearningActivity,
    LearningBadge,
    LearningBadgeVersion,
    LearningBadgeVersionState,
    LearningPage,
    LearningVariable,
)
from src.db.programs import Program, ProgramAssignment, ProgramObjective, ProgramPhase
from src.db.requirements import RequirementFramework
from src.security.org_auth import require_org_admin
from src.services import learning, requirements
from src.services.learning_documents import store
from src.services.learning_documents.models import (
    ActivityDocumentCreate,
    ActivityDocumentSave,
    activity_document_json_schema,
    authoring_guide,
)
from src.services.learning_preview import sessions
from src.services.plan_template_documents import store as template_store
from src.services.plan_template_documents.models import authoring_guide as template_authoring_guide
from src.services.plan_template_documents.models import plan_template_json_schema
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext


def _state(version: LearningBadgeVersion) -> str:
    return version.state.value if hasattr(version.state, "value") else str(version.state)


def _badge(db_session: Session, ctx: AccessContext, badge_uuid: str) -> LearningBadge:
    badge = learning._get_badge(db_session, badge_uuid)
    if badge.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Badge not found in the connected organization")
    return badge


def _activity(db_session: Session, ctx: AccessContext, activity_uuid: str) -> LearningActivity:
    activity = learning._get_activity(db_session, activity_uuid)
    if activity.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Activity not found in the connected organization")
    return activity


def _versions(db_session: Session, badge: LearningBadge) -> list[LearningBadgeVersion]:
    return list(
        db_session.exec(
            select(LearningBadgeVersion)
            .where(LearningBadgeVersion.badge_id == badge.id)
            .order_by(LearningBadgeVersion.update_date.desc())  # type: ignore[union-attr]
        ).all()
    )


def _version_info(version: LearningBadgeVersion, active_id: int | None) -> dict:
    return {
        "version_uuid": version.version_uuid,
        "title": version.title,
        "state": _state(version),
        "semantic_version": version.semantic_version,
        "is_active": version.id == active_id,
        "editable": _state(version) == LearningBadgeVersionState.DRAFT.value,
    }


def _editor_url(db_session: Session, activity: LearningActivity) -> str:
    org = learning._get_org(db_session, activity.org_id)
    badge = db_session.get(LearningBadge, activity.badge_id)
    badge_uuid = (badge.badge_uuid if badge else "").removeprefix("badge_")
    activity_uuid = activity.activity_uuid.removeprefix("learning_activity_")
    version = db_session.get(LearningBadgeVersion, activity.version_id) if activity.version_id else None
    query = f"?version={version.version_uuid}" if version else ""
    return f"{frontend_url()}/orgs/{org.slug}/admin/badges/badge/{badge_uuid}/learning-path/activity/{activity_uuid}/editor{query}"


async def list_badges(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    learning._require_org_admin(db_session, ctx.user, ctx.org_id)
    badges = db_session.exec(
        select(LearningBadge)
        .where(LearningBadge.org_id == ctx.org_id, LearningBadge.deleted_at.is_(None))  # type: ignore[union-attr]
        .order_by(LearningBadge.name.asc())  # type: ignore[union-attr]
    ).all()
    query = str(args.get("query") or "").strip().lower()
    items = []
    for badge in badges:
        if query and query not in badge.name.lower():
            continue
        versions = _versions(db_session, badge)
        drafts = [version for version in versions if _state(version) == LearningBadgeVersionState.DRAFT.value]
        items.append(
            {
                "badge_uuid": badge.badge_uuid,
                "name": badge.name,
                "description": badge.description or "",
                "status": badge.status.value if hasattr(badge.status, "value") else badge.status,
                "draft_version": _version_info(drafts[0], badge.active_version_id) if drafts else None,
                "active_version": next((_version_info(v, badge.active_version_id) for v in versions if v.id == badge.active_version_id), None),
            }
        )
    return {"badges": items}


async def list_activities(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    badge = _badge(db_session, ctx, args["badge_uuid"])
    learning._require_org_admin(db_session, ctx.user, badge.org_id)
    versions = _versions(db_session, badge)
    if args.get("version_uuid"):
        version = learning._get_badge_version(db_session, badge, args["version_uuid"])
    else:
        version = next((v for v in versions if _state(v) == LearningBadgeVersionState.DRAFT.value), None) or next(
            (v for v in versions if v.id == badge.active_version_id), None
        )
    if version is None:
        return {"badge": {"badge_uuid": badge.badge_uuid, "name": badge.name}, "version": None, "activities": []}
    activities = db_session.exec(
        select(LearningActivity).where(LearningActivity.version_id == version.id).order_by(LearningActivity.order.asc())  # type: ignore[union-attr]
    ).all()
    counts = dict(
        db_session.exec(
            select(LearningPage.activity_id, func.count(LearningPage.id))  # type: ignore[arg-type]
            .where(LearningPage.version_id == version.id)
            .group_by(LearningPage.activity_id)
        ).all()
    )
    return {
        "badge": {"badge_uuid": badge.badge_uuid, "name": badge.name},
        "version": _version_info(version, badge.active_version_id),
        "other_versions": [_version_info(v, badge.active_version_id) for v in versions if v.id != version.id],
        "activities": [
            {
                "activity_uuid": activity.activity_uuid,
                "title": activity.title,
                "description": activity.description or "",
                "order": activity.order,
                "required": activity.required,
                "page_count": counts.get(activity.id, 0),
                "branching": bool((activity.settings or {}).get("flow")),
            }
            for activity in activities
        ],
    }


async def get_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity = _activity(db_session, ctx, args["activity_uuid"])
    envelope = await store.get_activity_document(request, activity.activity_uuid, ctx.user, db_session)
    return {**envelope, "editor_url": _editor_url(db_session, activity)}


async def get_activity_schema(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"guide": authoring_guide(), "schema": activity_document_json_schema()}


async def list_variables(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    learning._require_org_admin(db_session, ctx.user, ctx.org_id)
    variables = db_session.exec(
        select(LearningVariable).where(LearningVariable.org_id == ctx.org_id).order_by(LearningVariable.key.asc())  # type: ignore[union-attr]
    ).all()
    return {
        "variables": [
            {
                "key": f"user.details.variables.{variable.key}",
                "label": variable.label,
                "description": variable.description or "",
                "value_type": variable.value_type.value if hasattr(variable.value_type, "value") else variable.value_type,
                "options": variable.options or [],
            }
            for variable in variables
        ],
        "built_in": ["user.first_name", "user.last_name", "user.username", "user.email"],
    }


def _scope_target(db_session: Session, ctx: AccessContext, args: dict) -> tuple[str | None, str | None]:
    activity_uuid, badge_uuid = args.get("activity_uuid"), args.get("badge_uuid")
    if activity_uuid:
        activity_uuid = _activity(db_session, ctx, activity_uuid).activity_uuid
    elif badge_uuid:
        badge_uuid = _badge(db_session, ctx, badge_uuid).badge_uuid
    return activity_uuid, badge_uuid


async def validate_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity_uuid, badge_uuid = _scope_target(db_session, ctx, args)
    return await store.validate_activity_document(
        request, args["document"], ctx.user, db_session, activity_uuid=activity_uuid, badge_uuid=badge_uuid
    )


async def preview_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity_uuid, badge_uuid = _scope_target(db_session, ctx, args)
    created = await sessions.create_preview(
        request,
        sessions.PreviewCreate(
            activity_uuid=activity_uuid,
            badge_uuid=badge_uuid,
            document=args.get("document"),
            persona=args.get("persona") or {},
            source="connector",
        ),
        ctx.user,
        db_session,
    )
    return {
        "preview_url": created["url"],
        "embed_url": f"{created['url']}&embed=1",
        "expires_at": created["expires_at"],
        "warnings": created["warnings"],
        "unsaved": args.get("document") is not None,
    }


async def save_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity = _activity(db_session, ctx, args["activity_uuid"])
    payload = ActivityDocumentSave(document=args["document"], base_etag=args["base_etag"])
    envelope = await store.save_activity_document(request, activity.activity_uuid, payload, ctx.user, db_session)
    return {**envelope, "editor_url": _editor_url(db_session, activity)}


async def create_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    badge = _badge(db_session, ctx, args["badge_uuid"])
    payload = ActivityDocumentCreate(badge_uuid=badge.badge_uuid, version_uuid=args.get("version_uuid"), document=args["document"])
    envelope = await store.create_activity_from_document(request, payload, ctx.user, db_session)
    activity = learning._get_activity(db_session, envelope["context"]["activity_uuid"])
    return {**envelope, "editor_url": _editor_url(db_session, activity)}


# Plan templates ---------------------------------------------------------------


def _template_editor_url(db_session: Session, ctx: AccessContext, template_uuid: str) -> str:
    org = learning._get_org(db_session, ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/plans/{quote(template_uuid)}/objectives"


def _with_template_url(db_session: Session, ctx: AccessContext, envelope: dict) -> dict:
    return {**envelope, "editor_url": _template_editor_url(db_session, ctx, envelope["context"]["template_uuid"])}


async def list_plan_templates(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    query = str(args.get("query") or "").strip().lower()
    templates = db_session.exec(
        select(Program).where(Program.org_id == ctx.org_id).order_by(Program.name.asc())  # type: ignore[union-attr]
    ).all()
    items = []
    for program in templates:
        if query and query not in f"{program.name} {program.description}".lower():
            continue
        phases = db_session.exec(select(func.count(ProgramPhase.id)).where(ProgramPhase.program_id == program.id)).one()  # type: ignore[arg-type]
        objectives = db_session.exec(select(func.count(ProgramObjective.id)).where(ProgramObjective.program_id == program.id)).one()  # type: ignore[arg-type]
        assignments = db_session.exec(select(func.count(ProgramAssignment.id)).where(ProgramAssignment.program_id == program.id)).one()  # type: ignore[arg-type]
        items.append(
            {
                "template_uuid": program.program_uuid,
                "name": program.name,
                "description": program.description or "",
                "phase_count": phases,
                "objective_count": objectives,
                "assignment_count": assignments,
                "updated": program.update_date,
                "editor_url": _template_editor_url(db_session, ctx, program.program_uuid),
            }
        )
    return {"templates": items}


async def get_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = template_store.get_template_document(db_session, ctx.user, ctx.org_id, args["template_uuid"])
    return _with_template_url(db_session, ctx, envelope)


async def get_plan_template_schema(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"guide": template_authoring_guide(), "schema": plan_template_json_schema()}


async def list_requirement_nodes(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    if not requirements._available(db_session):
        return {"frameworks": []}
    frameworks = db_session.exec(
        select(RequirementFramework).where(
            RequirementFramework.org_id == ctx.org_id, RequirementFramework.archived == False  # noqa: E712
        ).order_by(RequirementFramework.name.asc())  # type: ignore[union-attr]
    ).all()
    return {
        "frameworks": [
            {
                "framework_uuid": framework.framework_uuid,
                "name": framework.name,
                "nodes": [
                    {"node_uuid": node.node_uuid, "code": node.code, "title": node.title, "parent_node_uuid": node.parent_node_uuid}
                    for node in requirements._nodes(db_session, int(requirements._version(db_session, framework).id))  # type: ignore[arg-type]
                ],
            }
            for framework in frameworks
        ]
    }


async def validate_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return template_store.validate_template_document(db_session, ctx.user, ctx.org_id, args["document"], args.get("template_uuid"))


async def save_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = template_store.save_template_document(db_session, ctx.user, ctx.org_id, args["template_uuid"], args["document"], args["base_etag"])
    return _with_template_url(db_session, ctx, envelope)


async def create_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = template_store.create_template_from_document(db_session, ctx.user, ctx.org_id, args["document"])
    return _with_template_url(db_session, ctx, envelope)
