"""Test helpers: permission to issue a badge is approval on its plans (``GoalTemplateAuthorization``)."""

import importlib.util
from pathlib import Path

from sqlmodel import select

from src.db.badge_routes import BadgeRoute
from src.db.goals import GoalTemplate
from src.db.template_marketplace import GoalTemplateAuthorization

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "a8c4e1f7d2b9_plan_permission_issues_badges.py"


def migration():
    spec = importlib.util.spec_from_file_location("plan_permission_issues_badges_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def approve_on_plans(db, org_id: int, badge_id: int | None = None, now: str = "2026-01-01T00:00:00") -> int:
    """Approve the organization on every plan route (of one badge, or all), committed; returns how many."""
    GoalTemplateAuthorization.__table__.create(db.get_bind(), checkfirst=True)
    statement = select(BadgeRoute, GoalTemplate).join(GoalTemplate, GoalTemplate.id == BadgeRoute.goal_template_id)
    if badge_id is not None:
        statement = statement.where(BadgeRoute.badge_id == badge_id)
    written = 0
    for route, template in db.exec(statement).all():
        if int(template.org_id) == int(org_id) or db.exec(select(GoalTemplateAuthorization).where(
                GoalTemplateAuthorization.template_id == template.id, GoalTemplateAuthorization.issuer_org_id == org_id)).first():
            continue
        db.add(GoalTemplateAuthorization(authorization_uuid=f"template_auth_{template.id}_{org_id}", template_id=int(template.id), creator_org_id=template.org_id,
                                         issuer_org_id=org_id, status="approved", creation_date=now, update_date=now))
        written += 1
    db.commit()
    return written


def set_plan_permission(db, org_id: int, status: str, template_id: int | None = None) -> None:
    """Change an organization's permission on one plan (or all of them), committed."""
    statement = select(GoalTemplateAuthorization).where(GoalTemplateAuthorization.issuer_org_id == org_id)
    if template_id is not None:
        statement = statement.where(GoalTemplateAuthorization.template_id == template_id)
    for row in db.exec(statement).all():
        row.status = status
        db.add(row)
    db.commit()
