"""Plan templates in the marketplace: listings, permission to use them, and copies.

Permission is to use a plan, not a badge (see ``src/db/template_marketplace``).
A creator lists any of its templates, badge or not, as ``locked`` (others run it
as-is: ``badge_authority.runnable`` lets an approved organization assign it,
read-only, on the creator's published versions) or ``open`` (others copy it
into a template of their own, which remembers where it came from). Access is
``open`` (adding it approves at once) or ``request`` (the creator decides).

Permission on a template that is a way to earn a badge is also permission to
issue that badge through it (``plan_issuers.may_issue``). A plan of a badge
listed in the marketplace can be asked for even when the plan itself isn't
listed: that is how an organization asks to issue the badge. Leaving a plan
(``revoke`` by the issuer) stops issuing through it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import GoalAssignment, GoalTemplate, TemplateStatus
from src.db.learning import LearningBadge
from src.db.organizations import Organization
from src.db.template_marketplace import (
    GoalTemplateAuthorization,
    GoalTemplateListing,
    TemplateAuthorizationRequest,
    TemplateAuthorizationStatus,
    TemplateListingAccess,
    TemplateListingMode,
    TemplateListingUpdate,
)
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates
from src.services.goals.document import iter_steps

APPROVED = TemplateAuthorizationStatus.APPROVED.value
REQUESTED = TemplateAuthorizationStatus.REQUESTED.value


def _now() -> str:
    return datetime.now().isoformat()


def require_reader(db: Session, user: PublicUser, org_id: int) -> None:
    from src.services.school.roles import is_staff
    from src.security.superadmin import is_user_superadmin

    if is_user_superadmin(user.id, db) or is_staff(db, org_id, user.id):
        return
    raise HTTPException(status_code=403, detail="Only the organization's staff can see the marketplace")


def _org(org: Organization | None) -> dict | None:
    return {"id": org.id, "name": org.name, "slug": org.slug, "logo_image": org.logo_image, "org_uuid": org.org_uuid} if org else None


def _template(db: Session, template_uuid: str) -> GoalTemplate:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if not template:
        raise HTTPException(status_code=404, detail="Goal template not found")
    return template


def listing_of(db: Session, template: GoalTemplate) -> GoalTemplateListing | None:
    return db.exec(select(GoalTemplateListing).where(GoalTemplateListing.template_id == template.id)).first()


def authorization_of(db: Session, template: GoalTemplate, org_id: int) -> GoalTemplateAuthorization | None:
    return db.exec(select(GoalTemplateAuthorization).where(
        GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == org_id,
    )).first()


# Who may use what ---------------------------------------------------------------------------------

def may_use_as_is(db: Session, template: GoalTemplate, org_id: int) -> bool:
    """A locked listed template this organization holds an approved permission to run."""
    listing = listing_of(db, template)
    if listing is None or listing.mode != TemplateListingMode.LOCKED.value:
        return False
    authorization = authorization_of(db, template, org_id)
    return bool(authorization and authorization.status == APPROVED)


def use_withdrawn(db: Session, template: GoalTemplate, org_id: int) -> bool:
    """The creator revoked (or never granted) this organization's permission to use its template."""
    authorization = authorization_of(db, template, org_id)
    return authorization is not None and authorization.status != APPROVED


# Listing (the creator) -----------------------------------------------------------------------------

def listing_dict(listing: GoalTemplateListing | None) -> dict:
    if listing is None:
        return {"listed": False, "mode": TemplateListingMode.LOCKED.value, "access": TemplateListingAccess.REQUEST.value, "listed_at": None}
    return {"listed": listing.listed, "mode": listing.mode, "access": listing.access, "listed_at": listing.listed_at}


def _usage_counts(db: Session, template: GoalTemplate) -> dict:
    rows = db.exec(select(GoalTemplateAuthorization.status, func.count()).where(GoalTemplateAuthorization.template_id == template.id)
                   .group_by(GoalTemplateAuthorization.status)).all()
    counts = {status: count for status, count in rows}
    return {"approved": counts.get(APPROVED, 0), "requested": counts.get(REQUESTED, 0)}


def get_listing(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    require_reader(db, current_user, org_id)
    template = templates.template_or_404(db, org_id, template_uuid)
    live = templates.published_version(db, template)
    return {**listing_dict(listing_of(db, template)), "usage": _usage_counts(db, template), "published_version": live.number if live else None}


def set_listing(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: TemplateListingUpdate) -> dict:
    """The creator lists (or unlists) a template, and says how others may use it."""
    from src.services.learning_marketplace import require_org_feature

    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    if payload.listed:
        require_org_feature(db, current_user, org_id, "plan_publishing")
        if template.system_type:
            raise HTTPException(status_code=409, detail="System templates can't be listed in the marketplace")
        if templates.published_version(db, template) is None:
            raise HTTPException(status_code=422, detail="Release a version of the template before listing it in the marketplace")
    listing = listing_of(db, template)
    now = _now()
    if listing is None:
        listing = GoalTemplateListing(template_id=int(template.id), org_id=org_id, creation_date=now)  # type: ignore[arg-type]
    if payload.listed and not listing.listed:
        listing.listed_at = datetime.utcnow()
    listing.listed, listing.mode, listing.access, listing.update_date = payload.listed, payload.mode, payload.access, now
    db.add(listing)
    db.commit()
    return get_listing(db, current_user, org_id, template_uuid)


# Browse ------------------------------------------------------------------------------------------------

def _frameworks(db: Session, node_uuids: set[str]) -> list[dict]:
    if not node_uuids:
        return []
    from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode

    rows = db.exec(select(RequirementFramework.framework_uuid, RequirementFramework.name, RequirementNode.node_uuid)
                   .join(RequirementFrameworkVersion, RequirementFrameworkVersion.framework_id == RequirementFramework.id)
                   .join(RequirementNode, RequirementNode.version_id == RequirementFrameworkVersion.id)
                   .where(col(RequirementNode.node_uuid).in_(node_uuids))).all()
    found: dict[str, dict] = {}
    for framework_uuid, name, node_uuid in rows:
        entry = found.setdefault(framework_uuid, {"framework_uuid": framework_uuid, "name": name, "nodes": set()})
        entry["nodes"].add(node_uuid)
    return [{"framework_uuid": item["framework_uuid"], "name": item["name"], "node_count": len(item["nodes"])} for item in found.values()]


def _badges(db: Session, template: GoalTemplate) -> list[dict]:
    rows = db.exec(select(BadgeRoute, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id)
                   .where(BadgeRoute.goal_template_id == template.id, col(LearningBadge.deleted_at).is_(None))).all()
    return [{"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or "",
             "route_uuid": route.route_uuid} for route, badge in rows]


def authorization_dict(db: Session, authorization: GoalTemplateAuthorization, template: GoalTemplate | None = None) -> dict:
    template = template or db.get(GoalTemplate, authorization.template_id)
    copied = db.get(GoalTemplate, authorization.copied_template_id) if authorization.copied_template_id else None
    listing = listing_of(db, template) if template else None
    return {
        "authorization_uuid": authorization.authorization_uuid, "status": authorization.status, "message": authorization.message or "",
        "creation_date": authorization.creation_date, "update_date": authorization.update_date, "decided_at": authorization.decided_at,
        "template": {"template_uuid": template.template_uuid, "title": template.title, "thumbnail_image": template.thumbnail_image,
                     "mode": listing.mode if listing else None} if template else None,
        "creator_org": _org(db.get(Organization, authorization.creator_org_id)),
        "issuer_org": _org(db.get(Organization, authorization.issuer_org_id)),
        "copied_template_uuid": copied.template_uuid if copied else None,
        # The badges this plan earns: approval on it is permission to issue them.
        "badges": _badges(db, template) if template else [],
    }


def _card(db: Session, template: GoalTemplate, listing: GoalTemplateListing, org_id: int | None) -> dict:
    live = templates.published_version(db, template)
    document = (live.document if live else {}) or {}
    steps = [step for _, step in iter_steps(document)]
    nodes = {node for step in steps for node in step.get("requirement_node_uuids") or []}
    authorization = authorization_of(db, template, org_id) if org_id else None
    return {
        "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
        **templates.cover(template), "published_version": live.number if live else None,
        "stage_count": len(document.get("stages") or []), "step_count": len(steps),
        "creator_org": _org(db.get(Organization, template.org_id)), "is_own": org_id is not None and template.org_id == org_id,
        **listing_dict(listing), "badges": _badges(db, template), "frameworks": _frameworks(db, nodes), "requirement_count": len(nodes),
        "authorization": authorization_dict(db, authorization, template) if authorization else None,
    }


def browse(db: Session, current_user: PublicUser, org_id: int, query: str = "", creator_org_id: int | None = None) -> list[dict]:
    """Listed templates with a published version, each with this organization's permission."""
    require_reader(db, current_user, org_id)
    statement = (select(GoalTemplate, GoalTemplateListing).join(GoalTemplateListing, GoalTemplateListing.template_id == GoalTemplate.id)
                 .where(GoalTemplateListing.listed == True, GoalTemplate.status != TemplateStatus.ARCHIVED,  # noqa: E712
                        col(GoalTemplate.published_version_id).is_not(None)))
    if creator_org_id:
        statement = statement.where(GoalTemplate.org_id == creator_org_id)
    needle = query.strip().lower()
    cards = []
    for template, listing in db.exec(statement.order_by(GoalTemplate.title)).all():
        if needle and needle not in f"{template.title} {template.description or ''}".lower():
            continue
        cards.append(_card(db, template, listing, org_id))
    return cards


# Requests --------------------------------------------------------------------------------------------------

def _authorization(db: Session, authorization_uuid: str) -> GoalTemplateAuthorization:
    authorization = db.exec(select(GoalTemplateAuthorization).where(GoalTemplateAuthorization.authorization_uuid == authorization_uuid)).first()
    if not authorization:
        raise HTTPException(status_code=404, detail="Template permission not found")
    return authorization


def _decide(authorization: GoalTemplateAuthorization, status: str, user_id: int | None) -> None:
    authorization.status = status
    authorization.decided_by_user_id = user_id
    authorization.decided_at = datetime.utcnow()
    authorization.update_date = _now()


def _earns_listed_badge(db: Session, template: GoalTemplate) -> bool:
    """Whether the template is a way to earn a published badge listed in the marketplace."""
    from src.db.learning import LearningBadgeStatus

    return db.exec(select(BadgeRoute.id).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id).where(
        BadgeRoute.goal_template_id == template.id, LearningBadge.marketplace_listed == True,  # noqa: E712
        LearningBadge.status == LearningBadgeStatus.PUBLISHED, col(LearningBadge.deleted_at).is_(None))).first() is not None


def request_use(db: Session, current_user: PublicUser, payload: TemplateAuthorizationRequest) -> dict:
    """Ask to use a listed template, or to issue a marketplace badge through one of its plans.

    Open access approves at once (a badge's plan that isn't listed itself is by request); asking again
    after a decline or after leaving asks again."""
    require_org_admin(current_user.id, payload.issuer_org_id, db)
    template = _template(db, payload.template_uuid)
    listing = listing_of(db, template)
    if template.org_id == payload.issuer_org_id:
        raise HTTPException(status_code=422, detail="Your organization already owns this template")
    listed = listing is not None and listing.listed
    if not listed and not _earns_listed_badge(db, template):
        raise HTTPException(status_code=422, detail="This template isn't in the marketplace")
    now = _now()
    authorization = authorization_of(db, template, payload.issuer_org_id)
    if authorization and authorization.status in (APPROVED, REQUESTED):
        return authorization_dict(db, authorization, template)
    if authorization is None:
        authorization = GoalTemplateAuthorization(
            authorization_uuid=f"template_auth_{uuid4()}", template_id=int(template.id), creator_org_id=template.org_id,  # type: ignore[arg-type]
            issuer_org_id=payload.issuer_org_id, creation_date=now,
        )
    authorization.message = payload.message or ""
    authorization.requested_by_user_id = current_user.id
    authorization.update_date = now
    if listed and listing.access == TemplateListingAccess.OPEN.value:  # type: ignore[union-attr]
        _decide(authorization, APPROVED, None)
    else:
        authorization.status, authorization.decided_by_user_id, authorization.decided_at = REQUESTED, None, None
    db.add(authorization)
    db.commit()
    db.refresh(authorization)
    return authorization_dict(db, authorization, template)


def decide(db: Session, current_user: PublicUser, authorization_uuid: str, approve: bool) -> dict:
    authorization = _authorization(db, authorization_uuid)
    require_org_admin(current_user.id, authorization.creator_org_id, db)
    if authorization.status != REQUESTED:
        raise HTTPException(status_code=422, detail=f"This request isn't pending (status: {authorization.status})")
    _decide(authorization, APPROVED if approve else TemplateAuthorizationStatus.REJECTED.value, current_user.id)
    db.add(authorization)
    template = db.get(GoalTemplate, authorization.template_id)
    listing = listing_of(db, template) if template else None
    if approve and template is not None and listing is not None and listing.mode == TemplateListingMode.OPEN.value and not authorization.copied_template_id:
        # An editable plan is added as the asker's own copy as soon as it's approved.
        from src.services.goals.discover import copy_for

        copy_for(db, authorization.requested_by_user_id, authorization.issuer_org_id, template, authorization)
    db.commit()
    return authorization_dict(db, authorization)


def revoke(db: Session, current_user: PublicUser, authorization_uuid: str) -> dict:
    """Either side ends the permission: the owner revokes it, or the organization leaves the plan.
    Assignments already running stop issuing new plans, and the plan's badges stop issuing through it."""
    authorization = _authorization(db, authorization_uuid)
    try:
        require_org_admin(current_user.id, authorization.creator_org_id, db)
    except HTTPException:
        require_org_admin(current_user.id, authorization.issuer_org_id, db)
    if authorization.status != TemplateAuthorizationStatus.REVOKED.value:
        _decide(authorization, TemplateAuthorizationStatus.REVOKED.value, current_user.id)
        db.add(authorization)
        db.commit()
    return authorization_dict(db, authorization)


def list_authorizations(db: Session, current_user: PublicUser, org_id: int, perspective: str, status: str | None = None,
                        template_uuid: str | None = None) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    if perspective not in ("creator", "issuer"):
        raise HTTPException(status_code=400, detail="perspective must be 'creator' or 'issuer'")
    column = GoalTemplateAuthorization.creator_org_id if perspective == "creator" else GoalTemplateAuthorization.issuer_org_id
    statement = select(GoalTemplateAuthorization).where(column == org_id)
    if template_uuid:
        statement = statement.where(GoalTemplateAuthorization.template_id == _template(db, template_uuid).id)
    if status and status != "all":
        statement = statement.where(GoalTemplateAuthorization.status == status)
    rows = db.exec(statement.order_by(col(GoalTemplateAuthorization.id).desc())).all()
    result = []
    for row in rows:
        item = authorization_dict(db, row)
        if perspective == "creator":
            item["learner_count"] = _learners_running(db, row)
        result.append(item)
    return result


def _learners_running(db: Session, authorization: GoalTemplateAuthorization) -> int:
    """How many plans the issuer runs on the creator's template (locked) or its copy (open): counts only."""
    template_ids = [authorization.template_id] + ([authorization.copied_template_id] if authorization.copied_template_id else [])
    from src.db.goals import Goal

    return int(db.exec(select(func.count()).select_from(Goal).join(GoalAssignment, GoalAssignment.id == Goal.assignment_id)
                       .where(GoalAssignment.org_id == authorization.issuer_org_id, col(GoalAssignment.template_id).in_(template_ids))).one() or 0)


def requests_summary(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Counts for the Marketplace tab: plan requests waiting on this organization, and its own still pending."""
    require_org_admin(current_user.id, org_id, db)

    def count(*where) -> int:
        return int(db.exec(select(func.count()).select_from(GoalTemplateAuthorization).where(*where)).one() or 0)

    return {"incoming_requested": count(GoalTemplateAuthorization.creator_org_id == org_id, GoalTemplateAuthorization.status == REQUESTED),
            "outgoing_pending": count(GoalTemplateAuthorization.issuer_org_id == org_id, GoalTemplateAuthorization.status == REQUESTED)}


# Open-mode copies ---------------------------------------------------------------------------------------------

def copy_template(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """An open template's published version, copied into a draft template of this organization's own."""
    from src.services.goals.library import copy_into, library_status

    require_org_admin(current_user.id, org_id, db)
    template = _template(db, template_uuid)
    listing = listing_of(db, template)
    if template.org_id == org_id:
        raise HTTPException(status_code=422, detail="Your organization already owns this template")
    if listing is None or listing.mode != TemplateListingMode.OPEN.value:
        raise HTTPException(status_code=403, detail="This template can be run as-is but not copied")
    authorization = authorization_of(db, template, org_id)
    if authorization is None or authorization.status != APPROVED:
        if listing.listed and listing.access == TemplateListingAccess.OPEN.value:
            request_use(db, current_user, TemplateAuthorizationRequest(template_uuid=template_uuid, issuer_org_id=org_id))
            authorization = authorization_of(db, template, org_id)
        else:
            raise HTTPException(status_code=403, detail="Ask the creator for permission before copying this template")
    live = templates.issuable_version(db, template)
    copied = copy_into(db, current_user, org_id, template, live.document, live.number)
    authorization.copied_template_id = copied.id  # type: ignore[union-attr]
    authorization.update_date = _now()  # type: ignore[union-attr]
    db.add(authorization)
    db.commit()
    db.refresh(copied)
    return {**templates.template_dict(db, copied), **library_status(db, copied), "based_on": provenance(db, copied)}


def provenance(db: Session, template: GoalTemplate) -> dict | None:
    """"Based on <plan> by <org>" for a copy of another organization's template."""
    if not template.source_template_uuid:
        return None
    source = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template.source_template_uuid)).first()
    if source is None or source.org_id == template.org_id:
        return None
    return {"template_uuid": source.template_uuid, "title": source.title, "version": template.source_version,
            "org": _org(db.get(Organization, source.org_id))}


def owner_org(db: Session, template_uuid: str) -> dict | None:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    return _org(db.get(Organization, template.org_id)) if template else None


# Added from other organizations --------------------------------------------------------------------------------
