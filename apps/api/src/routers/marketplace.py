from fastapi import APIRouter, Depends, Query, Request
from src.core.events.database import get_db_session
from src.db.learning import (
    IssuerAuthorizationInvite,
    IssuerAuthorizationRequest,
    IssuerLearnerLinkCreate,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
)
from src.db.template_marketplace import TemplateAuthorizationRequest, TemplateInvite, TemplateListingUpdate
from src.security.auth import get_current_user
from src.services import learning_marketplace as marketplace_service
from src.services.goals import plan_issuers, template_marketplace
from src.services.learning_issuers import BadgeIssuerAuthorizationAccessRead, BadgeIssuingSettingsUpdate, IssuerAccessUpdate

router = APIRouter()


@router.get("/badges")
async def api_browse_marketplace_badges(
    request: Request,
    issuer_org_id: int | None = Query(None),
    q: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return await marketplace_service.browse_marketplace_badges(request, current_user, db_session, issuer_org_id=issuer_org_id, query=q)


@router.get("/badges/{badge_uuid}/eligible-issuers")
async def api_list_eligible_issuers(
    request: Request,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return await marketplace_service.list_eligible_issuers(request, badge_uuid, current_user, db_session)


@router.get("/badges/{badge_uuid}/issuing")
async def api_get_issuing_settings(
    request: Request,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.get_issuing_settings(request, badge_uuid, current_user, db_session)


@router.put("/badges/{badge_uuid}/issuing")
async def api_update_issuing_settings(
    request: Request,
    badge_uuid: str,
    payload: BadgeIssuingSettingsUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.update_issuing_settings(request, badge_uuid, payload, current_user, db_session)


@router.get("/authorizations")
async def api_list_authorizations(
    request: Request,
    org_id: int = Query(...),
    perspective: str = Query("issuer"),
    badge_uuid: str | None = Query(None),
    status: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[BadgeIssuerAuthorizationAccessRead]:
    return await marketplace_service.list_authorizations(
        request, org_id, perspective, current_user, db_session, badge_uuid=badge_uuid, status_filter=status
    )


@router.post("/authorizations")
async def api_request_authorization(
    request: Request,
    payload: IssuerAuthorizationRequest,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.request_authorization(request, payload, current_user, db_session)


@router.post("/authorizations/invite")
async def api_invite_issuer(
    request: Request,
    payload: IssuerAuthorizationInvite,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.invite_issuer(request, payload, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/approve")
async def api_approve_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.decide_authorization(request, authorization_uuid, True, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/reject")
async def api_reject_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.decide_authorization(request, authorization_uuid, False, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/accept")
async def api_accept_invite(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.accept_invite(request, authorization_uuid, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/revoke")
async def api_revoke_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.revoke_authorization(request, authorization_uuid, current_user, db_session)


@router.put("/authorizations/{authorization_uuid}")
async def api_update_authorization(
    request: Request,
    authorization_uuid: str,
    payload: IssuerAccessUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationAccessRead:
    return await marketplace_service.update_authorization(request, authorization_uuid, payload, current_user, db_session)


@router.get("/learner-links")
async def api_list_learner_links(
    request: Request,
    org_id: int = Query(...),
    badge_uuid: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return await marketplace_service.list_learner_links(request, org_id, current_user, db_session, badge_uuid=badge_uuid)


@router.post("/learner-links")
async def api_create_learner_link(
    request: Request,
    payload: IssuerLearnerLinkCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.create_learner_link(request, payload, current_user, db_session)


@router.post("/learner-requests")
async def api_request_learner_support(
    request: Request,
    payload: IssuerLearnerRequestCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.request_learner_support(
        request, payload, current_user, db_session
    )


@router.post("/learner-requests/{link_uuid}/accept")
async def api_accept_learner_request(
    request: Request,
    link_uuid: str,
    payload: IssuerLearnerRequestDecision,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.decide_learner_request(
        request, link_uuid, True, payload, current_user, db_session
    )


@router.post("/learner-requests/{link_uuid}/reject")
async def api_reject_learner_request(
    request: Request,
    link_uuid: str,
    payload: IssuerLearnerRequestDecision,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.decide_learner_request(
        request, link_uuid, False, payload, current_user, db_session
    )


@router.delete("/learner-links/{link_uuid}")
async def api_delete_learner_link(
    request: Request,
    link_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.delete_learner_link(request, link_uuid, current_user, db_session)


@router.get("/metrics/creator")
async def api_creator_issuance_metrics(
    request: Request,
    org_id: int = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.creator_issuance_metrics(request, org_id, current_user, db_session)


@router.get("/metrics/issuer")
async def api_issuer_badge_metrics(
    request: Request,
    org_id: int = Query(...),
    badge_uuid: str = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await marketplace_service.issuer_badge_metrics(
        request, org_id, badge_uuid, current_user, db_session
    )


# Plan templates: listings, permission to use them, copies (see services/goals/template_marketplace) ------------

@router.get("/requests/summary")
def api_requests_summary(org_id: int = Query(...), current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    """Counts for the Marketplace tab: requests waiting on this organization and its own pending ones (badges + templates)."""
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
    """Ask to use a listed template (approved at once when its access is open)."""
    return template_marketplace.request_use(db_session, current_user, payload)


@router.post("/template-authorizations/{authorization_uuid}/approve")
def api_approve_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.decide(db_session, current_user, authorization_uuid, True)


@router.post("/template-authorizations/{authorization_uuid}/reject")
def api_reject_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.decide(db_session, current_user, authorization_uuid, False)


@router.post("/template-authorizations/{authorization_uuid}/revoke")
def api_revoke_template(authorization_uuid: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)) -> dict:
    return template_marketplace.revoke(db_session, current_user, authorization_uuid)
