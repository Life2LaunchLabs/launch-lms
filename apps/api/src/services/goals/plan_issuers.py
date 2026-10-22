"""Who may issue a badge: its owner, and the organizations approved on one of its plans.

This is the one check. An organization may issue badge B if it owns B, or if it holds an approved
``GoalTemplateAuthorization`` on a plan template that is a way to earn B (a ``BadgeRoute``). Which
versions of that plan earn the badge stays the route's rule (``badge_authority.eligible``), and which
of a badge's plans an issuer offers stays ``BadgeRouteOffer``. There is no badge-level permission:
an organization asks for a specific plan (``template_marketplace.request_use``), the plan's owner
approves or declines it, and either side ends it (``template_marketplace.revoke``: for the issuer,
leaving the plan). A badge earned only through legacy program routes is issued by its owner alone.

``BadgeIssuerAuthorization``, ``BadgeRoute.trusted_only`` and ``badge_route_partner`` are no longer
read or written; migration a8c4e1f7d2b9 copied their approvals onto the plans.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, col, func, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import Goal, GoalAssignment, GoalStatus, GoalTemplate
from src.db.learning import LearningBadge
from src.db.organizations import Organization
from src.db.template_marketplace import GoalTemplateAuthorization, TemplateAuthorizationStatus
from src.db.users import PublicUser

APPROVED = TemplateAuthorizationStatus.APPROVED.value
REQUESTED = TemplateAuthorizationStatus.REQUESTED.value


def _now() -> str:
    return datetime.now().isoformat()


def _has_tables(db: Session) -> bool:
    found = inspect(db.connection())
    return found.has_table(GoalTemplateAuthorization.__tablename__) and found.has_table(BadgeRoute.__tablename__)


def _approved_routes(org_ids: Iterable[int]):
    """(badge id, issuer org id) for every plan route an organization in ``org_ids`` is approved on."""
    return (select(BadgeRoute.badge_id, GoalTemplateAuthorization.issuer_org_id)
            .join(GoalTemplateAuthorization, GoalTemplateAuthorization.template_id == BadgeRoute.goal_template_id)
            .where(col(GoalTemplateAuthorization.issuer_org_id).in_({int(item) for item in org_ids}),
                   GoalTemplateAuthorization.status == APPROVED))


def approved_on(db: Session, template_id: int | None, org_id: int) -> bool:
    """The template's owner, or an organization with an approved permission to run it."""
    if not template_id:
        return False
    template = db.get(GoalTemplate, template_id)
    if template is not None and int(template.org_id) == int(org_id):
        return True
    if not _has_tables(db):
        return False
    return db.exec(select(GoalTemplateAuthorization.id).where(
        GoalTemplateAuthorization.template_id == template_id, GoalTemplateAuthorization.issuer_org_id == org_id,
        GoalTemplateAuthorization.status == APPROVED,
    )).first() is not None


def may_issue(db: Session, badge: LearningBadge, org_id: int | None) -> bool:
    """The single check: the badge's owner, or an organization approved on one of the badge's plans."""
    if org_id is None:
        return False
    if int(badge.org_id) == int(org_id):
        return True
    if not _has_tables(db):
        return False
    return db.exec(_approved_routes([org_id]).where(BadgeRoute.badge_id == badge.id)).first() is not None


def issued_badge_ids(db: Session, org_ids: Iterable[int]) -> set[int]:
    """Badges of other organizations these organizations may issue (through a plan they're approved on)."""
    ids = {int(item) for item in org_ids if item is not None}
    if not ids or not _has_tables(db):
        return set()
    rows = db.exec(_approved_routes(ids).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
                   .where(LearningBadge.org_id != GoalTemplateAuthorization.issuer_org_id)).all()
    return {int(badge_id) for badge_id, _ in rows}


def issuer_org_ids(db: Session, badge: LearningBadge) -> list[int]:
    """Organizations other than the owner that may issue the badge, in the order they were approved."""
    if not _has_tables(db):
        return []
    rows = db.exec(select(GoalTemplateAuthorization.issuer_org_id)
                   .join(BadgeRoute, BadgeRoute.goal_template_id == GoalTemplateAuthorization.template_id)
                   .where(BadgeRoute.badge_id == badge.id, GoalTemplateAuthorization.status == APPROVED,
                          GoalTemplateAuthorization.issuer_org_id != badge.org_id)
                   .order_by(GoalTemplateAuthorization.id)).all()
    return list(dict.fromkeys(int(item) for item in rows))


def badge_plans(db: Session, badge: LearningBadge, org_id: int | None) -> list[dict]:
    """The badge's plans with this organization's permission on each, for asking to issue it through one."""
    from src.services.goals.badges import badge_routes
    from src.services.goals.template_marketplace import authorization_dict

    found = {}
    if org_id is not None and _has_tables(db):
        found = {row.template_id: row for row in db.exec(select(GoalTemplateAuthorization).where(
            GoalTemplateAuthorization.issuer_org_id == org_id,
            col(GoalTemplateAuthorization.template_id).in_(select(BadgeRoute.goal_template_id).where(BadgeRoute.badge_id == badge.id)))).all()}
    plans = []
    for route, template in badge_routes(db, badge):
        authorization = found.get(template.id)
        plans.append({"route_uuid": route.route_uuid, "template_uuid": template.template_uuid, "title": template.title,
                      "recommended": route.recommended, "authorization": authorization_dict(db, authorization, template) if authorization else None})
    return plans


# The template owner's Publish tab ------------------------------------------------------------------------

def invite(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, issuer_org_slug: str) -> dict:
    """The template's owner authorizes an organization by slug (approving its request if it asked)."""
    from src.security.org_auth import require_org_admin
    from src.services.goals import templates
    from src.services.goals.template_marketplace import authorization_dict

    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates can't be shared with other organizations")
    issuer = db.exec(select(Organization).where(Organization.slug == issuer_org_slug.strip())).first()
    if issuer is None or issuer.id is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if int(issuer.id) == int(org_id):
        raise HTTPException(status_code=422, detail="Your organization already owns this template")
    row = db.exec(select(GoalTemplateAuthorization).where(
        GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == issuer.id)).first()
    if row is None:
        row = GoalTemplateAuthorization(authorization_uuid=f"template_auth_{uuid4()}", template_id=int(template.id), creator_org_id=template.org_id,  # type: ignore[arg-type]
                                        issuer_org_id=int(issuer.id), creation_date=_now())
    row.status, row.decided_by_user_id, row.decided_at, row.update_date = APPROVED, current_user.id, datetime.utcnow(), _now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return authorization_dict(db, row, template)


def template_metrics(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Quick usage counts for a template the organization owns, across every organization running it."""
    from src.security.org_auth import require_org_admin
    from src.services.goals import templates

    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)

    def count(statement) -> int:
        return int(db.exec(statement).one() or 0)

    goals = select(func.count()).select_from(Goal).where(Goal.template_id == template.id)
    permissions = {status: number for status, number in db.exec(
        select(GoalTemplateAuthorization.status, func.count()).where(GoalTemplateAuthorization.template_id == template.id)
        .group_by(GoalTemplateAuthorization.status)).all()} if _has_tables(db) else {}
    running = {int(item) for item in db.exec(select(GoalAssignment.org_id).where(GoalAssignment.template_id == template.id).distinct()).all() if item}
    return {
        "authorized_orgs": int(permissions.get(APPROVED, 0)),
        "pending_requests": int(permissions.get(REQUESTED, 0)),
        "orgs_running": len(running),
        "assignments": count(select(func.count()).select_from(GoalAssignment).where(GoalAssignment.template_id == template.id)),
        "active_learners": count(select(func.count(func.distinct(Goal.subject_user_id))).where(
            Goal.template_id == template.id, col(Goal.status).in_([GoalStatus.ACTIVE, GoalStatus.PENDING]))),
        "completions": count(goals.where(Goal.status == GoalStatus.FINISHED)),
        "badges_earned": count(goals.where(Goal.status == GoalStatus.FINISHED, col(Goal.badge_id).is_not(None))),
    }


def route_issuers(db: Session, route: BadgeRoute, owner_admin: bool) -> dict:
    """For a badge's Ways to earn card: who owns the route's plan, the organizations approved on it,
    and its pending requests (counted only for an admin of the plan's owner)."""
    template = db.get(GoalTemplate, route.goal_template_id) if route.goal_template_id else None
    if template is None:
        return {"owner_org": None, "approved": [], "requested": 0}
    owner = db.get(Organization, template.org_id)
    approved: list[dict] = []
    requested = 0
    if _has_tables(db):
        rows = db.exec(select(GoalTemplateAuthorization, Organization).join(Organization, Organization.id == GoalTemplateAuthorization.issuer_org_id)
                       .where(GoalTemplateAuthorization.template_id == template.id, col(GoalTemplateAuthorization.status).in_([APPROVED, REQUESTED]))
                       .order_by(Organization.name)).all()
        approved = [{"id": org.id, "name": org.name, "slug": org.slug} for row, org in rows if row.status == APPROVED]
        requested = sum(row.status == REQUESTED for row, _ in rows)
    return {"owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None,
            "approved": approved, "requested": requested if owner_admin else 0}
