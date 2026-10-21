"""The owner organization: the instance's first organization, which runs the platform."""

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.organizations import Organization


def owner_org(db_session: Session) -> Organization | None:
    return db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()  # type: ignore[arg-type]


def require_owner_org(db_session: Session) -> Organization:
    org = owner_org(db_session)
    if not org:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return org
