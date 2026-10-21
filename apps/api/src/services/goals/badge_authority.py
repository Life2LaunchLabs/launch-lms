"""Who may run a badge's routes, and which template versions earn the badge.

A badge's routes are goal templates of the badge's organization. The owner runs
them; another organization runs one only while it holds an approved
BadgeIssuerAuthorization for the badge, and only the routes it offers
(BadgeRouteOffer; offering none offers all). Running a route means assigning
its template to the organization's learners, whose plans then earn the badge.
Learners starting a badge themselves are checked by
``learning_issuers.validate_issuer_start`` the same way.

The owner also says which versions of a route's template earn the badge on an
assignment: every version, only the newest, or versions from a number on.
Moving an assignment to another version stays the issuer's call
(``assignment_versions``); nothing moves on its own.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute, BadgeRouteEligibilityUpdate
from src.db.goals import GoalAssignment, GoalTemplate, GoalTemplateVersion
from src.db.learning import BadgeIssuerAuthorization, BadgeIssuerAuthorizationStatus, LearningBadge
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates


def authorized(db: Session, badge: LearningBadge, org_id: int) -> bool:
    """The badge's owner, or an organization with an approved authorization to issue it."""
    if int(badge.org_id) == int(org_id):
        return True
    return db.exec(select(BadgeIssuerAuthorization.id).where(
        BadgeIssuerAuthorization.badge_id == badge.id, BadgeIssuerAuthorization.issuer_org_id == org_id,
        BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
    )).first() is not None


def route_for(db: Session, badge_id: int | None, template_id: int | None) -> BadgeRoute | None:
    if not badge_id or not template_id:
        return None
    return db.exec(select(BadgeRoute).where(BadgeRoute.badge_id == badge_id, BadgeRoute.goal_template_id == template_id)).first()


def may_run(db: Session, badge: LearningBadge, org_id: int, route: BadgeRoute) -> bool:
    """Whether this organization may run this route of the badge now."""
    from src.services.goals.badge_routes import offered, offers

    if badge.deleted_at is not None or not authorized(db, badge, org_id):
        return False
    if int(badge.org_id) == int(org_id):
        return True
    return offers(offered(db, badge), org_id, route) and trusted(db, route, org_id)


def trusted(db: Session, route: BadgeRoute, org_id: int) -> bool:
    """A trusted-partners-only route runs only for the issuers its badge's owner approved for it."""
    if not route.trusted_only:
        return True
    from src.db.template_marketplace import BadgeRoutePartner

    return db.exec(select(BadgeRoutePartner.id).where(BadgeRoutePartner.route_id == route.id, BadgeRoutePartner.issuer_org_id == org_id)).first() is not None


def runnable(db: Session, org_id: int, template_uuid: str, badge_uuid: str | None = None) -> tuple[GoalTemplate, LearningBadge | None]:
    """The template an organization may assign, and the badge its learners earn (None: no badge).

    Its own templates earn a badge only when one is named. Another organization's
    template is assignable only as a route of a badge this organization may run.
    """
    from src.services.learning.lookups import _get_badge

    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if not template:
        raise HTTPException(status_code=404, detail="Goal template not found")
    if badge_uuid:
        badge = _get_badge(db, badge_uuid)
        route = route_for(db, badge.id, template.id)
        if not route:
            raise HTTPException(status_code=422, detail="This template isn't a way to earn that badge")
        if not may_run(db, badge, org_id, route):
            raise HTTPException(status_code=403, detail="This organization isn't authorized to run this badge's template")
        return template, badge
    if template.org_id == org_id:
        return template, None
    routes = db.exec(select(BadgeRoute, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
                     .where(BadgeRoute.goal_template_id == template.id).order_by(BadgeRoute.id)).all()
    for route, badge in routes:
        if may_run(db, badge, org_id, route):
            return template, badge
    # A locked marketplace template this organization was given permission to use (no badge unless a route above allows it).
    from src.services.goals.template_marketplace import may_use_as_is

    if may_use_as_is(db, template, org_id):
        return template, None
    if not routes:
        raise HTTPException(status_code=404, detail="Goal template not found")
    raise HTTPException(status_code=403, detail="This organization isn't authorized to run this badge's template")


def still_runs(db: Session, assignment: GoalAssignment) -> bool:
    """A badge assignment issues new plans only while its organization may still run the route."""
    badge = db.get(LearningBadge, assignment.badge_id) if assignment.badge_id else None
    if badge is None:
        if assignment.badge_id is not None:
            return False
        template = db.get(GoalTemplate, assignment.template_id)
        if template is None or int(template.org_id) == int(assignment.org_id):
            return True
        from src.services.goals.template_marketplace import use_withdrawn

        return not use_withdrawn(db, template, assignment.org_id)
    route = route_for(db, badge.id, assignment.template_id)
    return bool(route and may_run(db, badge, assignment.org_id, route))


# Eligible versions -----------------------------------------------------------------------

def rule_of(route: BadgeRoute) -> dict:
    if route.latest_only:
        return {"rule": "latest", "from_version": None}
    if route.eligible_from_version:
        return {"rule": "from", "from_version": route.eligible_from_version}
    return {"rule": "any", "from_version": None}


def eligible(route: BadgeRoute | None, number: int | None, latest: int | None) -> bool:
    if route is None or number is None:
        return True
    if route.latest_only:
        return latest is None or number >= latest
    return not route.eligible_from_version or number >= route.eligible_from_version


def _latest_number(db: Session, template: GoalTemplate | None) -> int | None:
    live = templates.published_version(db, template) if template else None
    return live.number if live else None


def badge_ref(db: Session, badge: LearningBadge) -> dict:
    owner = db.get(Organization, badge.org_id)
    return {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or "",
            "owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None}


def version_status(db: Session, assignment: GoalAssignment) -> dict:
    """An assignment's version against its template's newest, and whether its badge still accepts it."""
    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    live = templates.published_version(db, template) if template else None
    badge = db.get(LearningBadge, assignment.badge_id) if assignment.badge_id else None
    route = route_for(db, assignment.badge_id, assignment.template_id) if badge else None
    number = version.number if version else None
    return {
        "version_uuid": version.version_uuid if version else None,
        "latest_version": live.number if live else None,
        "latest_version_uuid": live.version_uuid if live else None,
        "update_available": bool(live and version and live.id != version.id and live.number > version.number),
        "badge": {**badge_ref(db, badge), **(rule_of(route) if route else {})} if badge else None,
        "version_eligible": eligible(route, number, live.number if live else None) if badge else None,
    }


def finishing_earns_badge(db: Session, assignment: GoalAssignment | None, version: GoalTemplateVersion | None) -> bool:
    """Whether finishing a plan of this assignment, on this version, earns its badge."""
    if assignment is None or not assignment.badge_id:
        return False
    route = route_for(db, assignment.badge_id, assignment.template_id)
    if route is None:
        return False
    return eligible(route, version.number if version else None, _latest_number(db, db.get(GoalTemplate, assignment.template_id)))


def set_eligibility(db: Session, current_user: PublicUser, badge_uuid: str, route_uuid: str, payload: BadgeRouteEligibilityUpdate) -> dict:
    """The badge owner says which versions of a route's template earn the badge."""
    from src.services.goals.badge_routes import list_routes
    from src.services.learning.lookups import _get_badge

    badge = _get_badge(db, badge_uuid)
    require_org_admin(current_user.id, badge.org_id, db)
    route = db.exec(select(BadgeRoute).where(BadgeRoute.route_uuid == route_uuid, BadgeRoute.badge_id == badge.id)).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    latest = _latest_number(db, db.get(GoalTemplate, route.goal_template_id))
    if payload.rule == "from":
        if not payload.from_version:
            raise HTTPException(status_code=422, detail="Choose the first version that earns the badge")
        if latest is None or payload.from_version > latest:
            raise HTTPException(status_code=422, detail="That version of the template isn't published yet")
    route.latest_only = payload.rule == "latest"
    route.eligible_from_version = payload.from_version if payload.rule == "from" else None
    route.update_date = datetime.now().isoformat()
    db.add(route)
    db.commit()
    return list_routes(db, current_user, badge_uuid)
