"""Learners an organization removed with its data (OP-3, DEV-187). The account stays the learner's, but they can't
come back on their own: Join on an open organization, a shared join link and joining one of its plans are refused,
and its page shows them invite only. The organization lets them back by inviting them or approving their request to
join, which clears the removal."""

from __future__ import annotations

import datetime as dt

from fastapi import HTTPException
from sqlalchemy import delete as sql_delete
from sqlmodel import Session, select

from src.db.organization_removals import OrganizationRemoval
from src.db.organizations import Organization


def note(db: Session, org_id: int, user_id: int, removed_by: int | None) -> None:
    """Remember the removal (doesn't commit)."""
    if is_removed(db, org_id, user_id):
        return
    db.add(OrganizationRemoval(org_id=org_id, user_id=user_id, removed_by_user_id=removed_by,
                               creation_date=dt.datetime.now().isoformat(timespec="seconds")))


def is_removed(db: Session, org_id: int, user_id: int | None) -> bool:
    if not user_id:
        return False
    return db.exec(select(OrganizationRemoval.id).where(OrganizationRemoval.org_id == org_id,
                                                        OrganizationRemoval.user_id == user_id)).first() is not None


def removed_from(db: Session, user_id: int | None, org_ids: list[int]) -> set[int]:
    if not user_id or not org_ids:
        return set()
    return set(db.exec(select(OrganizationRemoval.org_id).where(OrganizationRemoval.user_id == user_id,
                                                                OrganizationRemoval.org_id.in_(org_ids))).all())  # type: ignore[attr-defined]


def clear(db: Session, org_id: int, user_id: int) -> None:
    """The organization let them back in (doesn't commit)."""
    db.exec(sql_delete(OrganizationRemoval).where(OrganizationRemoval.org_id == org_id, OrganizationRemoval.user_id == user_id))  # type: ignore[call-overload]


def refuse_self_join(db: Session, org_id: int, user_id: int | None) -> None:
    """403 when the learner was removed and is trying to come back without the organization's say."""
    if is_removed(db, org_id, user_id):
        org = db.get(Organization, org_id)
        name = org.name if org else "This organization"
        raise HTTPException(status_code=403, detail=f"{name} removed you. You can join again if they invite you.")
