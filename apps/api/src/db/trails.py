
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel
from src.db.trail_runs import TrailRunRead


class TrailBase(SQLModel):
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True)
    )
    guest_session_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True)
    )


class Trail(TrailBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True)
    )
    guest_session_id: int | None = Field(
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

    id: int | None = None
    trail_uuid: str | None = None
    org_id: int
    user_id: int | None = None
    guest_session_id: int | None = None
    creation_date: str | None = None
    update_date: str | None = None
    runs: list[TrailRunRead]
