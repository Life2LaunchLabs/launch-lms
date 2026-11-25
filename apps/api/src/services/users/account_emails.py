"""An account's emails: one main (``User.email``) and verified spares (DEV-197, PF-2).

People who sign up with a school or work address lose it when they leave; a spare personal email keeps the account
theirs. Anyone can sign in, reset a password and be invited at any verified email on their account. Notifications,
sign-in tokens and display use the main one. An email belongs to at most one account, main or spare.

Adding an email sends a six-digit code to it; typing the code adds it. A school's Canvas vouches for the email it
sends at a launch, so linking a Canvas person to an account adds that email without a code (``add_verified``).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlmodel import Session, select

from src.db.user_emails import UserEmail
from src.db.users import User
from src.services.users import account_settings, personal_email_prompt

logger = logging.getLogger(__name__)

CODE_TTL_SECONDS = 15 * 60
CODE_ATTEMPTS = 5
CODES_PER_HOUR = 5
MAX_SPARES = 5

TAKEN = "That email is already on another Life2Launch account. Sign in to that account instead, or use a different email."
YOURS = "That email is already on your account."
WRONG_CODE = "That code doesn't match. Check the latest email we sent and try again."
EXPIRED = "That code has expired. Send a new one."


def normalize(email: str) -> str:
    from src.services.orgs.users import normalize_email

    return normalize_email(email)


def _valid(email: str) -> str:
    try:
        return validate_email(str(email).strip(), check_deliverability=False).normalized
    except EmailNotValidError as error:
        raise HTTPException(status_code=400, detail="That doesn't look like an email address.") from error


def _now() -> str:
    return str(datetime.now())


# Looking people up -------------------------------------------------------------------------------------------------

def find_user(db: Session, email: str | None) -> User | None:
    """The account that has this email, main or verified spare (case doesn't matter)."""
    if not email:
        return None
    key = normalize(str(email))
    user = db.exec(select(User).where(User.email == str(email).strip())).first() or \
        db.exec(select(User).where(func.lower(User.email) == key)).first()
    if user is not None:
        return user
    spare = db.exec(select(UserEmail.user_id).where(UserEmail.email_normalized == key)).first()
    return db.get(User, spare) if spare else None


def owner_id(db: Session, email: str) -> int | None:
    user = find_user(db, email)
    return int(user.id) if user is not None and user.id is not None else None


def emails_of(db: Session, user_id: int) -> set[str]:
    """Every email on the account, normalized: what invitations and join checks match against."""
    user = db.get(User, user_id)
    found = {normalize(user.email)} if user is not None and user.email else set()
    found.update(db.exec(select(UserEmail.email_normalized).where(UserEmail.user_id == user_id)).all())
    return found


def matches(column, user) -> object:
    """A SQL condition: ``column`` (a normalized email) is one of the user's emails, main or spare.

    For queries that only have the signed-in user, not a session: the spares come from a subquery."""
    spares = select(UserEmail.email_normalized).where(UserEmail.user_id == user.id)
    return or_(column == normalize(str(user.email or "")), column.in_(spares))  # type: ignore[attr-defined]


def listing(db: Session, user: User) -> dict:
    spares = db.exec(select(UserEmail).where(UserEmail.user_id == user.id).order_by(UserEmail.id)).all()
    return {
        "main": {"email": user.email, "verified": bool(user.email_verified)},
        "spares": [{"email": item.email, "source": item.source, "verified_at": item.verified_at} for item in spares],
        "max_spares": MAX_SPARES,
        "ask_for_personal": personal_email_prompt.should_prompt(db, user),
        # The account's one phone number sits under its emails in Settings; the résumé prints it (PF-3).
        "phone": account_settings.phone_of(user),
    }


def _check_free(db: Session, user: User, email: str) -> None:
    owner = owner_id(db, email)
    if owner == user.id:
        raise HTTPException(status_code=409, detail=YOURS)
    if owner is not None:
        raise HTTPException(status_code=409, detail=TAKEN)


# Adding with a code ------------------------------------------------------------------------------------------------

def _redis():
    from src.services.users.email_verification import get_redis_connection

    return get_redis_connection()


def _code_key(user_id: int, email: str) -> str:
    return f"account_email:{user_id}:{normalize(email)}"


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def start_add(db: Session, user: User, raw_email: str) -> dict:
    """Send a code to an email the person wants to add. Refused when it's already on an account."""
    email = _valid(raw_email)
    _check_free(db, user, email)
    if len(db.exec(select(UserEmail.id).where(UserEmail.user_id == user.id)).all()) >= MAX_SPARES:
        raise HTTPException(status_code=409, detail=f"An account can have up to {MAX_SPARES} extra emails. Remove one first.")
    r = _redis()
    sent_key = f"account_email:sent:{user.id}"
    if int(r.incr(sent_key)) > CODES_PER_HOUR:
        raise HTTPException(status_code=429, detail="You've asked for a lot of codes. Try again in an hour.")
    r.expire(sent_key, 3600)
    code = f"{secrets.randbelow(1_000_000):06d}"
    r.setex(_code_key(int(user.id), email), CODE_TTL_SECONDS, json.dumps({"hash": _hash(code), "email": email, "attempts": 0}))
    from src.services.email.utils import EmailDeliveryError
    from src.services.users.emails import send_add_email_code

    try:
        send_add_email_code(email, code, user)
    except EmailDeliveryError as error:
        logger.info("Add-email code to user %s didn't send: %s", user.id, error)
        raise HTTPException(status_code=502, detail="The code email didn't send. Try again in a minute.") from error
    return {"email": email, "expires_in": CODE_TTL_SECONDS}


def confirm_add(db: Session, user: User, raw_email: str, code: str) -> dict:
    email = _valid(raw_email)
    r = _redis()
    key = _code_key(int(user.id), email)
    raw = r.get(key)
    if not raw:
        raise HTTPException(status_code=400, detail=EXPIRED)
    data = json.loads(raw)
    if not hmac.compare_digest(data.get("hash", ""), _hash(str(code).strip())):
        data["attempts"] = int(data.get("attempts", 0)) + 1
        if data["attempts"] >= CODE_ATTEMPTS:
            r.delete(key)
            raise HTTPException(status_code=400, detail="Too many wrong codes. Send a new one.")
        r.setex(key, max(int(r.ttl(key) or 0), 1), json.dumps(data))
        raise HTTPException(status_code=400, detail=WRONG_CODE)
    r.delete(key)
    _check_free(db, user, email)
    _store(db, user, data.get("email") or email, "code")
    db.commit()
    return listing(db, user)


def _store(db: Session, user: User, email: str, source: str) -> None:
    now = _now()
    db.add(UserEmail(user_id=int(user.id), email=email, email_normalized=normalize(email), source=source,  # type: ignore[arg-type]
                     verified_at=now, creation_date=now, update_date=now))
    db.flush()


def add_verified(db: Session, user: User, email: str | None, source: str = "canvas") -> bool:
    """Add an email someone else vouched for (a school's Canvas). False when it's already this account's or another's.
    Flushes, doesn't commit."""
    if not email:
        return False
    try:
        email = _valid(email)
    except HTTPException:
        return False
    if owner_id(db, email) is not None:
        return False
    if len(db.exec(select(UserEmail.id).where(UserEmail.user_id == user.id)).all()) >= MAX_SPARES:
        return False
    _store(db, user, email, source)
    return True


# Main and removing -------------------------------------------------------------------------------------------------

def make_main(db: Session, user: User, raw_email: str) -> User:
    """Swap a spare in as the main email; the old main stays on as a spare. Commits."""
    key = normalize(raw_email)
    spare = db.exec(select(UserEmail).where(UserEmail.user_id == user.id, UserEmail.email_normalized == key)).first()
    if spare is None:
        if normalize(user.email) == key:
            return user
        raise HTTPException(status_code=404, detail="Add and confirm that email first.")
    old_main, old_verified = user.email, user.email_verified
    now = _now()
    user.email, user.email_verified, user.email_verified_at = spare.email, True, spare.verified_at or now
    user.update_date = now
    if old_main and old_verified:
        spare.email, spare.email_normalized, spare.source, spare.verified_at, spare.update_date = old_main, normalize(old_main), "main", now, now
        db.add(spare)
    else:  # an unverified main email isn't kept
        db.delete(spare)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def remove(db: Session, user: User, raw_email: str) -> dict:
    key = normalize(raw_email)
    if normalize(user.email) == key:
        raise HTTPException(status_code=409, detail="That's your main email. Make another email your main one first.")
    spare = db.exec(select(UserEmail).where(UserEmail.user_id == user.id, UserEmail.email_normalized == key)).first()
    if spare is None:
        raise HTTPException(status_code=404, detail="That email isn't on your account.")
    db.delete(spare)
    db.commit()
    return listing(db, user)
