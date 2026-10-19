"""A badge's ways to earn it ("routes"), on goal templates.

The badge's creator picks which of its goal templates earn the badge and which
one is recommended; an issuer organization offers some or all of them. Starting
a badge issues the learner's goal from a route (see ``goals/badges``).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Field, Session, SQLModel, select

from src.db.badge_routes import BadgeRoute, BadgeRouteOffer, BadgeRouteOffersUpdate
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStep, GoalTemplate, StepProgress
from src.db.learning import LearningBadge
from src.db.users import PublicUser
from src.services.goals import templates
from src.services.goals.badge_authority import rule_of
from src.services.goals.badges import active_badge_goal, badge_routes, start_badge_goal
from src.services.goals.document import iter_steps
from src.services.learning.lookups import _get_badge


class GoalBadgeRouteInput(SQLModel):
    template_uuid: str = ""
    program_uuid: str = Field(default="", description="Legacy name for template_uuid (same uuid).")
    recommended: bool = False

    @property
    def uuid(self) -> str:
        return self.template_uuid or self.program_uuid


class GoalBadgeRoutesUpdate(SQLModel):
    routes: list[GoalBadgeRouteInput]


class GoalBadgeStart(SQLModel):
    template_uuid: str | None = Field(default=None, description="The route to earn it by; defaults to the recommended route.")
    program_uuid: str | None = Field(default=None, description="Legacy name for template_uuid.")
    issuer_org_id: int | None = Field(default=None, description="The organization to earn it with; defaults to the badge's creator.")


def _value(item) -> str:
    return getattr(item, "value", item)


def offered(db: Session, badge: LearningBadge) -> dict[int, set[int]]:
    """Issuer org id -> the route ids it offers (issuers missing here offer every route)."""
    result: dict[int, set[int]] = {}
    for offer in db.exec(select(BadgeRouteOffer).join(BadgeRoute, BadgeRoute.id == BadgeRouteOffer.route_id).where(BadgeRoute.badge_id == badge.id)).all():
        result.setdefault(offer.issuer_org_id, set()).add(offer.route_id)
    return result


def offers(offered_routes: dict[int, set[int]], org_id: int, route: BadgeRoute) -> bool:
    return org_id not in offered_routes or int(route.id or 0) in offered_routes[org_id]


def route_summary(db: Session, template: GoalTemplate) -> dict:
    """What a learner would get from this template: its published version, else the draft."""
    live = templates.published_version(db, template)
    document = (live.document if live else template.document) or {}
    steps = [{"title": step.get("title") or "", "kind": step.get("type") or "", "chapter": stage.get("title") or ""} for stage, step in iter_steps(document)]
    return {
        "template_uuid": template.template_uuid, "name": template.title,
        "description": template.description or "",
        "steps": steps, "step_count": len(steps), "activity_count": sum(step["kind"] == "activity" for step in steps),
        "published_version": live.number if live else None,
    }


def goal_progress(db: Session, goal: Goal) -> dict:
    rows = db.exec(select(StepProgress.status).select_from(GoalStep).outerjoin(StepProgress, StepProgress.step_id == GoalStep.id).where(GoalStep.goal_id == goal.id)).all()
    return {"goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status),
            "done": sum(_value(status) in DONE_STEP_STATUSES for status in rows), "total": len(rows)}


def list_routes(db: Session, current_user: PublicUser | None, badge_uuid: str) -> dict:
    """The ways to earn a badge, each with the issuers that offer it, and the learner's goal if started."""
    from src.services.learning_issuers import issuer_options

    badge = _get_badge(db, badge_uuid)
    user_id = int(current_user.id) if current_user and getattr(current_user, "id", None) else None
    visible = {option["org"]["id"]: option for option in issuer_options(db, badge, user_id, set())["issuers"]}
    offered_routes = offered(db, badge)
    routes, uuids = [], {}
    for route, template in badge_routes(db, badge):
        uuids[route.id] = route.route_uuid
        issuers = [{**visible[org_id], "is_creator": org_id == badge.org_id} for org_id in visible if offers(offered_routes, org_id, route)]
        routes.append({**route_summary(db, template), "route_uuid": route.route_uuid, "recommended": route.recommended, "issuers": issuers,
                       "eligible_versions": rule_of(route)})
    routes.sort(key=lambda item: not item["recommended"])
    goal = active_badge_goal(db, badge, user_id) if user_id else None
    return {
        "badge_uuid": badge.badge_uuid, "routes": routes,
        "offers": {str(org_id): sorted(uuids[route_id] for route_id in route_ids if route_id in uuids) for org_id, route_ids in offered_routes.items()},
        "goal": goal_progress(db, goal) if goal else None,
    }


def _legacy_program_id(db: Session, template_uuid: str) -> int | None:
    """Routes keep pointing at the legacy template with the same uuid until the plan tables are dropped."""
    if not inspect(db.get_bind()).has_table("program"):
        return None
    from src.db.programs import Program

    return db.exec(select(Program.id).where(Program.program_uuid == template_uuid)).first()


def set_routes(db: Session, current_user: PublicUser, badge_uuid: str, payload: GoalBadgeRoutesUpdate) -> dict:
    """The creator chooses which of its goal templates earn the badge, and which one is recommended."""
    from src.security.org_auth import require_org_admin

    badge = _get_badge(db, badge_uuid)
    require_org_admin(current_user.id, badge.org_id, db)
    chosen: list[tuple[GoalTemplate, bool]] = []
    for item in payload.routes:
        template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == item.uuid, GoalTemplate.org_id == badge.org_id)).first()
        if not template:
            raise HTTPException(status_code=422, detail="Routes must be goal templates of the badge's organization")
        chosen.append((template, item.recommended))
    if len({template.id for template, _ in chosen}) != len(chosen):
        raise HTTPException(status_code=422, detail="A goal template can only be one route")
    if chosen and not any(recommended for _, recommended in chosen):
        chosen[0] = (chosen[0][0], True)
    existing = {route.goal_template_id: route for route, _ in badge_routes(db, badge)}
    now = datetime.now().isoformat()
    for position, (template, recommended) in enumerate(chosen):
        route = existing.pop(template.id, None) or BadgeRoute(
            route_uuid=f"badge_route_{uuid4()}", badge_id=badge.id, goal_template_id=template.id,  # type: ignore[arg-type]
            program_id=_legacy_program_id(db, template.template_uuid), creation_date=now,
        )
        route.recommended = recommended and not any(other for _, other in chosen[:position])
        route.position = position
        route.update_date = now
        db.add(route)
    for route in existing.values():
        db.delete(route)
    db.commit()
    return list_routes(db, current_user, badge_uuid)


def set_offered_routes(db: Session, current_user: PublicUser, badge_uuid: str, issuer_org_id: int, payload: BadgeRouteOffersUpdate) -> dict:
    """An issuer chooses which of the badge's routes it offers (none chosen: every route)."""
    from src.security.org_auth import require_org_admin
    from src.services.learning_issuers import active_issuers

    badge = _get_badge(db, badge_uuid)
    require_org_admin(current_user.id, issuer_org_id, db)
    if issuer_org_id not in {org_id for org_id, _, _ in active_issuers(db, badge)}:
        raise HTTPException(status_code=403, detail="This organization is not issuing this badge")
    routes = {route.route_uuid: route for route, _ in badge_routes(db, badge)}
    if any(uuid not in routes for uuid in payload.route_uuids):
        raise HTTPException(status_code=422, detail="Offer only this badge's routes")
    route_ids = [route.id for route in routes.values()] or [0]
    for offer in db.exec(select(BadgeRouteOffer).where(BadgeRouteOffer.issuer_org_id == issuer_org_id, BadgeRouteOffer.route_id.in_(route_ids))).all():  # type: ignore[union-attr]
        db.delete(offer)
    for uuid in dict.fromkeys(payload.route_uuids):
        db.add(BadgeRouteOffer(route_id=routes[uuid].id, issuer_org_id=issuer_org_id, creation_date=datetime.now().isoformat()))
    db.commit()
    return list_routes(db, current_user, badge_uuid)


def start(db: Session, current_user: PublicUser, badge_uuid: str, payload: GoalBadgeStart) -> dict:
    """Start earning a badge: the learner's goal summary (an existing one, or a new one from the chosen route)."""
    badge = _get_badge(db, badge_uuid)
    goal = start_badge_goal(db, current_user, badge, payload.template_uuid or payload.program_uuid, payload.issuer_org_id)
    return goal_progress(db, goal)
