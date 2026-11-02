"""Usernames for new accounts. The username is the public portfolio link (/user/<username>), so it is
picked at sign-up or made at random, never taken from the email: many learners are minors, and an email
often holds a full name or a school ID."""

import re
import secrets

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.users import User

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,29}$")


def generate_username(email: str, db_session: Session) -> str:
    """A random "learner…" username. The email is taken only to keep the old signature; it isn't read."""
    while True:
        candidate = f"learner{secrets.token_hex(4)}"
        if not db_session.exec(select(User).where(User.username == candidate)).first():
            return candidate


def picked_username(raw: str | None, db_session: Session) -> str | None:
    """A username picked on the sign-up page, checked: 3 to 30 letters, numbers, dots, dashes or underscores."""
    if raw is None or not raw.strip():
        return None
    username = raw.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=422, detail="A username is 3 to 30 letters, numbers, dots, dashes or underscores")
    if db_session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=409, detail="That username is taken")
    return username
