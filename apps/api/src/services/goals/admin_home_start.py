"""Getting started: the first things a new organization's admin does, ticked off from the org's own data.

Admins see it on Home until every required step is done or they dismiss it. Each step is
done when the data says so, never by clicking it:

- ``plan``: the org has a plan template of its own (made, copied or added from the Marketplace).
- ``organization``: the org has a description or a logo.
- ``learners``: someone has joined as a learner.
- ``staff`` (optional): someone besides the viewer has joined as an admin or staff member.
- ``assign``: a plan has been handed out.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import GoalAssignment, GoalTemplate
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import get_user_org
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS, ADMIN_ROLE_ID, LEARNER_ROLE_ID

DISMISSED_KEY = "getting_started_dismissed"
STEPS = ("plan", "organization", "learners", "staff", "assign")
OPTIONAL = frozenset({"staff"})


def _exists(db: Session, statement) -> bool:
    return db.exec(statement.limit(1)).first() is not None


def steps(db: Session, org_id: int, viewer_id: int) -> dict[str, bool]:
    """Which getting-started steps this org has done."""
    org = db.get(Organization, org_id)
    members = select(UserOrganization.id).where(UserOrganization.org_id == org_id)
    return {
        "plan": _exists(db, select(GoalTemplate.id).where(GoalTemplate.org_id == org_id, col(GoalTemplate.system_type).is_(None))),
        "organization": bool(org and ((org.description or "").strip() or org.logo_image)),
        "learners": _exists(db, members.where(UserOrganization.role_id == LEARNER_ROLE_ID, UserOrganization.user_id != viewer_id)),
        "staff": _exists(db, members.where(col(UserOrganization.role_id).in_(ADMIN_OR_MAINTAINER_ROLE_IDS), UserOrganization.user_id != viewer_id)),
        "assign": _exists(db, select(GoalAssignment.id).where(GoalAssignment.org_id == org_id)),
    }


def getting_started(db: Session, current_user: PublicUser, org_id: int) -> dict | None:
    """The checklist for an admin of the org, or None once it's dismissed or finished, and for anyone else."""
    membership = get_user_org(current_user.id, org_id, db)
    if not membership or membership.role_id != ADMIN_ROLE_ID or (membership.preferences or {}).get(DISMISSED_KEY):
        return None
    done = steps(db, org_id, current_user.id)
    required = [key for key in STEPS if key not in OPTIONAL]
    if all(done[key] for key in required):
        return None
    return {
        "steps": [{"key": key, "done": done[key], "optional": key in OPTIONAL} for key in STEPS],
        "done": sum(done[key] for key in STEPS),
        "total": len(STEPS),
    }


def dismiss(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Hide the checklist for this admin in this org."""
    membership = get_user_org(current_user.id, org_id, db)
    if not membership or membership.role_id != ADMIN_ROLE_ID:
        raise HTTPException(status_code=403, detail="Only admins of this organization see getting started")
    # A new dict, so the JSON column sees the change.
    membership.preferences = {**(membership.preferences or {}), DISMISSED_KEY: True}
    db.add(membership)
    db.commit()
    return {"dismissed": True}

