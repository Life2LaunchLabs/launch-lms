from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


class SuggestedActionEventType(str, Enum):
    VIEWED = "viewed"
    CLICKED = "clicked"
    DISMISSED = "dismissed"
    COMPLETED = "completed"


class SuggestedActionKind(str, Enum):
    CONTINUE_LEARNING = "continue_learning"
    PROFILE_COMPLETION = "profile_completion"
    CONTENT_DISCOVERY = "content_discovery"
    ONBOARDING = "onboarding"
    ANNOUNCEMENT = "announcement"
    SCAFFOLDED_PATH = "scaffolded_path"


class SuggestedActionTextTone(str, Enum):
    DARK = "dark"
    LIGHT = "light"


class SuggestedActionState(SQLModel, table=True):
    __tablename__ = "suggestedactionstate"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "org_id",
            "action_key",
            "surface",
            name="uq_suggestedactionstate_user_org_key_surface",
        ),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    action_key: str = Field(index=True)
    surface: str = Field(default="global", index=True)
    dismissed_until: Optional[str] = None
    completed_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    last_clicked_at: Optional[str] = None
    view_count: int = 0
    click_count: int = 0
    metadata_json: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    creation_date: str = ""
    update_date: str = ""


class SuggestedAction(BaseModel):
    key: str
    source: str
    kind: SuggestedActionKind
    title: str
    subtext: Optional[str] = None
    href: str
    imageUrl: Optional[str] = None
    textTone: SuggestedActionTextTone = SuggestedActionTextTone.DARK
    priority: int
    dismissible: bool
    expiresAt: Optional[str] = None
    metadata: dict = PydanticField(default_factory=dict)


class SuggestedActionEventCreate(BaseModel):
    action_key: str
    event_type: SuggestedActionEventType
    surface: str = "global"
    metadata: dict = PydanticField(default_factory=dict)


class SuggestedActionStateRead(BaseModel):
    id: Optional[int] = None
    user_id: int
    org_id: int
    action_key: str
    surface: str
    dismissed_until: Optional[str] = None
    completed_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    last_clicked_at: Optional[str] = None
    view_count: int = 0
    click_count: int = 0
    metadata: dict = PydanticField(default_factory=dict)
    creation_date: str = ""
    update_date: str = ""
