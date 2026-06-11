from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, ForeignKey, Integer, JSON, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class LaunchPlanCardType(str, Enum):
    resource_outcome = "resource_outcome"
    activity_result = "activity_result"
    integration_result = "integration_result"


class LaunchPlanCanvasDefinition(SQLModel, table=True):
    __tablename__ = "launchplancanvasdefinition"
    __table_args__ = (UniqueConstraint("org_id", "slug", name="uq_launchplan_canvas_org_slug"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    canvas_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    slug: str = Field(index=True)
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class LaunchPlanSectionDefinition(SQLModel, table=True):
    __tablename__ = "launchplansectiondefinition"
    __table_args__ = (UniqueConstraint("canvas_id", "slug", name="uq_launchplan_section_canvas_slug"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    section_uuid: str = Field(index=True, unique=True)
    canvas_id: int = Field(sa_column=Column(Integer, ForeignKey("launchplancanvasdefinition.id", ondelete="CASCADE"), index=True))
    resource_tag_id: int = Field(sa_column=Column(Integer, ForeignKey("resourcetag.id", ondelete="RESTRICT"), index=True))
    slug: str = Field(index=True)
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    explanation: Optional[str] = Field(default=None, sa_column=Column(Text))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class UserLaunchPlanSection(SQLModel, table=True):
    __tablename__ = "userlaunchplansection"
    __table_args__ = (UniqueConstraint("user_id", "org_id", "section_id", name="uq_user_launchplan_section"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    section_id: int = Field(sa_column=Column(Integer, ForeignKey("launchplansectiondefinition.id", ondelete="CASCADE"), index=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    intro_seen_at: Optional[str] = None
    creation_date: str = ""
    update_date: str = ""


class UserLaunchPlanCard(SQLModel, table=True):
    __tablename__ = "userlaunchplancard"
    __table_args__ = (
        UniqueConstraint("user_section_id", "card_type", "source_uuid", name="uq_user_launchplan_card_source"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    card_uuid: str = Field(index=True, unique=True)
    user_section_id: int = Field(sa_column=Column(Integer, ForeignKey("userlaunchplansection.id", ondelete="CASCADE"), index=True))
    card_type: LaunchPlanCardType = Field(index=True)
    source_uuid: str = Field(index=True)
    grid: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LaunchPlanCardWrite(BaseModel):
    card_uuid: Optional[str] = None
    card_type: LaunchPlanCardType
    source_uuid: str
    grid: dict = PydanticField(default_factory=dict)


class LaunchPlanWorkspaceUpdate(BaseModel):
    notes: str = ""
    cards: list[LaunchPlanCardWrite] = PydanticField(default_factory=list)
