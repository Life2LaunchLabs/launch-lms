"""An organization's public page: the plans it offers, the badges they award, and its story.

Listing is opt-in: "List us in Discover" is ``Organization.explore``. A listed page is public,
signed-out visitors included, like any other resource; an unlisted page is for its members only.
Discover's Organizations shelf shows listed organizations whose page meets the bar (a cover, a
tagline and at least one plan anyone can join or request), so it never fills with empty pages.

The page never shows people: no member count, no contact email, no faces.
"""

from __future__ import annotations

import json
import re
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization, OrganizationDiscoverRead, PublicPage, PublicPageUpdate
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser
from src.security.org_auth import require_org_owner_admin
from src.services.user_tests.visibility import is_test_org, org_is_discoverable

MAX_HIGHLIGHTS = 3
MAX_HIGHLIGHT_LENGTH = 60
MAX_PINNED = 3
SOCIALS = ("twitter", "facebook", "instagram", "linkedin", "youtube")
URL = re.compile(r"^https?://\S+$", re.IGNORECASE)


def page_of(org_config: OrganizationConfig | None) -> PublicPage:
    raw = ((org_config.config if org_config else None) or {}).get("page") or {}
    try:
        return PublicPage.model_validate(raw)
    except ValueError:
        return PublicPage()


def plan_stats(db: Session, org_id: int, page: PublicPage) -> tuple[int, int]:
    """How many plans the organization offers on its page (hidden ones left out), and how many earn a badge."""
    from src.services.badges.definition import summary
    from src.services.goals.plan_joining import offers

    hidden = set(page.hidden_plans)
    plans: dict[str, bool] = {}
    for offer in offers(db, org_id):
        uuid = offer.template.template_uuid
        if uuid not in hidden and uuid not in plans:
            plans[uuid] = summary(offer.template, offer.version.document or {}) is not None
    return len(plans), sum(plans.values())


def missing(org: Organization, plan_count: int) -> list[str]:
    """What the page still needs before Discover can list it."""
    gaps = []
    if not org.thumbnail_image:
        gaps.append("cover")
    if not (org.description or "").strip():
        gaps.append("tagline")
    if plan_count < 1:
        gaps.append("plan")
    return gaps


def is_member(db: Session, current_user: PublicUser | AnonymousUser, org_id: int | None) -> bool:
    if isinstance(current_user, AnonymousUser) or not org_id:
        return False
    return db.exec(select(UserOrganization.id).where(
        UserOrganization.user_id == current_user.id, UserOrganization.org_id == org_id)).first() is not None


def can_view(db: Session, current_user: PublicUser | AnonymousUser, org: Organization, member: bool) -> bool:
    """A listed page is public; an unlisted one opens for its members. Test orgs stay sealed to their own run."""
    if not org_is_discoverable(db, current_user, org.id):
        return False
    return bool(org.explore) or member or is_test_org(db, org.id)


def discover_read(db: Session, org: Organization, org_config: OrganizationConfig | None, member: bool, owner_id: int | None) -> OrganizationDiscoverRead:
    from src.services.orgs.orgs import _build_org_read_with_access, _extract_signup_mode_from_config

    payload = _build_org_read_with_access(org, org_config, owner_id).model_dump()
    page = page_of(org_config)
    plan_count, badge_count = plan_stats(db, int(org.id), page)  # type: ignore[arg-type]
    complete = not missing(org, plan_count)
    payload.update({
        "config": None,
        "email": payload["email"] if member else "",
        "signup_mode": _extract_signup_mode_from_config(org_config),
        "is_member": member,
        "page": page.model_dump(),
        "plan_count": plan_count,
        "badge_count": badge_count,
        "complete": complete,
        "listed": bool(org.explore) and complete,
    })
    return OrganizationDiscoverRead.model_validate(payload)


def _clean_url(value: str, field: str) -> str:
    value = value.strip()
    if value and not URL.match(value):
        raise HTTPException(status_code=422, detail=f"The {field} link must start with http:// or https://")
    return value


def update_public_page(db: Session, current_user: PublicUser, org_id: int, payload: PublicPageUpdate) -> OrganizationDiscoverRead:
    """Save the Public page tab. Turning listing on needs a complete page."""
    from src.security.access.access import owner_org_id

    require_org_owner_admin(current_user.id, org_id, db)
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    org_config = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    page = page_of(org_config)

    if payload.description is not None:
        org.description = payload.description.strip()
    if payload.about is not None:
        org.about = payload.about.strip()
    if payload.socials is not None:
        socials = dict(org.socials or {})
        for key, value in payload.socials.items():
            if key in SOCIALS:
                socials[key] = _clean_url(value or "", key)
        org.socials = socials
    if payload.city is not None:
        page.city = payload.city.strip()
    if payload.website is not None:
        page.website = _clean_url(payload.website, "website")
    if payload.highlights is not None:
        page.highlights = [item.strip()[:MAX_HIGHLIGHT_LENGTH] for item in payload.highlights if item.strip()][:MAX_HIGHLIGHTS]
    if payload.hidden_plans is not None:
        page.hidden_plans = list(dict.fromkeys(payload.hidden_plans))
    if payload.pinned_plans is not None:
        page.pinned_plans = list(dict.fromkeys(payload.pinned_plans))[:MAX_PINNED]
    page.pinned_plans = [uuid for uuid in page.pinned_plans if uuid not in set(page.hidden_plans)]

    if payload.listed is not None:
        if payload.listed:
            plan_count, _ = plan_stats(db, org_id, page)
            gaps = missing(org, plan_count)
            if gaps:
                raise HTTPException(status_code=409, detail={"message": "Finish the page before listing it in Discover", "missing": gaps})
        org.explore = payload.listed

    now = str(datetime.now())
    org.update_date = now
    if org_config is None:
        org_config = OrganizationConfig(org_id=org_id, config={}, creation_date=now)
    config = json.loads(json.dumps(org_config.config or {}))
    config["page"] = page.model_dump()
    org_config.config = config
    org_config.update_date = now
    db.add(org)
    db.add(org_config)
    db.commit()
    db.refresh(org)
    db.refresh(org_config)
    return discover_read(db, org, org_config, True, owner_org_id(db))


def listed_orgs(db: Session, current_user: PublicUser | AnonymousUser, query: str = "", limit: int = 24) -> list[OrganizationDiscoverRead]:
    """Discover's Organizations shelf and search: listed organizations whose page is complete,
    the viewer's own first, then the ones offering the most plans."""
    from src.security.access.access import owner_org_id
    from src.services.user_tests.visibility import discoverable_orgs

    statement = (select(Organization, OrganizationConfig)
                 .outerjoin(OrganizationConfig, OrganizationConfig.org_id == Organization.id)
                 .where(Organization.explore == True, col(Organization.thumbnail_image).is_not(None))  # noqa: E712
                 .where(discoverable_orgs(db, current_user, Organization.id)))
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(Organization.name.ilike(pattern) | Organization.description.ilike(pattern))  # type: ignore[union-attr]
    rows = db.exec(statement.order_by(Organization.name, Organization.id)).all()
    member_of = set()
    if not isinstance(current_user, AnonymousUser) and rows:
        member_of = set(db.exec(select(UserOrganization.org_id).where(
            UserOrganization.user_id == current_user.id,
            col(UserOrganization.org_id).in_([org.id for org, _ in rows]))).all())
    owner_id = owner_org_id(db)
    reads = [discover_read(db, org, org_config, org.id in member_of, owner_id) for org, org_config in rows]
    reads = [read for read in reads if read.listed]
    reads.sort(key=lambda read: (not read.is_member, -read.plan_count, read.name.lower()))
    return reads[:limit]
