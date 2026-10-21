"""Other organizations' badge templates an organization runs, as its admins see them.

The organization doesn't own these templates, so it reads the published
version (never the owner's draft) and can't edit them; it assigns them like its
own (``assignments.assign``) and decides per assignment when to move to a new
version (``assignment_versions``). See ``badge_authority`` for who may run what.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.goals import GoalAssignment, GoalTemplate
from src.db.learning import LearningBadge
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.services.goals import badge_authority, templates
from src.services.goals.assignment_summary import assignment_dict
from src.services.goals.badges import badge_routes
from src.services.goals.plan_issuers import issued_badge_ids


def _template_ref(db: Session, template: GoalTemplate) -> dict:
    live = templates.published_version(db, template)
    return {
        "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "",
        "thumbnail_image": template.thumbnail_image, "published_version": live.number if live else None,
        "published_at": live.published_at if live else None,
    }


def issuer_routes(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Badge routes of other organizations this one may run, each with its assignments here."""
    templates.require_reader(db, current_user, org_id)
    # Staff who aren't admins see only the assignments they staff, as on the Assignments list.
    sees_all = templates.can_edit(db, current_user, org_id)
    badges = db.exec(
        select(LearningBadge).where(col(LearningBadge.id).in_(issued_badge_ids(db, [org_id]) or {0}), col(LearningBadge.deleted_at).is_(None))
        .order_by(LearningBadge.name)
    ).all()
    result = []
    for badge in badges:
        for route, template in badge_routes(db, badge):
            if not badge_authority.may_run(db, badge, org_id, route):
                continue
            rows = db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id, GoalAssignment.template_id == template.id,
                                                        GoalAssignment.badge_id == badge.id).order_by(col(GoalAssignment.id).desc())).all()
            if not sees_all:
                rows = [row for row in rows if current_user.id in (row.staff_user_ids or [])]
            result.append({
                "route_uuid": route.route_uuid, "badge": badge_authority.badge_ref(db, badge), **badge_authority.rule_of(route),
                "template": _template_ref(db, template), "assignments": [assignment_dict(db, row) for row in rows],
            })
    return result


def template_view(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Another organization's badge template as this one may read it: the published version, read-only."""
    templates.require_reader(db, current_user, org_id)
    template, badge = badge_authority.runnable(db, org_id, template_uuid)
    live = templates.published_version(db, template)
    route = badge_authority.route_for(db, badge.id if badge else None, template.id)
    owner = db.get(Organization, template.org_id)
    badge_view = {**badge_authority.badge_ref(db, badge), **(badge_authority.rule_of(route) if route else {})} if badge else None
    return {
        **_template_ref(db, template), "org_id": template.org_id, "status": getattr(template.status, "value", template.status),
        "system_type": None, "etag": "", "has_unpublished_changes": False, "read_only": True,
        "document": (live.document if live else None) or {"template": {"title": template.title}, "stages": []},
        "versions": [], "badge": badge_view, "badges": [badge_view] if badge_view else [],
        "owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None,
    }


def owns(db: Session, org_id: int, template_uuid: str) -> bool:
    return db.exec(select(GoalTemplate.id).where(GoalTemplate.template_uuid == template_uuid, GoalTemplate.org_id == org_id)).first() is not None

