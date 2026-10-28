from datetime import datetime

from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class PlatformSecret(SQLModel, table=True):
    """A platform-wide API key a superadmin pastes in Platform › Settings (Pexels, for now).

    Encrypted at rest and never returned; the environment variable stays the fallback.
    """

    __tablename__ = "platformsecret"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(max_length=64, unique=True, index=True)
    ciphertext: str = Field(sa_column=Column(Text, nullable=False))
    last4: str = Field(default="", max_length=4)
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PlatformSecretUpdate(SQLModel):
    # An empty value removes the saved key (the environment variable applies again).
    value: str = Field(default="", max_length=512)
