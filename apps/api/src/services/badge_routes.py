"""Badges earned through plan templates.

A badge is the credential and its details. The ways to earn it are plan
templates its creator publishes with it ("routes", one recommended). An
issuer organization offers some or all routes, with the access it set (open,
request, invite). Starting a badge creates the learner's own plan from the
route, offered by the issuer, the same way an organization assigns a plan;
issuer staff join it as reviewers. Finishing every step awards the badge.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.badge_routes import BadgePlanStart, BadgeRoute, BadgeRouteOffer, BadgeRouteOffersUpdate, BadgeRoutesUpdate
from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeVersion,
)
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanStatus
from src.db.programs import Objective, ObjectiveKind, Program, ProgramObjective, ProgramPhase
from src.db.users import PublicUser
from src.services.learning.lookups import _get_badge


def _now_string() -> str:
    return datetime.now().isoformat()


def _routes(db: Session, badge: LearningBadge) -> list[tuple[BadgeRoute, Program]]:
    return list(db.exec(
        select(BadgeRoute, Program).join(Program, Program.id == BadgeRoute.program_id)
        .where(BadgeRoute.badge_id == badge.id).order_by(BadgeRoute.position, BadgeRoute.id)
    ).all())


def _route_summary(db: Session, program: Program) -> dict:
    rows = db.exec(
        select(Objective.title, Objective.kind, ProgramPhase.name).join(ProgramObjective, ProgramObjective.objective_id == Objective.id)
        .outerjoin(ProgramPhase, ProgramPhase.id == ProgramObjective.phase_id)
        .where(ProgramObjective.program_id == program.id).order_by(ProgramPhase.position, ProgramObjective.position)
    ).all()
    steps = [{"title": title, "kind": getattr(kind, "value", kind), "chapter": chapter or ""} for title, kind, chapter in rows]
    return {
        "program_uuid": program.program_uuid, "name": program.name, "description": program.description or "",
        "step_order": program.step_order, "steps": steps, "step_count": len(steps),
        "activity_count": sum(step["kind"] == ObjectiveKind.ACTIVITY.value for step in steps),
    }


def _offered(db: Session, badge: LearningBadge) -> dict[int, set[int]]:
    """Issuer org id -> the route ids it offers (issuers missing here offer every route)."""
    offered: dict[int, set[int]] = {}
    for offer in db.exec(select(BadgeRouteOffer).join(BadgeRoute, BadgeRoute.id == BadgeRouteOffer.route_id).where(BadgeRoute.badge_id == badge.id)).all():
        offered.setdefault(offer.issuer_org_id, set()).add(offer.route_id)
    return offered


def _offers(offered: dict[int, set[int]], org_id: int, route: BadgeRoute) -> bool:
    return org_id not in offered or int(route.id or 0) in offered[org_id]


def badge_summary(db: Session, badge_id: int | None) -> dict | None:
    badge = db.get(LearningBadge, badge_id) if badge_id else None
    return {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or ""} if badge else None


def active_badge_plan(db: Session, badge: LearningBadge, user_id: int) -> Plan | None:
    return db.exec(select(Plan).where(
        Plan.source_badge_id == badge.id, Plan.subject_user_id == user_id,
        Plan.status.in_([PlanStatus.ACTIVE, PlanStatus.COMPLETED]),  # type: ignore[union-attr]
    ).order_by(Plan.id.desc())).first()


def list_routes(db: Session, current_user: PublicUser | None, badge_uuid: str) -> dict:
    """The ways to earn a badge, each with the issuers that offer it and whether this learner can start."""
    from src.services.learning_issuers import issuer_options

    badge = _get_badge(db, badge_uuid)
    user_id = int(current_user.id) if current_user and getattr(current_user, "id", None) else None
    visible = {option["org"]["id"]: option for option in issuer_options(db, badge, user_id, set())["issuers"]}
    offered = _offered(db, badge)
    routes, uuids = [], {}
    for route, program in _routes(db, badge):
        uuids[route.id] = route.route_uuid
        issuers = [{**visible[org_id], "is_creator": org_id == badge.org_id} for org_id in visible if _offers(offered, org_id, route)]
        routes.append({**_route_summary(db, program), "route_uuid": route.route_uuid, "recommended": route.recommended, "issuers": issuers})
    routes.sort(key=lambda item: not item["recommended"])
    plan = active_badge_plan(db, badge, user_id) if user_id else None
    return {
        "badge_uuid": badge.badge_uuid, "routes": routes,
        "offers": {str(org_id): sorted(uuids[route_id] for route_id in route_ids if route_id in uuids) for org_id, route_ids in offered.items()},
        "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "status": getattr(plan.status, "value", plan.status)} if plan else None,
    }


def set_routes(db: Session, current_user: PublicUser, badge_uuid: str, payload: BadgeRoutesUpdate) -> dict:
    """The creator chooses which of its plan templates earn the badge, and which one is recommended."""
    from src.security.org_auth import require_org_admin

    badge = _get_badge(db, badge_uuid)
    require_org_admin(current_user.id, badge.org_id, db)
    programs = []
    for item in payload.routes:
        program = db.exec(select(Program).where(Program.program_uuid == item.program_uuid, Program.org_id == badge.org_id)).first()
        if not program:
            raise HTTPException(status_code=422, detail="Routes must be plan templates of the badge's organization")
        programs.append((program, item.recommended))
    if len({program.id for program, _ in programs}) != len(programs):
        raise HTTPException(status_code=422, detail="A plan template can only be one route")
    if programs and not any(recommended for _, recommended in programs):
        programs[0] = (programs[0][0], True)
    existing = {route.program_id: route for route, _ in _routes(db, badge)}
    now = _now_string()
    for position, (program, recommended) in enumerate(programs):
        route = existing.pop(int(program.id), None) or BadgeRoute(  # type: ignore[arg-type]
            route_uuid=f"badge_route_{uuid4()}", badge_id=badge.id, program_id=program.id, creation_date=now,
        )
        route.recommended = recommended and not any(other for _, other in programs[:position])
        route.position = position
        route.update_date = now
        db.add(route)
    for route in existing.values():
        db.delete(route)
    db.commit()
    return list_routes(db, current_user, badge_uuid)


def start_badge_plan(db: Session, current_user: PublicUser, badge_uuid: str, payload: BadgePlanStart) -> dict:
    """Start earning a badge: the learner's own plan from the chosen route, offered by the chosen issuer."""
    from src.services.learning_issuers import validate_issuer_start
    from src.services.planning import _plan_dict

    badge = _get_badge(db, badge_uuid)
    user_id = int(current_user.id)
    existing = active_badge_plan(db, badge, user_id)
    if existing:
        return _plan_dict(db, existing, user_id, True)
    routes = _routes(db, badge)
    if not routes:
        raise HTTPException(status_code=409, detail="This badge has no way to earn it yet")
    chosen = next(((route, program) for route, program in routes if program.program_uuid == payload.program_uuid), None) if payload.program_uuid else (
        next(((route, program) for route, program in routes if route.recommended), routes[0])
    )
    if not chosen:
        raise HTTPException(status_code=404, detail="This plan template is not a way to earn this badge")
    route, program = chosen
    issuer_org_id = payload.issuer_org_id or badge.org_id
    if not _offers(_offered(db, badge), issuer_org_id, route):
        raise HTTPException(status_code=403, detail="This organization doesn't offer that way of earning the badge")
    link = validate_issuer_start(db, badge, issuer_org_id, user_id, set())
    plan = create_badge_plan(db, badge, program, user_id, issuer_org_id, [int(item) for item in (link.staff_user_ids if link else [])])
    db.commit()
    db.refresh(plan)
    return _plan_dict(db, plan, user_id, True)


def create_badge_plan(db: Session, badge: LearningBadge, program: Program, user_id: int, issuer_org_id: int, staff_ids: list[int]) -> Plan:
    """The learner's own plan from a route, offered by the issuer (not committed)."""
    from src.services.own_plans import create_own_plan

    plan = create_own_plan(db, program, user_id, issuer_org_id, staff_ids)
    plan.source_badge_id = badge.id
    plan.name = badge.name
    db.add(plan)
    db.flush()
    return plan


def set_offered_routes(db: Session, current_user: PublicUser, badge_uuid: str, issuer_org_id: int, payload: BadgeRouteOffersUpdate) -> dict:
    """An issuer chooses which of the badge's routes it offers (none chosen: every route)."""
    from src.security.org_auth import require_org_admin
    from src.services.learning_issuers import active_issuers

    badge = _get_badge(db, badge_uuid)
    require_org_admin(current_user.id, issuer_org_id, db)
    if issuer_org_id not in {org_id for org_id, _, _ in active_issuers(db, badge)}:
        raise HTTPException(status_code=403, detail="This organization is not issuing this badge")
    routes = {route.route_uuid: route for route, _ in _routes(db, badge)}
    if any(uuid not in routes for uuid in payload.route_uuids):
        raise HTTPException(status_code=422, detail="Offer only this badge's routes")
    route_ids = [route.id for route in routes.values()] or [0]
    for offer in db.exec(select(BadgeRouteOffer).where(BadgeRouteOffer.issuer_org_id == issuer_org_id, BadgeRouteOffer.route_id.in_(route_ids))).all():  # type: ignore[union-attr]
        db.delete(offer)
    for uuid in dict.fromkeys(payload.route_uuids):
        db.add(BadgeRouteOffer(route_id=routes[uuid].id, issuer_org_id=issuer_org_id, creation_date=_now_string()))
    db.commit()
    return list_routes(db, current_user, badge_uuid)


def award_if_plan_complete(db: Session, plan: Plan) -> LearningBadgeAward | None:
    """Every step of a badge plan finished: the issuer awards the badge.

    Plans issued by an organization or template finish the same way, without a
    badge; plans learners write themselves stay open until they mark them done.
    """
    if not plan.subject_user_id or not (plan.source_badge_id or plan.source_org_id or plan.source_program_id):
        return None
    objective_count = len(db.exec(select(PlanObjective.id).where(PlanObjective.plan_id == plan.id)).all())
    rows = db.exec(
        select(PlanObjectiveProgress.status).join(PlanObjective, PlanObjective.id == PlanObjectiveProgress.plan_objective_id)
        .where(PlanObjective.plan_id == plan.id)
    ).all()
    statuses = [getattr(status, "value", status) for status in rows]
    if not statuses or len(statuses) < objective_count or any(status not in {"completed", "canceled"} for status in statuses) or "completed" not in statuses:
        return None
    if not plan.source_badge_id:
        if getattr(plan.status, "value", plan.status) == PlanStatus.ACTIVE.value:
            plan.status = PlanStatus.COMPLETED
            plan.completed_at = datetime.utcnow()
            db.add(plan)
            db.commit()
        return None
    badge = db.get(LearningBadge, plan.source_badge_id)
    if not badge:
        return None
    version = db.get(LearningBadgeVersion, badge.active_version_id) if badge.active_version_id else None
    major = int(str(version.semantic_version or "1.0.0").split(".")[0]) if version else 1
    award = db.exec(select(LearningBadgeAward).where(
        LearningBadgeAward.badge_id == badge.id, LearningBadgeAward.user_id == plan.subject_user_id, LearningBadgeAward.major_version == major,
    )).first()
    if award is None:
        now = datetime.utcnow()
        award = LearningBadgeAward(
            award_uuid=f"award_{uuid4()}", badge_id=badge.id, badge_version_id=version.id if version else None, major_version=major,
            org_id=badge.org_id, issuing_org_id=plan.source_org_id if plan.source_org_id != badge.org_id else None,
            user_id=plan.subject_user_id, source=LearningAwardSource.PLAN_COMPLETION, issued_at=now,
            evidence={"plan_uuid": plan.plan_uuid}, creation_date=str(now), update_date=str(now),
        )
        db.add(award)
        for link in db.exec(select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.badge_id == badge.id, BadgeIssuerLearnerLink.user_id == plan.subject_user_id,
            BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
        )).all():
            link.status, link.end_reason, link.ended_at, link.update_date = BadgeIssuerLearnerLinkStatus.COMPLETED, "badge_completed", now, str(now)
            db.add(link)
    plan.status = PlanStatus.COMPLETED
    plan.completed_at = datetime.utcnow()
    db.add(plan)
    db.commit()
    db.refresh(award)
    return award
