"""Goal templates, for organization admins and the connector."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.goals import GoalAssignmentCreate, TemplateCreate, TemplatePublish, TemplateSave, TemplateStatus
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import assignments, templates
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


@router.get("/{template_uuid}")
def api_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.get_template(db, user, org_id, template_uuid)


@router.put("/{template_uuid}")
def api_save_template(template_uuid: str, org_id: int, payload: TemplateSave, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.save_template(db, user, org_id, template_uuid, payload.document, payload.etag)


@router.post("/{template_uuid}/publish")
def api_publish_template(template_uuid: str, org_id: int, payload: TemplatePublish, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return templates.publish(db, user, org_id, template_uuid, payload.note)


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
def api_assign_template(template_uuid: str, org_id: int, payload: GoalAssignmentCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return assignments.assign(db, user, org_id, template_uuid, payload)
