"""One-use login links: a platform admin mints one for a persona; a browser redeems it once.

The link carries the login, so the browser that opens it never needs an admin cookie.
Only a hash of the token is stored, it expires after 60 seconds, and it works once.
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import update
from sqlmodel import Session
from src.db.user_tests import TestLoginTicket
from src.db.users import User
from src.services.user_tests import sessions

TICKET_TTL = timedelta(seconds=60)
# An orchestrator may hand a link on to a browser elsewhere, which takes longer than a click.
MAX_TICKET_TTL = timedelta(minutes=30)
ENTRY_PATH = "/auth/test-entry"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def safe_path(path: str | None) -> str:
    """Only paths on this site: no scheme, no host, no protocol-relative tricks."""
    path = (path or "/").strip()
    if not path.startswith("/") or path.startswith("//") or "\\" in path or any(ord(c) < 32 for c in path):
        raise HTTPException(422, "The landing page must be a path on this site, starting with /.")
    return path[:1000]


START_PATH = "/start"
ADMIN_PATH = "/admin"


def _owns_test_org(db: Session, persona) -> bool:
    from sqlmodel import select
    from src.db.user_tests import TestCohortOrg

    return db.exec(select(TestCohortOrg.org_id).where(TestCohortOrg.created_by_user_id == persona.user_id)).first() is not None


def admin_org_slug(db: Session, persona) -> str | None:
    """The run's org this persona runs as an admin, if any: where its day starts, not the learner Launchpad."""
    from sqlmodel import col, select
    from src.db.organizations import Organization
    from src.db.user_organizations import UserOrganization
    from src.db.user_tests import TestCohortOrg

    return db.exec(select(Organization.slug).join(TestCohortOrg, col(TestCohortOrg.org_id) == Organization.id)
                   .join(UserOrganization, col(UserOrganization.org_id) == Organization.id)
                   .where(TestCohortOrg.cohort_id == persona.cohort_id, UserOrganization.user_id == persona.user_id,
                          UserOrganization.role_id == 1).order_by(col(TestCohortOrg.creation_date))).first()


def mint(db: Session, operator_id: int, persona_user_id: int, target_path: str = "/", ttl: timedelta = TICKET_TTL) -> dict:
    if not sessions.is_platform_admin(operator_id, db):
        raise HTTPException(403, "Platform admin access is required.")
    user = db.get(User, persona_user_id)
    persona = sessions.persona_for(db, user)
    # The one rule that keeps this from ever reaching a real person.
    if not user or not persona:
        raise HTTPException(403, "Login links can only be made for test personas.")
    sessions.open_cohort(db, persona.cohort_id)
    if persona.start_state == "new_signup" and safe_path(target_path) == "/" and not _owns_test_org(db, persona):
        target_path = START_PATH  # just signed up: the onboarding a new account goes through next
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + min(max(ttl, TICKET_TTL), MAX_TICKET_TTL)
    db.add(
        TestLoginTicket(
            token_hash=_hash(token),
            persona_user_id=user.id,
            operator_user_id=operator_id,
            target_path=safe_path(target_path),
            expires_at=expires_at,
        )
    )
    db.commit()
    return {
        "path": f"{ENTRY_PATH}?t={quote(token)}",
        "expires_at": expires_at.isoformat() + "Z",
    }


def redeem(db: Session, token: str) -> dict:
    """Spend a ticket. Returns persona session tokens and where to land."""
    invalid = HTTPException(401, "This login link has expired or was already used. Make a new one in User tests.")
    if not token or len(token) > 200:
        raise invalid
    now = datetime.utcnow()
    token_hash = _hash(token)
    spent = db.execute(
        update(TestLoginTicket)
        .where(
            TestLoginTicket.token_hash == token_hash,
            TestLoginTicket.used_at.is_(None),
            TestLoginTicket.expires_at > now,
        )
        .values(used_at=now)
    )
    db.commit()
    if spent.rowcount != 1:
        raise invalid
    ticket = db.get(TestLoginTicket, token_hash)
    user = db.get(User, ticket.persona_user_id)
    persona = sessions.persona_for(db, user)
    if not user or not persona or not sessions.is_platform_admin(ticket.operator_user_id, db):
        raise invalid
    cohort = sessions.open_cohort(db, persona.cohort_id)
    # No particular page asked for: an org's admin starts on that org's admin, on its own site.
    org_slug = admin_org_slug(db, persona) if ticket.target_path == "/" else None
    return {
        "tokens": sessions.tokens(user, ticket.operator_user_id, cohort),
        "target_path": ADMIN_PATH if org_slug else ticket.target_path,
        "target_org_slug": org_slug,
        "persona": {"user_id": user.id, "name": f"{user.first_name} {user.last_name}".strip()},
        "cohort": {"cohort_uuid": cohort.cohort_uuid, "name": cohort.name},
    }
