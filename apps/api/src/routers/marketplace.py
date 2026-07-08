from fastapi import APIRouter, Depends, Query, Request

from src.core.events.database import get_db_session
from src.db.learning import (
    BadgeIssuerAuthorizationRead,
    IssuerAuthorizationInvite,
    IssuerAuthorizationRequest,
    IssuerAuthorizationUpdate,
    IssuerLearnerLinkCreate,
)
from src.security.auth import get_current_user
from src.services import learning_marketplace as marketplace_service


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


@router.get("/authorizations")
async def api_list_authorizations(
    request: Request,
    org_id: int = Query(...),
    perspective: str = Query("issuer"),
    badge_uuid: str | None = Query(None),
    status: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[BadgeIssuerAuthorizationRead]:
    return await marketplace_service.list_authorizations(
        request, org_id, perspective, current_user, db_session, badge_uuid=badge_uuid, status_filter=status
    )


@router.post("/authorizations")
async def api_request_authorization(
    request: Request,
    payload: IssuerAuthorizationRequest,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.request_authorization(request, payload, current_user, db_session)


@router.post("/authorizations/invite")
async def api_invite_issuer(
    request: Request,
    payload: IssuerAuthorizationInvite,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.invite_issuer(request, payload, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/approve")
async def api_approve_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.decide_authorization(request, authorization_uuid, True, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/reject")
async def api_reject_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.decide_authorization(request, authorization_uuid, False, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/accept")
async def api_accept_invite(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.accept_invite(request, authorization_uuid, current_user, db_session)


@router.post("/authorizations/{authorization_uuid}/revoke")
async def api_revoke_authorization(
    request: Request,
    authorization_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
    return await marketplace_service.revoke_authorization(request, authorization_uuid, current_user, db_session)


@router.put("/authorizations/{authorization_uuid}")
async def api_update_authorization(
    request: Request,
    authorization_uuid: str,
    payload: IssuerAuthorizationUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeIssuerAuthorizationRead:
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
