"""Who issues a badge to a learner, and how a learner joins that issuer.

Creating a badge and issuing it are separate roles. Every issuer, the creator
included, holds an approved BadgeIssuerAuthorization with a learner access mode:

- ``open``: any learner starts immediately.
- ``request``: any learner may ask; the issuer accepts or declines.
- ``invite``: only learners the issuer has linked.

The creator issues its own badge as ``open`` until it records its own
authorization (``not issuing`` is stored as a revoked self-authorization), so
existing badges keep working without a data migration.
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
from src.db.organizations import Organization
from src.services.learning_issuer_links import ensure_learner_membership

LearnerAccess = Literal["open", "request", "invite"]
LEARNER_ACCESS: tuple[str, ...] = ("open", "request", "invite")


class IssuerAccessUpdate(BaseModel):
    open_to_all: bool | None = None
    learner_access: LearnerAccess | None = None


class BadgeIssuingSettingsUpdate(BaseModel):
    # "none" means the creator does not issue this badge itself.
    creator_access: Literal["open", "request", "invite", "none"] | None = None
    default_issuer_org_id: int | None = None
    clear_default_issuer: bool = False


class BadgeIssuerAuthorizationAccessRead(BadgeIssuerAuthorizationRead):
    learner_access: str = "invite"


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


def creator_access(db_session: Session, badge: LearningBadge) -> str:
    """The creator's own learner access, or "none" when it does not issue the badge."""
    own = creator_authorization(db_session, badge)
    if own is None:
        return "open"
    if own.status != BadgeIssuerAuthorizationStatus.APPROVED:
        return "none"
    return learner_access(own)


def active_issuers(db_session: Session, badge: LearningBadge) -> list[tuple[int, str, BadgeIssuerAuthorization | None]]:
    """(org id, learner access, authorization) for every issuer, creator first."""
    issuers: list[tuple[int, str, BadgeIssuerAuthorization | None]] = []
    own_access = creator_access(db_session, badge)
    if own_access != "none":
        issuers.append((badge.org_id, own_access, creator_authorization(db_session, badge)))
    for authorization in db_session.exec(select(BadgeIssuerAuthorization).where(
        BadgeIssuerAuthorization.badge_id == badge.id,
        BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        BadgeIssuerAuthorization.issuer_org_id != badge.org_id,
    ).order_by(BadgeIssuerAuthorization.id)).all():
        issuers.append((authorization.issuer_org_id, learner_access(authorization), authorization))
    return issuers


def default_issuer_org_id(badge: LearningBadge) -> int | None:
    value = (badge.badge_metadata or {}).get("default_issuer_org_id")
    return int(value) if isinstance(value, int) else None


def _org_summary(org: Organization) -> dict:
    return {"id": org.id, "org_uuid": org.org_uuid, "slug": org.slug, "name": org.name, "logo_image": org.logo_image}


def issuer_options(db_session: Session, badge: LearningBadge, user_id: int | None, program_org_ids: set[int]) -> dict:
    """The issuers this learner can see, which one is preselected, and which can start now."""
    issuers = active_issuers(db_session, badge)
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
) -> BadgeIssuerLearnerLink | None:
    """Allow starting under an issuer the learner may use, joining an open issuer on the way."""
    match = next(((access, authorization) for org_id, access, authorization in active_issuers(db_session, badge) if org_id == issuing_org_id), None)
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization only issues this badge to invited learners")
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
    if data.creator_access is not None:
        own = creator_authorization(db_session, badge)
        if own is None:
            own = BadgeIssuerAuthorization(
                authorization_uuid=f"issuer_auth_{uuid4()}", badge_id=badge.id or 0, creator_org_id=badge.org_id,
                issuer_org_id=badge.org_id, requested_by_user_id=admin_user_id, creation_date=now,
            )
        if data.creator_access == "none":
            own.status = BadgeIssuerAuthorizationStatus.REVOKED
        else:
            own.status = BadgeIssuerAuthorizationStatus.APPROVED
            set_learner_access(own, data.creator_access)
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
    issuers = []
    for org_id, access, _ in active_issuers(db_session, badge):
        org = db_session.get(Organization, org_id)
        if org:
            issuers.append({"org": _org_summary(org), "is_creator": org_id == badge.org_id, "access": access})
    return {
        "creator_access": creator_access(db_session, badge),
        "default_issuer_org_id": default_issuer_org_id(badge),
        "issuers": issuers,
    }
