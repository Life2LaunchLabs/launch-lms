"""Move goal comments from before plans talked in chats into those chats, once, for migration e7f8a9b0c1d2.

The goalcomment table is described here as it last stood, since the model went with it.
Each comment becomes a message in the chat its plan talks in, tagged with its step (a reply
takes its thread's step). A plan from an organization talks in the learner's chat with it;
a personal plan in its own chat, made for the move if nobody else is on it any more.
"""

from __future__ import annotations

from uuid import uuid4

import sqlalchemy as sa
from sqlmodel import Session, select

from src.db.conversations import Conversation, ConversationMessage
from src.db.goals import Goal, GoalStep
from src.services.connect import workspace
from src.services.goals.sharing_roles import _stamp
from src.services.school import chats as school_chats

GOALCOMMENT = sa.Table(
    "goalcomment", sa.MetaData(),
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("goal_id", sa.Integer),
    sa.Column("step_uuid", sa.String),
    sa.Column("parent_id", sa.Integer),
    sa.Column("author_user_id", sa.Integer),
    sa.Column("body", sa.Text),
    sa.Column("creation_date", sa.String),
    sa.Column("update_date", sa.String),
)


def _chat(db: Session, goal: Goal) -> Conversation:
    if workspace._external(goal):
        return school_chats.school_chat(db, int(goal.org_id), int(goal.subject_user_id))  # type: ignore[arg-type]
    conversation = workspace._goal_chat(db, goal, create=True)
    if conversation:
        return conversation
    now = _stamp()
    conversation = Conversation(conversation_uuid=f"chat_{uuid4()}", kind=workspace.GOAL, direct_key=workspace._goal_key(int(goal.id)), title=goal.title,  # type: ignore[arg-type]
                                org_id=goal.org_id, created_by_user_id=goal.owner_user_id, creation_date=now, update_date=now)
    db.add(conversation)
    db.flush()
    workspace._set_members(db, conversation, workspace._goal_people(db, goal))
    return conversation


def move_all(db: Session) -> int:
    """Move every comment, and return how many moved. The caller drops the table."""
    rows = list(db.connection().execute(sa.select(GOALCOMMENT).order_by(GOALCOMMENT.c.id)).mappings())
    by_goal: dict[int, list] = {}
    for row in rows:
        by_goal.setdefault(int(row["goal_id"]), []).append(row)
    for goal_id, comments in by_goal.items():
        goal = db.get(Goal, goal_id)
        if not goal:
            continue
        conversation = _chat(db, goal)
        steps = {step.step_uuid for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}
        threads = {int(row["id"]): row["step_uuid"] for row in comments}
        newest = conversation.last_message_at or ""
        for row in comments:
            step_uuid = threads.get(int(row["parent_id"])) if row["parent_id"] else row["step_uuid"]
            on_step = step_uuid if step_uuid in steps else None
            token = f"<step:{goal.goal_uuid}/{on_step}>" if on_step else f"<plan:{goal.goal_uuid}>"
            ref = {"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": on_step} if on_step else {"kind": "plan", "goal_uuid": goal.goal_uuid}
            stamp = row["update_date"] or row["creation_date"]
            message = ConversationMessage(
                message_uuid=f"chat_message_{uuid4()}", conversation_id=int(conversation.id), sender_user_id=row["author_user_id"],  # type: ignore[arg-type]
                kind="text", body=f"{token} {row['body']}", refs=[ref], creation_date=row["creation_date"], update_date=stamp,
            )
            db.add(message)
            db.flush()
            workspace.attach(db, message, [(int(goal.id), on_step)])  # type: ignore[arg-type]
            newest = max(newest, stamp)
        conversation.last_message_at = newest
        db.add(conversation)
    db.flush()
    return len(rows)
