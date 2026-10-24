"""Learners' Discover: plans organizations offer to learners, a plan's public page, and joining."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.plan_joining import PlanJoin
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_authenticated_user, get_current_user
from src.services import discover_featured
from src.db.discover import DiscoverSettings
from src.services.goals import plan_joining

router = APIRouter()


@router.get("/discover")
def api_discover(org_id: int | None = None, site_org_id: int | None = None, db: Session = Depends(get_db_session),
                 current_user: PublicUser | AnonymousUser = Depends(get_current_user)):
    """The learner's Discover feed: featured plans, plans in progress, collections and every plan offered."""
    return plan_joining.discover(db, current_user, org_id, site_org_id)


@router.get("/discover/settings")
def api_read_discover_settings(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    return discover_featured.read_settings(db, current_user, org_id)


@router.put("/discover/settings")
def api_save_discover_settings(payload: DiscoverSettings, org_id: int, db: Session = Depends(get_db_session),
                               current_user: PublicUser = Depends(get_authenticated_user)):
    return discover_featured.save_settings(db, current_user, org_id, payload)


@router.get("/plans/{template_uuid}")
def api_plan_page(template_uuid: str, org_id: int | None = None, db: Session = Depends(get_db_session),
                  current_user: PublicUser | AnonymousUser = Depends(get_current_user)):
    """A plan's public page (also its badge's criteria page): its steps, its badge and who offers it."""
    return plan_joining.plan_page(db, current_user, template_uuid, org_id)


@router.post("/plans/{template_uuid}/join")
def api_join(template_uuid: str, payload: PlanJoin, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    """Start an open plan, or ask to join one offered by request."""
    return plan_joining.join(db, current_user, template_uuid, payload)


@router.delete("/plans/{template_uuid}/request")
def api_cancel(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    return plan_joining.cancel(db, current_user, template_uuid, org_id)


@router.get("/requests")
def api_requests(org_id: int, status: str = "requested", db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    """Learners asking to join the organization's plans."""
    return plan_joining.list_requests(db, current_user, org_id, status)


@router.post("/requests/{request_uuid}/accept")
def api_accept(request_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    return plan_joining.decide(db, current_user, request_uuid, True)


@router.post("/requests/{request_uuid}/reject")
def api_reject(request_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)):
    return plan_joining.decide(db, current_user, request_uuid, False)
