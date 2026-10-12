"""Tool implementations for the Launch LMS MCP server.

Every handler runs as the connected admin, inside the single organization the
OAuth grant was issued for. Objects from any other organization are reported
as not found, even when the user is also an admin there.
"""

from __future__ import annotations

from urllib.parse import quote

from fastapi import HTTPException, Request
from sqlmodel import Session, func, select

from src.db.learning import LearningActivity, LearningPage, LearningVariable
from src.db.programs import Objective, Program, ProgramAssignment, ProgramObjective, ProgramPhase
from src.db.requirements import RequirementFramework
from src.security.org_auth import require_org_admin
from src.services import learning, programs, requirements
from src.services.learning_documents import store
from src.services.learning_documents.models import (
    ActivityDocumentSave,
    activity_document_json_schema,
    authoring_guide,
)
from src.services.learning_preview import sessions
from src.services.plan_template_documents import store as template_store
from src.services.plan_template_documents.models import authoring_guide as template_authoring_guide
from src.services.plan_template_documents.models import plan_template_json_schema
from src.services.requirement_documents import store as requirement_store
from src.services.requirement_documents.models import authoring_guide as requirement_authoring_guide
from src.services.requirement_documents.models import requirement_framework_json_schema
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext


def _activity(db_session: Session, ctx: AccessContext, activity_uuid: str) -> LearningActivity:
    activity = learning._get_activity(db_session, activity_uuid)
    if activity.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Activity not found in the connected organization")
    return activity


def _editor_url(db_session: Session, activity: LearningActivity) -> str:
    org = learning._get_org(db_session, activity.org_id)
    activity_uuid = activity.activity_uuid.removeprefix("learning_activity_")
    relation = db_session.exec(select(ProgramObjective).where(ProgramObjective.objective_id == activity.objective_id)).first()
    program = db_session.get(Program, relation.program_id) if relation else None
    return f"{frontend_url()}/orgs/{org.slug}/admin/plans/{program.program_uuid if program else ''}/activity/{activity_uuid}"


async def list_activities(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return _template_activities(db_session, ctx, args["template_uuid"])


def _template_activities(db_session: Session, ctx: AccessContext, template_uuid: str) -> dict:
    learning._require_org_admin(db_session, ctx.user, ctx.org_id)
    program = db_session.exec(select(Program).where(Program.program_uuid == template_uuid, Program.org_id == ctx.org_id)).first()
    if not program:
        raise HTTPException(status_code=404, detail="Plan template not found in the connected organization")
    rows = db_session.exec(
        select(LearningActivity, Objective)
        .join(Objective, Objective.id == LearningActivity.objective_id)
        .join(ProgramObjective, ProgramObjective.objective_id == Objective.id)
        .where(ProgramObjective.program_id == program.id)
        .order_by(ProgramObjective.position)
    ).all()
    counts = dict(db_session.exec(
        select(LearningPage.activity_id, func.count(LearningPage.id))  # type: ignore[arg-type]
        .where(LearningPage.activity_id.in_([activity.id for activity, _ in rows] or [0]))  # type: ignore[union-attr]
        .group_by(LearningPage.activity_id)
    ).all())
    return {
        "template": {"template_uuid": program.program_uuid, "name": program.name},
        "activities": [
            {"activity_uuid": activity.activity_uuid, "objective_uuid": objective.objective_uuid, "title": activity.title,
             "page_count": counts.get(activity.id, 0), "branching": bool((activity.settings or {}).get("flow")),
             "editor_url": _editor_url(db_session, activity)}
            for activity, objective in rows
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
    """The stored activity, or for an unsaved document the template it will live in."""
    activity_uuid, template_uuid = args.get("activity_uuid"), args.get("template_uuid")
    if activity_uuid:
        return _activity(db_session, ctx, activity_uuid).activity_uuid, None
    if template_uuid and not db_session.exec(select(Program.id).where(Program.program_uuid == template_uuid, Program.org_id == ctx.org_id)).first():
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


async def save_activity(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    activity = _activity(db_session, ctx, args["activity_uuid"])
    payload = ActivityDocumentSave(document=args["document"], base_etag=args["base_etag"])
    envelope = await store.save_activity_document(request, activity.activity_uuid, payload, ctx.user, db_session)
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


async def validate_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    return template_store.validate_template_document(db_session, ctx.user, ctx.org_id, args["document"], args.get("template_uuid"))


async def save_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = template_store.save_template_document(db_session, ctx.user, ctx.org_id, args["template_uuid"], args["document"], args["base_etag"])
    return _with_template_url(db_session, ctx, envelope)


async def create_plan_template(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    envelope = template_store.create_template_from_document(db_session, ctx.user, ctx.org_id, args["document"])
    return _with_template_url(db_session, ctx, envelope)


async def set_objective_requirements(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    mappings = template_store.set_objective_requirements(db_session, ctx.user, ctx.org_id, args["template_uuid"], args["objective_uuid"], list(args.get("node_uuids") or []))
    envelope = template_store.get_template_document(db_session, ctx.user, ctx.org_id, args["template_uuid"])
    return {"objective_uuid": args["objective_uuid"], "requirement_mappings": mappings, "template_etag": envelope["etag"]}


async def update_template_badge_versions(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    programs.update_badge_versions(db_session, ctx.user, ctx.org_id, args["template_uuid"], bool(args.get("accept_previous_major_versions")))
    envelope = template_store.get_template_document(db_session, ctx.user, ctx.org_id, args["template_uuid"])
    return _with_template_url(db_session, ctx, envelope)


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


# Global library ---------------------------------------------------------------

_LIBRARY_KINDS = {"plan_template", "requirement_framework"}


def _library_kind(args: dict) -> str:
    kind = str(args.get("kind") or "")
    if kind not in _LIBRARY_KINDS:
        raise HTTPException(status_code=422, detail="kind must be plan_template or requirement_framework")
    return kind


async def search_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind, query = _library_kind(args), str(args.get("query") or "")
    if kind == "plan_template":
        return {"kind": kind, "items": [{**item, "uuid": item["program_uuid"]} for item in programs.list_program_library(db_session, ctx.user, ctx.org_id, query)]}
    return {"kind": kind, "items": [{**item, "uuid": item["framework_uuid"]} for item in requirements.list_framework_library(db_session, ctx.user, ctx.org_id, query)]}


async def copy_from_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind = _library_kind(args)
    if kind == "plan_template":
        copied = programs.copy_program_from_library(db_session, ctx.user, ctx.org_id, args["uuid"])
        envelope = template_store.get_template_document(db_session, ctx.user, ctx.org_id, copied["program_uuid"])
        return {"kind": kind, **_with_template_url(db_session, ctx, envelope)}
    copied = requirements.copy_framework_from_library(db_session, ctx.user, ctx.org_id, args["uuid"])
    envelope = requirement_store.get_framework_document(db_session, ctx.user, ctx.org_id, copied["framework_uuid"])
    return {"kind": kind, **_with_framework_url(db_session, ctx, envelope)}


async def publish_to_library(request: Request, db_session: Session, ctx: AccessContext, args: dict) -> dict:
    kind = _library_kind(args)
    if kind == "plan_template":
        programs.publish_program_to_library(db_session, ctx.user, ctx.org_id, args["uuid"])
    else:
        requirements.publish_framework_to_library(db_session, ctx.user, ctx.org_id, args["uuid"])
    return {"kind": kind, "uuid": args["uuid"], "published_to_library": True}
