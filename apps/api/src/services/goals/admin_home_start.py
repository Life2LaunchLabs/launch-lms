"""Getting started: the first things a new organization's admin does, ticked off from the org's own data.

Admins see it on Home until they dismiss it, done or not. Each step is
done when the data says so, never by clicking it, so whatever /start already did shows as done:

- ``plan``: the org has a plan template of its own (made, copied or added from Discover).
- ``organization``: the org has a description or a logo (optional once /start named and colored it).
- ``staff`` (optional): someone besides the viewer is staff or an admin, or has been invited as one.
- ``groups`` (orgs with groups): the org has a group.
- ``requirements`` (optional, orgs with groups): the org tracks a requirement framework.
- ``learners``: a learner has joined or been invited.
- ``assign``: a plan has been handed out.

Orgs without groups (Free) get plan, organization, learners and assign.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.goals import GoalAssignment, GoalTemplate
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.requirements import RequirementFramework
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.security.access.access import org_access
from src.db.users import PublicUser
from src.security.org_auth import get_user_org
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS, ADMIN_ROLE_ID, LEARNER_ROLE_ID

DISMISSED_KEY = "getting_started_dismissed"
STEPS = ("plan", "organization", "staff", "groups", "requirements", "learners", "assign")
FREE_STEPS = ("plan", "organization", "learners", "assign")
OPTIONAL = frozenset({"staff", "requirements"})


def _count(db: Session, statement) -> int:
    return len(db.exec(statement).all())


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def _setup(db: Session, org_id: int) -> dict:
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    return ((row.config if row else None) or {}).get("setup") or {}


def counts(db: Session, org_id: int, viewer_id: int) -> dict[str, int]:
    """How much of each getting-started step this org has: a step is done once its count is above zero."""
    org = db.get(Organization, org_id)
    members = select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id != viewer_id)
    invited = select(OrganizationInvitation.id).where(OrganizationInvitation.org_id == org_id, OrganizationInvitation.status == "pending")
    staff_roles = list(ADMIN_OR_MAINTAINER_ROLE_IDS)
    return {
        "plan": _count(db, select(GoalTemplate.id).where(GoalTemplate.org_id == org_id, col(GoalTemplate.system_type).is_(None))),
        "organization": int(bool(org and ((org.description or "").strip() or org.logo_image))),
        "staff": _count(db, members.where(col(UserOrganization.role_id).in_(staff_roles)))
        + _count(db, invited.where(col(OrganizationInvitation.role_id).in_(staff_roles))),
        "groups": _count(db, select(UserGroup.id).where(UserGroup.org_id == org_id)),
        "requirements": _count(db, select(RequirementFramework.id).where(RequirementFramework.org_id == org_id)),
        "learners": _count(db, members.where(UserOrganization.role_id == LEARNER_ROLE_ID))
        + _count(db, invited.where(OrganizationInvitation.role_id == LEARNER_ROLE_ID)),
        "assign": _count(db, select(GoalAssignment.id).where(GoalAssignment.org_id == org_id)),
    }


def steps(db: Session, org_id: int, viewer_id: int) -> dict[str, bool]:
    """Which getting-started steps this org has done."""
    return {key: count > 0 for key, count in counts(db, org_id, viewer_id).items()}


NOTES = {"plan": "plan", "staff": "staff member", "groups": "group", "requirements": "framework", "learners": "learner"}


def _note(key: str, count: int) -> str | None:
    """What a done step has: "3 plans", "2 learners"."""
    return _plural(count, NOTES[key]) if count and key in NOTES else None


def getting_started(db: Session, current_user: PublicUser, org_id: int) -> dict | None:
    """The checklist for an admin of the org, or None once it's dismissed, and for anyone else."""
    membership = get_user_org(current_user.id, org_id, db)
    if not membership or membership.role_id != ADMIN_ROLE_ID or (membership.preferences or {}).get(DISMISSED_KEY):
        return None
    setup = _setup(db, org_id)
    keys = STEPS if org_access(org_id, db).has("groups") else FREE_STEPS
    # /start already named and colored the space, so the details page is a nice-to-have.
    optional = OPTIONAL | ({"organization"} if setup else set())
    have = counts(db, org_id, current_user.id)
    return {
        "steps": [{
            "key": key, "done": have[key] > 0, "optional": key in optional,
            "note": _note(key, have[key]),
        } for key in keys],
        "done": sum(have[key] > 0 for key in keys),
        "total": len(keys),
        "from_setup": bool(setup),
        # Every required step is done; it stays until the admin dismisses it.
        "complete": all(have[key] for key in keys if key not in optional),
    }

