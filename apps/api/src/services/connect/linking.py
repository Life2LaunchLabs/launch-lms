"""Pointing to your own plans from any chat, and sharing them with the people there.

In a chat with a school counselor you can tag a step of a plan from somewhere else ("would this
count?"). People in the chat who can't see that plan get asked about first: share it with all of
them, with some of them, or send without sharing, in which case they see a private plan.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, or_, select

from src.db.conversations import Conversation, ConversationMember
from src.db.goals import Goal
from src.db.goal_sharing import PlanCollaboratorRequestCreate
from src.db.users import PublicUser, User
from src.services.connect import people, workspace
from src.services.goals import access
from src.services.goals.sharing_roles import _role, org_summary

VIEWER = "viewer"


def my_plans(db: Session, current_user: PublicUser) -> list[dict]:
    """Plans you can tag from any chat: the ones you own or that are about you."""
    goals = db.exec(select(Goal).where(
        or_(Goal.owner_user_id == current_user.id, Goal.subject_user_id == current_user.id), col(Goal.status).in_(workspace.LIVE),
    ).order_by(col(Goal.id).desc()).limit(40)).all()
    plans = []
    for goal in goals:
        org = org_summary(db, goal.org_id) if goal.org_id else None
        plans.append({**workspace.topic(db, goal), "org_name": org["name"] if org else None})
    return plans


def missing(db: Session, conversation: Conversation, refs: list[dict], sender_id: int) -> list[dict]:
    """Each plan from outside the chat that someone here can't see, with who they are."""
    members = [int(item) for item in db.exec(select(ConversationMember.user_id).where(
        ConversationMember.conversation_id == conversation.id, ConversationMember.status == "active", ConversationMember.user_id != sender_id,
    )).all()]
    found = []
    for goal_uuid in dict.fromkeys(ref["goal_uuid"] for ref in refs if ref.get("outside")):
        goal = access.goal_or_404(db, goal_uuid)
        blind = [user_id for user_id in members if "view_plan" not in access.capabilities(db, goal, user_id)]
        if blind:
            granted = access.capabilities(db, goal, sender_id)
            how = "share" if "manage_collaborators" in granted else "request" if "request_collaborators" in granted else "none"
            found.append({"goal_uuid": goal_uuid, "title": goal.title, "how": how,
                          "people": [summary for summary in (people.person(db, user_id) for user_id in blind) if summary]})
    return found


def share(db: Session, current_user: PublicUser, conversation: Conversation, goal_uuid: str, user_uuids: list[str]) -> str:
    """Let people in this chat see one of your plans: added as viewers, or asked for when the plan's admins decide."""
    from src.services.goals import sharing

    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    members = set(db.exec(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation.id)).all())
    targets = [user for user in db.exec(select(User).where(col(User.user_uuid).in_(user_uuids))).all() if user.id in members and user.id != current_user.id]
    if "manage_collaborators" in granted:
        role = _role(db, goal, VIEWER)
        if not role:
            raise HTTPException(status_code=422, detail="This plan can't be shared with viewers")
        for user in targets:
            if "view_plan" not in access.capabilities(db, goal, int(user.id)):  # type: ignore[arg-type]
                access.add_member(db, goal, int(user.id), role)  # type: ignore[arg-type]
        db.flush()
        access.log(db, goal, current_user.id, "collaborator.role_changed", {"shared_in_chat": conversation.conversation_uuid, "count": len(targets)})
        return "shared"
    if "request_collaborators" in granted:
        for user in targets:
            try:
                sharing.create_collaborator_request(db, current_user, goal_uuid, PlanCollaboratorRequestCreate(email=user.email, role_key=VIEWER, message="Shared from a chat"))
            except HTTPException as error:
                if error.status_code != 409:
                    raise
        return "requested"
    return "none"
