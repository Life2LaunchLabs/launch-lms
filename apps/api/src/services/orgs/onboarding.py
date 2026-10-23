"""Getting started at /start: plans suggested for a role, then one call that sets up the space.

Everything picked before the account exists (role, plans, name, colors) is sent together once the
person is signed in. ``set_up`` makes the organization (a personal space for solo roles that don't
name one), makes them its admin, adds the picked plans from Discover, and starts the Full trial when
asked. Calling it again returns the space it already made, so a refresh can't make two.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization, OrganizationCreate
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.goals import discover

ROLES = ("parent", "mentor", "teacher", "program", "district")
SOLO_ROLES = {"parent", "mentor"}
# The plan categories each role sees first (services/goals/collections.CATEGORIES).
ROLE_CATEGORIES = {
    "parent": ["Life skills", "Financial literacy", "College and training"],
    "mentor": ["Career exploration", "Portfolio", "Life skills"],
    "teacher": ["College and training", "Career exploration", "Portfolio"],
    "program": ["Work-based learning", "Career exploration", "Civic and community", "Wellbeing"],
    "district": ["College and training", "Career exploration", "Work-based learning"],
}
SUGGESTED = 6
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class SetUpRequest(BaseModel):
    role: str
    name: str = Field(default="", max_length=120)
    # Empty for a personal space.
    org_name: str = Field(default="", max_length=120)
    color: str = ""
    plan_uuids: list[str] = Field(default_factory=list, max_length=20)
    trial: bool = False


def _role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Pick one of: {', '.join(ROLES)}")
    return role


def suggested(db: Session, role: str) -> list[dict]:
    """Shared plans anyone may add without asking, the role's categories first. Readable before signing in."""
    categories = ROLE_CATEGORIES[_role(role)]
    catalog = discover._catalog(db, 0)
    plans = [plan for plan in catalog["plans"] if plan["access"] == "open"]

    def rank(plan: dict) -> tuple:
        hits = [categories.index(category) for category in plan["categories"] if category in categories]
        return (min(hits) if hits else len(categories), not plan["partner"], plan["title"])

    return [{
        "template_uuid": plan["template_uuid"], "title": plan["title"], "description": plan["description"],
        "thumbnail_image": plan["thumbnail_image"], "step_count": plan["step_count"], "stage_count": plan["stage_count"],
        "categories": plan["categories"], "badge": bool(plan["badges"]), "creator_org": plan["creator_org"],
    } for plan in sorted(plans, key=rank)[:SUGGESTED]]


def _slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "space"
    slug, n = base, 1
    while db.exec(select(Organization.id).where(Organization.slug == slug)).first() is not None:
        n += 1
        slug = f"{base}-{n}"
    return slug


def _made_by(db: Session, user_id: int) -> Organization | None:
    """The space this person already set up here, if any."""
    org_ids = db.exec(select(UserOrganization.org_id).where(UserOrganization.user_id == user_id, UserOrganization.role_id == 1)).all()
    if not org_ids:
        return None
    for row in db.exec(select(OrganizationConfig).where(col(OrganizationConfig.org_id).in_(list(org_ids)))).all():
        if ((row.config or {}).get("setup") or {}).get("created_by_user_id") == user_id:
            return db.get(Organization, row.org_id)
    return None


def _space_name(user: User, payload: SetUpRequest) -> str:
    if payload.org_name.strip():
        return payload.org_name.strip()
    first = (payload.name.strip() or user.first_name or "").split(" ")[0]
    if first:
        return f"{first}’s space"
    return f"{user.email.split('@')[0]}’s space"


async def set_up(request: Request, db: Session, current_user: PublicUser, payload: SetUpRequest) -> dict:
    from src.services.orgs.orgs import create_org
    from src.services.orgs import trial

    role = _role(payload.role)
    if payload.color and not HEX.match(payload.color):
        raise HTTPException(status_code=422, detail="Color must look like #2F66D6")
    user = db.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first")
    if payload.name.strip():
        first, _, last = payload.name.strip().partition(" ")
        user.first_name, user.last_name = first, last.strip()
        db.add(user)
        db.commit()

    org = _made_by(db, int(user.id or 0))
    if org is None:
        name = _space_name(user, payload)
        slug = _slug(db, name)
        await create_org(request, OrganizationCreate(name=name, slug=slug, email=user.email, description="", label=""), current_user, db)
        org = db.exec(select(Organization).where(Organization.slug == slug)).one()
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)).one()
    config = dict(row.config or {})
    customization = dict(config.get("customization") or {})
    if payload.color:
        customization["general"] = {**(customization.get("general") or {}), "color": payload.color}
    setup = dict(config.get("setup") or {})
    setup.update({"role": role, "solo": role in SOLO_ROLES and not payload.org_name.strip(), "created_by_user_id": user.id,
                  "completed_at": setup.get("completed_at") or datetime.now(timezone.utc).isoformat()})
    row.config = {**config, "customization": customization, "setup": setup}
    db.add(row)
    db.commit()

    added, failed = [], []
    for uuid in dict.fromkeys(payload.plan_uuids):
        try:
            result = discover.add_plan(db, current_user, int(org.id or 0), uuid)
            added.append({"template_uuid": uuid, "status": result["status"], "local_template_uuid": result["local_template_uuid"]})
        except HTTPException as error:
            db.rollback()
            failed.append({"template_uuid": uuid, "detail": error.detail})
    trial_started = False
    if payload.trial:
        try:
            trial.start(db, int(org.id or 0))
            trial_started = True
        except HTTPException:
            db.rollback()
    return {"org": {"id": org.id, "slug": org.slug, "name": org.name}, "added": added, "failed": failed, "trial": trial_started}
