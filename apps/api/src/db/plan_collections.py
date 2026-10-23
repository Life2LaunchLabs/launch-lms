"""Plan collections: an organization's own groupings of its plans. A plan can be in many; removing a
collection never touches its plans (see services/goals/collections.py)."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint, false
from sqlmodel import Field, SQLModel


class PlanCollection(SQLModel, table=True):
    __tablename__ = "plan_collection"
    __table_args__ = (UniqueConstraint("collection_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    collection_uuid: str = Field(index=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: str = ""
    # Up to three of services/goals/collections.CATEGORIES; they apply to every plan inside, for Discover.
    categories: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    # The Plans carousel shows the most recently opened first.
    last_opened_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    # Added from Discover: the other organization's collection this one mirrors.
    source_collection_uuid: str | None = Field(default=None, index=True)
    # The platform's own collections can be starter categories: their plans show in every organization's New plan.
    starter: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=false()))
    creation_date: str = ""
    update_date: str = ""


class PlanCollectionItem(SQLModel, table=True):
    __tablename__ = "plan_collection_item"
    __table_args__ = (UniqueConstraint("collection_id", "template_id"),)

    id: int | None = Field(default=None, primary_key=True)
    collection_id: int = Field(sa_column=Column(Integer, ForeignKey("plan_collection.id", ondelete="CASCADE"), index=True))
    template_id: int = Field(sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), index=True))
    position: int = 0
    creation_date: str = ""


class PlanCollectionCreate(SQLModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    categories: list[str] = Field(default_factory=list)
    template_uuids: list[str] = Field(default_factory=list)


class PlanCollectionUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    categories: list[str] | None = None
    starter: bool | None = None


class PlanCollectionPlans(SQLModel):
    template_uuids: list[str] = Field(min_length=1)
