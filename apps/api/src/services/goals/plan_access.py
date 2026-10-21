"""Who can start a plan: each organization's learner access for each plan template it runs.

Learner access belongs to the plan an organization runs, not to the badge. For every
(organization, template) pair, whether the organization's own template or another
organization's it may run (a badge route, or a marketplace template it was approved to use), the
organization says who may start it:

- ``open``: any learner starts right away.
- ``request``: learners ask; the organization accepts or declines.
- ``invite``: only learners the organization adds (the default; no row means invite).

A badge reaches Discover only while an organization allowed to issue it (its owner, or an
issuer approved on that route's plan that offers it) runs one of
its routes ``open`` or by ``request``; starting the badge goes to such an organization.
``BadgeIssuerAuthorization.learner_access`` stays readable but no longer decides anything: the
old badge-level setting writes through to the plans (``apply_to_badge``).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, col, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import GoalTemplate
from src.db.learning import LearningBadge
from src.db.template_marketplace import GoalTemplateLearnerAccess

LEVELS: tuple[str, ...] = ("invite", "request", "open")
DEFAULT = "invite"
OFFERED = ("open", "request")


def best(values: Iterable[str]) -> str:
    """The most open of these access values (invite when there are none)."""
    return max((value for value in values if value in LEVELS), key=LEVELS.index, default=DEFAULT)


def _has_table(db: Session) -> bool:
    return inspect(db.connection()).has_table(GoalTemplateLearnerAccess.__tablename__)


def accesses(db: Session, template_ids: Iterable[int], org_ids: Iterable[int] | None = None) -> dict[tuple[int, int], str]:
    """(template id, org id) -> access, for the rows that exist."""
    ids = {int(item) for item in template_ids if item}
    if not ids or not _has_table(db):
        return {}
    statement = select(GoalTemplateLearnerAccess).where(col(GoalTemplateLearnerAccess.template_id).in_(ids))
    if org_ids is not None:
        statement = statement.where(col(GoalTemplateLearnerAccess.org_id).in_({int(item) for item in org_ids}))
    return {(row.template_id, row.org_id): row.access for row in db.exec(statement).all()}


def access_of(db: Session, template_id: int | None, org_id: int) -> str:
    if not template_id:
        return DEFAULT
    return accesses(db, [template_id], [org_id]).get((int(template_id), int(org_id)), DEFAULT)


def set_access(db: Session, template_id: int, org_id: int, access: str, user_id: int | None) -> None:
    """Store an organization's learner access for a template (flushed, not committed)."""
    if access not in LEVELS:
        raise HTTPException(status_code=422, detail="Learner access must be open, request, or invite")
    row = db.exec(select(GoalTemplateLearnerAccess).where(
        GoalTemplateLearnerAccess.template_id == template_id, GoalTemplateLearnerAccess.org_id == org_id,
    )).first()
    now = datetime.now().isoformat()
    if row is None:
        row = GoalTemplateLearnerAccess(template_id=template_id, org_id=org_id, creation_date=now)
    row.access, row.updated_by_user_id, row.update_date = access, user_id, now
    db.add(row)
    db.flush()


# Badges: which organizations offer which routes ------------------------------------------------

def runs_route(db: Session, badge: LearningBadge, route: BadgeRoute, org_id: int, offered_routes: dict[int, set[int]] | None = None) -> bool:
    """Whether an organization already allowed to issue the badge runs this route (offers it and is approved on its plan)."""
    from src.services.goals.badge_authority import trusted
    from src.services.goals.badge_routes import offered, offers

    if int(badge.org_id) == int(org_id):
        return True
    routes = offered_routes if offered_routes is not None else offered(db, badge)
    return offers(routes, org_id, route) and trusted(db, route, org_id)


def _routes(db: Session, badge: LearningBadge) -> list[BadgeRoute]:
    return list(db.exec(select(BadgeRoute).where(BadgeRoute.badge_id == badge.id, col(BadgeRoute.goal_template_id).is_not(None))
                        .order_by(col(BadgeRoute.position), col(BadgeRoute.id))).all())


def has_plans(db: Session, badge: LearningBadge) -> bool:
    """Whether the badge is earned through plan templates (not only legacy program routes)."""
    if not inspect(db.connection()).has_table(BadgeRoute.__tablename__):
        return False
    return db.exec(select(BadgeRoute.id).where(BadgeRoute.badge_id == badge.id, col(BadgeRoute.goal_template_id).is_not(None))).first() is not None


def issuer_access(db: Session, badge: LearningBadge, org_id: int, route: BadgeRoute | None = None) -> str:
    """An issuer's learner access for one route of the badge, or its most open across the routes it runs."""
    from src.services.goals.badge_routes import offered

    routes = [route] if route is not None else _routes(db, badge)
    offered_routes = offered(db, badge)
    running = [item for item in routes if item.goal_template_id and runs_route(db, badge, item, org_id, offered_routes)]
    found = accesses(db, [int(item.goal_template_id) for item in running], [org_id])  # type: ignore[arg-type]
    return best(found.get((int(item.goal_template_id), int(org_id)), DEFAULT) for item in running)  # type: ignore[arg-type]


def apply_to_badge(db: Session, badge: LearningBadge, org_id: int, access: str, user_id: int | None) -> None:
    """The old badge-level setting: the same access on every route of the badge this organization runs."""
    from src.services.goals.badge_routes import offered

    offered_routes = offered(db, badge)
    for route in _routes(db, badge):
        if runs_route(db, badge, route, org_id, offered_routes):
            set_access(db, int(route.goal_template_id), org_id, access, user_id)  # type: ignore[arg-type]


def badge_plans(db: Session, badge: LearningBadge, org_id: int) -> list[dict]:
    """The badge's routes this organization runs, each with its learner access (for read-only badge views)."""
    from src.services.goals.badge_routes import offered

    if not has_plans(db, badge):
        return []
    offered_routes = offered(db, badge)
    rows =[(route, db.get(GoalTemplate, route.goal_template_id)) for route in _routes(db, badge) if runs_route(db, badge, route, org_id, offered_routes)]
    found = accesses(db, [int(template.id) for _, template in rows if template], [org_id])  # type: ignore[arg-type]
    return [{"route_uuid": route.route_uuid, "template_uuid": template.template_uuid, "title": template.title,
             "access": found.get((int(template.id), int(org_id)), DEFAULT)}  # type: ignore[arg-type]
            for route, template in rows if template]


def _may_issue(db: Session, badge: LearningBadge, org_id: int) -> bool:
    """The owner (unless it stopped issuing its badge), or an issuer with an approved authorization."""
    from src.services.goals.badge_authority import authorized
    from src.services.learning_issuers import creator_issues

    if int(badge.org_id) == int(org_id):
        return creator_issues(db, badge)
    return authorized(db, badge, org_id)


def offered_badge_ids(db: Session, badges: list[LearningBadge]) -> set[int]:
    """Badges at least one organization lets learners start (open or by request) on a route it may run."""
    from src.services.goals.badge_routes import offered

    by_id = {int(badge.id): badge for badge in badges if badge.id}  # type: ignore[arg-type]
    if not by_id or not _has_table(db):
        return set()
    rows = db.exec(
        select(BadgeRoute, GoalTemplateLearnerAccess.org_id)
        .join(GoalTemplateLearnerAccess, GoalTemplateLearnerAccess.template_id == BadgeRoute.goal_template_id)
        .where(col(BadgeRoute.badge_id).in_(list(by_id)), col(GoalTemplateLearnerAccess.access).in_(OFFERED))
    ).all()
    found: set[int] = set()
    issuing: dict[tuple[int, int], bool] = {}
    offers: dict[int, dict[int, set[int]]] = {}
    for route, org_id in rows:
        badge = by_id[int(route.badge_id)]
        if int(badge.id) in found:  # type: ignore[arg-type]
            continue
        key = (int(badge.id), int(org_id))  # type: ignore[arg-type]
        if key not in issuing:
            issuing[key] = _may_issue(db, badge, org_id)
        if not issuing[key]:
            continue
        routes = offers.setdefault(int(badge.id), offered(db, badge))  # type: ignore[arg-type]
        if runs_route(db, badge, route, org_id, routes):
            found.add(int(badge.id))  # type: ignore[arg-type]
    return found
