"""Who may run another organization's plan: the plan's owner, and organizations approved on it.

An organization asks for a plan (``template_marketplace.request_use``), the owner
approves or declines (or invites an organization by slug here), and either side ends it
(``template_marketplace.revoke``). An organization that may run a plan also awards its
badge (``services/badges/awards.runs_plan``).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.badges import BadgeAward
from src.db.goals import Goal, GoalAssignment, GoalStatus, GoalTemplate
from src.db.organizations import Organization
from src.db.template_marketplace import GoalTemplateAuthorization, TemplateAuthorizationStatus
from src.db.users import PublicUser

APPROVED = TemplateAuthorizationStatus.APPROVED.value
REQUESTED = TemplateAuthorizationStatus.REQUESTED.value


def _now() -> str:
    return datetime.now().isoformat()


def approved_on(db: Session, template_id: int | None, org_id: int) -> bool:
    """The template's owner, or an organization with an approved permission to run it."""
    if not template_id:
        return False
    template = db.get(GoalTemplate, template_id)
    if template is not None and int(template.org_id) == int(org_id):
        return True
    return db.exec(select(GoalTemplateAuthorization.id).where(
        GoalTemplateAuthorization.template_id == template_id, GoalTemplateAuthorization.issuer_org_id == org_id,
        GoalTemplateAuthorization.status == APPROVED,
    )).first() is not None


def runnable(db: Session, org_id: int, template_uuid: str) -> GoalTemplate:
    """A template this organization may assign as it is: its own, or another organization's it is approved to run
    (an editable marketplace plan is copied instead, ``template_marketplace.copy``)."""
    from src.services.badges.definition import earns_badge
    from src.services.goals import templates
    from src.services.goals.template_marketplace import TemplateListingMode, listing_of

    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    if template is None:
        raise HTTPException(status_code=404, detail="Goal template not found")
    if int(template.org_id) == int(org_id):
        return template
    listing = listing_of(db, template)
    if approved_on(db, template.id, org_id) and (listing is None or listing.mode == TemplateListingMode.LOCKED.value):
        return template
    # Plans that earn a badge are public (their badge page links them), and an organization knows the plans it asked for;
    # anything else isn't there for it.
    asked = db.exec(select(GoalTemplateAuthorization.id).where(
        GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == org_id)).first()
    if asked is None and not earns_badge(templates.published_version(db, template)):
        raise HTTPException(status_code=404, detail="Goal template not found")
    raise HTTPException(status_code=403, detail="This organization isn't approved to run this plan")


def runnable_ids(db: Session, org_id: int) -> list[int]:
    """Other organizations' templates this one is approved to run as they are (not editable copies)."""
    from src.services.goals.template_marketplace import TemplateListingMode, listing_of

    rows = db.exec(select(GoalTemplate).join(GoalTemplateAuthorization, GoalTemplateAuthorization.template_id == GoalTemplate.id).where(
        GoalTemplateAuthorization.issuer_org_id == org_id, GoalTemplateAuthorization.status == APPROVED, GoalTemplate.org_id != org_id,
    )).all()
    return [int(row.id) for row in rows if (listing := listing_of(db, row)) is None or listing.mode == TemplateListingMode.LOCKED.value]  # type: ignore[arg-type]


def still_runs(db: Session, assignment: GoalAssignment) -> bool:
    """An assignment issues new plans only while its organization may still run the template."""
    template = db.get(GoalTemplate, assignment.template_id)
    if template is None or int(template.org_id) == int(assignment.org_id):
        return template is not None
    return approved_on(db, template.id, assignment.org_id)


def owns(db: Session, org_id: int, template_uuid: str) -> bool:
    return db.exec(select(GoalTemplate.id).where(GoalTemplate.template_uuid == template_uuid, GoalTemplate.org_id == org_id)).first() is not None


def template_view(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Another organization's plan this one runs, as its staff read it: the live release, read-only."""
    from src.services.badges.definition import live_achievement
    from src.services.goals import templates

    templates.require_reader(db, current_user, org_id)
    template = runnable(db, org_id, template_uuid)
    live = templates.published_version(db, template)
    owner = db.get(Organization, template.org_id)
    return {
        "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
        "thumbnail_image": template.thumbnail_image, "published_version": live.number if live else None,
        "published_at": live.published_at if live else None, "org_id": template.org_id,
        "status": getattr(template.status, "value", template.status), "system_type": None, "etag": "",
        "has_unpublished_changes": False, "read_only": True,
        "document": (live.document if live else None) or {"template": {"title": template.title}, "stages": []},
        "versions": [], "badge": live_achievement(db, template),
        "owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug, "logo_image": owner.logo_image, "org_uuid": owner.org_uuid} if owner else None,
    }


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
        .group_by(GoalTemplateAuthorization.status)).all()}
    running = {int(item) for item in db.exec(select(GoalAssignment.org_id).where(GoalAssignment.template_id == template.id).distinct()).all() if item}
    return {
        "authorized_orgs": int(permissions.get(APPROVED, 0)),
        "pending_requests": int(permissions.get(REQUESTED, 0)),
        "orgs_running": len(running),
        "assignments": count(select(func.count()).select_from(GoalAssignment).where(GoalAssignment.template_id == template.id)),
        "active_learners": count(select(func.count(func.distinct(Goal.subject_user_id))).where(
            Goal.template_id == template.id, col(Goal.status).in_([GoalStatus.ACTIVE, GoalStatus.PENDING]))),
        "completions": count(goals.where(Goal.status == GoalStatus.FINISHED)),
        "badges_earned": count(select(func.count()).select_from(BadgeAward).where(BadgeAward.template_id == template.id)),
    }
