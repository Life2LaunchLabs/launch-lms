"""Queueing email notifications, and the worker that sends them.

``notify`` adds a row in the caller's transaction, so the email exists exactly when the change that
caused it commits, and it never raises: a notification problem must not block a hand-in or a review.

``run_due`` (every minute, from the app's startup) takes due rows per person and stream and sends
one email for all of them, at most once per the stream's window. Rows are claimed first (``SKIP
LOCKED`` on Postgres), so two API processes never send the same email. Before sending it drops what
the person switched off and what is no longer true (a hand-in someone already reviewed).

Visitor copies of the demo queue nothing. A change made by a user-test persona is remembered on the
row, so its email is still kept in User tests (services/user_tests/mail.py) rather than delivered,
even though the worker sends it outside the persona's request.
"""

from __future__ import annotations

import hashlib
import html
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import func
from sqlmodel import Session, col, select

from src.db.notifications import NotificationEvent
from src.db.organizations import Organization
from src.db.users import User
from src.services.notifications import kinds, preferences, unsubscribe
from src.services.notifications.catalog import KINDS, STREAMS, stream_of

logger = logging.getLogger(__name__)

EVERY = 60  # seconds between worker runs
BATCH = 200  # rows claimed per run
MAX_ATTEMPTS = 5
RETRY_AFTER = timedelta(minutes=5)
# A row left "sending" this long (its process died mid-send) is taken again.
STALE_CLAIM = timedelta(minutes=10)
PERSONA_KEY = "_persona"


def _now() -> datetime:
    return datetime.utcnow()


# Queueing ---------------------------------------------------------------------------------

def notify(db: Session, kind: str, recipient_user_id: int | None, *, org_id: int | None, data: dict, dedupe_key: str | None = None,
           actor_user_id: int | None = None) -> NotificationEvent | None:
    """Queue one notification (added to the session, not committed). Never raises."""
    if kind not in KINDS or not recipient_user_id or recipient_user_id == actor_user_id:
        return None
    try:
        from src.services.demo.context import current_demo
        from src.services.user_tests.sessions import current_test_persona

        if current_demo.get():
            return None
        payload = dict(data)
        persona = current_test_persona.get()
        if persona:
            payload[PERSONA_KEY] = persona
        with db.begin_nested():
            if dedupe_key and db.exec(select(NotificationEvent.id).where(NotificationEvent.dedupe_key == dedupe_key)).first():
                return None
            now = _now()
            event = NotificationEvent(
                event_uuid=f"notification_{uuid4()}", kind=kind, stream=KINDS[kind], recipient_user_id=int(recipient_user_id),
                org_id=org_id, data=payload, dedupe_key=dedupe_key, created_at=now, send_after=now + stream_of(kind).settle,
            )
            db.add(event)
        return event
    except Exception:
        logger.exception("Could not queue the %s notification for user %s", kind, recipient_user_id)
        return None


# Sending ----------------------------------------------------------------------------------

def _claim(db: Session, now: datetime) -> list[NotificationEvent]:
    """Take every due row (and stale claims) in one commit before sending any of them."""
    query = select(NotificationEvent).where(
        ((NotificationEvent.status == "pending") & (col(NotificationEvent.send_after) <= now))
        | ((NotificationEvent.status == "sending") & (col(NotificationEvent.claimed_at) <= now - STALE_CLAIM))
    ).order_by(col(NotificationEvent.id)).limit(BATCH)
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    rows = list(db.exec(query).all())
    for row in rows:
        row.status, row.claimed_at = "sending", now
        db.add(row)
    db.commit()
    return rows


def _last_sent(db: Session, recipient_user_id: int, stream: str) -> datetime | None:
    return db.exec(select(func.max(NotificationEvent.sent_at)).where(
        NotificationEvent.recipient_user_id == recipient_user_id, NotificationEvent.stream == stream, NotificationEvent.status == "sent",
    )).first()


def _settle(db: Session, rows: list[NotificationEvent], status: str, now: datetime, *, error: str = "", send_after: datetime | None = None) -> None:
    for row in rows:
        row.status, row.last_error = status, error[:2000]
        if status == "sent":
            row.sent_at = now
        if send_after is not None:
            row.send_after = send_after
        db.add(row)
    db.commit()


def render(db: Session, user: User, stream_key: str, rows: list[NotificationEvent]) -> tuple[str, str]:
    """The subject and HTML body of one email carrying ``rows`` (all for ``user`` on one stream)."""
    orgs: dict[int | None, Organization | None] = {}
    items = []
    for row in rows:
        if row.org_id not in orgs:
            orgs[row.org_id] = db.get(Organization, row.org_id) if row.org_id else None
        items.append(kinds.RENDER[row.kind](row, orgs[row.org_id]))
    subject = items[0].subject if len(items) == 1 else kinds.DIGEST_SUBJECTS[stream_key](len(items))
    names = sorted({org.name for org in orgs.values() if org and org.name})
    stream = STREAMS[stream_key]
    greeting = html.escape(user.first_name or user.username or "there")
    lines = "".join(
        f'<tr><td style="padding:12px 0;border-top:1px solid #eee;font-size:15px;line-height:22px">{item.line}<br>'
        f'<a href="{html.escape(item.link)}" style="color:#2563eb;font-weight:600">{html.escape(item.link_label)}</a></td></tr>'
        for item in items
    )
    sender = f"Sent by {html.escape(', '.join(names))}. " if names else ""
    body = f"""<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;margin:0;padding:24px">
    <div style="max-width:560px;margin:0 auto">
      <p style="font-size:15px">Hi {greeting},</p>
      <table role="presentation" style="width:100%;border-collapse:collapse">{lines}</table>
      <p style="margin-top:24px;font-size:12px;line-height:18px;color:#777">
        {sender}You get these because “{html.escape(stream.label)}” is on in your settings.
        <a href="{html.escape(unsubscribe.link(user, stream_key))}" style="color:#777">Stop these emails</a>
      </p>
    </div>
  </body>
</html>"""
    return subject, body


def _deliver(user: User, subject: str, body: str, rows: list[NotificationEvent]) -> None:
    from src.services.email.utils import send_email
    from src.services.user_tests.sessions import current_test_persona

    persona = next((row.data.get(PERSONA_KEY) for row in rows if row.data.get(PERSONA_KEY)), None)
    key = hashlib.sha256(",".join(str(row.id) for row in rows).encode()).hexdigest()[:40]
    reset = current_test_persona.set(persona) if persona else None
    try:
        send_email(to=user.email, subject=subject, body=body, idempotency_key=f"notify:{key}")
    finally:
        if reset is not None:
            current_test_persona.reset(reset)


def _send_group(db: Session, recipient_user_id: int, stream_key: str, rows: list[NotificationEvent], now: datetime) -> bool:
    """Send (or hold, or drop) one person's rows on one stream; True when an email went."""
    stream = STREAMS.get(stream_key)
    user = db.get(User, recipient_user_id)
    if not stream or not user or not user.email or not preferences.enabled(user, stream_key):
        _settle(db, rows, "skipped", now, error="switched off" if user and stream else "no recipient")
        return False
    last = _last_sent(db, recipient_user_id, stream_key)
    if last and now - last < stream.window:
        # Emailed on this stream lately: wait out the window, then send everything at once.
        _settle(db, rows, "pending", now, send_after=last + stream.window)
        return False
    # The same thing twice (handed in, taken back, handed in again) is said once, as it is now.
    latest: dict[tuple, NotificationEvent] = {}
    for row in rows:
        latest[(row.kind, row.data.get("step_uuid") or row.data.get("goal_uuid") or row.id)] = row
    stale = [row for row in rows if row not in latest.values() or not kinds.still_relevant(db, row)]
    if stale:
        _settle(db, stale, "skipped", now, error="no longer relevant")
    rows = [row for row in rows if row not in stale]
    if not rows:
        return False
    subject, body = render(db, user, stream_key, rows)
    try:
        _deliver(user, subject, body, rows)
    except Exception as exc:
        from src.services.email.utils import EmailDeliveryError

        retryable = not isinstance(exc, EmailDeliveryError) or exc.retryable
        attempts = max(row.attempts for row in rows) + 1
        for row in rows:
            row.attempts = attempts
        if retryable and attempts < MAX_ATTEMPTS:
            _settle(db, rows, "pending", now, error=str(exc), send_after=now + RETRY_AFTER)
        else:
            _settle(db, rows, "failed", now, error=str(exc))
        logger.warning("Notification email to user %s (%s) failed: %s", recipient_user_id, stream_key, exc)
        return False
    _settle(db, rows, "sent", now)
    return True


def run_due(engine, now: datetime | None = None) -> int:
    """Send everything due; returns how many emails went."""
    now = now or _now()
    sent = 0
    with Session(engine) as db:
        groups: dict[tuple[int, str], list[NotificationEvent]] = defaultdict(list)
        for row in _claim(db, now):
            groups[(row.recipient_user_id, row.stream)].append(row)
        for (recipient_user_id, stream_key), rows in groups.items():
            try:
                sent += _send_group(db, recipient_user_id, stream_key, rows, now)
            except Exception as exc:
                db.rollback()
                logger.exception("Sending notifications to user %s (%s) failed", recipient_user_id, stream_key)
                # A row that can't even be rendered would otherwise be retried forever.
                _settle(db, rows, "failed", now, error=f"{type(exc).__name__}: {exc}")
    return sent


async def run_forever(engine, every: int = EVERY) -> None:
    """The notification worker: started with the app, wakes every minute."""
    import asyncio

    while True:
        try:
            await asyncio.to_thread(run_due, engine)
        except Exception:
            logger.exception("Sending notifications failed; will retry")
        await asyncio.sleep(every)
