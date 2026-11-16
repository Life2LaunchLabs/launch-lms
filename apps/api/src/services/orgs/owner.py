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


def ensure_owner_membership(db_session: Session, user_id: int) -> None:
    """Every account belongs to the owner organization (Life2Launch itself) as well as any it joined.

    Without it, someone who signs up through another organization's invitation is a stranger on the
    main site: a "join" banner over everything and no way back to their own organization (FEED-172).
    Adds the learner membership to the session; the caller commits.
    """
    from datetime import datetime

    from src.db.user_organizations import UserOrganization

    owner = owner_org(db_session)
    if not owner or not owner.id:
        return
    if db_session.exec(select(UserOrganization.id).where(UserOrganization.user_id == user_id, UserOrganization.org_id == owner.id)).first():
        return
    now = str(datetime.now())
    db_session.add(UserOrganization(user_id=user_id, org_id=int(owner.id), role_id=4, creation_date=now, update_date=now))
