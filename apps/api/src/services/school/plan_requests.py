"""Learners asking for a plan in Discover, as Threads shows them: a card in the learner's thread for
staff who decide (admins, and staff who manage learners), and the answer posted to the learner there.

Someone who isn't one of the organization's people yet can ask too; until they're answered, their
thread is the request (they become a learner when it's accepted).
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.plan_joining import JoinRequestStatus, PlanJoinRequest
from src.security.org_auth import is_org_admin
from src.security.superadmin import is_user_superadmin
from src.services.connect import chats
from src.services.school import chats as school_chats

APPLICANT = "applicant"


def can_decide(db: Session, user_id: int, org_id: int) -> bool:
    return is_org_admin(user_id, org_id, db, "manage_learners") or is_user_superadmin(user_id, db)


def waiting(db: Session, org_id: int, user_id: int | None = None) -> list[PlanJoinRequest]:
    query = select(PlanJoinRequest).where(PlanJoinRequest.org_id == org_id, PlanJoinRequest.status == JoinRequestStatus.REQUESTED.value)
    if user_id is not None:
        query = query.where(PlanJoinRequest.user_id == user_id)
    return list(db.exec(query.order_by(col(PlanJoinRequest.creation_date))).all())


def cards(db: Session, org_id: int, user_id: int) -> list[dict]:
    from src.services.goals.plan_joining import _request_dict

    return [_request_dict(db, row) for row in waiting(db, org_id, user_id)]


def tell_learner(db: Session, row: PlanJoinRequest, decider_id: int, title: str, accepted: bool) -> None:
    """The answer, from whoever gave it, in the learner's chat with the organization."""
    conversation = school_chats.school_chat(db, row.org_id, row.user_id)
    body = (f"I accepted your request for “{title}”. It’s in your plans now." if accepted
            else f"I declined your request for “{title}” for now. Reply here if you’d like to talk about it.")
    chats.post(db, conversation, decider_id, body)
