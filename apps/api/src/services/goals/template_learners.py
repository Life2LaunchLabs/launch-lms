"""Who may start a plan in the organization running it, and the badge it earns there.

For a template the organization runs (its own, or another organization's it may run) this
answers who may start it here (``plan_access``) and whether finishing it here earns its
badge. The learner setting is the running organization's own, so its admins change it even
when the template itself is read-only to them.
"""

from __future__ import annotations

from sqlmodel import Session

from src.db.goals import GoalTemplate
from src.db.template_marketplace import TemplateLearnerAccessUpdate
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.badges.awards import runs_plan
from src.services.badges.definition import badge_summary
from src.services.goals import plan_access, plan_issuers, templates


def _template(db: Session, org_id: int, template_uuid: str) -> GoalTemplate:
    """The organization's own template, or another organization's it may run (404/403 otherwise)."""
    if plan_issuers.owns(db, org_id, template_uuid):
        return templates.template_or_404(db, org_id, template_uuid)
    return plan_issuers.runnable(db, org_id, template_uuid)


def template_learners(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Who may start this plan in this organization, and the badge its live release earns."""
    templates.require_reader(db, current_user, org_id)
    template = _template(db, org_id, template_uuid)
    badge = badge_summary(db, template)
    return {
        "template_uuid": template.template_uuid, "access": plan_access.access_of(db, template.id, org_id),
        "can_edit": templates.can_edit(db, current_user, org_id), "owned": int(template.org_id) == int(org_id),
        "badge": badge, "earns_badge": badge is not None and runs_plan(db, template, org_id),
    }


def set_template_access(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: TemplateLearnerAccessUpdate) -> dict:
    """The running organization says who may start this plan: open, by request, or invited learners only."""
    require_org_admin(current_user.id, org_id, db)
    template = _template(db, org_id, template_uuid)
    plan_access.set_access(db, int(template.id), org_id, payload.access, current_user.id)  # type: ignore[arg-type]
    db.commit()
    return template_learners(db, current_user, org_id, template_uuid)
