"""Who issues a badge to a learner, and how a learner joins that issuer.

Creating a badge and issuing it are separate roles. The creator issues its own
badge, and other organizations issue it while approved on one of its plans
(``goals/plan_issuers.may_issue``, the one check).

Which learners an issuer takes is set per plan it runs (``goals/plan_access``):

- ``open``: any learner starts immediately.
- ``request``: any learner may ask; the issuer accepts or declines.
- ``invite``: only learners the issuer has linked.

An issuer's access for a badge is its most open access across the badge's routes
it runs; starting a particular route uses that route's own access. A learner's
link with an issuer (``BadgeIssuerLearnerLink``) is per badge, issuer and learner.
"""

from datetime import datetime

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from src.db.badge_routes import BadgeRoute
from src.db.learning import BadgeIssuerLearnerLink, BadgeIssuerLearnerLinkStatus, LearningBadge
from src.db.organizations import Organization
from src.services.goals import plan_access, plan_issuers
from src.services.learning_issuer_links import ensure_learner_membership, find_link, new_link


class BadgeIssuingSettingsUpdate(BaseModel):
    """The issuer learners see first on the badge (badge metadata, not a permission)."""

    default_issuer_org_id: int | None = None
    clear_default_issuer: bool = False


def _now() -> str:
    return str(datetime.now())


def active_issuers(db_session: Session, badge: LearningBadge, route: BadgeRoute | None = None) -> list[tuple[int, str]]:
    """(org id, learner access) for every organization that may issue the badge, creator first.

    With ``route``: only the issuers running that route, each with its access for that plan."""
    from src.services.goals.badge_routes import offered

    offered_routes = offered(db_session, badge) if route is not None else None
    issuers: list[tuple[int, str]] = []
    for org_id in [int(badge.org_id), *plan_issuers.issuer_org_ids(db_session, badge)]:
        if route is not None and not plan_access.runs_route(db_session, badge, route, org_id, offered_routes):
            continue
        issuers.append((org_id, plan_access.issuer_access(db_session, badge, org_id, route)))
    return issuers


def issuer_access(db_session: Session, badge: LearningBadge, org_id: int) -> str:
    """An issuer's most open learner access across the badge's plans it runs."""
    return plan_access.issuer_access(db_session, badge, org_id)


def default_issuer_org_id(badge: LearningBadge) -> int | None:
    value = (badge.badge_metadata or {}).get("default_issuer_org_id")
    return int(value) if isinstance(value, int) else None


def _org_summary(org: Organization) -> dict:
    return {"id": org.id, "org_uuid": org.org_uuid, "slug": org.slug, "name": org.name, "logo_image": org.logo_image}


def issuer_options(db_session: Session, badge: LearningBadge, user_id: int | None, route: BadgeRoute | None = None) -> dict:
    """The issuers this learner can see, which one is preselected, and which can start now (on ``route``'s plan, when given)."""
    options = []
    for org_id, access in active_issuers(db_session, badge, route):
        link = find_link(db_session, int(badge.id), org_id, user_id)  # type: ignore[arg-type]
        accepted = bool(link and link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED)
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
    route: BadgeRoute | None = None,
) -> BadgeIssuerLearnerLink | None:
    """Allow starting under an issuer the learner may use (on ``route``'s plan, when given), joining an open issuer on the way."""
    access = next((value for org_id, value in active_issuers(db_session, badge, route) if org_id == issuing_org_id), None)
    if access is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization is not issuing this badge")
    if user_id is None:
        if access == "open" and issuing_org_id == badge.org_id:
            return None
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sign in to start this badge with this organization")
    link = find_link(db_session, int(badge.id), issuing_org_id, user_id)  # type: ignore[arg-type]
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
    # Open issuers accept every learner: record the collaboration like an accepted request.
    now = _now()
    if not link:
        link = new_link(int(badge.id), issuing_org_id, user_id, now, requested_by_user_id=user_id)  # type: ignore[arg-type]
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
    """The creator picks which issuer learners see first (or lets it be chosen automatically)."""
    if data.clear_default_issuer or data.default_issuer_org_id is not None:
        metadata = dict(badge.badge_metadata or {})
        if data.clear_default_issuer:
            metadata.pop("default_issuer_org_id", None)
        else:
            if not plan_issuers.may_issue(db_session, badge, data.default_issuer_org_id):
                raise HTTPException(status_code=422, detail="Choose an organization that issues this badge")
            metadata["default_issuer_org_id"] = data.default_issuer_org_id
        badge.badge_metadata = metadata
        badge.update_date = _now()
        db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return issuing_settings(db_session, badge)


def issuing_settings(db_session: Session, badge: LearningBadge) -> dict:
    """Who issues the badge and how learners reach each issuer, read from the plans each one runs."""
    issuers = []
    for org_id, access in active_issuers(db_session, badge):
        org = db_session.get(Organization, org_id)
        if org:
            issuers.append({"org": _org_summary(org), "is_creator": org_id == badge.org_id, "access": access,
                            "plans": plan_access.badge_plans(db_session, badge, org_id)})
    return {
        "creator_access": issuer_access(db_session, badge, int(badge.org_id)),
        "creator_plans": plan_access.badge_plans(db_session, badge, int(badge.org_id)),
        "default_issuer_org_id": default_issuer_org_id(badge),
        "issuers": issuers,
    }
