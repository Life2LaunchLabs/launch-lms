"""What one person sees on someone's profile: the goals shared with them, their chat, and their portfolio role."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, col, select

from src.db.conversations import ConversationMember
from src.db.goals import Goal, GoalStatus
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service, portfolio_people
from src.services.connect import chats, people
from src.services.goals import access

HIDDEN = (GoalStatus.DRAFT.value, GoalStatus.ARCHIVED.value)


def _value(item) -> str:
    return getattr(item, "value", item)


def shared_goals(db: Session, viewer_id: int, user_id: int) -> list[dict]:
    """Goals that are this person's (as learner, or owner of their own) and that the viewer can see."""
    goals = db.exec(select(Goal).where(or_(
        Goal.subject_user_id == user_id, (Goal.owner_user_id == user_id) & col(Goal.subject_user_id).is_(None),
    )).order_by(col(Goal.id).desc())).all()
    rows = []
    for goal in goals:
        if _value(goal.status) in HIDDEN or "view_plan" not in access.capabilities(db, goal, viewer_id):
            continue
        rows.append({
            "goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status),
            "icon": (goal.details or {}).get("icon"), "target_date": goal.target_date,
            "can_comment": "comment" in access.capabilities(db, goal, viewer_id),
        })
    return rows


def profile(db: Session, current_user: PublicUser, username: str) -> dict:
    user = db.exec(select(User).where(User.username == username)).first()
    if not user or people.blocked(db, current_user.id, int(user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail="No one goes by that handle")
    user_id = int(user.id)  # type: ignore[arg-type]
    own = user_id == current_user.id
    conversation = None if own else chats._direct(db, current_user.id, user_id)
    member = db.exec(select(ConversationMember).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id,
    )).first() if conversation else None
    portfolio = portfolio_service._get_portfolio(db, user_id)
    return {
        "person": people.person(db, user_id),
        "goals": [] if own else shared_goals(db, current_user.id, user_id),
        "portfolio_role": portfolio_people.role_for(db, portfolio, current_user.id) if portfolio else None,
        "chat_uuid": conversation.conversation_uuid if conversation and member and member.status in ("active", "request") and conversation.last_message_at else None,
        "can_message": not own and (people.knows(db, current_user.id, user_id) or people.discoverable(user) or conversation is not None),
    }
