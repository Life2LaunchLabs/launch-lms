"""Plan collections, for organization admins (writes) and staff (reads)."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.plan_collections import PlanCollectionCreate, PlanCollectionPlans, PlanCollectionUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import collections

router = APIRouter()


@router.get("")
def api_collections(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The organization's collections, most recently opened first, with the categories to pick from."""
    return collections.list_collections(db, user, org_id)


@router.post("")
def api_create_collection(org_id: int, payload: PlanCollectionCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.create_collection(db, user, org_id, payload)


@router.get("/{collection_uuid}")
def api_collection(collection_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.get_collection(db, user, org_id, collection_uuid)


@router.patch("/{collection_uuid}")
def api_update_collection(collection_uuid: str, org_id: int, payload: PlanCollectionUpdate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.update_collection(db, user, org_id, collection_uuid, payload)


@router.delete("/{collection_uuid}")
def api_delete_collection(collection_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Remove the collection; its plans stay."""
    return collections.delete_collection(db, user, org_id, collection_uuid)


@router.post("/{collection_uuid}/plans")
def api_add_plans(collection_uuid: str, org_id: int, payload: PlanCollectionPlans, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.add_plans(db, user, org_id, collection_uuid, payload.template_uuids)


@router.delete("/{collection_uuid}/plans/{template_uuid}")
def api_remove_plan(collection_uuid: str, template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.remove_plan(db, user, org_id, collection_uuid, template_uuid)


@router.post("/{collection_uuid}/opened")
def api_collection_opened(collection_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return collections.opened(db, user, org_id, collection_uuid)
