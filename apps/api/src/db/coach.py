"""Coach's platform policy: how Coach coaches, what it knows, when it acts, what it may do, and which models it runs on.

One policy serves the whole platform. Platform admins edit it on Platform › Coach; Coach reads
it on every conversation and routine.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Boolean, Column, ForeignKey, Integer, String, Text
from sqlmodel import Field, SQLModel

Tier = Literal["fast", "standard", "deep"]
TIERS: tuple[Tier, ...] = ("fast", "standard", "deep")


class CoachPolicy(SQLModel, table=True):
    """The single platform policy row (id 1)."""

    __tablename__ = "coach_policy"

    id: int | None = Field(default=None, primary_key=True)
    enabled: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    # The coaching team's own document: approach, voice, standards. Markdown.
    method: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    # {ability_key: bool}; a key that's missing uses the ability's default.
    abilities: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # {tier: {"key_uuid", "model", "settings": CoachModelSettings}}.
    tiers: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # Conversation-starter cards on Coach home; NULL means the code defaults.
    launch_cards: list | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    # The release learners get. Edits on the tabs change the draft; NULL (no release yet) means Coach runs the draft.
    live_release_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("coach_release.id", ondelete="SET NULL"), nullable=True))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CoachProviderKey(SQLModel, table=True):
    """One API key for a model provider. A platform can hold several keys per provider."""

    __tablename__ = "coach_provider_key"

    id: int | None = Field(default=None, primary_key=True)
    key_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    provider: str = Field(sa_column=Column(String(50), nullable=False))
    label: str = Field(sa_column=Column(String(120), nullable=False))
    ciphertext: str = Field(sa_column=Column(Text, nullable=False))
    last_four: str = Field(default="", sa_column=Column(String(8), nullable=False, server_default=""))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CoachPlaybook(SQLModel, table=True):
    """Knowledge the coaching team writes. Coach reads it when a conversation matches ``used_when``, or always."""

    __tablename__ = "coach_playbook"

    id: int | None = Field(default=None, primary_key=True)
    playbook_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    title: str = Field(sa_column=Column(String(200), nullable=False))
    used_when: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    body: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    always: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    enabled: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CoachRoutine(SQLModel, table=True):
    """When a trigger happens, Coach gets these instructions."""

    __tablename__ = "coach_routine"

    id: int | None = Field(default=None, primary_key=True)
    routine_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    name: str = Field(sa_column=Column(String(200), nullable=False))
    trigger: str = Field(sa_column=Column(String(60), nullable=False, index=True))
    instructions: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    tier: str = Field(default="standard", sa_column=Column(String(20), nullable=False, server_default="standard"))
    enabled: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CoachRelease(SQLModel, table=True):
    """A numbered, frozen copy of the draft: method, abilities, models, playbooks and routines."""

    __tablename__ = "coach_release"

    id: int | None = Field(default=None, primary_key=True)
    release_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    number: int = Field(sa_column=Column(Integer, nullable=False, unique=True))
    snapshot: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    # What changed from the release that was live, in words.
    changes: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    note: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    released_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    released_at: datetime = Field(default_factory=datetime.utcnow)


class CoachModelSettings(BaseModel):
    max_output_tokens: int = PydanticField(default=700, ge=128, le=4_000)
    # OpenAI
    reasoning_effort: Literal["default", "none", "low", "medium", "high", "xhigh"] = "default"
    verbosity: Literal["default", "low", "medium", "high"] = "default"
    # Anthropic
    thinking_effort: Literal["default", "low", "medium", "high", "xhigh", "max"] = "default"


class CoachTierUpdate(BaseModel):
    key_uuid: str = PydanticField(default="", max_length=80)
    model: str = PydanticField(default="", max_length=200)
    settings: CoachModelSettings = PydanticField(default_factory=CoachModelSettings)


class CoachPolicyUpdate(BaseModel):
    """Any field left out stays as it is."""

    enabled: bool | None = None
    method: str | None = PydanticField(default=None, max_length=60_000)
    abilities: dict[str, bool] | None = None
    tiers: dict[Tier, CoachTierUpdate] | None = None


class CoachReleaseCreate(BaseModel):
    note: str = PydanticField(default="", max_length=2_000)


class CoachKeyCreate(BaseModel):
    provider: Literal["openai", "anthropic"]
    label: str = PydanticField(min_length=1, max_length=120)
    api_key: str = PydanticField(min_length=20, max_length=512)


class CoachKeyUpdate(BaseModel):
    label: str | None = PydanticField(default=None, min_length=1, max_length=120)
    api_key: str | None = PydanticField(default=None, min_length=20, max_length=512)


class CoachPlaybookWrite(BaseModel):
    title: str = PydanticField(min_length=1, max_length=200)
    used_when: str = PydanticField(default="", max_length=2_000)
    body: str = PydanticField(default="", max_length=60_000)
    always: bool = False
    enabled: bool = True


class CoachRoutineWrite(BaseModel):
    name: str = PydanticField(min_length=1, max_length=200)
    trigger: str = PydanticField(min_length=1, max_length=60)
    instructions: str = PydanticField(default="", max_length=20_000)
    tier: Tier = "standard"
    enabled: bool = True


class CoachOrder(BaseModel):
    uuids: list[str] = PydanticField(max_length=500)
