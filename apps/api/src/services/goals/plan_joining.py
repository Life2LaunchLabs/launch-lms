"""Learners finding plans in Discover and joining them.

An organization offers a plan it runs (its own, or another organization's it is approved to
run) to learners ``open`` or by ``request`` (``plan_access``). Discover lists those offers: on an
organization's site, the plans that organization offers; across the platform, the plans the site
organization offers and the ones verified badge publishers offer for their own plans. A plan with a
badge is still one plan, offered by each organization that runs it.

Joining an open plan gives the learner their own goal from its live release at once, issued by the
organization offering it (so finishing it earns the badge there). Joining by request waits for the
organization to accept. Either way the learner becomes a learner of that organization.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.badges import BadgeAward
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalSource, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress, TemplateStatus
from src.db.organizations import Organization
from src.db.plan_collections import PlanCollection, PlanCollectionItem
from src.db.plan_joining import JoinRequestStatus, PlanJoin, PlanJoinRequest
from src.db.template_marketplace import GoalTemplateLearnerAccess
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.services.badges.definition import live_achievement, summary
from src.services.goals import plan_access, plan_issuers
from src.services.goals.document import iter_steps

FEATURED_COUNT = 5
MIN_COLLECTION_PLANS = 2
# The partner program whose members' plans the platform-wide Discover lists.
PUBLISHING = "badge_publishing"
# A learner's plan in progress, from any source.
OPEN_GOALS = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value)
LEARNER_ROLE_ID = 4


def _now() -> str:
    return datetime.now().isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def _user_id(current_user: PublicUser | AnonymousUser | None) -> int | None:
    return None if current_user is None or isinstance(current_user, AnonymousUser) else int(current_user.id)


def _org(org: Organization | None) -> dict | None:
    return {"id": org.id, "name": org.name, "slug": org.slug, "logo_image": org.logo_image or "", "org_uuid": org.org_uuid} if org else None


class Offer:
    """One organization offering one plan to learners."""

    def __init__(self, template: GoalTemplate, version: GoalTemplateVersion, org_id: int, access: str):
        self.template, self.version, self.org_id, self.access = template, version, int(org_id), access


def offers(db: Session, org_id: int | None = None, site_org_id: int | None = None, template_ids: list[int] | None = None) -> list[Offer]:
    """The plans learners may join: offered open or by request, with a live release that has steps, by an
    organization that runs them. ``org_id`` narrows to that organization's offers; without it, the site
    organization's offers and verified publishers' offers of their own plans."""
    from src.security.access.access import orgs_with_feature, owner_org_id

    statement = (select(GoalTemplateLearnerAccess, GoalTemplate).join(GoalTemplate, GoalTemplate.id == GoalTemplateLearnerAccess.template_id)
                 .where(col(GoalTemplateLearnerAccess.access).in_(plan_access.OFFERED), GoalTemplate.status != TemplateStatus.ARCHIVED,
                        col(GoalTemplate.published_version_id).is_not(None), col(GoalTemplate.system_type).is_(None)))
    if org_id is not None:
        statement = statement.where(GoalTemplateLearnerAccess.org_id == org_id)
    if template_ids is not None:
        statement = statement.where(col(GoalTemplate.id).in_(template_ids or [0]))
    rows = list(db.exec(statement.order_by(GoalTemplate.title, GoalTemplateLearnerAccess.org_id)).all())
    if org_id is None:
        site = site_org_id if site_org_id is not None else owner_org_id(db)
        publishers = orgs_with_feature({int(template.org_id) for _, template in rows}, PUBLISHING, db)
        rows = [(access, template) for access, template in rows
                if access.org_id == site or (access.org_id == template.org_id and template.org_id in publishers)]
    versions = {int(row.id): row for row in db.exec(select(GoalTemplateVersion).where(
        col(GoalTemplateVersion.id).in_([int(template.published_version_id) for _, template in rows] or [0]))).all()}  # type: ignore[arg-type]
    result = []
    for access, template in rows:
        version = versions.get(int(template.published_version_id))  # type: ignore[arg-type]
        if version is None or not any(True for _ in iter_steps(version.document or {})):
            continue
        if not plan_issuers.approved_on(db, template.id, access.org_id):
            continue
        result.append(Offer(template, version, access.org_id, access.access))
    return result


class _Viewer:
    """What one learner has going on with a set of plans."""

    def __init__(self, db: Session, user_id: int | None, template_ids: list[int]):
        self.goals: dict[int, dict] = {}
        self.earned: set[int] = set()
        self.requests: dict[tuple[int, int], str] = {}
        if not user_id or not template_ids:
            return
        goals = db.exec(select(Goal).where(Goal.subject_user_id == user_id, col(Goal.template_id).in_(template_ids),
                                           col(Goal.status).in_(OPEN_GOALS)).order_by(col(Goal.id))).all()
        counts: dict[int, list[int]] = {}
        for goal_id, status in db.exec(select(GoalStep.goal_id, StepProgress.status).outerjoin(StepProgress, StepProgress.step_id == GoalStep.id)
                                       .where(col(GoalStep.goal_id).in_([goal.id for goal in goals] or [0]))).all():
            count = counts.setdefault(int(goal_id), [0, 0])
            count[1] += 1
            count[0] += _value(status) in DONE_STEP_STATUSES
        for goal in goals:
            done, total = counts.get(int(goal.id), [0, 0])  # type: ignore[arg-type]
            self.goals[int(goal.template_id)] = {"goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status),  # type: ignore[arg-type]
                                                 "org_id": goal.org_id, "done": done, "total": total}
        self.earned = {int(item) for item in db.exec(select(BadgeAward.template_id).where(
            BadgeAward.user_id == user_id, col(BadgeAward.template_id).in_(template_ids))).all() if item}
        self.requests = {(int(row.template_id), int(row.org_id)): row.status for row in db.exec(select(PlanJoinRequest).where(
            PlanJoinRequest.user_id == user_id, col(PlanJoinRequest.template_id).in_(template_ids))).all()}

    def state(self, offer: Offer) -> str:
        template_id = int(offer.template.id)  # type: ignore[arg-type]
        if template_id in self.goals:
            return "joined"
        if template_id in self.earned:
            return "earned"
        return self.requests.get((template_id, offer.org_id)) or "none"


def _cards(db: Session, items: list[Offer], user_id: int | None) -> list[dict]:
    template_ids = list({int(item.template.id) for item in items})  # type: ignore[arg-type]
    viewer = _Viewer(db, user_id, template_ids)
    orgs = {int(org.id): org for org in db.exec(select(Organization).where(col(Organization.id).in_(  # type: ignore[arg-type]
        {item.org_id for item in items} | {int(item.template.org_id) for item in items} or {0}))).all()}
    cards = []
    for item in items:
        template, document = item.template, item.version.document or {}
        cards.append({
            "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
            "thumbnail_image": template.thumbnail_image or "", "icon": template.icon, "color": template.color,
            "stage_count": len(document.get("stages") or []), "step_count": sum(1 for _ in iter_steps(document)),
            "badge": summary(template, document), "creator": _org(orgs.get(int(template.org_id))), "org": _org(orgs.get(item.org_id)),
            "access": item.access, "state": viewer.state(item), "goal": viewer.goals.get(int(template.id)),  # type: ignore[arg-type]
            "update_date": template.update_date,
        })
    return cards


def _collections(db: Session, items: list[Offer], cards: list[dict]) -> list[dict]:
    """Each offering organization's plan collections holding two or more of the plans it offers."""
    by_key = {(int(item.template.id), item.org_id): card for item, card in zip(items, cards)}  # type: ignore[arg-type]
    org_ids = {item.org_id for item in items}
    rows = db.exec(select(PlanCollection).where(col(PlanCollection.org_id).in_(org_ids or {0})).order_by(col(PlanCollection.id))).all()
    members: dict[int, list[int]] = {}
    for collection_id, template_id in db.exec(select(PlanCollectionItem.collection_id, PlanCollectionItem.template_id).where(
            col(PlanCollectionItem.collection_id).in_([row.id for row in rows] or [0])).order_by(col(PlanCollectionItem.position))).all():
        members.setdefault(int(collection_id), []).append(int(template_id))
    result = []
    for row in rows:
        shown = [by_key[(template_id, int(row.org_id))] for template_id in members.get(int(row.id), []) if (template_id, int(row.org_id)) in by_key]  # type: ignore[arg-type]
        if len(shown) >= MIN_COLLECTION_PLANS:
            result.append({"collection_uuid": row.collection_uuid, "name": row.name, "description": row.description or "",
                           "categories": row.categories or [], "org": shown[0]["org"], "plans": shown})
    return result


def discover(db: Session, current_user: PublicUser | AnonymousUser | None, org_id: int | None = None, site_org_id: int | None = None) -> dict:
    """Everything the learner's Discover page shows, in one call."""
    from src.services.discover_featured import hero_slides

    user_id = _user_id(current_user)
    items = offers(db, org_id, site_org_id)
    cards = _cards(db, items, user_id)
    # One card per plan: the learner's own offer first, else the site's, else the first.
    plans: dict[str, dict] = {}
    for card in cards:
        current = plans.get(card["template_uuid"])
        if current is None or (card["state"] != "none" and current["state"] == "none") or (card["org"] or {}).get("id") == (site_org_id or org_id):
            plans[card["template_uuid"]] = card
    unique = list(plans.values())
    available = [card for card in unique if card["state"] in ("none", "requested")]
    # Plans with art first, newest first: the hero carousel is image-led.
    featured = sorted(available, key=lambda card: (bool(card["thumbnail_image"]), card["update_date"] or ""), reverse=True)[:FEATURED_COUNT]
    collections = _collections(db, items, cards)
    return {
        "hero_slides": hero_slides(db, site_org_id or org_id, featured, user_id, (unique, collections)),
        "featured": featured,
        "keep_going": [card for card in unique if card["state"] == "joined"],
        "collections": collections,
        "plans": available,
        "earned_count": sum(card["state"] == "earned" for card in unique),
    }


def _template_or_404(db: Session, template_uuid: str) -> GoalTemplate:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if template is None or _value(template.status) == TemplateStatus.ARCHIVED.value or not template.published_version_id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return template


def _outline(document: dict) -> list[dict]:
    """The plan's stages and steps as a learner reads them before joining: titles and kinds only."""
    return [{"title": stage.get("title") or "", "description": stage.get("description") or "",
             "steps": [{"title": step.get("title") or "", "type": step.get("type") or "task", "description": step.get("description") or "",
                        "requirement_node_uuids": list(step.get("requirement_node_uuids") or [])} for step in stage.get("steps") or []]}
            for stage in document.get("stages") or []]


def plan_page(db: Session, current_user: PublicUser | AnonymousUser | None, template_uuid: str, org_id: int | None = None) -> dict:
    """A plan's public page: what it takes, the badge it earns, and who offers it. It is also the
    criteria page of the plan's badge, so a plan with a badge has one even when nobody offers it."""
    from src.services.goals.template_marketplace import listing_of

    template = _template_or_404(db, template_uuid)
    version = db.get(GoalTemplateVersion, template.published_version_id)
    items = offers(db, template_ids=[int(template.id)]) + [  # type: ignore[arg-type]
        item for item in (offers(db, org_id, template_ids=[int(template.id)]) if org_id is not None else [])]  # type: ignore[arg-type]
    unique = list({item.org_id: item for item in items}.values())
    badge = live_achievement(db, template)
    listing = listing_of(db, template)
    if not unique and badge is None and not (listing and listing.listed):
        raise HTTPException(status_code=404, detail="Plan not found")
    cards = _cards(db, unique, _user_id(current_user))
    cards.sort(key=lambda card: (card["org"] or {}).get("id") != org_id)
    document = (version.document if version else None) or {}
    return {
        "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
        "thumbnail_image": template.thumbnail_image or "", "icon": template.icon, "color": template.color,
        "version": version.semver if version else None, "creator": _org(db.get(Organization, template.org_id)),
        "stages": _outline(document), "badge": badge, "offers": cards,
        "goal": next((card["goal"] for card in cards if card["goal"]), None),
    }


# Joining ----------------------------------------------------------------------------------------------

def _offer_or_404(db: Session, template_uuid: str, org_id: int) -> Offer:
    template = _template_or_404(db, template_uuid)
    found = offers(db, org_id, template_ids=[int(template.id)])  # type: ignore[arg-type]
    if not found:
        raise HTTPException(status_code=403, detail="This organization doesn't offer this plan to learners")
    return found[0]


def _ensure_learner(db: Session, org_id: int, user_id: int) -> None:
    """The learner joins the organization as a learner, when not already a member (flushed)."""
    from src.security.access.access import require_capacity

    if db.exec(select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first():
        return
    require_capacity("learners", org_id, db)
    now = _now()
    db.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=LEARNER_ROLE_ID, creation_date=now, update_date=now))
    db.flush()


def _issue(db: Session, offer: Offer, user_id: int) -> Goal:
    from src.services.goals.issue import issue_goal

    _ensure_learner(db, offer.org_id, user_id)
    return issue_goal(db, offer.template, offer.version, subject_user_id=user_id, owner_user_id=user_id, org_id=offer.org_id,
                      source=GoalSource.JOINED, actor_user_id=user_id)


def _open_goal(db: Session, template_id: int, user_id: int) -> Goal | None:
    return db.exec(select(Goal).where(Goal.template_id == template_id, Goal.subject_user_id == user_id,
                                      col(Goal.status).in_(OPEN_GOALS)).order_by(col(Goal.id).desc())).first()


def join(db: Session, current_user: PublicUser, template_uuid: str, payload: PlanJoin, commit: bool = True) -> dict:
    """Start an open plan, or ask to join one offered by request. A plan the learner already has comes back as it is."""
    user_id = int(current_user.id)
    offer = _offer_or_404(db, template_uuid, payload.org_id)
    existing = _open_goal(db, int(offer.template.id), user_id)  # type: ignore[arg-type]
    if existing:
        return {"status": "joined", "goal_uuid": existing.goal_uuid}
    if offer.access == "open":
        goal = _issue(db, offer, user_id)
        if commit:
            db.commit()
        return {"status": "joined", "goal_uuid": goal.goal_uuid}
    row = db.exec(select(PlanJoinRequest).where(PlanJoinRequest.template_id == offer.template.id, PlanJoinRequest.org_id == offer.org_id,
                                                PlanJoinRequest.user_id == user_id)).first()
    now = _now()
    if row is None:
        row = PlanJoinRequest(request_uuid=f"plan_join_{uuid4()}", template_id=int(offer.template.id), org_id=offer.org_id,  # type: ignore[arg-type]
                              user_id=user_id, creation_date=now)
    # Asking again after a decline (or after an accepted plan was archived) asks again.
    row.status, row.message, row.decided_by_user_id, row.decided_at, row.goal_id, row.update_date = (
        JoinRequestStatus.REQUESTED.value, payload.message.strip(), None, None, None, now)
    db.add(row)
    if commit:
        db.commit()
    return {"status": "requested", "request_uuid": row.request_uuid}


def cancel(db: Session, current_user: PublicUser, template_uuid: str, org_id: int) -> dict:
    """The learner takes back a request still waiting."""
    template = _template_or_404(db, template_uuid)
    row = db.exec(select(PlanJoinRequest).where(PlanJoinRequest.template_id == template.id, PlanJoinRequest.org_id == org_id,
                                                PlanJoinRequest.user_id == current_user.id, PlanJoinRequest.status == JoinRequestStatus.REQUESTED.value)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    db.delete(row)
    db.commit()
    return {"status": "none"}


# The organization's side --------------------------------------------------------------------------------

def _request_dict(db: Session, row: PlanJoinRequest) -> dict:
    template = db.get(GoalTemplate, row.template_id)
    user = db.get(User, row.user_id)
    goal = db.get(Goal, row.goal_id) if row.goal_id else None
    return {
        "request_uuid": row.request_uuid, "status": row.status, "message": row.message, "creation_date": row.creation_date,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None, "goal_uuid": goal.goal_uuid if goal else None,
        "plan": {"template_uuid": template.template_uuid, "title": template.title, "thumbnail_image": template.thumbnail_image or ""} if template else None,
        "user": {"id": user.id, "user_uuid": user.user_uuid, "username": user.username, "first_name": user.first_name,
                 "last_name": user.last_name, "avatar_image": user.avatar_image} if user else None,
    }


def list_requests(db: Session, current_user: PublicUser, org_id: int, status: str = JoinRequestStatus.REQUESTED.value) -> list[dict]:
    from src.security.org_auth import require_org_admin

    require_org_admin(current_user.id, org_id, db, "manage_learners")
    rows = db.exec(select(PlanJoinRequest).where(PlanJoinRequest.org_id == org_id, PlanJoinRequest.status == status)
                   .order_by(col(PlanJoinRequest.creation_date))).all()
    return [_request_dict(db, row) for row in rows]


def decide(db: Session, current_user: PublicUser, request_uuid: str, accept: bool) -> dict:
    """The organization accepts a request (the learner gets the plan) or declines it."""
    from src.security.org_auth import require_org_admin

    row = db.exec(select(PlanJoinRequest).where(PlanJoinRequest.request_uuid == request_uuid)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    require_org_admin(current_user.id, row.org_id, db, "manage_learners")
    if row.status != JoinRequestStatus.REQUESTED.value:
        raise HTTPException(status_code=409, detail="This request was already decided")
    if accept:
        template = db.get(GoalTemplate, row.template_id)
        offer = _offer_or_404(db, template.template_uuid, row.org_id) if template else None
        if offer is None:
            raise HTTPException(status_code=404, detail="Plan not found")
        goal = _open_goal(db, int(offer.template.id), row.user_id) or _issue(db, offer, row.user_id)  # type: ignore[arg-type]
        row.goal_id = goal.id
    row.status = (JoinRequestStatus.ACCEPTED if accept else JoinRequestStatus.REJECTED).value
    row.decided_by_user_id, row.decided_at, row.update_date = current_user.id, datetime.utcnow(), _now()
    db.add(row)
    db.commit()
    return _request_dict(db, row)
