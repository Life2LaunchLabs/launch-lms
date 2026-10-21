"""A plan template's badge side and its learners, as the organization running it sees them.

For a template the organization runs (its own, or another organization's it may run) this
answers: which badges it earns (route type, which versions earn it, who offers it to learners)
and who may start it here (``plan_access``). The learner setting is the running organization's
own, so its admins change it even when the template itself is read-only to them.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import GoalTemplate
from src.db.learning import LearningBadge, LearningBadgeVersion
from src.db.template_marketplace import TemplateLearnerAccessUpdate
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import badge_authority, badge_templates, plan_access, templates


def _template(db: Session, org_id: int, template_uuid: str) -> GoalTemplate:
    """The organization's own template, or another organization's it may run (404/403 otherwise)."""
    if badge_templates.owns(db, org_id, template_uuid):
        return templates.template_or_404(db, org_id, template_uuid)
    return badge_authority.runnable(db, org_id, template_uuid)[0]


def _offered_by(db: Session, badge: LearningBadge, route: BadgeRoute) -> list[dict]:
    """The organizations letting learners start this route: open, or by request."""
    from src.services.learning_issuers import issuer_options

    return [{"org": option["org"], "access": option["access"], "is_creator": option["is_creator"]}
            for option in issuer_options(db, badge, None, set(), route)["issuers"] if option["access"] in plan_access.OFFERED]


def _badge_version(db: Session, badge: LearningBadge) -> str | None:
    version = db.get(LearningBadgeVersion, badge.active_version_id) if badge.active_version_id else None
    return version.semantic_version if version else None


def template_learners(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """The badges this template earns and who may start it in this organization."""
    from src.services.goals.template_marketplace import route_partners

    templates.require_reader(db, current_user, org_id)
    template = _template(db, org_id, template_uuid)
    rows = db.exec(select(BadgeRoute, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
                   .where(BadgeRoute.goal_template_id == template.id, col(LearningBadge.deleted_at).is_(None))
                   .order_by(LearningBadge.name)).all()
    badges = []
    for route, badge in rows:
        badges.append({
            **badge_authority.badge_ref(db, badge), "badge_version": _badge_version(db, badge), "status": getattr(badge.status, "value", badge.status),
            "route_uuid": route.route_uuid, "recommended": bool(route.recommended), "eligible_versions": badge_authority.rule_of(route),
            "trusted_only": bool(route.trusted_only), "partners": route_partners(db, route) if route.trusted_only else [],
            # Whether finishing this plan here earns the badge: the owner, or an issuer allowed to run this route.
            "earns_here": badge_authority.may_run(db, badge, org_id, route),
            "offered_by": _offered_by(db, badge, route),
        })
    return {
        "template_uuid": template.template_uuid, "access": plan_access.access_of(db, template.id, org_id),
        "can_edit": templates.can_edit(db, current_user, org_id), "owned": int(template.org_id) == int(org_id),
        "earns_badge": any(item["earns_here"] for item in badges), "badges": badges,
    }


def set_template_access(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: TemplateLearnerAccessUpdate) -> dict:
    """The running organization says who may start this plan: open, by request, or invited learners only."""
    require_org_admin(current_user.id, org_id, db)
    template = _template(db, org_id, template_uuid)
    plan_access.set_access(db, int(template.id), org_id, payload.access, current_user.id)  # type: ignore[arg-type]
    db.commit()
    return template_learners(db, current_user, org_id, template_uuid)
