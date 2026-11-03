"""Asked-for quotes: a learner asks someone about one experience or project, and they answer from a link.

A learner never types a quote in. They pick someone from My people (or add them) and send an ask with an
optional note; the person gets an email with a link that needs no account. The page behind it shows what
they're vouching for, their name and role as the learner entered them (theirs to fix), and a box for the
quote. Answering confirms the quote and spends the link. Only the token's hash is stored.
"""

from __future__ import annotations

import hashlib
import html
import logging
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.organizations import Organization
from src.db.portfolio import Portfolio, ProjectItem, TimelineEntry
from src.db.portfolio_records import PortfolioContact, PortfolioQuote, QuoteAnswer, QuoteAsk, QuoteStatus
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service
from src.services.email.utils import send_email
from src.services.oauth.config import frontend_url
from src.services.orgs.owner import owner_org
from src.services.portfolio_records import quote_dto

logger = logging.getLogger(__name__)

# Open asks a learner can have at once, so the form can't be used to send mail in bulk.
OPEN_LIMIT = 10


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _learner_name(user: User) -> str:
    return " ".join(part for part in (user.first_name, user.last_name) if part).strip() or f"@{user.username}"


def _org_slug(db: Session, user_id: int) -> str:
    membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == user_id).order_by(col(UserOrganization.id))).first()
    org = db.get(Organization, membership.org_id) if membership else owner_org(db)
    return org.slug if org else "default"


def _item(db: Session, portfolio: Portfolio, timeline_uuid: str | None, project_uuid: str | None) -> TimelineEntry | ProjectItem:
    if bool(timeline_uuid) == bool(project_uuid):
        raise HTTPException(status_code=422, detail="Ask about one experience or one project")
    model, key, value = (TimelineEntry, TimelineEntry.timeline_uuid, timeline_uuid) if timeline_uuid else (ProjectItem, ProjectItem.project_uuid, project_uuid)
    item = db.exec(select(model).where(model.portfolio_id == portfolio.id, key == value)).first()  # type: ignore[attr-defined]
    if not item:
        raise HTTPException(status_code=404, detail="That isn't on your portfolio")
    return item


def _contact(db: Session, portfolio: Portfolio, payload: QuoteAsk, timeline_id: int | None) -> PortfolioContact:
    if payload.contact_uuid:
        contact = db.exec(select(PortfolioContact).where(PortfolioContact.portfolio_id == portfolio.id, PortfolioContact.contact_uuid == payload.contact_uuid)).first()
        if not contact:
            raise HTTPException(status_code=404, detail="That person isn't in My people")
        if payload.email and not contact.email:
            contact.email = payload.email.strip()
        return contact
    if not (payload.name or "").strip():
        raise HTTPException(status_code=422, detail="Say who you're asking")
    now = _now()
    contact = PortfolioContact(
        contact_uuid=f"con_{uuid4().hex}", portfolio_id=portfolio.id or 0, name=payload.name.strip(), role_label=(payload.role_label or "").strip(),  # type: ignore[union-attr]
        email=(payload.email or "").strip(), timeline_entry_id=timeline_id, creation_date=now, update_date=now,
    )
    db.add(contact)
    db.flush()
    return contact


def _email(contact: PortfolioContact, db: Session) -> str:
    if contact.email:
        return contact.email
    user = db.get(User, contact.linked_user_id) if contact.linked_user_id else None
    return user.email if user else ""


def _send(db: Session, learner: User, contact: PortfolioContact, item_title: str, note: str, token: str, to: str) -> None:
    link = f"{frontend_url()}/orgs/{_org_slug(db, learner.id or 0)}/quote/{token}"
    who, title = html.escape(_learner_name(learner)), html.escape(item_title)
    quoted = f"<blockquote>{html.escape(note)}</blockquote>" if note else ""
    try:
        send_email(to=to, subject=f"{_learner_name(learner)} asked you for a quote", body=f"""
<html>
    <body>
        <p>Hi {html.escape(contact.name)},</p>
        <p>{who} is building their portfolio and asked if you'd say a few words about <b>{title}</b>.</p>
        {quoted}
        <p><a href="{link}">Write your quote</a>. It takes a minute and you don't need an account.</p>
    </body>
</html>
""")
    except Exception:
        logger.exception("Failed to send a quote request to %s", to)
        raise HTTPException(status_code=502, detail="Couldn't send the email. Try again in a bit.")


def ask(payload: QuoteAsk, current_user: PublicUser, db: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    open_asks = db.exec(select(func.count()).select_from(PortfolioQuote).where(PortfolioQuote.portfolio_id == portfolio.id, PortfolioQuote.status == QuoteStatus.REQUESTED.value)).one()
    if open_asks >= OPEN_LIMIT:
        raise HTTPException(status_code=429, detail=f"You have {OPEN_LIMIT} asks waiting. Wait for some answers first.")
    item = _item(db, portfolio, payload.timeline_uuid, payload.project_uuid)
    is_timeline = isinstance(item, TimelineEntry)
    contact = _contact(db, portfolio, payload, item.id if is_timeline else None)
    to = _email(contact, db)
    if not to or "@" not in to:
        raise HTTPException(status_code=422, detail=f"Add an email for {contact.name}")
    token = secrets.token_urlsafe(24)
    now = _now()
    quote = PortfolioQuote(
        quote_uuid=f"quo_{uuid4().hex}", portfolio_id=portfolio.id or 0, contact_id=contact.id or 0, status=QuoteStatus.REQUESTED.value,
        timeline_entry_id=item.id if is_timeline else None, project_item_id=None if is_timeline else item.id,
        requested_at=now, request_token_hash=_hash(token), request_note=payload.note.strip(), creation_date=now, update_date=now,
    )
    db.add(quote)
    db.flush()
    learner = db.get(User, current_user.id)
    _send(db, learner, contact, item.title, quote.request_note, token, to)  # type: ignore[arg-type]
    db.commit()
    return quote_dto(quote, db)


def _by_token(db: Session, token: str) -> PortfolioQuote:
    quote = db.exec(select(PortfolioQuote).where(PortfolioQuote.request_token_hash == _hash(token or ""))).first()
    if not quote or quote.status != QuoteStatus.REQUESTED.value:
        raise HTTPException(status_code=404, detail="This link was already used, or the ask was taken back")
    return quote


def request_view(token: str, db: Session) -> dict:
    """What the person asked sees: who asked, about what, the note, and themselves as the learner entered them."""
    quote = _by_token(db, token)
    portfolio = db.get(Portfolio, quote.portfolio_id)
    learner = db.get(User, portfolio.user_id) if portfolio else None
    contact = db.get(PortfolioContact, quote.contact_id)
    item = db.get(TimelineEntry, quote.timeline_entry_id) if quote.timeline_entry_id else db.get(ProjectItem, quote.project_item_id) if quote.project_item_id else None
    detail = ""
    if isinstance(item, TimelineEntry):
        detail = item.organization
    elif item is not None:
        detail = item.subtitle
    return {
        "learner": {"name": _learner_name(learner) if learner else "", "first_name": (learner.first_name if learner else "") or ""},
        "item": {"kind": "experience" if isinstance(item, TimelineEntry) else "project", "title": item.title if item else "", "detail": detail},
        "note": quote.request_note, "name": contact.name if contact else "", "role_label": contact.role_label if contact else "",
    }


def answer(token: str, payload: QuoteAnswer, db: Session) -> dict:
    quote = _by_token(db, token)
    contact = db.get(PortfolioContact, quote.contact_id)
    if contact:
        contact.name, contact.role_label = payload.name.strip(), payload.role_label.strip()
        contact.is_reference = contact.is_reference or payload.reference
        contact.update_date = _now()
    quote.body, quote.status, quote.confirmed_at = payload.body.strip(), QuoteStatus.CONFIRMED.value, _now()
    quote.request_token_hash = None
    quote.update_date = quote.confirmed_at
    db.commit()
    return {"success": True}


def take_back(quote_uuid: str, current_user: PublicUser, db: Session) -> dict:
    """The learner withdraws an ask that hasn't been answered; its link stops working."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db)
    quote = db.exec(select(PortfolioQuote).where(PortfolioQuote.portfolio_id == portfolio.id, PortfolioQuote.quote_uuid == quote_uuid)).first()
    if not quote or quote.status != QuoteStatus.REQUESTED.value:
        raise HTTPException(status_code=404, detail="That ask isn't waiting")
    db.delete(quote)
    db.commit()
    return {"success": True}
