"""The Full trial: a Free organization can try Full once, for TRIAL_DAYS.

Starting it writes ``trial`` on the org's config; access reads it (see security/access). When it
ends the org is back on Free: nothing is deleted, groups stay readable, and adding people or
groups waits until the org is under Free's limits or a superadmin approves Full.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.organization_config import OrganizationConfig
from src.security.access.access import org_access
from src.security.access.catalog import TRIAL_DAYS, TRIAL_TIER


def start(db: Session, org_id: int, now: datetime | None = None) -> dict:
    """Start the org's one trial and return its access."""
    access = org_access(org_id, db)
    if not access.trial_available():
        raise HTTPException(status_code=409, detail="This organization has already tried Full" if access.trial else "This organization already has Full")
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Organization config not found")
    started = now or datetime.now(timezone.utc)
    trial = {"tier": TRIAL_TIER, "started_at": started.isoformat(), "ends_at": (started + timedelta(days=TRIAL_DAYS)).isoformat()}
    # A new dict, so the JSON column sees the change.
    row.config = {**(row.config or {}), "trial": trial}
    row.update_date = started.isoformat()
    db.add(row)
    db.commit()
    return org_access(org_id, db).to_dict()
