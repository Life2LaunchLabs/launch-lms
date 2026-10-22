"""
Badge marketplace: badges listed for other organizations to issue, through their plans.

Creator orgs list badges in the marketplace. An issuer org asks to run one of the badge's plans
(a ``GoalTemplateAuthorization`` request, ``goals/template_marketplace``); approval on a plan is
permission to issue the badge through it (``goals/plan_issuers.may_issue``). Issuers then manage
which learners they support (learner links and requests, per badge).
"""
from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    IssuerLearnerLinkCreate,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
    LearningBadge,
    LearningBadgeRead,
    LearningBadgeStatus,
)
from src.db.organizations import Organization
from src.db.goals import GoalAssignment, GoalTemplate
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.access.access import ensure_feature
from src.security.superadmin import is_user_superadmin
from src.services.learning_issuer_links import ensure_learner_membership, find_link, new_link, simulate_issuer_acceptance
from src.services import learning_issuers as issuers
from src.services.goals import plan_access, plan_issuers
from src.services.learning import (
    _clean_uuid,
    _get_badge,
    _get_org,
    _now,
    _require_org_admin,
    _require_org_staff,
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
) -> None:
    """Require an org access feature; superadmins bypass."""
    if isinstance(current_user, PublicUser) and is_user_superadmin(current_user.id, db_session):
        return
    ensure_feature(org_id, feature, db_session)


async def browse_marketplace_badges(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    issuer_org_id: int | None = None,
    query: str | None = None,
) -> list[dict]:
    """List badges published to the marketplace across all orgs.

    When issuer_org_id is given (staff of that org), each badge includes whether that org issues it
    and the badge's plans with that org's permission on each, so the UI can ask for one.
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
    issued: set[int] = set()
    if issuer_org_id is not None:
        _require_org_staff(db_session, current_user, issuer_org_id)  # staff browse; requesting stays admin only
        issued = plan_issuers.issued_badge_ids(db_session, [issuer_org_id])

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
            item["is_own_badge"] = badge.org_id == issuer_org_id
            item["issuing"] = item["is_own_badge"] or badge.id in issued
            item["plans"] = plan_issuers.badge_plans(db_session, badge, issuer_org_id)
        results.append(item)
    return results


async def list_issued_badges(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[dict]:
    """Other organizations' badges this one issues: the plans it runs for each (with learner access
    and its permission to leave), for the issuer's Marketplace › Requests."""
    _require_org_admin(db_session, current_user, org_id)
    ids = plan_issuers.issued_badge_ids(db_session, [org_id])
    badges = db_session.exec(select(LearningBadge).where(LearningBadge.id.in_(ids or {0}), LearningBadge.deleted_at.is_(None))  # type: ignore
                             .order_by(LearningBadge.name)).all()
    result = []
    for badge in badges:
        creator_org = db_session.get(Organization, badge.org_id)
        result.append({
            "badge": _badge_summary(badge),
            "creator_org": _org_summary(creator_org) if creator_org else None,
            "learner_access": issuers.issuer_access(db_session, badge, org_id),
            "plans": plan_access.badge_plans(db_session, badge, org_id),
        })
    return result


async def list_eligible_issuers(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[dict]:
    """Issuers the current user can see for this badge, the creator first when it issues."""
    badge = _get_badge(db_session, badge_uuid)
    user_id = current_user.id if isinstance(current_user, PublicUser) else None
    options = issuers.issuer_options(db_session, badge, user_id)["issuers"]
    return [{**option, "via_link": option["request_status"] == BadgeIssuerLearnerLinkStatus.ACCEPTED} for option in options]


async def get_issuing_settings(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    return issuers.issuing_settings(db_session, badge)


async def update_issuing_settings(
    request: Request,
    badge_uuid: str,
    data: issuers.BadgeIssuingSettingsUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    badge = _get_badge(db_session, badge_uuid)
    admin = _require_org_admin(db_session, current_user, badge.org_id)
    return issuers.update_issuing_settings(db_session, badge, data, admin.id)


async def create_learner_link(
    request: Request,
    data: IssuerLearnerLinkCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    admin = _require_org_admin(db_session, current_user, data.issuer_org_id)
    badge = _get_badge(db_session, data.badge_uuid)
    if not plan_issuers.may_issue(db_session, badge, data.issuer_org_id):
        raise HTTPException(status_code=422, detail="Your organization is not authorized to issue this badge")
    user = db_session.get(User, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = find_link(db_session, badge.id or 0, data.issuer_org_id, user.id)
    if existing:
        if existing.status in {
            BadgeIssuerLearnerLinkStatus.ENDED,
            BadgeIssuerLearnerLinkStatus.COMPLETED,
            BadgeIssuerLearnerLinkStatus.REJECTED,
        }:
            existing.status = BadgeIssuerLearnerLinkStatus.ACCEPTED
            existing.staff_user_ids = list(dict.fromkeys([*(existing.staff_user_ids or []), admin.id]))
            existing.decided_by_user_id = admin.id
            existing.decided_at = datetime.utcnow()
            existing.end_reason = None
            existing.ended_by_user_id = None
            existing.ended_at = None
            existing.update_date = _now()
            db_session.add(existing)
            db_session.commit()
            db_session.refresh(existing)
        return _serialize_learner_link(db_session, simulate_issuer_acceptance(db_session, existing))

    now = _now()
    link = new_link(
        badge.id or 0, data.issuer_org_id, user.id or 0, now,
        status=BadgeIssuerLearnerLinkStatus.ACCEPTED,
        created_by_user_id=admin.id,
        decided_by_user_id=admin.id,
        decided_at=datetime.utcnow(),
        staff_user_ids=[admin.id],
        note=data.note or "",
    )
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return _serialize_learner_link(db_session, link)


async def request_learner_support(
    request: Request,
    data: IssuerLearnerRequestCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    learner = _require_user(current_user)
    badge = _get_badge(db_session, data.badge_uuid)
    issuing = dict(issuers.active_issuers(db_session, badge))
    access = issuing.get(data.issuer_org_id)
    if access == "open":
        link = issuers.validate_issuer_start(db_session, badge, data.issuer_org_id, learner.id)
        return _serialize_learner_link(db_session, link) if link else {"status": BadgeIssuerLearnerLinkStatus.ACCEPTED, "active": True}
    # Requests go to an issuer running one of the badge's plans by request.
    if access != "request":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This organization is not accepting learner requests for this badge",
        )
    existing = find_link(db_session, badge.id or 0, data.issuer_org_id, learner.id)
    now = _now()
    if existing:
        if existing.status in {
            BadgeIssuerLearnerLinkStatus.REJECTED,
            BadgeIssuerLearnerLinkStatus.ENDED,
            BadgeIssuerLearnerLinkStatus.COMPLETED,
        }:
            existing.status = BadgeIssuerLearnerLinkStatus.REQUESTED
            existing.message = data.message or ""
            existing.requested_by_user_id = learner.id
            existing.decided_by_user_id = None
            existing.decided_at = None
            existing.end_reason = None
            existing.ended_by_user_id = None
            existing.ended_at = None
            existing.update_date = now
            db_session.add(existing)
            db_session.commit()
            db_session.refresh(existing)
        return _serialize_learner_link(db_session, simulate_issuer_acceptance(db_session, existing))
    link = new_link(
        badge.id or 0, data.issuer_org_id, learner.id, now,
        status=BadgeIssuerLearnerLinkStatus.REQUESTED,
        requested_by_user_id=learner.id,
        message=data.message or "",
    )
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return _serialize_learner_link(db_session, simulate_issuer_acceptance(db_session, link))


async def decide_learner_request(
    request: Request,
    link_uuid: str,
    accepted: bool,
    data: IssuerLearnerRequestDecision,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    link = db_session.exec(
        select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.link_uuid
            == _clean_uuid(link_uuid, "issuer_link_")
        )
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Learner request not found")
    admin = _require_org_admin(db_session, current_user, link.issuer_org_id)
    staff_ids = list(dict.fromkeys(data.staff_user_ids or [admin.id]))
    memberships = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.org_id == link.issuer_org_id,
            UserOrganization.user_id.in_(staff_ids),  # type: ignore
        )
    ).all()
    if accepted and len({item.user_id for item in memberships}) != len(staff_ids):
        raise HTTPException(
            status_code=422,
            detail="Every assigned staff member must belong to the issuing organization",
        )
    link.status = (
        BadgeIssuerLearnerLinkStatus.ACCEPTED
        if accepted
        else BadgeIssuerLearnerLinkStatus.REJECTED
    )
    link.staff_user_ids = staff_ids if accepted else []
    link.decided_by_user_id = admin.id
    link.decided_at = datetime.utcnow()
    link.note = data.note or ""
    link.end_reason = None
    link.ended_by_user_id = None
    link.ended_at = None
    link.update_date = _now()
    if accepted:
        ensure_learner_membership(db_session, link, _now())
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return _serialize_learner_link(db_session, link)


def _serialize_learner_link(db_session: Session, link: BadgeIssuerLearnerLink) -> dict:
    user = db_session.get(User, link.user_id)
    badge = db_session.get(LearningBadge, link.badge_id)
    org = db_session.get(Organization, link.issuer_org_id)
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
        "organization": _org_summary(org) if org else None,
        "active": link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
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
    user = _require_user(current_user)
    if user.id == link.user_id:
        reason = "ended_by_learner"
    else:
        _require_org_admin(db_session, current_user, link.issuer_org_id)
        reason = "ended_by_organization"
    link.status = BadgeIssuerLearnerLinkStatus.ENDED
    link.end_reason = reason
    link.ended_by_user_id = user.id
    link.ended_at = datetime.utcnow()
    link.update_date = _now()
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    return _serialize_learner_link(db_session, link)


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


async def issuer_badge_metrics(
    request: Request,
    org_id: int,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Issuance and goal template usage for one authorized issuer and badge."""
    from src.db.learning import LearningBadgeAward
    _require_org_staff(db_session, current_user, org_id)  # a read: staff see it on the badge page too
    badge = _get_badge(db_session, badge_uuid)
    if not plan_issuers.may_issue(db_session, badge, org_id):
        raise HTTPException(status_code=404, detail="Your organization doesn't issue this badge")

    awards = db_session.exec(
        select(LearningBadgeAward).where(
            LearningBadgeAward.badge_id == badge.id,
            LearningBadgeAward.issuing_org_id == org_id,
        )
    ).all()
    from src.services.goals.document import iter_steps

    templates = [
        template for template in db_session.exec(
            select(GoalTemplate).where(GoalTemplate.org_id == org_id).order_by(GoalTemplate.title)  # type: ignore[arg-type]
        ).all()
        if any(step.get("type") == "badge" and (step.get("config") or {}).get("badge_uuid") == badge.badge_uuid for _, step in iter_steps(template.document or {}))
    ]
    assignment_counts: dict[int, int] = {}
    if templates:
        for template_id in db_session.exec(
            select(GoalAssignment.template_id).where(GoalAssignment.template_id.in_([template.id for template in templates]))  # type: ignore[union-attr]
        ).all():
            assignment_counts[template_id] = assignment_counts.get(template_id, 0) + 1

    return {
        "learner_access": issuers.issuer_access(db_session, badge, org_id),
        "plans": plan_access.badge_plans(db_session, badge, org_id),
        "issued_count": len(awards),
        "templates": [
            {
                "template_uuid": template.template_uuid,
                "title": template.title,
                "status": template.status,
                "assignment_count": assignment_counts.get(template.id or 0, 0),
            }
            for template in templates
        ],
    }
