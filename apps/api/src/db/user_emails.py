"""An account's spare emails (DEV-197, PF-2).

The main email stays on ``User.email``: sign-in tokens, notifications and display use it. Spare emails are verified
addresses the person can also sign in with and be invited at, kept so an account outlives a school or work address.
An email belongs to at most one account, main or spare (``services/users/account_emails.py`` checks both).
"""

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlmodel import Field, SQLModel


class UserEmail(SQLModel, table=True):
    __tablename__ = "useremail"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    email: str = Field(sa_column=Column(String, nullable=False))
    email_normalized: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    # How it was verified: "code" (the person typed the code sent to it), "canvas" (their school's Canvas vouched
    # for it at a launch) or "main" (it was their main email before they changed it).
    source: str = Field(default="code", sa_column=Column(String, nullable=False, server_default="code"))
    verified_at: str = ""
    creation_date: str = ""
    update_date: str = ""
