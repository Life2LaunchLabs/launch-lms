"""
Plan upgrade and package add-on request endpoints.

Org admins submit requests; superadmins (or master org) review them.
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest, PlanRequestCreate, PlanRequestRead
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.security.features_utils.packs import AVAILABLE_PACKAGES, is_valid_package
from src.security.features_utils.plans import PLAN_HIERARCHY, plan_meets_requirement
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.db.user_organizations import UserOrganization

router = APIRouter()


def _get_org_by_slug(org_slug: str, db_session: Session) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.slug == org_slug)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _require_org_admin(org: Organization, user: PublicUser, db_session: Session) -> None:
    if isinstance(user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    from src.security.superadmin import is_user_superadmin
    if is_user_superadmin(user.id, db_session):
        return
    membership = db_session.exec(
        select(UserOrganization)
        .where(UserOrganization.user_id == user.id)
        .where(UserOrganization.org_id == org.id)
        .where(UserOrganization.role_id == ADMIN_ROLE_ID)
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Organization admin access required")


@router.post("/orgs/{org_slug}/plan-requests", response_model=PlanRequestRead)
async def submit_plan_request(
    org_slug: str,
    body: PlanRequestCreate,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """
    Submit a plan upgrade or package add-on request for an organization.
    Only org admins can submit requests.
    """
    org = _get_org_by_slug(org_slug, db_session)
    _require_org_admin(org, current_user, db_session)

    # Validate the requested value
    if body.request_type == "plan_upgrade":
        if body.requested_value not in PLAN_HIERARCHY:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {body.requested_value}")
    elif body.request_type == "package_add":
        if not is_valid_package(body.requested_value):
            raise HTTPException(status_code=400, detail=f"Unknown package: {body.requested_value}")
    else:
        raise HTTPException(status_code=400, detail="Invalid request_type")

    now = datetime.now(timezone.utc).isoformat()
    plan_request = PlanRequest(
        org_id=org.id,
        request_uuid=str(uuid4()),
        request_type=body.request_type,
        requested_value=body.requested_value,
        message=body.message,
        status="pending",
        creation_date=now,
        update_date=now,
    )
    db_session.add(plan_request)
    db_session.commit()
    db_session.refresh(plan_request)
    return plan_request


@router.get("/orgs/{org_slug}/plan-requests", response_model=list[PlanRequestRead])
async def list_org_plan_requests(
    org_slug: str,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """List plan requests for an organization (admins only)."""
    org = _get_org_by_slug(org_slug, db_session)
    _require_org_admin(org, current_user, db_session)

    requests = db_session.exec(
        select(PlanRequest)
        .where(PlanRequest.org_id == org.id)
        .order_by(PlanRequest.creation_date.desc())
    ).all()
    return requests
