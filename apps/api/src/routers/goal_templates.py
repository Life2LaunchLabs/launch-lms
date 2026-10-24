"""Goal templates, for organization admins and the connector."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.goal_templates import GoalAssignmentRequest, TemplateCover
from src.db.goal_drafts import TemplateDraftStart, TemplateDraftUpdate, TemplateLiveUpdate
from src.db.goals import TemplateCreate, TemplatePublish, TemplateSave, TemplateStatus
from src.db.template_marketplace import TemplateLearnerAccessUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import assignments, drafts, library, plan_issuers, starters, template_learners, template_marketplace, templates
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
    return templates.create_template(db, user, org_id, payload.document, payload.title, payload.icon, payload.color)


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


@router.get("/starters")
def api_starters(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The New plan picker's starter plans, by category."""
    return starters.list_starters(db, user, org_id)


@router.post("/starters/{template_uuid}/use")
def api_use_starter(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """A new draft plan from a starter."""
    return starters.use_starter(db, user, org_id, template_uuid)


# One template -------------------------------------------------------------------------

@router.get("/{template_uuid}")
def api_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    if not plan_issuers.owns(db, org_id, template_uuid):
        # Another organization's plan this one runs: its live release, read-only.
        return plan_issuers.template_view(db, user, org_id, template_uuid)
    result = templates.get_template(db, user, org_id, template_uuid)
    template = templates.template_or_404(db, org_id, template_uuid)
    return {**result, **library.library_status(db, template),
            "based_on": template_marketplace.provenance(db, template)}


@router.put("/{template_uuid}")
def api_save_template(template_uuid: str, org_id: int, payload: TemplateSave, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.save_template(db, user, org_id, template_uuid, payload.document, payload.etag)


@router.put("/{template_uuid}/cover")
def api_template_cover(template_uuid: str, org_id: int, payload: TemplateCover, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.set_cover(db, user, org_id, template_uuid, payload)


@router.post("/{template_uuid}/publish")
def api_publish_template(template_uuid: str, org_id: int, payload: TemplatePublish, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Freeze the draft into a locked version; with ``make_live`` (the default) it goes live and active assignments move to it."""
    return templates.publish(db, user, org_id, template_uuid, payload.note, semver=payload.semver, make_live=payload.make_live)


@router.post("/{template_uuid}/draft")
def api_start_draft(template_uuid: str, org_id: int, payload: TemplateDraftStart, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Start editing under a new version number, higher than every version so far."""
    return drafts.start_draft(db, user, org_id, template_uuid, payload.semver, payload.note)


@router.patch("/{template_uuid}/draft")
def api_update_draft(template_uuid: str, org_id: int, payload: TemplateDraftUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return drafts.update_draft(db, user, org_id, template_uuid, payload.semver, payload.note)


@router.delete("/{template_uuid}/draft")
def api_discard_draft(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Throw the draft away; the plan goes back to its live version."""
    return drafts.discard_draft(db, user, org_id, template_uuid)


@router.get("/{template_uuid}/draft/changes")
def api_draft_changes(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return drafts.draft_changes(db, user, org_id, template_uuid)


@router.get("/{template_uuid}/live")
def api_live_preview(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """How many active assignments and open plans switching the live version would move."""
    return drafts.live_preview(db, user, org_id, template_uuid)


@router.put("/{template_uuid}/live")
def api_set_live(template_uuid: str, org_id: int, payload: TemplateLiveUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Switch the live version (active assignments move to it), or make the plan inactive with no version."""
    return drafts.set_live(db, user, org_id, template_uuid, payload.version_uuid)


@router.post("/{template_uuid}/publish-to-library")
def api_publish_to_library(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Share the draft in the global library (the platform owner organization only)."""
    return library.publish_to_library(db, user, org_id, template_uuid)


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


@router.get("/{template_uuid}/learners")
def api_template_learners(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Who may start this plan in this organization, and the badge it earns here."""
    return template_learners.template_learners(db, user, org_id, template_uuid)


@router.put("/{template_uuid}/learners")
def api_set_template_learners(template_uuid: str, org_id: int, payload: TemplateLearnerAccessUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Who may start this plan in this organization: open, by request, or invited learners only."""
    return template_learners.set_template_access(db, user, org_id, template_uuid, payload)
