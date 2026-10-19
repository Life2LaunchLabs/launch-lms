"""Requirement frameworks: create, edit, version, share through the library and assign to learners."""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.requirements import (
    RequirementAssignmentCreate,
    RequirementEnrollmentMigrate,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import requirements as requirement_service

router = APIRouter()


@router.get("")
def api_list_requirement_frameworks(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.list_frameworks(db, current_user, org_id)


@router.post("")
def api_create_requirement_framework(payload: RequirementFrameworkCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.create_framework(db, current_user, payload)


@router.get("/library")
def api_list_requirement_library(org_id: int, q: str = "", db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.list_framework_library(db, current_user, org_id, q)


@router.post("/library/{framework_uuid}/copy")
def api_copy_requirement_from_library(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.copy_framework_from_library(db, current_user, org_id, framework_uuid)


@router.get("/report")
def api_requirement_report(
    org_id: int, framework_uuid: str | None = None, version: int | None = None, usergroup_id: int | None = None,
    node_uuid: str | None = None, status: str | None = Query(default=None, pattern="^(satisfied|not_satisfied)$"),
    db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user),
):
    return requirement_service.report(db, current_user, org_id, framework_uuid, version, usergroup_id, node_uuid, status)


@router.get("/{framework_uuid}")
def api_get_requirement_framework(framework_uuid: str, org_id: int, version: int | None = None, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.get_framework(db, current_user, org_id, framework_uuid, version)


@router.patch("/{framework_uuid}")
def api_update_requirement_framework(framework_uuid: str, org_id: int, payload: RequirementFrameworkUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.update_framework(db, current_user, org_id, framework_uuid, payload)


@router.post("/{framework_uuid}/publish")
def api_publish_requirement_framework(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.publish_framework(db, current_user, org_id, framework_uuid)


@router.post("/{framework_uuid}/publish-to-library")
def api_publish_requirement_to_library(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.publish_framework_to_library(db, current_user, org_id, framework_uuid)


@router.post("/{framework_uuid}/assignments")
def api_assign_requirement_framework(framework_uuid: str, org_id: int, payload: RequirementAssignmentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.assign_framework(db, current_user, org_id, framework_uuid, payload)


@router.post("/{framework_uuid}/migrate-active")
def api_migrate_requirement_enrollments(framework_uuid: str, org_id: int, payload: RequirementEnrollmentMigrate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.migrate_enrollments(db, current_user, org_id, framework_uuid, payload)
