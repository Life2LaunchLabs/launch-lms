"""Plan template versions: list, publish the draft, roll back."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import template_versions as service

router = APIRouter()


class TemplateVersionNote(BaseModel):
    note: str = ""


@router.get("/templates/{template_uuid}/versions")
def api_list_template_versions(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_versions(db, current_user, org_id, template_uuid)


@router.post("/templates/{template_uuid}/versions/publish")
def api_publish_template(template_uuid: str, org_id: int, payload: TemplateVersionNote, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    """Publish the template's draft as a new version; new plans are issued from it."""
    return service.publish(db, current_user, org_id, template_uuid, payload.note)


@router.post("/templates/{template_uuid}/versions/{number}/restore")
def api_restore_template_version(template_uuid: str, number: int, org_id: int, payload: TemplateVersionNote, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    """Roll back: publish an earlier version again. Plans already issued keep their version."""
    return service.restore(db, current_user, org_id, template_uuid, number, payload.note)
