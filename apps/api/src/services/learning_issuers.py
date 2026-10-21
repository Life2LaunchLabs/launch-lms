"""Who issues a badge to a learner, and how a learner joins that issuer.

Creating a badge and issuing it are separate roles. The creator issues its own
badge (until it records that it doesn't: a revoked self-authorization), and other
organizations issue it while approved on one of its plans (``goals/plan_issuers``);
their BadgeIssuerAuthorization follows those plan permissions.

Which learners an issuer takes is set per plan it runs (``goals/plan_access``):

- ``open``: any learner starts immediately.
- ``request``: any learner may ask; the issuer accepts or declines.
- ``invite``: only learners the issuer has linked.

An issuer's access for a badge is its most open access across the badge's routes
it runs; starting a particular route uses that route's own access. The
authorization's ``learner_access`` column is kept readable, and setting it writes
through to the plans.
"""

from datetime import datetime
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationRead,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningBadge,
)
from src.db.badge_routes import BadgeRoute
from src.db.organizations import Organization
from src.services.goals import plan_access, plan_issuers
from src.services.learning_issuer_links import ensure_learner_membership

LearnerAccess = Literal["open", "request", "invite"]
LEARNER_ACCESS: tuple[str, ...] = ("open", "request", "invite")


class IssuerAccessUpdate(BaseModel):
    open_to_all: bool | None = None
    learner_access: LearnerAccess | None = None


class BadgeIssuingSettingsUpdate(BaseModel):
    # "none" means the creator does not issue this badge itself.
    creator_access: Literal["open", "request", "invite", "none"] | None = None
    # Whether the creator issues its badge at all, leaving who may start each plan as it is.
    creator_issues: bool | None = None
    default_issuer_org_id: int | None = None
    clear_default_issuer: bool = False


class BadgeIssuerAuthorizationAccessRead(BadgeIssuerAuthorizationRead):
    learner_access: str = "invite"
    # The badge's plans this issuer runs, each with who may start it (where learner access is set).
    plans: list[dict] = []


def learner_access(authorization: BadgeIssuerAuthorization) -> str:
    if authorization.learner_access in LEARNER_ACCESS:
        return authorization.learner_access
    return "request" if authorization.open_to_all else "invite"


def set_learner_access(authorization: BadgeIssuerAuthorization, access: str) -> None:
    if access not in LEARNER_ACCESS:
        raise HTTPException(status_code=422, detail="Learner access must be open, request, or invite")
    authorization.learner_access = access
    authorization.open_to_all = access != "invite"


def _now() -> str:
    return str(datetime.now())


def creator_authorization(db_session: Session, badge: LearningBadge) -> BadgeIssuerAuthorization | None:
    return db_session.exec(select(BadgeIssuerAuthorization).where(
        BadgeIssuerAuthorization.badge_id == badge.id,
        BadgeIssuerAuthorization.issuer_org_id == badge.org_id,
    )).first()


def creator_issues(db_session: Session, badge: LearningBadge) -> bool:
    """The creator issues its own badge unless it recorded that it doesn't (a revoked self-authorization)."""
    own = creator_authorization(db_session, badge)
    return own is None or own.status == BadgeIssuerAuthorizationStatus.APPROVED


def creator_access(db_session: Session, badge: LearningBadge) -> str:
    """The creator's most open learner access across its plans for the badge, or "none" when it does not issue it."""
    if not creator_issues(db_session, badge):
        return "none"
    return _access(db_session, badge, int(badge.org_id), creator_authorization(db_session, badge))


def _access(db_session: Session, badge: LearningBadge, org_id: int, authorization: BadgeIssuerAuthorization | None,
            route: BadgeRoute | None = None, plans: bool | None = None) -> str:
    """The issuer's access from the plans it runs. A badge earned only through legacy program routes
    (no plan templates) keeps its badge-level setting, the creator open unless it recorded one."""
    if route is not None:
        plans = route.goal_template_id is not None
    elif plans is None:
        plans = plan_access.has_plans(db_session, badge)
    if plans:
        return plan_access.issuer_access(db_session, badge, org_id, route)
    if authorization is None:
        return "open" if int(org_id) == int(badge.org_id) else "invite"
    return learner_access(authorization)


def active_issuers(db_session: Session, badge: LearningBadge, route: BadgeRoute | None = None) -> list[tuple[int, str, BadgeIssuerAuthorization | None]]:
    """(org id, learner access, authorization) for every issuer, creator first.

    With ``route``: only the issuers running that route, each with its access for that plan."""
    from src.services.goals.badge_routes import offered

    issuers: list[tuple[int, str, BadgeIssuerAuthorization | None]] = []
    plans = plan_access.has_plans(db_session, badge)
    if creator_issues(db_session, badge):
        own = creator_authorization(db_session, badge)
        issuers.append((badge.org_id, _access(db_session, badge, int(badge.org_id), own, route, plans), own))
    offered_routes = offered(db_session, badge) if route is not None else None
    for authorization in db_session.exec(select(BadgeIssuerAuthorization).where(
        BadgeIssuerAuthorization.badge_id == badge.id,
        BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        BadgeIssuerAuthorization.issuer_org_id != badge.org_id,
    ).order_by(BadgeIssuerAuthorization.id)).all():
        if route is not None and not plan_access.runs_route(db_session, badge, route, authorization.issuer_org_id, offered_routes):
            continue
        # Permission to issue lives on the badge's plans; the record alone isn't enough.
        if plans and not plan_issuers.badge_issuer(db_session, badge, authorization.issuer_org_id):
            continue
        issuers.append((authorization.issuer_org_id, _access(db_session, badge, authorization.issuer_org_id, authorization, route, plans), authorization))
    return issuers


def issuer_access(db_session: Session, badge: LearningBadge, org_id: int) -> str:
    """An issuer's most open learner access across the badge's plans it runs."""
    found = db_session.exec(select(BadgeIssuerAuthorization).where(
        BadgeIssuerAuthorization.badge_id == badge.id, BadgeIssuerAuthorization.issuer_org_id == org_id,
    )).first()
    return _access(db_session, badge, org_id, found)


def ensure_authorization(db_session: Session, badge: LearningBadge, org_id: int) -> BadgeIssuerAuthorization | None:
    """The issuer's approved authorization; the creator's own is recorded the first time it is needed."""
    found = db_session.exec(select(BadgeIssuerAuthorization).where(
        BadgeIssuerAuthorization.badge_id == badge.id, BadgeIssuerAuthorization.issuer_org_id == org_id,
    )).first()
    if found is not None:
        return found if found.status == BadgeIssuerAuthorizationStatus.APPROVED else None
    if int(org_id) != int(badge.org_id):
        return None
    now = _now()
    own = BadgeIssuerAuthorization(
        authorization_uuid=f"issuer_auth_{uuid4()}", badge_id=badge.id or 0, creator_org_id=badge.org_id, issuer_org_id=badge.org_id,
        status=BadgeIssuerAuthorizationStatus.APPROVED, creation_date=now, update_date=now,
    )
    set_learner_access(own, creator_access(db_session, badge))
    db_session.add(own)
    db_session.flush()
    return own


def default_issuer_org_id(badge: LearningBadge) -> int | None:
    value = (badge.badge_metadata or {}).get("default_issuer_org_id")
    return int(value) if isinstance(value, int) else None


def _org_summary(org: Organization) -> dict:
    return {"id": org.id, "org_uuid": org.org_uuid, "slug": org.slug, "name": org.name, "logo_image": org.logo_image}


def issuer_options(db_session: Session, badge: LearningBadge, user_id: int | None, program_org_ids: set[int], route: BadgeRoute | None = None) -> dict:
    """The issuers this learner can see, which one is preselected, and which can start now (on ``route``'s plan, when given)."""
    issuers = active_issuers(db_session, badge, route)
    authorization_ids = [authorization.id for _, _, authorization in issuers if authorization and authorization.id]
    links = {
        link.authorization_id: link
        for link in db_session.exec(select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.user_id == user_id,
            BadgeIssuerLearnerLink.authorization_id.in_(authorization_ids),  # type: ignore
        )).all()
    } if user_id is not None and authorization_ids else {}
    options = []
    for org_id, access, authorization in issuers:
        link = links.get(authorization.id) if authorization else None
        accepted = org_id in program_org_ids or bool(link and link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED)
        if access == "invite" and not accepted and not link:
            continue
        org = db_session.get(Organization, org_id)
        if not org:
            continue
        options.append({
            "org": _org_summary(org),
            "is_creator": org_id == badge.org_id,
            "access": access,
            "open_to_all": access != "invite",
            "request_status": link.status if link else None,
            "request_uuid": link.link_uuid if link else None,
            "can_start": accepted or (access == "open" and (user_id is not None or org_id == badge.org_id)),
        })
    by_id = {option["org"]["id"]: option for option in options}
    preferred = default_issuer_org_id(badge)
    startable = [option["org"]["id"] for option in options if option["can_start"]]
    chosen = preferred if preferred in by_id and by_id[preferred]["can_start"] else (
        startable[0] if startable else preferred if preferred in by_id else options[0]["org"]["id"] if options else None
    )
    for option in options:
        option["is_default"] = option["org"]["id"] == chosen
    return {
        "issuers": options,
        "default_issuer_org_id": chosen,
        "startable_issuer_org_id": chosen if chosen in startable else None,
    }


def validate_issuer_start(
    db_session: Session,
    badge: LearningBadge,
    issuing_org_id: int,
    user_id: int | None,
    program_org_ids: set[int],
    route: BadgeRoute | None = None,
) -> BadgeIssuerLearnerLink | None:
    """Allow starting under an issuer the learner may use (on ``route``'s plan, when given), joining an open issuer on the way."""
    match = next(((access, authorization) for org_id, access, authorization in active_issuers(db_session, badge, route) if org_id == issuing_org_id), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization is not issuing this badge")
    access, authorization = match
    if issuing_org_id in program_org_ids:
        return None
    if user_id is None:
        if access == "open" and issuing_org_id == badge.org_id:
            return None
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sign in to start this badge with this organization")
    link = db_session.exec(select(BadgeIssuerLearnerLink).where(
        BadgeIssuerLearnerLink.authorization_id == authorization.id,
        BadgeIssuerLearnerLink.user_id == user_id,
    )).first() if authorization else None
    if link and link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED:
        return link
    if access == "invite":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization only lets invited learners start this plan")
    if access != "open":
        if link and link.status == BadgeIssuerLearnerLinkStatus.REQUESTED:
            detail = "Your request is waiting for this organization to accept it"
        else:
            detail = "Request to join this organization before starting this badge"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    if authorization is None:
        return None
    # Open issuers accept every learner: record the collaboration like an accepted request.
    now = _now()
    if not link:
        link = BadgeIssuerLearnerLink(
            link_uuid=f"issuer_link_{uuid4()}", authorization_id=authorization.id or 0, badge_id=badge.id or 0,
            issuer_org_id=issuing_org_id, user_id=user_id, requested_by_user_id=user_id, creation_date=now,
        )
    link.status = BadgeIssuerLearnerLinkStatus.ACCEPTED
    link.decided_at = datetime.utcnow()
    link.end_reason = None
    link.ended_at = None
    link.update_date = now
    db_session.add(link)
    if issuing_org_id != badge.org_id:
        ensure_learner_membership(db_session, link, now)
    db_session.commit()
    db_session.refresh(link)
    return link


def update_issuing_settings(db_session: Session, badge: LearningBadge, data: BadgeIssuingSettingsUpdate, admin_user_id: int) -> dict:
    """Creator-side issuing settings: its own learner access and the preselected issuer."""
    now = _now()
    if data.creator_access is not None or data.creator_issues is not None:
        own = creator_authorization(db_session, badge)
        if own is None:
            own = BadgeIssuerAuthorization(
                authorization_uuid=f"issuer_auth_{uuid4()}", badge_id=badge.id or 0, creator_org_id=badge.org_id,
                issuer_org_id=badge.org_id, requested_by_user_id=admin_user_id, creation_date=now,
            )
        if data.creator_access == "none" or data.creator_issues is False:
            own.status = BadgeIssuerAuthorizationStatus.REVOKED
        elif data.creator_access is None:
            # Issuing again keeps who may start each plan as the plans say.
            own.status = BadgeIssuerAuthorizationStatus.APPROVED
            set_learner_access(own, _access(db_session, badge, int(badge.org_id), own))
        else:
            own.status = BadgeIssuerAuthorizationStatus.APPROVED
            set_learner_access(own, data.creator_access)
            # Learner access lives on the plans: the badge-level choice sets every route the creator runs.
            plan_access.apply_to_badge(db_session, badge, int(badge.org_id), data.creator_access, admin_user_id)
        own.decided_by_user_id = admin_user_id
        own.decided_at = datetime.utcnow()
        own.update_date = now
        db_session.add(own)
    if data.clear_default_issuer or data.default_issuer_org_id is not None:
        metadata = dict(badge.badge_metadata or {})
        if data.clear_default_issuer:
            metadata.pop("default_issuer_org_id", None)
        else:
            if data.default_issuer_org_id not in {org_id for org_id, _, _ in active_issuers(db_session, badge)}:
                raise HTTPException(status_code=422, detail="Choose an organization that issues this badge")
            metadata["default_issuer_org_id"] = data.default_issuer_org_id
        badge.badge_metadata = metadata
        badge.update_date = now
        db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return issuing_settings(db_session, badge)


def issuing_settings(db_session: Session, badge: LearningBadge) -> dict:
    """Who issues the badge and how learners reach each issuer, read from the plans each one runs."""
    issuers = []
    for org_id, access, _ in active_issuers(db_session, badge):
        org = db_session.get(Organization, org_id)
        if org:
            issuers.append({"org": _org_summary(org), "is_creator": org_id == badge.org_id, "access": access,
                            "plans": plan_access.badge_plans(db_session, badge, org_id)})
    return {
        "creator_access": creator_access(db_session, badge),
        "creator_issues": creator_issues(db_session, badge),
        "creator_plans": plan_access.badge_plans(db_session, badge, int(badge.org_id)),
        "default_issuer_org_id": default_issuer_org_id(badge),
        "issuers": issuers,
    }
