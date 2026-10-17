"""Coach's notes on a goal, as the learner sees and acts on them.

Notes are the goal owner's own: nobody else sees them, not even people the goal is shared
with. Acting on a note records the choice and hands back the action for the page to run
(open the chat with a prompt, start a session, open a step); nothing here changes the goal.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.goals import CoachNote, CoachNoteStatus, Goal, GoalStatus
from src.db.users import PublicUser
from src.services.goals import access, check_ins
from src.services.goals.check_ins import CADENCE


class NoteAction(BaseModel):
    action_id: str = Field(max_length=20)


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _open(now: datetime):
    return (CoachNote.status == CoachNoteStatus.OPEN.value) & ((CoachNote.expires_at.is_(None)) | (CoachNote.expires_at > now))  # type: ignore[union-attr, operator]


def note_dict(note: CoachNote, goal: Goal) -> dict:
    return {
        "note_uuid": note.note_uuid, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "kind": note.kind,
        "title": note.title, "body": note.body, "actions": note.actions or [], "status": _value(note.status),
        "created_at": note.created_at, "expires_at": note.expires_at,
    }


def _own_goal(db: Session, user_id: int, goal_uuid: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    if goal.owner_user_id != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


def open_notes(db: Session, user_id: int, goals: list[Goal] | None = None) -> list[tuple[CoachNote, Goal]]:
    """The learner's open notes, newest first, optionally only on some goals."""
    statement = select(CoachNote, Goal).join(Goal, Goal.id == CoachNote.goal_id).where(
        CoachNote.user_id == user_id, _open(datetime.utcnow()), Goal.status == GoalStatus.ACTIVE.value,
    )
    if goals is not None:
        statement = statement.where(CoachNote.goal_id.in_([goal.id for goal in goals]))  # type: ignore[union-attr]
    return list(db.exec(statement.order_by(CoachNote.created_at.desc())).all())  # type: ignore[union-attr]


def note_counts(db: Session, user_id: int, goal_ids: list[int]) -> dict[int, int]:
    if not goal_ids:
        return {}
    return dict(db.exec(select(CoachNote.goal_id, func.count()).where(  # type: ignore[call-overload]
        CoachNote.user_id == user_id, CoachNote.goal_id.in_(goal_ids), _open(datetime.utcnow()),  # type: ignore[union-attr]
    ).group_by(CoachNote.goal_id)).all())


def goal_notes(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    """Open notes on one goal, and when Coach next checks in. Others who can see the goal get none."""
    goal = access.goal_or_404(db, goal_uuid)
    if goal.owner_user_id != current_user.id:
        access.require(db, goal, current_user.id, "view_plan")
        return {"notes": [], "cadence": "weekly", "next_check_in_at": None}
    check_ins.sweep(db, goal)
    from src.services.coach import first_look
    from src.services.coach.policy import runtime

    return {
        "notes": [note_dict(note, goal) for note, _goal in open_notes(db, current_user.id, [goal])],
        "cadence": goal.coach_cadence if goal.coach_cadence in CADENCE else "weekly", "next_check_in_at": goal.next_check_in_at,
        "first_look_due": first_look.due(db, goal, int(current_user.id), runtime(db)),
    }


def act(db: Session, current_user: PublicUser, goal_uuid: str, note_uuid: str, payload: NoteAction) -> dict:
    goal = _own_goal(db, current_user.id, goal_uuid)
    note = db.exec(select(CoachNote).where(CoachNote.note_uuid == note_uuid, CoachNote.goal_id == goal.id)).first()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    action = next((item for item in note.actions or [] if item.get("id") == payload.action_id), None)
    if action is None:
        raise HTTPException(status_code=422, detail="Unknown action")
    if _value(note.status) != CoachNoteStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="This note was already handled")
    note.status = CoachNoteStatus.DISMISSED if action.get("kind") == "dismiss" else CoachNoteStatus.ACTED
    note.acted_at = datetime.utcnow()
    db.add(note)
    db.commit()
    return {"note": note_dict(note, goal), "action": action}
