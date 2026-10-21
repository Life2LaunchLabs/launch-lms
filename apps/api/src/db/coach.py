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
    # {ability_key: bool}; a key that's missing uses the ability's default.
    abilities: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # {tier: {"key_uuid", "model", "settings": CoachModelSettings}}.
    tiers: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # One routine per trigger: {trigger: {"instructions", "tier"}}; a trigger that's missing has no instructions and its default tier.
    routines: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
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


class CoachRelease(SQLModel, table=True):
    """A numbered, frozen copy of the draft: abilities, models, playbooks and routines."""

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


class CoachTest(SQLModel, table=True):
    """A coaching scenario: a made-up learner, a moment, and what a good response must and should do."""

    __tablename__ = "coach_test"

    id: int | None = Field(default=None, primary_key=True)
    test_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    title: str = Field(sa_column=Column(String(200), nullable=False))
    # learner_message, goal_created or conversation.
    moment: str = Field(sa_column=Column(String(60), nullable=False))
    # {"headline", "bio", "strengths": [], "values": [], "now": [], "goals": [{"title", "why", "next_steps": []}]}
    learner: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # learner_message: what the learner says; conversation: how they open it.
    message: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    # conversation: how the simulated learner behaves (Coach never sees it), and how many replies Coach gives.
    persona: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    turns: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    # goal_created: {"title", "why", "target_date", "steps": []}
    goal: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # [{"id", "kind": "must" | "should", "text"}]
    rubric: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    enabled: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    updated_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CoachTestRun(SQLModel, table=True):
    """One run of every test on the draft, beside the live release, graded by a judge model."""

    __tablename__ = "coach_test_run"

    id: int | None = Field(default=None, primary_key=True)
    run_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    status: str = Field(default="running", sa_column=Column(String(20), nullable=False, server_default="running"))
    # Which draft this ran on; a release carries the results of the run on its snapshot.
    snapshot_hash: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    live_number: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    calls: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    done_calls: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    results: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    summary: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    error: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    started_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None


class CoachReport(SQLModel, table=True):
    """A learner's report that a Coach reply went wrong, for the coaching team to review and maybe turn into a test.

    A copy without the learner's name: the conversation up to the reported reply, and what Coach knew
    about them. Deleting the conversation removes its reports.
    """

    __tablename__ = "coach_report"

    id: int | None = Field(default=None, primary_key=True)
    report_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("hubconversation.id", ondelete="CASCADE"), nullable=False, index=True))
    message_uuid: str = Field(sa_column=Column(String, nullable=False))
    # harmful, wrong, unhelpful or other.
    reason: str = Field(sa_column=Column(String(20), nullable=False))
    note: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    # [{"role": "user" | "assistant", "content"}], ending with the reported reply.
    messages: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    # In the shape of a test's learner (see CoachTestLearner).
    learner: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    # new or reviewed.
    status: str = Field(default="new", sa_column=Column(String(20), nullable=False, server_default="new"))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: datetime | None = None


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


class CoachRoutineWrite(BaseModel):
    instructions: str = PydanticField(default="", max_length=20_000)
    tier: Tier = "standard"


class CoachPolicyUpdate(BaseModel):
    """Any field left out stays as it is."""

    enabled: bool | None = None
    abilities: dict[str, bool] | None = None
    tiers: dict[Tier, CoachTierUpdate] | None = None
    # Routines to replace, by trigger; triggers left out stay as they are.
    routines: dict[str, CoachRoutineWrite] | None = None


class CoachReleaseCreate(BaseModel):
    note: str = PydanticField(default="", max_length=2_000)


class CoachReportCreate(BaseModel):
    reason: Literal["harmful", "wrong", "unhelpful", "other"]
    note: str = PydanticField(default="", max_length=1_000)


class CoachRubricLine(BaseModel):
    id: str = PydanticField(default="", max_length=40)
    kind: Literal["must", "should"] = "should"
    text: str = PydanticField(min_length=1, max_length=500)


class CoachTestGoal(BaseModel):
    title: str = PydanticField(default="", max_length=200)
    why: str = PydanticField(default="", max_length=1_000)
    target_date: str = PydanticField(default="", max_length=10)
    steps: list[str] = PydanticField(default_factory=list, max_length=20)


class CoachTestLearnerGoal(BaseModel):
    title: str = PydanticField(min_length=1, max_length=200)
    why: str = PydanticField(default="", max_length=500)
    next_steps: list[str] = PydanticField(default_factory=list, max_length=5)


class CoachTestLearner(BaseModel):
    """Written like a real portfolio, in the shape Coach sees for a real learner."""

    headline: str = PydanticField(default="", max_length=200)
    bio: str = PydanticField(default="", max_length=800)
    location: str = PydanticField(default="", max_length=80)
    strengths: list[str] = PydanticField(default_factory=list, max_length=8)
    values: list[str] = PydanticField(default_factory=list, max_length=8)
    now: list[str] = PydanticField(default_factory=list, max_length=4)
    goals: list[CoachTestLearnerGoal] = PydanticField(default_factory=list, max_length=8)


class CoachTestWrite(BaseModel):
    title: str = PydanticField(min_length=1, max_length=200)
    moment: Literal["learner_message", "goal_created", "conversation"]
    learner: CoachTestLearner = PydanticField(default_factory=CoachTestLearner)
    message: str = PydanticField(default="", max_length=2_000)
    persona: str = PydanticField(default="", max_length=1_500)
    turns: int = PydanticField(default=3, ge=2, le=4)
    goal: CoachTestGoal = PydanticField(default_factory=CoachTestGoal)
    rubric: list[CoachRubricLine] = PydanticField(min_length=1, max_length=12)
    enabled: bool = True


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


class CoachOrder(BaseModel):
    uuids: list[str] = PydanticField(max_length=500)
