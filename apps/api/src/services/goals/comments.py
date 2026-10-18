"""Comments on a goal and its steps, Google Docs style.

A thread starts on the goal or on one step; replies point at the thread's first comment and the
thread can be resolved. An @handle in a comment tells that person, in their chat with the author,
if they can see the goal, and otherwise brings them in as a Commenter: invited directly by people
who manage the goal's people, or asked for from the goal's admins by everyone else who may ask.
"""

from __future__ import annotations

import re
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goal_comments import GoalComment, GoalCommentCreate, GoalCommentUpdate
from src.db.goals import Goal, GoalStep
from src.db.planning import (
    PlanCollaborator,
    PlanCollaboratorRequestCreate,
    PlanInvitationCreate,
)
from src.db.users import PublicUser, User
from src.services.connect import cards
from src.services.goals import access, sharing
from src.services.goals.sharing_roles import _stamp, user_summary

MENTION = re.compile(r"(?<![\w.@])@([A-Za-z0-9_][A-Za-z0-9_.-]*)")
MAX_BODY = 5000
INVITE_ROLE = "commenter"


def _handles(body: str) -> list[str]:
    seen: list[str] = []
    for match in MENTION.finditer(body):
        handle = match.group(1).rstrip(".-")
        if handle and handle.lower() not in {item.lower() for item in seen}:
            seen.append(handle)
    return seen


def _user_by_handle(db: Session, handle: str) -> User | None:
    user = db.exec(select(User).where(User.username == handle)).first() or db.exec(select(User).where(col(User.username).ilike(handle))).first()
    return user if user and user.username.lower() == handle.lower() else None


def _person(db: Session, user_id: int | None) -> dict | None:
    """Who someone is, without their email: comments are read by everyone on the goal."""
    person = user_summary(db, user_id)
    if person:
        person.pop("email", None)
    return person


def _comment_dict(db: Session, item: GoalComment, viewer_id: int, granted: set[str]) -> dict:
    return {
        "comment_uuid": item.comment_uuid, "step_uuid": item.step_uuid, "body": item.body,
        "author": _person(db, item.author_user_id),
        "mentions": [person for person in (_person(db, user_id) for user_id in item.mentioned_user_ids or []) if person],
        "creation_date": item.creation_date, "update_date": item.update_date,
        "can_edit": item.author_user_id == viewer_id,
        "can_delete": item.author_user_id == viewer_id or "manage_collaborators" in granted,
    }


def _thread_dict(db: Session, item: GoalComment, replies: list[GoalComment], viewer_id: int, granted: set[str]) -> dict:
    return {
        **_comment_dict(db, item, viewer_id, granted),
        "resolved": item.resolved_at is not None, "resolved_at": item.resolved_at, "resolved_by": _person(db, item.resolved_by_user_id),
        "replies": [_comment_dict(db, reply, viewer_id, granted) for reply in replies],
    }


def list_comments(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    rows = db.exec(select(GoalComment).where(GoalComment.goal_id == goal.id).order_by(col(GoalComment.id))).all()
    replies: dict[int, list[GoalComment]] = {}
    for row in rows:
        if row.parent_id:
            replies.setdefault(int(row.parent_id), []).append(row)
    threads = [_thread_dict(db, row, replies.get(int(row.id), []), current_user.id, granted) for row in rows if not row.parent_id]  # type: ignore[arg-type]
    return {"goal_uuid": goal.goal_uuid, "can_comment": "comment" in granted, "threads": threads}


def _thread(db: Session, goal: Goal, comment_uuid: str) -> GoalComment:
    item = db.exec(select(GoalComment).where(GoalComment.goal_id == goal.id, GoalComment.comment_uuid == comment_uuid)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Comment not found")
    return item


def _clean(body: str) -> str:
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Write a comment first")
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=422, detail=f"Comments can be up to {MAX_BODY} characters")
    return body


def _can_see(db: Session, goal: Goal, user_id: int) -> bool:
    return "view_plan" in access.capabilities(db, goal, user_id)


def _notify(db: Session, goal: Goal, comment: GoalComment, recipient_id: int, mentioned: bool = False) -> None:
    """A card in the recipient's chat with the comment's author."""
    cards.goal_comment(db, goal, comment, recipient_id, mentioned=mentioned)


def _bring_in(db: Session, current_user: PublicUser, goal: Goal, granted: set[str], target: User, body: str) -> str:
    """Give someone who can't see the goal a way in: an invitation, or a request to the goal's admins."""
    try:
        if "manage_collaborators" in granted:
            sharing.create_invitation(db, current_user, goal.goal_uuid, PlanInvitationCreate(email=target.email, role_key=INVITE_ROLE))
            return "invited"
        if "request_collaborators" in granted:
            sharing.create_collaborator_request(db, current_user, goal.goal_uuid, PlanCollaboratorRequestCreate(email=target.email, role_key=INVITE_ROLE, message=body[:200]))
            return "requested"
    except HTTPException as error:
        # Already invited or already asked for: the earlier invitation or request still stands.
        if error.status_code == 409:
            return "invited" if "manage_collaborators" in granted else "requested"
        raise
    return "no_access"


def add_comment(db: Session, current_user: PublicUser, goal_uuid: str, payload: GoalCommentCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "comment")
    body = _clean(payload.body)
    parent = _thread(db, goal, payload.parent_uuid) if payload.parent_uuid else None
    if parent and parent.parent_id:
        raise HTTPException(status_code=422, detail="Reply to the thread's first comment")
    step_uuid = parent.step_uuid if parent else payload.step_uuid
    if step_uuid and not db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.step_uuid == step_uuid)).first():
        raise HTTPException(status_code=404, detail="Step not found on this goal")

    mentioned = [user for user in (_user_by_handle(db, handle) for handle in _handles(body)) if user and user.id != current_user.id]
    now = _stamp()
    comment = GoalComment(
        comment_uuid=f"goal_comment_{uuid4()}", goal_id=int(goal.id), step_uuid=step_uuid,  # type: ignore[arg-type]
        parent_id=int(parent.id) if parent else None, author_user_id=current_user.id, body=body,  # type: ignore[arg-type]
        mentioned_user_ids=[int(user.id) for user in mentioned], creation_date=now, update_date=now,  # type: ignore[arg-type]
    )
    db.add(comment)
    if parent and parent.resolved_at:
        # Replying brings a resolved thread back.
        parent.resolved_at, parent.resolved_by_user_id = None, None
        db.add(parent)
    access.log(db, goal, current_user.id, "comment.added", {"comment_uuid": comment.comment_uuid, "step_uuid": step_uuid, "body": body[:500]})
    db.flush()

    outcomes: list[dict] = []
    told: set[int] = {current_user.id}
    for user in mentioned:
        if _can_see(db, goal, int(user.id)):  # type: ignore[arg-type]
            _notify(db, goal, comment, int(user.id), mentioned=True)  # type: ignore[arg-type]
            status = "notified"
        else:
            status = _bring_in(db, current_user, goal, granted, user, body)
        told.add(int(user.id))  # type: ignore[arg-type]
        outcomes.append({"user": _person(db, user.id), "status": status})

    # The people already in the conversation hear about it too: the thread's earlier voices on a reply,
    # and the goal's learner and owner on a new thread.
    if parent:
        earlier = db.exec(select(GoalComment.author_user_id).where((GoalComment.id == parent.id) | (GoalComment.parent_id == parent.id))).all()
        audience = [int(user_id) for user_id in earlier if user_id]
    else:
        audience = [int(user_id) for user_id in (goal.subject_user_id, goal.owner_user_id) if user_id]
    for user_id in dict.fromkeys(audience):
        if user_id not in told and _can_see(db, goal, user_id):
            _notify(db, goal, comment, user_id)
            told.add(user_id)
    db.commit()
    thread = parent or comment
    return {"thread": _thread_of(db, current_user, goal, thread, granted), "mentions": outcomes}


def _thread_of(db: Session, current_user: PublicUser, goal: Goal, thread: GoalComment, granted: set[str]) -> dict:
    db.refresh(thread)
    replies = db.exec(select(GoalComment).where(GoalComment.parent_id == thread.id).order_by(col(GoalComment.id))).all()
    return _thread_dict(db, thread, list(replies), current_user.id, granted)


def update_comment(db: Session, current_user: PublicUser, goal_uuid: str, comment_uuid: str, payload: GoalCommentUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "comment")
    comment = _thread(db, goal, comment_uuid)
    if comment.author_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the person who wrote a comment can change it")
    comment.body = _clean(payload.body)
    comment.update_date = _stamp()
    db.add(comment)
    db.commit()
    return _comment_dict(db, comment, current_user.id, granted)


def delete_comment(db: Session, current_user: PublicUser, goal_uuid: str, comment_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    comment = _thread(db, goal, comment_uuid)
    if comment.author_user_id != current_user.id and "manage_collaborators" not in granted:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")
    for reply in db.exec(select(GoalComment).where(GoalComment.parent_id == comment.id)).all():
        db.delete(reply)
    db.delete(comment)
    access.log(db, goal, current_user.id, "comment.deleted", {"comment_uuid": comment_uuid})
    db.commit()
    return {"deleted": True, "comment_uuid": comment_uuid}


def resolve_thread(db: Session, current_user: PublicUser, goal_uuid: str, comment_uuid: str, resolved: bool) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "comment")
    thread = _thread(db, goal, comment_uuid)
    if thread.parent_id:
        raise HTTPException(status_code=422, detail="Resolve the thread from its first comment")
    thread.resolved_at = _stamp() if resolved else None
    thread.resolved_by_user_id = current_user.id if resolved else None
    db.add(thread)
    db.commit()
    return _thread_of(db, current_user, goal, thread, granted)


def mention_candidates(db: Session, current_user: PublicUser, goal_uuid: str, query: str = "") -> list[dict]:
    """People to suggest after @: the goal's people, and whoever has exactly the handle typed."""
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "comment")
    user_ids = [goal.owner_user_id, goal.subject_user_id, *db.exec(
        select(PlanCollaborator.user_id).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True)  # noqa: E712
    ).all()]
    people = [person for person in (_person(db, user_id) for user_id in dict.fromkeys(user_id for user_id in user_ids if user_id)) if person]
    needle = (query or "").strip().lstrip("@").lower()
    rows = [{**person, "has_access": True} for person in people if person["id"] != current_user.id and (
        not needle or needle in person["username"].lower() or needle in person["name"].lower()
    )]
    if needle and not any(person["username"].lower() == needle for person in rows):
        exact = _user_by_handle(db, needle)
        if exact and exact.id != current_user.id:
            rows.append({**(_person(db, exact.id) or {}), "has_access": _can_see(db, goal, int(exact.id))})  # type: ignore[arg-type]
    return rows[:8]
