from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.badge_routes import BadgeRouteEligibilityUpdate, BadgeRouteOffersUpdate
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.db.template_marketplace import BadgeRouteTrustUpdate
from src.services.goals import badge_authority, template_marketplace
from src.services.goals import badge_routes as service
from src.services.goals.badge_routes import GoalBadgeRoutesUpdate, GoalBadgeStart

router = APIRouter()


@router.get("/{badge_uuid}/routes")
def api_badge_routes(
    badge_uuid: str,
    db: Session = Depends(get_db_session),
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    """The ways to earn a badge (goal templates), the issuers offering each, and the learner's goal if started."""
    return service.list_routes(db, current_user if isinstance(current_user, PublicUser) else None, badge_uuid)


@router.put("/{badge_uuid}/routes")
def api_set_badge_routes(
    badge_uuid: str,
    payload: GoalBadgeRoutesUpdate,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """The badge's creator chooses which of its goal templates earn it and which is recommended."""
    return service.set_routes(db, current_user, badge_uuid, payload)


@router.put("/{badge_uuid}/routes/offers")
def api_set_offered_routes(
    badge_uuid: str,
    issuer_org_id: int,
    payload: BadgeRouteOffersUpdate,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """An issuer chooses which routes it offers (none: every route)."""
    return service.set_offered_routes(db, current_user, badge_uuid, issuer_org_id, payload)


@router.put("/{badge_uuid}/routes/{route_uuid}/eligibility")
def api_set_route_eligibility(
    badge_uuid: str,
    route_uuid: str,
    payload: BadgeRouteEligibilityUpdate,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """The badge's owner says which versions of the route's template earn it: any, only the newest, or from a version on."""
    return badge_authority.set_eligibility(db, current_user, badge_uuid, route_uuid, payload)


@router.put("/{badge_uuid}/routes/{route_uuid}/trust", deprecated=True)
def api_set_route_trust(
    badge_uuid: str,
    route_uuid: str,
    payload: BadgeRouteTrustUpdate,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Deprecated: stored but no longer decides who runs the route. Approve organizations on the route's plan instead."""
    return template_marketplace.set_route_trust(db, current_user, badge_uuid, route_uuid, payload)


@router.post("/{badge_uuid}/start-plan")
def api_start_badge_plan(
    badge_uuid: str,
    payload: GoalBadgeStart,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    """Start earning a badge: the learner's goal from the route, offered by the issuer ({goal_uuid, title, status, done, total})."""
    return service.start(db, current_user, badge_uuid, payload)
