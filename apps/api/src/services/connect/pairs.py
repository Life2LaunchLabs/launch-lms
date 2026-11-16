"""Two people never keep two chats: a plan only they are on talks in their direct chat.

A personal plan shared with one other person (a learner and a parent), or an organization's plan
with only a helper besides its learner, has no chat of its own. Its talk is a topic in the pair's
direct chat, beside their portfolios and anything else they say. A plan chat from before this
moves into the direct chat the first time it's touched (see merge), and a plan that gains a third
person gets a chat of its own again (workspace._goal_chat).
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goal_sharing import PlanCollaborator
from src.db.goals import Goal
from src.services.connect import chats, people
from src.services.goals.sharing_roles import _stamp


def pair_chat(db: Session, wanted: set[int], create: bool) -> Conversation | None:
    """The direct chat of the only two people on a plan. None if either stepped away from it (or, without create, it doesn't exist yet)."""
    low, high = sorted(wanted)
    if not create and not chats._direct(db, low, high):
        return None
    return chats.ensure_direct(db, low, high)


def direct_for(db: Session, goal: Goal, own: Conversation | None, wanted: set[int], create: bool) -> Conversation | None:
    """The pair's direct chat for a plan only they are on, with the plan's own chat from before moved into it the first time it's touched."""
    pair = pair_chat(db, wanted, create or own is not None)
    if pair and own and own.id != pair.id:
        merge(db, own, pair, goal)
    return pair


def about_plan(query, conversation: Conversation, about):
    """Between two people, a plan's chat is their whole conversation but what's about something else:
    a reply written in Connect without tagging the plan still answers what was asked about it."""
    tagged = select(ConversationMessageRef.message_id).where(ConversationMessageRef.conversation_id == conversation.id)
    return query.where(col(ConversationMessage.id).in_(about) | col(ConversationMessage.id).not_in(tagged))


def chat_name(db: Session, conversation: Conversation, viewer_id: int) -> str | None:
    """A chat's name: its own, or for a direct chat the other person's."""
    if conversation.title:
        return conversation.title
    other = next((member.user_id for member in chats._members(db, conversation) if member.user_id != viewer_id), None)
    summary = people.person(db, other) if other else None
    return summary["name"] if summary else None


def merge(db: Session, old: Conversation, into: Conversation, goal: Goal) -> None:
    """Move a plan's own chat into its two people's direct chat, so they keep one conversation.

    Everything said there was about the plan, so a message that tagged nothing keeps the plan as its topic.
    The emptied chat stays without members, out of everyone's list.
    """
    messages = list(db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == old.id)).all())
    if messages:
        about = set(db.exec(select(ConversationMessageRef.message_id).where(
            ConversationMessageRef.conversation_id == old.id, ConversationMessageRef.goal_id == goal.id,
        )).all())
        for ref in db.exec(select(ConversationMessageRef).where(ConversationMessageRef.conversation_id == old.id)).all():
            ref.conversation_id = int(into.id)  # type: ignore[arg-type]
            db.add(ref)
        for message in messages:
            message.conversation_id = int(into.id)  # type: ignore[arg-type]
            db.add(message)
            if message.id not in about:
                db.add(ConversationMessageRef(message_id=int(message.id), conversation_id=int(into.id), goal_id=int(goal.id), step_uuid=None))  # type: ignore[arg-type]
        newest = max((message.creation_date for message in messages if message.creation_date), default=None)
        if newest and (not into.last_message_at or into.last_message_at < newest):
            into.last_message_at = newest
        into.update_date = _stamp()
        db.add(into)
    for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == old.id)).all():
        db.delete(member)
    old.last_message_at = None
    db.add(old)
    db.flush()


def _involved(db: Session, user_id: int) -> set[int]:
    """The live plans someone owns, is the learner on, or was brought onto."""
    from src.services.connect import workspace

    own = db.exec(select(Goal.id).where(
        (Goal.owner_user_id == user_id) | (Goal.subject_user_id == user_id), col(Goal.status).in_(workspace.LIVE),  # type: ignore[arg-type]
    )).all()
    joined = db.exec(select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == user_id, PlanCollaborator.active == True)).all()  # noqa: E712
    return {int(item) for item in (*own, *joined)}


def pair_goals(db: Session, a: int, b: int) -> list[Goal]:
    """The plans only these two people are on, which talk in their direct chat: personal plans, and an organization's plan with a helper on it."""
    from src.services.connect import workspace

    shared = sorted(_involved(db, a) & _involved(db, b))
    if not shared:
        return []
    goals = db.exec(select(Goal).where(col(Goal.id).in_(shared), col(Goal.status).in_(workspace.LIVE)).order_by(col(Goal.id))).all()
    return [goal for goal in goals if (not workspace._external(goal) or workspace.helpers_on(db, goal)) and workspace._goal_people(db, goal) == {a, b}]


def settle_pairs(db: Session, user_id: int) -> bool:
    """Fold each plan chat this person is in that only two people are on into their direct chat. Whether anything moved."""
    from src.services.connect import workspace

    rows = db.exec(select(Conversation).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(
        ConversationMember.user_id == user_id, Conversation.kind == workspace.GOAL,
    )).all()
    moved = False
    for conversation in rows:
        for goal in workspace.goals_in(db, conversation):
            if len(workspace._goal_people(db, goal)) == 2 and (found := workspace._goal_chat(db, goal, create=False)) and found.id != conversation.id:
                moved = True
    return moved
