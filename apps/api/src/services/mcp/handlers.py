"""Tool implementations for the Launch LMS MCP server.

Every handler runs as the connected admin, inside the single organization the
OAuth grant was issued for. Objects from any other organization are reported
as not found, even when the user is also an admin there.
"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageProgress, LearningResponseAttempt, LearningVariable
from src.db.requirements import RequirementFramework
from src.security.org_auth import require_org_admin
from src.services import learning, requirements
from src.services.learning_documents import store
from src.services.learning_documents.models import (
    ActivityDocumentSave,
    activity_document_json_schema,
    authoring_guide,
)
from src.services.learning_preview import sessions
from src.services.requirement_documents import store as requirement_store
from src.services.requirement_documents.models import authoring_guide as requirement_authoring_guide
from src.services.requirement_documents.models import requirement_framework_json_schema
from src.services.badge_documents import collections as badge_collections
from src.services.badge_documents import store as badge_store
from src.services.badge_documents.models import authoring_guide as badge_authoring_guide
from src.services.badge_documents.models import badge_json_schema
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext, admin_orgs


def _activity(db_session: Session, ctx: AccessContext, activity_uuid: str) -> LearningActivity:
    activity = learning._get_activity(db_session, activity_uuid)
    if activity.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Activity not found in the connected organization")
    return activity


def _editor_url(db_session: Session, activity: LearningActivity) -> str:
    org = learning._get_org(db_session, activity.org_id)
    activity_uuid = activity.activity_uuid.removeprefix("learning_activity_")
    template = store.owning_template(db_session, activity)
    return f"{frontend_url()}/orgs/{org.slug}/admin/plans/{template['template_uuid'] if template else ''}/activity/{activity_uuid}"


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
    """The stored activity, or for an unsaved document the template it will live in."""
    activity_uuid, template_uuid = args.get("activity_uuid"), args.get("template_uuid")
    if activity_uuid:
        return _activity(db_session, ctx, activity_uuid).activity_uuid, None
    template = store.template_by_uuid(db_session, template_uuid) if template_uuid else None
    if template_uuid and (template is None or template["org_id"] != ctx.org_id):
        raise HTTPException(status_code=404, detail="Plan template not found in the connected organization")
    return None, template_uuid


async def validate_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity_uuid, _template_uuid = _scope_target(db_session, ctx, args)
    return await store.validate_activity_document(request, args["document"], ctx.user, db_session, activity_uuid=activity_uuid)


async def preview_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity_uuid, template_uuid = _scope_target(db_session, ctx, args)
    created = await sessions.create_preview(
        request,
        sessions.PreviewCreate(
            activity_uuid=activity_uuid,
            template_uuid=template_uuid,
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


def _refuse_removing_learner_work(db_session: Session, activity: LearningActivity, document) -> None:
    """The connector never deletes learner records: removing a page would delete its learners' progress and answers."""
    kept = {str(page.get("page_uuid") or "") for page in (document or {}).get("pages") or [] if isinstance(page, dict)} if isinstance(document, dict) else set()
    removed = [page for page in db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all() if page.page_uuid not in kept]
    if not removed:
        return
    ids = [page.id for page in removed]
    touched = set(db_session.exec(select(LearningPageProgress.page_id).where(LearningPageProgress.page_id.in_(ids))).all())  # type: ignore[union-attr]
    touched |= set(db_session.exec(select(LearningResponseAttempt.page_id).where(LearningResponseAttempt.page_id.in_(ids))).all())  # type: ignore[union-attr]
    blocked = [page for page in removed if page.id in touched]
    if blocked:
        titles = ", ".join(f"\"{page.title}\" ({page.page_uuid})" for page in blocked)
        raise HTTPException(status_code=409, detail={
            "message": f"Learners have progress or answers on {titles}, and removing a page deletes them. The connector never deletes learner work: "
                       "keep the page (set required: false and route the flow around it to retire it), or remove it in the Launch LMS editor.",
            "page_uuids": [page.page_uuid for page in blocked],
        })


async def save_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity = _activity(db_session, ctx, args["activity_uuid"])
    _refuse_removing_learner_work(db_session, activity, args.get("document"))
    payload = ActivityDocumentSave(document=args["document"], base_etag=args["base_etag"])
    envelope = await store.save_activity_document(request, activity.activity_uuid, payload, ctx.user, db_session)
    return {**envelope, "editor_url": _editor_url(db_session, activity)}


# Requirement frameworks -------------------------------------------------------


def _framework_editor_url(db_session: Session, ctx: AccessContext, framework_uuid: str) -> str:
    org = learning._get_org(db_session, ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/plans/requirements/{quote(framework_uuid)}/details"


def _with_framework_url(db_session: Session, ctx: AccessContext, envelope: dict) -> dict:
    return {**envelope, "editor_url": _framework_editor_url(db_session, ctx, envelope["context"]["framework_uuid"])}


async def list_requirement_frameworks(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    require_org_admin(ctx.user.id, ctx.org_id, db_session)
    if not requirements._available(db_session):
        return {"frameworks": []}
    frameworks = db_session.exec(
        select(RequirementFramework).where(
            RequirementFramework.org_id == ctx.org_id, RequirementFramework.archived == False  # noqa: E712
        ).order_by(RequirementFramework.name.asc())  # type: ignore[union-attr]
    ).all()
    items = []
    for framework in frameworks:
        version = requirements._version(db_session, framework)
        nodes = requirements._nodes(db_session, int(version.id))  # type: ignore[arg-type]
        parents = {node.parent_node_uuid for node in nodes if node.parent_node_uuid}
        items.append(
            {
                "framework_uuid": framework.framework_uuid,
                "name": framework.name,
                "description": framework.description or "",
                "version": version.version_number,
                "status": version.status.value if hasattr(version.status, "value") else str(version.status),
                "published_version": framework.published_version,
                # Leaf requirements are what objectives link to.
                "requirements": [
                    {"node_uuid": node.node_uuid, "code": node.code, "title": node.title, "parent_node_uuid": node.parent_node_uuid, "leaf": node.node_uuid not in parents}
                    for node in nodes
                ],
                "editor_url": _framework_editor_url(db_session, ctx, framework.framework_uuid),
            }
        )
    return {"frameworks": items}


async def get_requirement_framework(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = requirement_store.get_framework_document(db_session, ctx.user, ctx.org_id, args["framework_uuid"])
    return _with_framework_url(db_session, ctx, envelope)


async def get_requirement_framework_schema(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"guide": requirement_authoring_guide(), "schema": requirement_framework_json_schema()}


async def validate_requirement_framework(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return requirement_store.validate_framework_document(db_session, ctx.user, ctx.org_id, args["document"], args.get("framework_uuid"))


async def save_requirement_framework(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = requirement_store.save_framework_document(db_session, ctx.user, ctx.org_id, args["framework_uuid"], args["document"], args["base_etag"])
    return _with_framework_url(db_session, ctx, envelope)


async def create_requirement_framework(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = requirement_store.create_framework_from_document(db_session, ctx.user, ctx.org_id, args["document"])
    return _with_framework_url(db_session, ctx, envelope)


async def publish_requirement_framework(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = requirement_store.publish_framework(db_session, ctx.user, ctx.org_id, args["framework_uuid"])
    return _with_framework_url(db_session, ctx, envelope)


# Organizations ----------------------------------------------------------------


async def list_organizations(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {
        "default_org": learning._get_org(db_session, ctx.default_org_id or ctx.org_id).slug,
        "current_org": learning._get_org(db_session, ctx.org_id).slug,
        "organizations": [{"slug": org.slug, "name": org.name} for org in sorted(admin_orgs(db_session, ctx.user), key=lambda item: item.name.lower())],
    }


# Badges -----------------------------------------------------------------------


def _badge_editor_url(db_session: Session, ctx: AccessContext, badge_uuid: str, tab: str = "definition") -> str:
    org = learning._get_org(db_session, ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/badges/badge/{quote(badge_uuid.removeprefix('badge_'))}/{tab}"


def _with_badge_url(db_session: Session, ctx: AccessContext, envelope: dict) -> dict:
    badge_uuid = envelope["context"]["badge_uuid"]
    return {**envelope, "editor_url": _badge_editor_url(db_session, ctx, badge_uuid), "routes_url": _badge_editor_url(db_session, ctx, badge_uuid, "routes")}


async def list_badges(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    items = badge_store.list_badges(db_session, ctx.user, ctx.org_id, str(args.get("query") or ""))
    return {"badges": [{**item, "editor_url": _badge_editor_url(db_session, ctx, item["badge_uuid"])} for item in items]}


async def get_badge(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return _with_badge_url(db_session, ctx, badge_store.get_badge_document(db_session, ctx.user, ctx.org_id, args["badge_uuid"]))


async def get_badge_schema(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"guide": badge_authoring_guide(), "schema": badge_json_schema()}


async def validate_badge(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return badge_store.validate_badge_document(db_session, ctx.user, ctx.org_id, args["document"])


async def create_badge(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return _with_badge_url(db_session, ctx, await badge_store.create_badge_from_document(db_session, ctx.user, ctx.org_id, args["document"]))


async def save_badge(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = badge_store.save_badge_document(db_session, ctx.user, ctx.org_id, args["badge_uuid"], args["document"], args["base_etag"])
    return _with_badge_url(db_session, ctx, envelope)


async def publish_badge(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = await badge_store.publish_badge(
        db_session, ctx.user, ctx.org_id, args["badge_uuid"], args.get("semantic_version"), args.get("release_title"), args.get("release_notes"),
    )
    return _with_badge_url(db_session, ctx, envelope)


async def set_badge_routes(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    routes = args.get("routes")
    if not isinstance(routes, list):
        raise HTTPException(status_code=422, detail="routes must be a list of {template_uuid, recommended}")
    return _with_badge_url(db_session, ctx, badge_store.set_badge_routes(db_session, ctx.user, ctx.org_id, args["badge_uuid"], routes))


async def list_badge_collections(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"collections": badge_collections.list_collections(db_session, ctx.user, ctx.org_id)}


async def save_badge_collection(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return {"collection": badge_collections.save_collection(db_session, ctx.user, ctx.org_id, args)}
