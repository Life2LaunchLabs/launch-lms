"""Settings › Account (PF-3, DEV-213): the username, the account's one phone number and the ways to sign in.

Personal details (name, photo, intro) are edited in the portfolio; Settings holds the account. The phone number is
the one the résumé prints, beside the main email. Google sign-in is "connected" once the person signed in with
Google or connected it here; disconnecting turns Google sign-in off for the account until they connect it again.
Both live in ``User.details`` under keys other people never see (``PRIVATE_DETAILS`` in ``src/db/users.py``).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.users import User

PHONE_KEY = "phone"
GOOGLE_KEY = "google_sign_in"

USERNAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$")
PHONE = re.compile(r"^[0-9+()\-.\s]{7,40}$")

BAD_USERNAME = "Use 3 to 30 letters, numbers, dots, dashes or underscores, starting with a letter or number."
TAKEN_USERNAME = "That username is taken. Try another."
BAD_PHONE = "That phone number doesn't look right."
GOOGLE_OFF = "Google sign-in is turned off for this account. Sign in with your email, then connect Google in Settings."
GOOGLE_TAKEN = "That Google account's email is on another Life2Launch account."
NEEDS_PASSWORD = "Set a password before you disconnect Google, so you can still sign in. Use Forgot password on the sign-in page."


def _details(user: User) -> dict:
    return dict(user.details or {})


def _save(db: Session, user: User, details: dict) -> None:
    user.details = details
    user.update_date = str(datetime.now())
    db.add(user)
    db.commit()
    db.refresh(user)


# Phone ------------------------------------------------------------------------------------------------------------

def phone_of(user: User | None) -> str:
    return str(_details(user).get(PHONE_KEY) or "") if user else ""


def set_phone(db: Session, user: User, raw: str) -> dict:
    """The account's one phone number. Empty takes it off."""
    phone = " ".join(str(raw or "").split())
    if phone and (not PHONE.match(phone) or sum(char.isdigit() for char in phone) < 7):
        raise HTTPException(status_code=422, detail=BAD_PHONE)
    details = _details(user)
    if phone:
        details[PHONE_KEY] = phone
    else:
        details.pop(PHONE_KEY, None)
    _save(db, user, details)
    return {"phone": phone}


# Username ---------------------------------------------------------------------------------------------------------

def change_username(db: Session, user: User, raw: str) -> dict:
    """A new username. Old links to the profile stop working; the old name is free for anyone. No limit on how often."""
    username = str(raw or "").strip()
    if not USERNAME.match(username):
        raise HTTPException(status_code=422, detail=BAD_USERNAME)
    if username == user.username:
        return {"username": username}
    taken = db.exec(select(User.id).where(func.lower(User.username) == username.lower(), User.id != user.id)).first()
    if taken:
        raise HTTPException(status_code=409, detail=TAKEN_USERNAME)
    user.username = username
    user.update_date = str(datetime.now())
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"username": username}


# Sign-in methods --------------------------------------------------------------------------------------------------

def google_state(user: User) -> dict:
    return dict(_details(user).get(GOOGLE_KEY) or {})


def google_connected(user: User) -> bool:
    state = google_state(user)
    if state.get("off"):
        return False
    return bool(state.get("email")) or user.signup_method == "google"


def check_google_sign_in(user: User) -> None:
    """Refuse Google sign-in on an account that disconnected it."""
    if google_state(user).get("off"):
        raise HTTPException(status_code=403, detail=GOOGLE_OFF)


def note_google_sign_in(db: Session, user: User, email: str) -> None:
    """Signing in with Google connects it, so Settings can show it and offer Disconnect."""
    state = google_state(user)
    if state.get("email") == email and not state.get("off"):
        return
    details = _details(user)
    details[GOOGLE_KEY] = {"email": email, "connected_at": datetime.now(timezone.utc).isoformat()}
    _save(db, user, details)


def sign_in_methods(db: Session, user: User) -> dict:
    from src.services.auth import google_oauth
    from src.services.users import account_emails

    listing = account_emails.listing(db, user)
    verified = int(bool(listing["main"]["verified"])) + len(listing["spares"])
    state = google_state(user)
    connected = google_connected(user)
    return {
        "email": {"verified": verified, "total": 1 + len(listing["spares"])},
        "password": {"set": bool(user.password)},
        "google": {"available": google_oauth.enabled(), "connected": connected, "email": state.get("email") if connected else None},
    }


def connect_google(db: Session, user: User, google_email: str) -> dict:
    """Connect the Google account the person just signed in to. Its email joins the account when it's on no account."""
    from src.services.users import account_emails

    email = account_emails.normalize(google_email)
    if not email:
        raise HTTPException(status_code=400, detail="Google didn't share an email address.")
    owner = account_emails.owner_id(db, email)
    if owner is not None and owner != user.id:
        raise HTTPException(status_code=409, detail=GOOGLE_TAKEN)
    # Google sign-in finds the account by email, so the Google account's email has to be on this one.
    if owner is None and not account_emails.add_verified(db, user, google_email, source="google"):
        raise HTTPException(status_code=409, detail="Your account has as many emails as it can hold. Remove one, then connect Google.")
    details = _details(user)
    details[GOOGLE_KEY] = {"email": email, "connected_at": datetime.now(timezone.utc).isoformat()}
    _save(db, user, details)
    return sign_in_methods(db, user)


def disconnect_google(db: Session, user: User) -> dict:
    if not user.password:
        raise HTTPException(status_code=409, detail=NEEDS_PASSWORD)
    details = _details(user)
    details[GOOGLE_KEY] = {"off": True, "disconnected_at": datetime.now(timezone.utc).isoformat()}
    _save(db, user, details)
    return sign_in_methods(db, user)
