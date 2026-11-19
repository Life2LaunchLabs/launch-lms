"""Ask a learner whose only email is a school or work one to add a personal email (DEV-198, PF-2).

They lose the school address when they leave, and with it the way into their account. The prompt goes to learners
of a school (not staff) with no spare email whose main email the school gave or vouched for: it came from Canvas, an
invitation they accepted was sent to it, or it's on a domain one of their school's join links asks for. They can
dismiss it; once they're alumni somewhere it comes back, since that's when the school address is about to go.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, col, select

from src.db.canvas import CanvasUserLink
from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.user_emails import UserEmail
from src.db.user_organizations import UserOrganization
from src.db.users import User

LEARNER_ROLE_ID = 4
DETAILS_KEY = "personal_email_prompt"


def _school_rows(db: Session, user_id: int) -> list[UserOrganization]:
    from src.services.orgs.owner import owner_org

    owner = owner_org(db)
    return [row for row in db.exec(select(UserOrganization).where(UserOrganization.user_id == user_id)).all()
            if owner is None or row.org_id != owner.id]


def _school_given(db: Session, user: User, org_ids: list[int]) -> bool:
    from src.services.users.account_emails import normalize

    email = normalize(str(user.email or ""))
    if db.exec(select(CanvasUserLink.id).where(CanvasUserLink.user_id == user.id)).first():
        return True
    if db.exec(select(OrganizationInvitation.id).where(
        OrganizationInvitation.email_normalized == email, OrganizationInvitation.status == "accepted",
    )).first():
        return True
    domains = db.exec(select(OrganizationJoinLink.approved_email_domain).where(
        col(OrganizationJoinLink.org_id).in_(org_ids), col(OrganizationJoinLink.approved_email_domain).is_not(None),
    )).all()
    return any(email.endswith(f"@{domain.strip().lower()}") for domain in domains if domain)


def should_prompt(db: Session, user: User) -> bool:
    if db.exec(select(UserEmail.id).where(UserEmail.user_id == user.id)).first():
        return False
    rows = _school_rows(db, int(user.id))  # type: ignore[arg-type]
    if not rows or any(row.role_id != LEARNER_ROLE_ID for row in rows):
        return False
    if not _school_given(db, user, [row.org_id for row in rows]):
        return False
    dismissed = (user.details or {}).get(DETAILS_KEY) or {}
    if not dismissed.get("dismissed_at"):
        return True
    alumni_now = any(row.status == "alumni" for row in rows)
    return alumni_now and not dismissed.get("alumni")


def dismiss(db: Session, user: User) -> None:
    rows = _school_rows(db, int(user.id))  # type: ignore[arg-type]
    details = dict(user.details or {})
    details[DETAILS_KEY] = {"dismissed_at": datetime.now().isoformat(timespec="seconds"),
                            "alumni": any(row.status == "alumni" for row in rows)}
    user.details = details
    db.add(user)
    db.commit()
