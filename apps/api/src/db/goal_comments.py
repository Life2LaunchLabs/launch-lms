from __future__ import annotations

from sqlalchemy import JSON, Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class GoalComment(SQLModel, table=True):
    """A comment on a goal or one of its steps, from before plans talked in chats.

    Each goal's comments move into its chat the first time it's opened (services/connect/workspace.py).
    """

    __tablename__ = "goalcomment"
    __table_args__ = (UniqueConstraint("comment_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    comment_uuid: str = Field(index=True)
    goal_id: int = Field(sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), index=True))
    step_uuid: str | None = Field(default=None, index=True)
    parent_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goalcomment.id", ondelete="CASCADE"), nullable=True, index=True))
    author_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    body: str = Field(sa_column=Column(Text, nullable=False))
    mentioned_user_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    resolved_at: str | None = None
    resolved_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""
    update_date: str = ""
