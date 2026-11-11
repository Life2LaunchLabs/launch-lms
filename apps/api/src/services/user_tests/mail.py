"""Test mail: email the app would have sent to or from a test persona, kept instead of delivered.

``send_email`` asks ``capture`` first. A message is captured when its recipient is on the
test domain (whoever sent it, including background jobs) or when a persona is the one
acting in this request (whatever the address). A captured message is never delivered,
even when saving it fails.
"""

import html as html_lib
import logging
import re
from datetime import datetime
from urllib.parse import urlsplit

from config.config import get_launchlms_config
from fastapi import HTTPException
from sqlmodel import Session, select
from src.db.user_tests import TestMail, TestPersona
from src.db.users import User
from src.services.user_tests.sessions import current_test_persona
from src.services.user_tests.settings import is_test_address

logger = logging.getLogger(__name__)

HREF = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
BARE = re.compile(r"""https?://[^\s"'<>]+""")
MAX_LINKS = 25


def site_hosts() -> set[str]:
    hosting = get_launchlms_config().hosting_config
    hosts = set()
    for value in [hosting.frontend_domain, *(hosting.allowed_origins or [])]:
        host = urlsplit(value if "//" in value else f"//{value}").hostname
        if host:
            hosts.add(host.lower())
    return hosts


def on_site_path(url: str) -> str | None:
    """The path of a link to this site (or one of its org subdomains), else None."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    host = parts.hostname.lower()
    if not any(host == base or host.endswith("." + base) for base in site_hosts()):
        return None
    path = parts.path or "/"
    return f"{path}?{parts.query}" if parts.query else path


def extract_links(body: str) -> list[dict]:
    found: list[str] = []
    for url in [*HREF.findall(body or ""), *BARE.findall(body or "")]:
        url = html_lib.unescape(url).strip()
        if url.startswith(("http://", "https://")) and url not in found:
            found.append(url)
    return [{"url": url, "path": on_site_path(url)} for url in found[:MAX_LINKS]]


def _store(to: str, subject: str, body: str, sender_id: int | None, reason: str) -> int | None:
    from src.core.events.database import engine

    with Session(engine) as db:
        recipient = db.exec(select(User).where(User.email == str(to))).first()
        recipient_persona = db.get(TestPersona, recipient.id) if recipient else None
        sender_persona = db.get(TestPersona, sender_id) if sender_id else None
        cohort = recipient_persona or sender_persona
        mail = TestMail(
            cohort_id=cohort.cohort_id if cohort else None,
            to_address=str(to),
            to_user_id=recipient.id if recipient else None,
            from_user_id=sender_id,
            subject=subject or "",
            html=body or "",
            links=extract_links(body),
            reason=reason,
        )
        db.add(mail)
        db.commit()
        return mail.id


def capture(to, subject: str, body: str) -> dict | None:
    """None means deliver normally; a dict means it was captured and must not be sent."""
    sender_id = current_test_persona.get()
    to_test = is_test_address(str(to))
    if not to_test and not sender_id:
        return None
    reason = "test_address" if to_test else "persona_sender"
    try:
        mail_id = _store(str(to), subject, body, sender_id, reason)
    except Exception:
        logger.exception("Could not save a captured test email; it was not delivered either")
        mail_id = None
    return {"id": None, "delivered": False, "captured": True, "test_mail_id": mail_id}


def serialize(mail: TestMail, *, full: bool = False) -> dict:
    data = {
        "id": mail.id,
        "cohort_id": mail.cohort_id,
        "to_address": mail.to_address,
        "to_user_id": mail.to_user_id,
        "from_user_id": mail.from_user_id,
        "subject": mail.subject,
        "reason": mail.reason,
        "captured_at": mail.captured_at.isoformat() + "Z",
        "opened_at": mail.opened_at.isoformat() + "Z" if mail.opened_at else None,
        "links": mail.links or [],
    }
    if full:
        data["html"] = mail.html
    return data


def list_mail(db: Session, cohort_id: int, persona_user_id: int | None = None, limit: int = 100) -> list[dict]:
    statement = select(TestMail).where(TestMail.cohort_id == cohort_id)
    if persona_user_id:
        statement = statement.where(TestMail.to_user_id == persona_user_id)
    statement = statement.order_by(TestMail.captured_at.desc(), TestMail.id.desc()).limit(min(limit, 500))
    return [serialize(mail) for mail in db.exec(statement).all()]


def read_mail(db: Session, mail_id: int, *, as_persona: bool = True) -> dict:
    """``as_persona`` False is an admin looking: the persona's copy stays unread."""
    mail = db.get(TestMail, mail_id)
    if not mail:
        raise HTTPException(404, "That test email no longer exists.")
    if as_persona and not mail.opened_at:
        mail.opened_at = datetime.utcnow()
        db.add(mail)
        db.commit()
    return serialize(mail, full=True)
