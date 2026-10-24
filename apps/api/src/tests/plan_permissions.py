"""Test helpers: permission to run another organization's plan (``GoalTemplateAuthorization``)."""

from sqlmodel import select

from src.db.goals import GoalTemplate
from src.db.template_marketplace import GoalTemplateAuthorization


def approve_on_plans(db, org_id: int, template_ids: list[int], now: str = "2026-01-01T00:00:00") -> int:
    """Approve the organization on these plans, committed; returns how many approvals were written."""
    GoalTemplateAuthorization.__table__.create(db.get_bind(), checkfirst=True)
    written = 0
    for template in db.exec(select(GoalTemplate).where(GoalTemplate.id.in_(template_ids))).all():  # type: ignore[union-attr]
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
