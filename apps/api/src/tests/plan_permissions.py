"""Test helper: the state after migration a8c4e1f7d2b9, where approved badge issuers hold the plan permissions."""

import importlib.util
from pathlib import Path

from src.db.template_marketplace import BadgeRoutePartner, GoalTemplateAuthorization

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "a8c4e1f7d2b9_plan_permission_issues_badges.py"


def migration():
    spec = importlib.util.spec_from_file_location("plan_permission_issues_badges_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def approve_badge_issuers_on_plans(db) -> int:
    """Copy each approved badge issuer onto the badge's plans, as the migration does (committed)."""
    for model in (GoalTemplateAuthorization, BadgeRoutePartner):
        model.__table__.create(db.get_bind(), checkfirst=True)
    written = migration().backfill(db.connection())
    db.commit()
    return written


def set_plan_permission(db, org_id: int, status: str, template_id: int | None = None) -> None:
    """Change an organization's permission on one plan (or all of them), committed."""
    from sqlmodel import select

    statement = select(GoalTemplateAuthorization).where(GoalTemplateAuthorization.issuer_org_id == org_id)
    if template_id is not None:
        statement = statement.where(GoalTemplateAuthorization.template_id == template_id)
    for row in db.exec(statement).all():
        row.status = status
        db.add(row)
    db.commit()
