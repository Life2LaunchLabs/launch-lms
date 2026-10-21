"""
Requests for a tier upgrade, a partner program or an on-request feature.

Org admins submit requests; superadmins (or master org) review them.
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest, PlanRequestCreate, PlanRequestRead
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.security.access.catalog import FEATURES, PARTNER_PROGRAMS, TIERS
from src.security.rbac.constants import ADMIN_ROLE_ID

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
    Submit a tier upgrade, partner application or feature request for an organization.
    Only org admins can submit requests.
    """
    org = _get_org_by_slug(org_slug, db_session)
    _require_org_admin(org, current_user, db_session)

    # Validate the requested value
    valid = {
        "tier_upgrade": TIERS[1:],
        "partner_application": PARTNER_PROGRAMS,
        "feature_request": [key for key, spec in FEATURES.items() if spec.on_request and not spec.off],
    }
    if body.requested_value not in valid[body.request_type]:
        raise HTTPException(status_code=400, detail=f"Unknown {body.request_type.replace('_', ' ')}: {body.requested_value}")
    if db_session.exec(select(PlanRequest).where(
        PlanRequest.org_id == org.id,
        PlanRequest.request_type == body.request_type,
        PlanRequest.requested_value == body.requested_value,
        PlanRequest.status == "pending",
    )).first():
        raise HTTPException(status_code=409, detail="This request is already waiting for review")

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


@router.post("/orgs/{org_slug}/trial")
async def start_trial(
    org_slug: str,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Start the organization's one Full trial. Only org admins can; returns the org's access."""
    from src.services.orgs import trial

    org = _get_org_by_slug(org_slug, db_session)
    _require_org_admin(org, current_user, db_session)
    return trial.start(db_session, int(org.id))  # type: ignore[arg-type]


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
