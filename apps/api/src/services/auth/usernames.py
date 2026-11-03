"""Usernames for new accounts. Sign-up doesn't ask for one; the account gets a random one, never one
taken from the email: many learners are minors, and an email often holds a full name or a school ID."""

import secrets

from sqlmodel import Session, select

from src.db.users import User


def generate_username(email: str, db_session: Session) -> str:
    """A random "learner…" username. The email is taken only to keep the old signature; it isn't read."""
    while True:
        candidate = f"learner{secrets.token_hex(4)}"
        if not db_session.exec(select(User).where(User.username == candidate)).first():
            return candidate
