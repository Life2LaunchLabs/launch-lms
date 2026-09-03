from datetime import datetime

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class HubAdvisorConfiguration(SQLModel, table=True):
    """Singleton platform configuration for the learner Hub advisor."""

    __tablename__ = "hubadvisorconfiguration"

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(default="openai", max_length=50)
    enabled: bool = False
    model: str = Field(max_length=200)
    instructions: str = Field(sa_column=Column(Text, nullable=False))
    api_key_ciphertext: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubAdvisorConfigurationUpdate(BaseModel):
    enabled: bool
    model: str = PydanticField(min_length=1, max_length=200)
    instructions: str = PydanticField(min_length=1, max_length=20_000)
    api_key: str | None = PydanticField(default=None, min_length=20, max_length=512)
    clear_api_key: bool = False
