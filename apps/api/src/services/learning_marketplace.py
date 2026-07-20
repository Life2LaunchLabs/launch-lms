"""
Badge marketplace: cross-org issuing authorizations.

Creator orgs list badges in the marketplace and control which issuer orgs are
authorized to deliver/grade/confer them. Issuer orgs browse the marketplace,
request authorization, and manage which learners they support.
"""
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationRead,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    IssuerAuthorizationInvite,
    IssuerAuthorizationRequest,
    IssuerAuthorizationUpdate,
    IssuerLearnerLinkCreate,
    LearningBadge,
    LearningBadgeRead,
    LearningBadgeStatus,
)
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.plan_requests import PlanRequest
from src.db.users import AnonymousUser, PublicUser, User
from src.security.features_utils.resolve import resolve_feature
from src.security.superadmin import is_user_superadmin
from src.services.learning import (
    _clean_uuid,
    _get_badge,
    _get_org,
    _now,
    _require_org_admin,
    _require_user,
)


def _org_summary(org: Organization) -> dict:
    return {
        "id": org.id,
        "org_uuid": org.org_uuid,
        "slug": org.slug,
        "name": org.name,
        "logo_image": org.logo_image,
    }


def _badge_summary(badge: LearningBadge) -> dict:
    return {
        "id": badge.id,
        "badge_uuid": badge.badge_uuid,
        "name": badge.name,
        "description": badge.description,
        "thumbnail_image": badge.thumbnail_image,
        "org_id": badge.org_id,
        "status": badge.status,
        "marketplace_listed": badge.marketplace_listed,
    }


def require_org_feature(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    org_id: int,
    feature: str,
    label: str,
) -> None:
    """Require an org-level feature (plan/package resolved); superadmins bypass."""
    if isinstance(current_user, PublicUser) and is_user_superadmin(current_user.id, db_session):
        return
    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    config = org_config.config if org_config and org_config.config else {}
    resolved = resolve_feature(feature, config, org_id)
    if not resolved.get("enabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{label} is not enabled for this organization. Add the required package to your plan.",
        )


def _org_feature_enabled(db_session: Session, org_id: int, feature: str) -> bool:
    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    config = org_config.config if org_config and org_config.config else {}
    return bool(resolve_feature(feature, config, org_id).get("enabled"))


def _has_pending_issuing_package_request(db_session: Session, org_id: int) -> bool:
    return db_session.exec(
        select(PlanRequest).where(
            PlanRequest.org_id == org_id,
            PlanRequest.request_type == "package_add",
            PlanRequest.requested_value == "badge_issuing",
            PlanRequest.status == "pending",
        )
    ).first() is not None


def transition_queued_authorizations(
    db_session: Session,
    org_id: int,
    *,
    package_denied: bool = False,
) -> int:
    """Advance or close queued requests after an entitlement decision."""
    queued = db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.issuer_org_id == org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.QUEUED,
        )
    ).all()
    if not queued:
        return 0

    if _org_feature_enabled(db_session, org_id, "badge_issuing"):
        next_status = BadgeIssuerAuthorizationStatus.REQUESTED
    elif package_denied:
        next_status = BadgeIssuerAuthorizationStatus.PACKAGE_DENIED
    else:
        return 0

    now = _now()
    for authorization in queued:
        authorization.status = next_status
        authorization.update_date = now
        db_session.add(authorization)
    return len(queued)


def _get_authorization(db_session: Session, authorization_uuid: str) -> BadgeIssuerAuthorization:
    authorization = db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.authorization_uuid == _clean_uuid(authorization_uuid, "issuer_auth_")
        )
    ).first()
    if not authorization:
        raise HTTPException(status_code=404, detail="Issuer authorization not found")
    return authorization


def get_active_authorization(db_session: Session, badge_id: int, issuer_org_id: int) -> BadgeIssuerAuthorization | None:
    return db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge_id,
            BadgeIssuerAuthorization.issuer_org_id == issuer_org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )
    ).first()


def _serialize_authorization(db_session: Session, authorization: BadgeIssuerAuthorization) -> BadgeIssuerAuthorizationRead:
    badge = db_session.get(LearningBadge, authorization.badge_id)
    creator_org = db_session.get(Organization, authorization.creator_org_id)
    issuer_org = db_session.get(Organization, authorization.issuer_org_id)
    return BadgeIssuerAuthorizationRead(
        **authorization.model_dump(),
        badge=_badge_summary(badge) if badge else None,
        creator_org=_org_summary(creator_org) if creator_org else None,
        issuer_org=_org_summary(issuer_org) if issuer_org else None,
    )


async def browse_marketplace_badges(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    issuer_org_id: int | None = None,
    query: str | None = None,
) -> list[dict]:
    """List badges published to the marketplace across all orgs.

    When issuer_org_id is given (requires admin of that org), each badge includes
    that org's authorization status so the UI can show request/track state.
    """
    statement = select(LearningBadge).where(
        LearningBadge.marketplace_listed == True,  # noqa: E712
        LearningBadge.status == LearningBadgeStatus.PUBLISHED,
        LearningBadge.public == True,  # noqa: E712
        LearningBadge.deleted_at.is_(None),
    )
    badges = db_session.exec(statement).all()
    if query:
        needle = query.strip().lower()
        badges = [b for b in badges if needle in (b.name or "").lower() or needle in (b.description or "").lower()]

    authorizations_by_badge_id: dict[int, BadgeIssuerAuthorization] = {}
    issuing_access: str | None = None
    if issuer_org_id is not None:
        _require_org_admin(db_session, current_user, issuer_org_id)
        if (
            isinstance(current_user, PublicUser)
            and is_user_superadmin(current_user.id, db_session)
        ) or _org_feature_enabled(db_session, issuer_org_id, "badge_issuing"):
            issuing_access = "active"
        elif _has_pending_issuing_package_request(db_session, issuer_org_id):
            issuing_access = "pending"
        else:
            issuing_access = "unavailable"
        badge_ids = [b.id or 0 for b in badges]
        if badge_ids:
            for authorization in db_session.exec(
                select(BadgeIssuerAuthorization).where(
                    BadgeIssuerAuthorization.issuer_org_id == issuer_org_id,
                    BadgeIssuerAuthorization.badge_id.in_(badge_ids),  # type: ignore
                )
            ).all():
                authorizations_by_badge_id[authorization.badge_id] = authorization

    org_ids = {b.org_id for b in badges}
    orgs = {
        org.id or 0: org
        for org in db_session.exec(select(Organization).where(Organization.id.in_(org_ids))).all()  # type: ignore
    } if org_ids else {}

    results = []
    for badge in badges:
        item: dict = {
            "badge": LearningBadgeRead(**badge.model_dump()).model_dump(),
            "creator_org": _org_summary(orgs[badge.org_id]) if badge.org_id in orgs else None,
        }
        if issuer_org_id is not None:
            authorization = authorizations_by_badge_id.get(badge.id or 0)
            item["authorization"] = _serialize_authorization(db_session, authorization).model_dump() if authorization else None
            item["is_own_badge"] = badge.org_id == issuer_org_id
            item["issuing_access"] = issuing_access
        results.append(item)
    return results


async def request_authorization(
    request: Request,
    data: IssuerAuthorizationRequest,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    user = _require_org_admin(db_session, current_user, data.issuer_org_id)
    issuing_enabled = (
        isinstance(current_user, PublicUser)
        and is_user_superadmin(current_user.id, db_session)
    ) or _org_feature_enabled(db_session, data.issuer_org_id, "badge_issuing")
    can_queue = not issuing_enabled and _has_pending_issuing_package_request(db_session, data.issuer_org_id)
    if not issuing_enabled and not can_queue:
        require_org_feature(db_session, current_user, data.issuer_org_id, "badge_issuing", "Badge Issuing")
    next_status = BadgeIssuerAuthorizationStatus.REQUESTED if issuing_enabled else BadgeIssuerAuthorizationStatus.QUEUED
    badge = _get_badge(db_session, data.badge_uuid)
    if badge.org_id == data.issuer_org_id:
        raise HTTPException(status_code=422, detail="Your organization already owns this badge")
    if not badge.marketplace_listed or badge.status != LearningBadgeStatus.PUBLISHED:
        raise HTTPException(status_code=422, detail="Badge is not available in the marketplace")
    _get_org(db_session, data.issuer_org_id)

    existing = db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge.id,
            BadgeIssuerAuthorization.issuer_org_id == data.issuer_org_id,
        )
    ).first()
    now = _now()
    if existing:
        if existing.status in (
            BadgeIssuerAuthorizationStatus.APPROVED,
            BadgeIssuerAuthorizationStatus.REQUESTED,
            BadgeIssuerAuthorizationStatus.QUEUED,
        ):
            return _serialize_authorization(db_session, existing)
        if existing.status == BadgeIssuerAuthorizationStatus.INVITED:
            # Requesting while invited is acceptance
            return await accept_invite(request, existing.authorization_uuid, current_user, db_session)
        existing.status = next_status
        existing.message = data.message or ""
        existing.requested_by_user_id = user.id
        existing.decided_by_user_id = None
        existing.decided_at = None
        existing.update_date = now
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)
        return _serialize_authorization(db_session, existing)

    authorization = BadgeIssuerAuthorization(
        authorization_uuid=f"issuer_auth_{uuid4()}",
        badge_id=badge.id or 0,
        creator_org_id=badge.org_id,
        issuer_org_id=data.issuer_org_id,
        status=next_status,
        message=data.message or "",
        requested_by_user_id=user.id,
        creation_date=now,
        update_date=now,
    )
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def invite_issuer(
    request: Request,
    data: IssuerAuthorizationInvite,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    badge = _get_badge(db_session, data.badge_uuid)
    user = _require_org_admin(db_session, current_user, badge.org_id)
    require_org_feature(db_session, current_user, badge.org_id, "marketplace_publishing", "Badge Publishing")
    issuer_org = db_session.exec(select(Organization).where(Organization.slug == data.issuer_org_slug)).first()
    if not issuer_org or issuer_org.id is None:
        raise HTTPException(status_code=404, detail="Issuer organization not found")
    if issuer_org.id == badge.org_id:
        raise HTTPException(status_code=422, detail="Cannot invite the badge's own organization")

    existing = db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge.id,
            BadgeIssuerAuthorization.issuer_org_id == issuer_org.id,
        )
    ).first()
    now = _now()
    if existing:
        if existing.status == BadgeIssuerAuthorizationStatus.REQUESTED:
            # Inviting an org that already requested is approval
            return await decide_authorization(request, existing.authorization_uuid, True, current_user, db_session)
        if existing.status in (BadgeIssuerAuthorizationStatus.APPROVED, BadgeIssuerAuthorizationStatus.INVITED):
            return _serialize_authorization(db_session, existing)
        existing.status = BadgeIssuerAuthorizationStatus.INVITED
        existing.message = data.message or ""
        existing.requested_by_user_id = user.id
        existing.decided_by_user_id = None
        existing.decided_at = None
        existing.update_date = now
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)
        return _serialize_authorization(db_session, existing)

    authorization = BadgeIssuerAuthorization(
        authorization_uuid=f"issuer_auth_{uuid4()}",
        badge_id=badge.id or 0,
        creator_org_id=badge.org_id,
        issuer_org_id=issuer_org.id,
        status=BadgeIssuerAuthorizationStatus.INVITED,
        message=data.message or "",
        requested_by_user_id=user.id,
        creation_date=now,
        update_date=now,
    )
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def decide_authorization(
    request: Request,
    authorization_uuid: str,
    approve: bool,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    authorization = _get_authorization(db_session, authorization_uuid)
    user = _require_org_admin(db_session, current_user, authorization.creator_org_id)
    if authorization.status != BadgeIssuerAuthorizationStatus.REQUESTED:
        raise HTTPException(status_code=422, detail=f"Authorization is not pending (status: {authorization.status})")
    authorization.status = BadgeIssuerAuthorizationStatus.APPROVED if approve else BadgeIssuerAuthorizationStatus.REJECTED
    authorization.decided_by_user_id = user.id
    authorization.decided_at = datetime.utcnow()
    authorization.update_date = _now()
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def accept_invite(
    request: Request,
    authorization_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    authorization = _get_authorization(db_session, authorization_uuid)
    user = _require_org_admin(db_session, current_user, authorization.issuer_org_id)
    require_org_feature(db_session, current_user, authorization.issuer_org_id, "badge_issuing", "Badge Issuing")
    if authorization.status != BadgeIssuerAuthorizationStatus.INVITED:
        raise HTTPException(status_code=422, detail=f"Authorization is not an open invite (status: {authorization.status})")
    authorization.status = BadgeIssuerAuthorizationStatus.APPROVED
    authorization.decided_by_user_id = user.id
    authorization.decided_at = datetime.utcnow()
    authorization.update_date = _now()
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def revoke_authorization(
    request: Request,
    authorization_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    authorization = _get_authorization(db_session, authorization_uuid)
    # Either side can end the relationship
    user = _require_user(current_user)
    try:
        user = _require_org_admin(db_session, current_user, authorization.creator_org_id)
    except HTTPException:
        user = _require_org_admin(db_session, current_user, authorization.issuer_org_id)
    if authorization.status == BadgeIssuerAuthorizationStatus.REVOKED:
        return _serialize_authorization(db_session, authorization)
    authorization.status = BadgeIssuerAuthorizationStatus.REVOKED
    authorization.decided_by_user_id = user.id
    authorization.decided_at = datetime.utcnow()
    authorization.update_date = _now()
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def update_authorization(
    request: Request,
    authorization_uuid: str,
    data: IssuerAuthorizationUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> BadgeIssuerAuthorizationRead:
    authorization = _get_authorization(db_session, authorization_uuid)
    _require_org_admin(db_session, current_user, authorization.issuer_org_id)
    if data.open_to_all is not None:
        authorization.open_to_all = data.open_to_all
    authorization.update_date = _now()
    db_session.add(authorization)
    db_session.commit()
    db_session.refresh(authorization)
    return _serialize_authorization(db_session, authorization)


async def list_authorizations(
    request: Request,
    org_id: int,
    perspective: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    badge_uuid: str | None = None,
    status_filter: str | None = None,
) -> list[BadgeIssuerAuthorizationRead]:
    _require_org_admin(db_session, current_user, org_id)
    statement = select(BadgeIssuerAuthorization)
    if perspective == "creator":
        statement = statement.where(
            BadgeIssuerAuthorization.creator_org_id == org_id,
            BadgeIssuerAuthorization.status.notin_([
                BadgeIssuerAuthorizationStatus.QUEUED,
                BadgeIssuerAuthorizationStatus.PACKAGE_DENIED,
            ]),
        )
    elif perspective == "issuer":
        statement = statement.where(BadgeIssuerAuthorization.issuer_org_id == org_id)
    else:
        raise HTTPException(status_code=400, detail="perspective must be 'creator' or 'issuer'")
    if badge_uuid:
        badge = _get_badge(db_session, badge_uuid)
        statement = statement.where(BadgeIssuerAuthorization.badge_id == badge.id)
    if status_filter and status_filter != "all":
        statement = statement.where(BadgeIssuerAuthorization.status == status_filter)
    authorizations = db_session.exec(statement).all()
    return [_serialize_authorization(db_session, authorization) for authorization in authorizations]


async def list_eligible_issuers(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[dict]:
    """Orgs the current user can select as issuer when starting this badge.

    The creator org is always eligible (default behavior). Other orgs must hold an
    approved authorization and either be open to all learners or have marked this
    specific user as supported.
    """
    badge = _get_badge(db_session, badge_uuid)
    creator_org = _get_org(db_session, badge.org_id)
    results = [{
        "org": _org_summary(creator_org),
        "is_creator": True,
        "open_to_all": True,
        "via_link": False,
    }]

    authorizations = db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge.id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )
    ).all()
    if not authorizations:
        return results

    user_id = current_user.id if isinstance(current_user, PublicUser) else None
    linked_authorization_ids: set[int] = set()
    if user_id is not None:
        authorization_ids = [a.id or 0 for a in authorizations]
        linked_authorization_ids = {
            link.authorization_id
            for link in db_session.exec(
                select(BadgeIssuerLearnerLink).where(
                    BadgeIssuerLearnerLink.user_id == user_id,
                    BadgeIssuerLearnerLink.authorization_id.in_(authorization_ids),  # type: ignore
                )
            ).all()
        }

    for authorization in authorizations:
        via_link = (authorization.id or 0) in linked_authorization_ids
        if not authorization.open_to_all and not via_link:
            continue
        issuer_org = db_session.get(Organization, authorization.issuer_org_id)
        if not issuer_org:
            continue
        results.append({
            "org": _org_summary(issuer_org),
            "is_creator": False,
            "open_to_all": authorization.open_to_all,
            "via_link": via_link,
        })
    return results


async def create_learner_link(
    request: Request,
    data: IssuerLearnerLinkCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    admin = _require_org_admin(db_session, current_user, data.issuer_org_id)
    badge = _get_badge(db_session, data.badge_uuid)
    authorization = get_active_authorization(db_session, badge.id or 0, data.issuer_org_id)
    if not authorization:
        raise HTTPException(status_code=422, detail="Your organization is not authorized to issue this badge")
    user = db_session.get(User, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db_session.exec(
        select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.authorization_id == authorization.id,
            BadgeIssuerLearnerLink.user_id == user.id,
        )
    ).first()
    if existing:
        return _serialize_learner_link(db_session, existing)

    now = _now()
    link = BadgeIssuerLearnerLink(
        link_uuid=f"issuer_link_{uuid4()}",
        authorization_id=authorization.id or 0,
        badge_id=badge.id or 0,
        issuer_org_id=data.issuer_org_id,
        user_id=user.id or 0,
        created_by_user_id=admin.id,
        note=data.note or "",
        creation_date=now,
        update_date=now,
    )
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return _serialize_learner_link(db_session, link)


def _serialize_learner_link(db_session: Session, link: BadgeIssuerLearnerLink) -> dict:
    user = db_session.get(User, link.user_id)
    badge = db_session.get(LearningBadge, link.badge_id)
    return {
        **link.model_dump(),
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        } if user else None,
        "badge": _badge_summary(badge) if badge else None,
    }


async def list_learner_links(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    badge_uuid: str | None = None,
) -> list[dict]:
    _require_org_admin(db_session, current_user, org_id)
    statement = select(BadgeIssuerLearnerLink).where(BadgeIssuerLearnerLink.issuer_org_id == org_id)
    if badge_uuid:
        badge = _get_badge(db_session, badge_uuid)
        statement = statement.where(BadgeIssuerLearnerLink.badge_id == badge.id)
    links = db_session.exec(statement).all()
    return [_serialize_learner_link(db_session, link) for link in links]


async def delete_learner_link(
    request: Request,
    link_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    link = db_session.exec(
        select(BadgeIssuerLearnerLink).where(BadgeIssuerLearnerLink.link_uuid == _clean_uuid(link_uuid, "issuer_link_"))
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Learner link not found")
    _require_org_admin(db_session, current_user, link.issuer_org_id)
    db_session.delete(link)
    db_session.commit()
    return {"detail": "Learner link removed"}


async def creator_issuance_metrics(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Per-badge, per-issuer issuance counts for a creator org."""
    from src.db.learning import LearningBadgeAward

    _require_org_admin(db_session, current_user, org_id)
    badges = db_session.exec(select(LearningBadge).where(
        LearningBadge.org_id == org_id,
        LearningBadge.deleted_at.is_(None),
    )).all()
    badge_by_id = {badge.id or 0: badge for badge in badges}
    if not badge_by_id:
        return {"badges": [], "total_awards": 0}

    awards = db_session.exec(
        select(LearningBadgeAward).where(LearningBadgeAward.badge_id.in_(list(badge_by_id.keys())))  # type: ignore
    ).all()

    issuer_org_ids = {award.issuing_org_id for award in awards if award.issuing_org_id is not None}
    issuer_orgs = {
        org.id or 0: org
        for org in db_session.exec(select(Organization).where(Organization.id.in_(issuer_org_ids))).all()  # type: ignore
    } if issuer_org_ids else {}
    creator_org = _get_org(db_session, org_id)

    per_badge: dict[int, dict] = {}
    for award in awards:
        badge_entry = per_badge.setdefault(award.badge_id, {"total": 0, "by_issuer": {}})
        badge_entry["total"] += 1
        effective_issuer_id = award.issuing_org_id if award.issuing_org_id is not None else org_id
        issuer_entry = badge_entry["by_issuer"].setdefault(effective_issuer_id, 0)
        badge_entry["by_issuer"][effective_issuer_id] = issuer_entry + 1

    def issuer_summary(issuer_id: int) -> dict:
        if issuer_id == org_id:
            return _org_summary(creator_org)
        org = issuer_orgs.get(issuer_id)
        return _org_summary(org) if org else {"id": issuer_id, "name": "Unknown organization"}

    return {
        "badges": [
            {
                "badge": _badge_summary(badge_by_id[badge_id]),
                "total_awards": entry["total"],
                "by_issuer": [
                    {"org": issuer_summary(issuer_id), "awards": count}
                    for issuer_id, count in sorted(entry["by_issuer"].items(), key=lambda kv: -kv[1])
                ],
            }
            for badge_id, entry in per_badge.items()
            if badge_id in badge_by_id
        ],
        "total_awards": len(awards),
    }
