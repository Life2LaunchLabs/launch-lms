"""Chats between people: direct conversations and groups, their members and messages.

A message is either text someone wrote or a card the app posts for them, such as
"3 comments on Earn a nursing degree". Text can tag a plan, a step, a person or an
organization inline; each plan or step it tags gets a ref row, so a chat filters by them. A member's status says whether the chat is in
their list (active), waiting for them to accept (request), or hidden (declined, blocked).
"""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import JSON, Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class Conversation(SQLModel, table=True):
    __tablename__ = "conversation"
    __table_args__ = (UniqueConstraint("assignment_id", "channel", name="uq_conversation_assignment_channel"),)

    id: int | None = Field(default=None, primary_key=True)
    conversation_uuid: str = Field(index=True, unique=True)
    kind: str = Field(default="direct", sa_column=Column(String, nullable=False))
    # "low:high" user ids, so two people share one direct chat.
    direct_key: str | None = Field(default=None, sa_column=Column(String, nullable=True, unique=True))
    title: str | None = None
    org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=True, index=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    # A cohort chat: the assignment it's about, and who reads it (see services/connect/cohort.py).
    assignment_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_assignment.id", ondelete="CASCADE"), nullable=True, index=True))
    channel: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    last_message_at: str | None = Field(default=None, index=True)
    creation_date: str = ""
    update_date: str = ""


class ConversationMember(SQLModel, table=True):
    __tablename__ = "conversationmember"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conversationmember_conversation_user"),)

    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("conversation.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    status: str = Field(default="active", sa_column=Column(String, nullable=False))
    last_read_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class ConversationMessage(SQLModel, table=True):
    __tablename__ = "conversationmessage"
    __table_args__ = (Index("ix_conversationmessage_conversation_created", "conversation_id", "creation_date"),)

    id: int | None = Field(default=None, primary_key=True)
    message_uuid: str = Field(index=True, unique=True)
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("conversation.id", ondelete="CASCADE"), nullable=False))
    sender_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    kind: str = Field(default="text", sa_column=Column(String, nullable=False))
    body: str = Field(sa_column=Column(Text, nullable=False))
    card: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    # What the message tags, in order: [{"kind": "plan"|"step"|"user"|"org", ...ids}].
    refs: list | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    # "all", or "staff": only the organization's staff read it (services/connect/visibility.py).
    visibility: str = Field(default="all", sa_column=Column(String, nullable=False, server_default="all"))
    creation_date: str = ""
    update_date: str = ""


class ConversationMessageRef(SQLModel, table=True):
    """A plan, or one of its steps, that a message is about. In a cohort chat: a template step, with no goal."""

    __tablename__ = "conversationmessageref"
    __table_args__ = (Index("ix_conversationmessageref_filter", "conversation_id", "goal_id", "step_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(sa_column=Column(Integer, ForeignKey("conversationmessage.id", ondelete="CASCADE"), nullable=False, index=True))
    conversation_id: int = Field(sa_column=Column(Integer, ForeignKey("conversation.id", ondelete="CASCADE"), nullable=False))
    goal_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=True))
    step_uuid: str | None = Field(default=None, sa_column=Column(String, nullable=True))


class ConversationReaction(SQLModel, table=True):
    """A cheer on a message: one per person, message and emoji."""

    __tablename__ = "conversationreaction"
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_conversationreaction_message_user_emoji"),)

    id: int | None = Field(default=None, primary_key=True)
    message_id: int = Field(sa_column=Column(Integer, ForeignKey("conversationmessage.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    emoji: str = Field(sa_column=Column(String, nullable=False))
    creation_date: str = ""


class UserBlock(SQLModel, table=True):
    __tablename__ = "userblock"
    __table_args__ = (UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_userblock_pair"),)

    id: int | None = Field(default=None, primary_key=True)
    blocker_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    blocked_user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    creation_date: str = ""


class ConversationReport(SQLModel, table=True):
    __tablename__ = "conversationreport"

    id: int | None = Field(default=None, primary_key=True)
    report_uuid: str = Field(index=True, unique=True)
    conversation_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("conversation.id", ondelete="SET NULL"), nullable=True, index=True))
    message_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("conversationmessage.id", ondelete="SET NULL"), nullable=True))
    reporter_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    reported_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True))
    reason: str = Field(sa_column=Column(Text, nullable=False))
    # A copy of the reported message, so the report survives the message being deleted.
    excerpt: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    # open, then resolved (someone acted) or dismissed (nothing to do), by an admin of an organization either person is in.
    status: str = Field(default="open", sa_column=Column(String, nullable=False, index=True))
    reviewed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    review_date: str | None = None
    creation_date: str = ""


class DirectChatOpen(BaseModel):
    """Someone to chat with, by @handle or user uuid."""

    handle: str | None = None
    user_uuid: str | None = None


class ChatMessageCreate(BaseModel):
    body: str = PydanticField(min_length=1, max_length=4000)
    # The plan, or plan and step, the chat is filtered to: the message is about it.
    goal_uuid: str | None = None
    step_uuid: str | None = None
    # For each of your plans from elsewhere that you tagged, who here to share it with. {} sends without sharing.
    share: dict[str, list[str]] | None = None
    # Only the organization's staff will read it: in a learner's chat with the organization or an assignment's group chat.
    staff_only: bool = False


class ReactionToggle(BaseModel):
    emoji: str = PydanticField(default="👏", min_length=1, max_length=16)


class ChatReportCreate(BaseModel):
    reason: str = PydanticField(min_length=1, max_length=2000)
    message_uuid: str | None = None
    block: bool = True


class ChatReportReview(BaseModel):
    status: str = PydanticField(pattern="^(open|resolved|dismissed)$")


class ConnectSettingsUpdate(BaseModel):
    discoverable: bool
