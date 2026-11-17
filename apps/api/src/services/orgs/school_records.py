"""Whether an organization uses school records and the Education Plan and Profile (PL-6, DEV-152).

It is one field of the organization's config, ``school_records``. Unset, it follows how the organization
started: schools and districts (and every organization made before /start asked) have it on; a parent,
mentor, program or workplace training space has it off. Organizations that already used school records or
the EPP were set on explicitly by migration ``w6s7c8h9o0o1``. An admin changes it in Org settings.

Off, nothing about school records reaches anyone in that organization: the EPP and school support routes
answer 404 (``require``), a learner's list of schools leaves it out, and Insights has no EPP for it.
Turning it off keeps the data; turning it back on shows it again.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.organization_config import OrganizationConfig
from src.db.users import PublicUser
from src.security.org_auth import require_org_owner_admin
from src.services.school import roles

# /start roles that aren't schools (services/orgs/onboarding.ROLES).
NOT_SCHOOLS = frozenset({"parent", "mentor", "program", "training"})
OFF_DETAIL = "This organization doesn't use school records"


class SchoolRecordsSetting(BaseModel):
    enabled: bool


def enabled_in(config: dict | None) -> bool:
    """On or off, from an organization's config document."""
    config = config or {}
    value = config.get("school_records")
    if isinstance(value, bool):
        return value
    role = (config.get("setup") or {}).get("role")
    return role not in NOT_SCHOOLS


def _row(db: Session, org_id: int) -> OrganizationConfig | None:
    return db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()


def enabled(db: Session, org_id: int) -> bool:
    row = _row(db, org_id)
    return enabled_in(row.config if row else None)


def require(db: Session, org_id: int) -> None:
    """Refuse anything about school records in an organization that has them off."""
    if not enabled(db, org_id):
        raise HTTPException(status_code=404, detail=OFF_DETAIL)


def get_setting(db: Session, current_user: PublicUser, org_id: int) -> dict:
    roles.require_staff(db, current_user.id, org_id)
    return {"enabled": enabled(db, org_id)}


def set_enabled(db: Session, org_id: int, on: bool) -> None:
    row = _row(db, org_id)
    if not row:
        row = OrganizationConfig(org_id=org_id, config={}, creation_date=str(datetime.now()))
    row.config = {**(row.config or {}), "school_records": on}
    row.update_date = str(datetime.now())
    db.add(row)
    db.commit()


def update_setting(db: Session, current_user: PublicUser, org_id: int, payload: SchoolRecordsSetting) -> dict:
    """Admins only: turn school records and the EPP on or off for the organization."""
    require_org_owner_admin(current_user.id, org_id, db)
    set_enabled(db, org_id, payload.enabled)
    return {"enabled": payload.enabled}


def route_guard(org_id: int, db_session: Session = Depends(get_db_session)) -> None:
    """Route dependency for anything under /orgs/{org_id} about school records."""
    require(db_session, org_id)
