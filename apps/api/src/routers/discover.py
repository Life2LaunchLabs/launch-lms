"""Discover: plans and collections other organizations share, and adding them."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import discover

router = APIRouter()


@router.get("")
def api_discover(org_id: int, q: str = "", db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The featured partner collection, shared collections, and listed plans with their categories."""
    return discover.discover(db, user, org_id, q)


@router.get("/added")
def api_added(org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Other organizations' plans shown in Plans: run as-is, or requested."""
    return discover.added_plans(db, user, org_id)


@router.get("/plans/{template_uuid}")
def api_plan(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return discover.plan_detail(db, user, org_id, template_uuid)


@router.post("/plans/{template_uuid}/add")
def api_add_plan(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Add the plan (copied if it's editable), or ask its creator."""
    return discover.add_plan(db, user, org_id, template_uuid)


@router.delete("/plans/{template_uuid}/request")
def api_cancel_request(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return discover.cancel_request(db, user, org_id, template_uuid)


@router.get("/collections/{collection_uuid}")
def api_collection(collection_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return discover.collection_detail(db, user, org_id, collection_uuid)


@router.post("/collections/{collection_uuid}/add")
def api_add_collection(collection_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Add every plan in the collection and a collection of your own that holds them."""
    return discover.add_collection(db, user, org_id, collection_uuid)
