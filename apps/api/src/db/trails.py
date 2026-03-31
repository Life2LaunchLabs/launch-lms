from typing import Optional
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel
from src.db.trail_runs import TrailRunRead


class TrailBase(SQLModel):
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True)
    )
    guest_session_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True)
    )


class Trail(TrailBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True)
    )
    guest_session_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True)
    )
    trail_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""


class TrailCreate(TrailBase):
    pass


# TODO: This is a hacky way to get around the list[TrailRun] issue, find a better way to do this
class TrailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    trail_uuid: Optional[str] = None
    org_id: int
    user_id: Optional[int] = None
    guest_session_id: Optional[int] = None
    creation_date: Optional[str] = None
    update_date: Optional[str] = None
    runs: list[TrailRunRead]
