"""OAuth 2.1 authorization server records for connected apps (e.g. Claude).

Secrets, codes and tokens are stored only as sha256 hashes.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlmodel import Field, SQLModel


class OAuthClient(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    client_id: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    client_secret_hash: str | None = Field(default=None, sa_column=Column(String(64), nullable=True))
    client_name: str = Field(default="", sa_column=Column(String(200), nullable=False))
    client_uri: str | None = Field(default=None, sa_column=Column(String(500), nullable=True))
    logo_uri: str | None = Field(default=None, sa_column=Column(String(500), nullable=True))
    redirect_uris: list = Field(default_factory=list, sa_column=Column(JSON))
    token_endpoint_auth_method: str = Field(default="none", sa_column=Column(String(32), nullable=False))
    scope: str = Field(default="", sa_column=Column(String(500), nullable=False))
    creation_date: str = ""


class OAuthAuthorizationCode(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code_hash: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    client_id: str = Field(sa_column=Column(String(64), nullable=False))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    redirect_uri: str = Field(sa_column=Column(String(500), nullable=False))
    code_challenge: str = Field(sa_column=Column(String(128), nullable=False))
    scope: str = Field(default="", sa_column=Column(String(500), nullable=False))
    resource: str = Field(default="", sa_column=Column(String(500), nullable=False))
    expires_at: datetime = Field(sa_column=Column(DateTime, nullable=False))
    used_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))


class OAuthGrant(SQLModel, table=True):
    """One access/refresh token pair. Refreshing rotates to a new row in the same family."""

    id: int | None = Field(default=None, primary_key=True)
    family_id: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    access_token_hash: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    refresh_token_hash: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    client_id: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    scope: str = Field(default="", sa_column=Column(String(500), nullable=False))
    resource: str = Field(default="", sa_column=Column(String(500), nullable=False))
    access_expires_at: datetime = Field(sa_column=Column(DateTime, nullable=False))
    refresh_expires_at: datetime = Field(sa_column=Column(DateTime, nullable=False))
    rotated_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    revoked_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    last_used_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
