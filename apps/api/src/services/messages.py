import logging
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select
from src.db.messages import InboxMessage, InboxMessageTemplate
from src.db.organizations import Organization
from src.db.users import PublicUser

logger = logging.getLogger(__name__)

WELCOME_TEMPLATE_KEY = "account_welcome"
DEFAULT_WELCOME_SUBJECT = "Welcome to Launch LMS"
DEFAULT_WELCOME_BODY = (
    "Welcome! Launch LMS is still a work in progress. You may encounter things "
    "that are unfinished or changing as we continue building. Thanks for joining "
    "us early."
)


def _owner_org(db_session: Session) -> Organization | None:
    return db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()


def get_welcome_template(db_session: Session) -> dict:
    template = db_session.exec(
        select(InboxMessageTemplate).where(
            InboxMessageTemplate.template_key == WELCOME_TEMPLATE_KEY
        )
    ).first()
    return {
        "template_key": WELCOME_TEMPLATE_KEY,
        "subject": template.subject if template else DEFAULT_WELCOME_SUBJECT,
        "body": template.body if template else DEFAULT_WELCOME_BODY,
        "customized": template is not None,
        "updated_at": template.updated_at if template else None,
        "updated_by_user_id": template.updated_by_user_id if template else None,
    }


def update_welcome_template(
    db_session: Session,
    current_user: PublicUser,
    *,
    subject: str,
    body: str,
) -> dict:
    normalized_subject = subject.strip()
    normalized_body = body.strip()
    if not normalized_subject or not normalized_body:
        raise HTTPException(status_code=422, detail="Subject and body are required")

    template = db_session.exec(
        select(InboxMessageTemplate).where(
            InboxMessageTemplate.template_key == WELCOME_TEMPLATE_KEY
        )
    ).first()
    if template is None:
        template = InboxMessageTemplate(
            template_key=WELCOME_TEMPLATE_KEY,
            subject=normalized_subject,
            body=normalized_body,
        )
    else:
        template.subject = normalized_subject
        template.body = normalized_body
    template.updated_by_user_id = current_user.id
    template.updated_at = datetime.utcnow()
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return get_welcome_template(db_session)


def reset_welcome_template(db_session: Session) -> dict:
    template = db_session.exec(
        select(InboxMessageTemplate).where(
            InboxMessageTemplate.template_key == WELCOME_TEMPLATE_KEY
        )
    ).first()
    if template is not None:
        db_session.delete(template)
        db_session.commit()
    return get_welcome_template(db_session)


def create_inbox_message(
    db_session: Session,
    *,
    subject: str,
    body: str,
    message_type: str,
    recipient_user_id: int | None = None,
    recipient_email: str | None = None,
    sender_org_id: int | None = None,
    sender_user_id: int | None = None,
    action_url: str | None = None,
    action_kind: str | None = None,
    action_data: dict | None = None,
    dedupe_key: str | None = None,
) -> InboxMessage:
    """Add one durable message to the current transaction."""

    if recipient_user_id is None and not recipient_email:
        raise ValueError("An inbox message requires a user or email recipient")
    if dedupe_key:
        existing = db_session.exec(
            select(InboxMessage).where(InboxMessage.dedupe_key == dedupe_key)
        ).first()
        if existing is not None:
            return existing
    message = InboxMessage(
        message_uuid=f"message_{uuid4()}",
        recipient_user_id=recipient_user_id,
        recipient_email_normalized=(recipient_email.strip().casefold() if recipient_email else None),
        sender_org_id=sender_org_id,
        sender_user_id=sender_user_id,
        message_type=message_type,
        subject=subject.strip(),
        body=body.strip(),
        action_url=action_url,
        action_kind=action_kind,
        action_data=action_data,
        action_status="pending" if action_kind else None,
        dedupe_key=dedupe_key,
    )
    db_session.add(message)
    return message


def create_welcome_message(db_session: Session, user_id: int) -> InboxMessage | None:
    """Create the account welcome exactly once; return None without an owner org."""

    dedupe_key = f"account_welcome:{user_id}"
    existing = db_session.exec(
        select(InboxMessage).where(InboxMessage.dedupe_key == dedupe_key)
    ).first()
    if existing is not None:
        return existing

    owner_org = _owner_org(db_session)
    if owner_org is None or owner_org.id is None:
        logger.warning("Welcome message skipped for user %s: owner org is missing", user_id)
        return None

    template = get_welcome_template(db_session)
    message = create_inbox_message(
        db_session,
        recipient_user_id=user_id,
        sender_org_id=int(owner_org.id),
        message_type="welcome",
        subject=template["subject"],
        body=template["body"],
        dedupe_key=dedupe_key,
    )
    db_session.commit()
    db_session.refresh(message)
    return message


def create_welcome_message_safely(db_session: Session, user_id: int) -> None:
    """Best-effort delivery: a messaging failure must not block account creation."""

    try:
        create_welcome_message(db_session, user_id)
    except Exception:
        db_session.rollback()
        logger.exception("Failed to create welcome inbox message for user %s", user_id)


def _my_messages_statement(current_user: PublicUser):
    normalized_email = str(current_user.email).strip().casefold()
    return select(InboxMessage).where(or_(
        InboxMessage.recipient_user_id == current_user.id,
        (
            InboxMessage.recipient_user_id.is_(None)
            & (InboxMessage.recipient_email_normalized == normalized_email)
        ),
    ))


def _claim_email_messages(current_user: PublicUser, db_session: Session) -> None:
    normalized_email = str(current_user.email).strip().casefold()
    messages = db_session.exec(select(InboxMessage).where(
        InboxMessage.recipient_user_id.is_(None),
        InboxMessage.recipient_email_normalized == normalized_email,
    )).all()
    for message in messages:
        message.recipient_user_id = current_user.id
        db_session.add(message)
    if messages:
        db_session.commit()


def get_my_message(message_uuid: str, current_user: PublicUser, db_session: Session) -> InboxMessage:
    message = db_session.exec(
        _my_messages_statement(current_user).where(InboxMessage.message_uuid == message_uuid)
    ).first()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


def list_my_messages(current_user: PublicUser, db_session: Session) -> list[dict]:
    _claim_email_messages(current_user, db_session)
    rows = db_session.exec(
        select(InboxMessage, Organization)
        .outerjoin(Organization, Organization.id == InboxMessage.sender_org_id)
        .where(InboxMessage.recipient_user_id == current_user.id)
        .order_by(InboxMessage.created_at.desc())  # type: ignore[union-attr]
    ).all()
    return [
        {
            "message_uuid": message.message_uuid,
            "message_type": message.message_type,
            "subject": message.subject,
            "body": message.body,
            "action_url": message.action_url,
            "action_kind": message.action_kind,
            "action_data": message.action_data,
            "action_status": message.action_status,
            "resolved_at": message.resolved_at,
            "unread": message.read_at is None,
            "read_at": message.read_at,
            "created_at": message.created_at,
            "sender_organization": (
                {
                    "id": organization.id,
                    "org_uuid": organization.org_uuid,
                    "name": organization.name,
                    "slug": organization.slug,
                    "logo_image": organization.logo_image,
                }
                if organization is not None
                else None
            ),
        }
        for message, organization in rows
    ]


def mark_my_messages_viewed(current_user: PublicUser, db_session: Session) -> dict:
    _claim_email_messages(current_user, db_session)
    messages = db_session.exec(
        select(InboxMessage)
        .where(InboxMessage.recipient_user_id == current_user.id)
        .where(InboxMessage.read_at.is_(None))  # type: ignore[union-attr]
    ).all()
    viewed_at = datetime.utcnow()
    for message in messages:
        message.read_at = viewed_at
        db_session.add(message)
    if messages:
        db_session.commit()
    return {"updated": len(messages), "viewed_at": viewed_at}


def resolve_message_action(
    message: InboxMessage,
    *,
    accepted: bool,
    db_session: Session,
) -> None:
    message.action_status = "accepted" if accepted else "declined"
    message.resolved_at = datetime.utcnow()
    message.read_at = message.read_at or message.resolved_at
    db_session.add(message)
    db_session.commit()


def resolve_action_by_dedupe(
    db_session: Session,
    dedupe_key: str,
    *,
    accepted: bool,
) -> None:
    """Keep message state aligned when a legacy domain endpoint handles the action."""

    message = db_session.exec(
        select(InboxMessage).where(InboxMessage.dedupe_key == dedupe_key)
    ).first()
    if message is None:
        return
    message.action_status = "accepted" if accepted else "declined"
    message.resolved_at = datetime.utcnow()
    message.read_at = message.read_at or message.resolved_at
    db_session.add(message)
