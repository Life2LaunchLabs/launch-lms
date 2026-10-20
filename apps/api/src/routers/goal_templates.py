"""Goal templates, for organization admins and the connector."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.goal_templates import GoalAssignmentRequest
from src.db.goals import TemplateCreate, TemplatePublish, TemplateSave, TemplateStatus
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import assignments, badge_templates, badge_versions, library, template_marketplace, templates
from src.services.goals.document import json_schema

router = APIRouter()


@router.get("/schema")
def api_document_schema():
    return json_schema()


@router.get("")
def api_templates(org_id: int, include_archived: bool = False, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.list_templates(db, user, org_id, include_archived)


@router.post("")
def api_create_template(org_id: int, payload: TemplateCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.create_template(db, user, org_id, payload.document, payload.title)


# Fixed paths before /{template_uuid} ------------------------------------------------

@router.get("/library")
def api_library(org_id: int, q: str = "", db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Templates the platform shares with every organization."""
    return library.list_library(db, user, org_id, q)


@router.post("/library/{template_uuid}/copy")
def api_copy_from_library(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A draft template of the organization's own from a library template, with copies of its activities."""
    return library.copy_from_library(db, user, org_id, template_uuid)


@router.get("/assignments")
def api_org_assignments(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Active assignments across templates: all for admins, the ones they staff for everyone else."""
    return assignments.list_org_assignments(db, user, org_id)


@router.get("/badge-routes")
def api_issuer_badge_routes(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Other organizations' badge templates this one is authorized to run, with its assignments of each."""
    return badge_templates.issuer_routes(db, user, org_id)


# One template -------------------------------------------------------------------------

@router.get("/{template_uuid}")
def api_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    if not badge_templates.owns(db, org_id, template_uuid):
        # Another organization's badge template this one runs: its published version, read-only.
        view = badge_templates.template_view(db, user, org_id, template_uuid)
        return {**view, "owner_org": template_marketplace.owner_org(db, template_uuid)}
    result = templates.get_template(db, user, org_id, template_uuid)
    template = templates.template_or_404(db, org_id, template_uuid)
    return {**result, **library.library_status(template), "outdated_badge_steps": badge_versions.outdated_badge_steps(db, template),
            "based_on": template_marketplace.provenance(db, template)}


@router.put("/{template_uuid}")
def api_save_template(template_uuid: str, org_id: int, payload: TemplateSave, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.save_template(db, user, org_id, template_uuid, payload.document, payload.etag)


@router.post("/{template_uuid}/publish")
def api_publish_template(template_uuid: str, org_id: int, payload: TemplatePublish, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.publish(db, user, org_id, template_uuid, payload.note)


@router.post("/{template_uuid}/publish-to-library")
def api_publish_to_library(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Share the draft in the global library (the platform owner organization only)."""
    return library.publish_to_library(db, user, org_id, template_uuid)


@router.post("/{template_uuid}/update-badge-versions")
def api_update_badge_versions(template_uuid: str, org_id: int, accept_previous_major_versions: bool = False, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Move the draft's badge steps to each badge's latest major version."""
    return badge_versions.update_badge_versions(db, user, org_id, template_uuid, accept_previous_major_versions)


@router.get("/{template_uuid}/activities/{activity_uuid}")
def api_template_activity(template_uuid: str, activity_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A template's activity with its pages, for the activity editor."""
    return templates.template_activity(db, user, org_id, template_uuid, activity_uuid)


@router.post("/{template_uuid}/versions/{number}/restore")
def api_restore_template(template_uuid: str, number: int, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.restore(db, user, org_id, template_uuid, number)


@router.post("/{template_uuid}/archive")
def api_archive_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.set_status(db, user, org_id, template_uuid, TemplateStatus.ARCHIVED)


@router.post("/{template_uuid}/unarchive")
def api_unarchive_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.set_status(db, user, org_id, template_uuid, TemplateStatus.ACTIVE)


@router.get("/{template_uuid}/assignments")
def api_template_assignments(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return assignments.list_assignments(db, user, org_id, template_uuid)


@router.post("/{template_uuid}/assignments")
def api_assign_template(template_uuid: str, org_id: int, payload: GoalAssignmentRequest, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Hand the template to a person, a group or an email address, with a schedule and staff."""
    return assignments.assign(db, user, org_id, template_uuid, payload)
