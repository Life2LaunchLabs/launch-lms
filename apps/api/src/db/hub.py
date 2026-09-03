from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class HubAdvisorConfiguration(SQLModel, table=True):
    """Singleton platform configuration for the learner Hub advisor."""

    __tablename__ = "hubadvisorconfiguration"

    id: int | None = Field(default=None, primary_key=True)
    provider: str = Field(default="openai", max_length=50)
    enabled: bool = False
    instructions: str = Field(sa_column=Column(Text, nullable=False))
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubAdvisorProviderConfiguration(SQLModel, table=True):
    """Credential and inference choices retained independently per provider."""

    __tablename__ = "hubadvisorproviderconfiguration"

    provider: str = Field(primary_key=True, max_length=50)
    model: str = Field(max_length=200)
    api_key_ciphertext: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    advanced_settings: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HubAdvisorAdvancedConfiguration(BaseModel):
    max_output_tokens: int = PydanticField(default=700, ge=128, le=4_000)
    reasoning_effort: Literal["default", "none", "low", "medium", "high", "xhigh"] = "default"
    verbosity: Literal["default", "low", "medium", "high"] = "default"
    thinking_effort: Literal["default", "low", "medium", "high", "xhigh", "max"] = "default"


class HubAdvisorConfigurationUpdate(BaseModel):
    provider: Literal["openai", "anthropic"]
    enabled: bool
    model: str = PydanticField(min_length=1, max_length=200)
    instructions: str = PydanticField(min_length=1, max_length=20_000)
    advanced: HubAdvisorAdvancedConfiguration = PydanticField(
        default_factory=HubAdvisorAdvancedConfiguration
    )
    api_key: str | None = PydanticField(default=None, min_length=20, max_length=512)
    clear_api_key: bool = False
