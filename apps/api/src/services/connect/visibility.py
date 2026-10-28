"""Staff-only messages: who reads them, and keeping them from everyone else.

Any message in an assignment's threads can be marked staff only: in a learner's chat with the
organization, or in a group assignment's chat with the whole group. Staff (the organization's
admins and staff) read them as part of the thread; learners and the helpers on their plans never
see them anywhere: not in the thread, its counts, unread badges, previews or notifications.
"""

from __future__ import annotations

from sqlmodel import Session

from src.db.conversations import Conversation, ConversationMessage
from src.services.school import roles as school_roles

ALL, STAFF = "all", "staff"
# Chats with a staff side: a learner's chat with the organization, and an assignment's group chat.
STAFF_KINDS = ("school", "cohort")
AUDIENCES = ("all", "learner", "staff")


def _student(conversation: Conversation) -> int | None:
    parts = (conversation.direct_key or "").split(":")
    return int(parts[2]) if conversation.kind == "school" and len(parts) == 3 and parts[2].isdigit() else None


def sees_staff(db: Session, conversation: Conversation, user_id: int | None) -> bool:
    """Whether this person reads the chat's staff-only messages: its organization's staff, never its learner."""
    if not user_id or conversation.kind not in STAFF_KINDS or not conversation.org_id or user_id == _student(conversation):
        return False
    return school_roles.is_staff(db, int(conversation.org_id), int(user_id))


def for_viewer(query, db: Session, conversation: Conversation, user_id: int | None):
    """A message query narrowed to what this person may read."""
    return query if sees_staff(db, conversation, user_id) else query.where(ConversationMessage.visibility == ALL)


def for_audience(query, audience: str | None):
    """All messages, the ones learners see, or staff-only ones."""
    if audience == "learner":
        return query.where(ConversationMessage.visibility == ALL)
    if audience == "staff":
        return query.where(ConversationMessage.visibility == STAFF)
    return query
