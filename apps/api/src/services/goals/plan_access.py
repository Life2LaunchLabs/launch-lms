"""Who can start a plan: each organization's learner access for each plan template it runs.

For every (organization, template) pair, whether the organization's own template or another
organization's it is approved to run, the organization says who may start it:

- ``open``: any learner starts right away.
- ``request``: learners ask; the organization accepts or declines.
- ``invite``: only learners the organization adds (the default; no row means invite).

Plans run ``open`` or by ``request`` are what learners find in Discover (``goals/plan_joining``).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, col, select

from src.db.template_marketplace import GoalTemplateLearnerAccess

LEVELS: tuple[str, ...] = ("invite", "request", "open")
DEFAULT = "invite"
OFFERED = ("open", "request")


def _has_table(db: Session) -> bool:
    return inspect(db.connection()).has_table(GoalTemplateLearnerAccess.__tablename__)


def accesses(db: Session, template_ids: Iterable[int], org_ids: Iterable[int] | None = None) -> dict[tuple[int, int], str]:
    """(template id, org id) -> access, for the rows that exist."""
    ids = {int(item) for item in template_ids if item}
    if not ids or not _has_table(db):
        return {}
    statement = select(GoalTemplateLearnerAccess).where(col(GoalTemplateLearnerAccess.template_id).in_(ids))
    if org_ids is not None:
        statement = statement.where(col(GoalTemplateLearnerAccess.org_id).in_({int(item) for item in org_ids}))
    return {(row.template_id, row.org_id): row.access for row in db.exec(statement).all()}


def access_of(db: Session, template_id: int | None, org_id: int) -> str:
    if not template_id:
        return DEFAULT
    return accesses(db, [template_id], [org_id]).get((int(template_id), int(org_id)), DEFAULT)


def set_access(db: Session, template_id: int, org_id: int, access: str, user_id: int | None) -> None:
    """Store an organization's learner access for a template (flushed, not committed)."""
    if access not in LEVELS:
        raise HTTPException(status_code=422, detail="Learner access must be open, request, or invite")
    row = db.exec(select(GoalTemplateLearnerAccess).where(
        GoalTemplateLearnerAccess.template_id == template_id, GoalTemplateLearnerAccess.org_id == org_id,
    )).first()
    now = datetime.now().isoformat()
    if row is None:
        row = GoalTemplateLearnerAccess(template_id=template_id, org_id=org_id, creation_date=now)
    row.access, row.updated_by_user_id, row.update_date = access, user_id, now
    db.add(row)
    db.flush()
