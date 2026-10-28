"""Plan templates other organizations share: listings, permission to use them, copies (see services/goals/template_marketplace)."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from src.core.events.database import get_db_session
from src.db.template_marketplace import TemplateAuthorizationRequest, TemplateInvite, TemplateListingUpdate
from src.security.auth import get_current_user
from src.services.goals import plan_issuers, plan_resources, template_marketplace

router = APIRouter()


class ResourceFix(BaseModel):
    fix: str | None = None  # "swap", "remove", or None to undo
    replacement_uuid: str | None = None


@router.get("/requests/summary")
def api_requests_summary(org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Counts for the Marketplace tab: plan requests waiting on this organization and its own pending ones."""
    return template_marketplace.requests_summary(db_session, current_user, org_id)


@router.get("/templates")
def api_browse_templates(
    org_id: int = Query(...),
    q: str = Query(""),
    creator_org_id: int | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    """Templates listed in the marketplace, each with this organization's permission to use it."""
    return template_marketplace.browse(db_session, current_user, org_id, q, creator_org_id)


@router.get("/templates/{template_uuid}/listing")
def api_template_listing(template_uuid: str, org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.get_listing(db_session, current_user, org_id, template_uuid)


@router.put("/templates/{template_uuid}/listing")
def api_set_template_listing(
    template_uuid: str,
    payload: TemplateListingUpdate,
    org_id: int = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    """The creator lists a template: locked (run as-is) or open (copy and change), with open or request access."""
    return template_marketplace.set_listing(db_session, current_user, org_id, template_uuid, payload)


@router.put("/templates/{template_uuid}/listing/resources/{resource_uuid}")
def api_set_listing_resource(
    template_uuid: str,
    resource_uuid: str,
    payload: ResourceFix,
    org_id: int = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    """For other organizations only: swap a resource that isn't in the Library for one that is, or remove it."""
    return plan_resources.set_override(db_session, current_user, org_id, template_uuid, resource_uuid, payload.fix, payload.replacement_uuid)


@router.post("/templates/{template_uuid}/authorizations/invite")
def api_invite_to_template(template_uuid: str, payload: TemplateInvite, org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """The template's owner authorizes another organization (by slug) to run it, and so to issue the badges it earns."""
    return plan_issuers.invite(db_session, current_user, org_id, template_uuid, payload.issuer_org_slug)


@router.get("/templates/{template_uuid}/metrics")
def api_template_metrics(template_uuid: str, org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Quick usage counts for the owner's Publish tab: authorized orgs, assignments, learners, completions, badges earned."""
    return plan_issuers.template_metrics(db_session, current_user, org_id, template_uuid)


@router.post("/templates/{template_uuid}/copy")
def api_copy_marketplace_template(template_uuid: str, org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Copy an open template into a draft of this organization's own ("Based on <plan> by <org>")."""
    return template_marketplace.copy_template(db_session, current_user, org_id, template_uuid)


@router.get("/template-authorizations")
def api_template_authorizations(
    org_id: int = Query(...),
    perspective: str = Query("issuer"),
    status: str | None = Query(None),
    template_uuid: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return template_marketplace.list_authorizations(db_session, current_user, org_id, perspective, status, template_uuid)


@router.post("/template-authorizations")
def api_request_template(payload: TemplateAuthorizationRequest, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Ask to use a listed template, or to issue a marketplace badge through one of its plans (approved at once when open)."""
    return template_marketplace.request_use(db_session, current_user, payload)


@router.post("/template-authorizations/{authorization_uuid}/approve")
def api_approve_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.decide(db_session, current_user, authorization_uuid, True)


@router.post("/template-authorizations/{authorization_uuid}/reject")
def api_reject_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.decide(db_session, current_user, authorization_uuid, False)


@router.post("/template-authorizations/{authorization_uuid}/revoke")
def api_revoke_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Either side ends the permission: the owner revokes it, or the organization leaves the plan (and stops issuing its badges)."""
    return template_marketplace.revoke(db_session, current_user, authorization_uuid)
