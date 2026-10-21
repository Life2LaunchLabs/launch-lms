"""Who may issue a badge: its owner, and the organizations approved on one of its plans.

Permission lives on the plan template (``GoalTemplateAuthorization``). An organization approved to
run a template that is a way to earn a badge (a ``BadgeRoute``) issues the badge through that plan;
a plan meant for trusted partners only is simply one whose owner approves only trusted partners.
``BadgeRoute.trusted_only`` and ``badge_route_partner`` are no longer read.

``BadgeIssuerAuthorization`` stays as the issuer's record for a badge (learner links, the issuer's
badge library and its learner-access setting hang off it), but it follows the plans: ``sync``
approves it while the organization is approved on one of the badge's plans and revokes it once it
isn't. The old badge-level decisions write through the other way (``grant_badge`` / ``end_badge``),
so approving an issuer for a badge approves it on every plan that earns the badge.

Badges earned only through legacy program routes (no plan templates) keep the badge-level record.
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
from src.db.learning import BadgeIssuerAuthorization, BadgeIssuerAuthorizationStatus, LearningBadge
from src.db.organizations import Organization
from src.db.template_marketplace import GoalTemplateAuthorization, TemplateAuthorizationStatus
from src.db.users import PublicUser

APPROVED = TemplateAuthorizationStatus.APPROVED.value
REQUESTED = TemplateAuthorizationStatus.REQUESTED.value
REVOKED = TemplateAuthorizationStatus.REVOKED.value


def _now() -> str:
    return datetime.now().isoformat()


def _has_table(db: Session) -> bool:
    return inspect(db.connection()).has_table(GoalTemplateAuthorization.__tablename__)


def _plan_template_ids(db: Session, badge: LearningBadge) -> list[int]:
    if not inspect(db.connection()).has_table(BadgeRoute.__tablename__):
        return []
    return [int(item) for item in db.exec(select(BadgeRoute.goal_template_id).where(
        BadgeRoute.badge_id == badge.id, col(BadgeRoute.goal_template_id).is_not(None))).all()]


def approved_on(db: Session, template_id: int | None, org_id: int) -> bool:
    """The template's owner, or an organization with an approved permission to run it."""
    if not template_id:
        return False
    template = db.get(GoalTemplate, template_id)
    if template is not None and int(template.org_id) == int(org_id):
        return True
    if not _has_table(db):
        return False
    return db.exec(select(GoalTemplateAuthorization.id).where(
        GoalTemplateAuthorization.template_id == template_id, GoalTemplateAuthorization.issuer_org_id == org_id,
        GoalTemplateAuthorization.status == APPROVED,
    )).first() is not None


def badge_issuer(db: Session, badge: LearningBadge, org_id: int) -> bool:
    """Whether a non-owner organization may issue the badge: approved on one of its plans
    (or, for a badge with no plan routes, holding an approved badge-level authorization)."""
    template_ids = _plan_template_ids(db, badge)
    if not template_ids or not _has_table(db):
        return db.exec(select(BadgeIssuerAuthorization.id).where(
            BadgeIssuerAuthorization.badge_id == badge.id, BadgeIssuerAuthorization.issuer_org_id == org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )).first() is not None
    return any(approved_on(db, template_id, org_id) for template_id in template_ids)


# Keeping the badge-level record in step with the plans ------------------------------------------------

def _badges_on(db: Session, template_ids: Iterable[int]) -> list[LearningBadge]:
    ids = {int(item) for item in template_ids if item}
    if not ids:
        return []
    return list(db.exec(select(LearningBadge).join(BadgeRoute, BadgeRoute.badge_id == LearningBadge.id)
                        .where(col(BadgeRoute.goal_template_id).in_(ids)).distinct()).all())


def sync_badge(db: Session, badge: LearningBadge, org_ids: Iterable[int] | None = None) -> None:
    """Approve or revoke each organization's badge-level record to match its plan permissions (flushed)."""
    if not _has_table(db) or not _plan_template_ids(db, badge):
        return
    records = {row.issuer_org_id: row for row in db.exec(select(BadgeIssuerAuthorization).where(BadgeIssuerAuthorization.badge_id == badge.id)).all()}
    if org_ids is None:
        template_ids = _plan_template_ids(db, badge)
        planned = db.exec(select(GoalTemplateAuthorization.issuer_org_id).where(col(GoalTemplateAuthorization.template_id).in_(template_ids))).all()
        org_ids = set(planned) | set(records)
    now = _now()
    for org_id in {int(item) for item in org_ids if int(item) != int(badge.org_id)}:
        wanted = badge_issuer(db, badge, org_id)
        record = records.get(org_id)
        approved = record is not None and record.status == BadgeIssuerAuthorizationStatus.APPROVED
        if wanted and not approved:
            if record is None:
                record = BadgeIssuerAuthorization(authorization_uuid=f"issuer_auth_{uuid4()}", badge_id=int(badge.id), creator_org_id=badge.org_id,  # type: ignore[arg-type]
                                                  issuer_org_id=org_id, creation_date=now)
            record.status = BadgeIssuerAuthorizationStatus.APPROVED
            record.decided_at, record.update_date = datetime.utcnow(), now
            db.add(record)
        elif approved and not wanted:
            record.status = BadgeIssuerAuthorizationStatus.REVOKED  # type: ignore[union-attr]
            record.decided_at, record.update_date = datetime.utcnow(), now  # type: ignore[union-attr]
            db.add(record)
    db.flush()


def sync_template(db: Session, template_id: int, org_id: int) -> None:
    """After a plan permission changes: every badge the plan earns follows it for that organization."""
    for badge in _badges_on(db, [template_id]):
        sync_badge(db, badge, [org_id])


def _set_plan_permission(db: Session, template: GoalTemplate, org_id: int, status: str, user_id: int | None) -> None:
    row = db.exec(select(GoalTemplateAuthorization).where(
        GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == org_id)).first()
    if row is None:
        if status != APPROVED:
            return
        row = GoalTemplateAuthorization(authorization_uuid=f"template_auth_{uuid4()}", template_id=int(template.id), creator_org_id=template.org_id,  # type: ignore[arg-type]
                                        issuer_org_id=org_id, creation_date=_now())
    elif status == REVOKED and row.status != APPROVED:
        return
    row.status, row.decided_by_user_id, row.decided_at, row.update_date = status, user_id, datetime.utcnow(), _now()
    db.add(row)


def grant_badge(db: Session, badge: LearningBadge, org_id: int, user_id: int | None) -> None:
    """A badge-level approval: the organization is approved on every plan that earns the badge."""
    if not _has_table(db):
        return
    for template_id in _plan_template_ids(db, badge):
        template = db.get(GoalTemplate, template_id)
        if template is not None and int(template.org_id) != int(org_id):
            _set_plan_permission(db, template, org_id, APPROVED, user_id)
    db.flush()
    _sync_plans(db, badge, org_id)


def end_badge(db: Session, badge: LearningBadge, org_id: int, user_id: int | None) -> None:
    """A badge-level revoke or release: the organization's permissions on the badge's plans end too."""
    if not _has_table(db):
        return
    for template_id in _plan_template_ids(db, badge):
        template = db.get(GoalTemplate, template_id)
        if template is not None:
            _set_plan_permission(db, template, org_id, REVOKED, user_id)
    db.flush()
    _sync_plans(db, badge, org_id)


def _sync_plans(db: Session, badge: LearningBadge, org_id: int) -> None:
    """Other badges earned through the same plans follow the change too."""
    for other in _badges_on(db, _plan_template_ids(db, badge)):
        sync_badge(db, other, [org_id])


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
    _set_plan_permission(db, template, int(issuer.id), APPROVED, current_user.id)
    db.flush()
    sync_template(db, int(template.id), int(issuer.id))  # type: ignore[arg-type]
    db.commit()
    row = db.exec(select(GoalTemplateAuthorization).where(
        GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == issuer.id)).one()
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
        .group_by(GoalTemplateAuthorization.status)).all()} if _has_table(db) else {}
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
    if _has_table(db):
        rows = db.exec(select(GoalTemplateAuthorization, Organization).join(Organization, Organization.id == GoalTemplateAuthorization.issuer_org_id)
                       .where(GoalTemplateAuthorization.template_id == template.id, col(GoalTemplateAuthorization.status).in_([APPROVED, REQUESTED]))
                       .order_by(Organization.name)).all()
        approved = [{"id": org.id, "name": org.name, "slug": org.slug} for row, org in rows if row.status == APPROVED]
        requested = sum(row.status == REQUESTED for row, _ in rows)
    return {"owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None,
            "approved": approved, "requested": requested if owner_admin else 0}
