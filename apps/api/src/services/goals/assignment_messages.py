"""An assignment's messages, as its staff read them.

A group assignment has one thread with the whole group (services/connect/cohort.py). Each learner
talks with staff in their chat with the organization, shown here filtered to their plan from the
assignment. Both filter to one step and to who reads them (all, what learners see, staff only).
Filtered to a step, the group thread also lists what learners asked about it in their own chats.
A learner's thread shows a line for each step past due; those lines aren't stored, they follow
from where the learner is now.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.conversations import ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goals import Goal, GoalAssignment, GoalStep
from src.db.users import PublicUser, User
from src.services.connect import chats, cohort, visibility
from src.services.goals import assignment_status
from src.services.goals.assignment_views import _assignment
from src.services.goals.review import person
from src.services.goals.sharing_roles import org_summary
from src.services.school import chats as school_chats


def _thread(db: Session, current_user: PublicUser, conversation, before: str | None, goal_uuid: str | None, step_uuid: str | None, audience: str | None) -> dict:
    """A chat for the viewer: in it, as any chat; an admin who isn't in it reads along."""
    member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first()
    if member or conversation.kind == cohort.COHORT:
        return chats.get_chat(db, current_user, conversation.conversation_uuid, before, goal_uuid, step_uuid, audience)
    return {"conversation_uuid": conversation.conversation_uuid, "kind": conversation.kind, "title": conversation.title, "people": [], "status": "active",
            "accepted": True, "waiting_for_them": False, "unavailable": False, "unread": 0, "last_message": None, "last_message_at": conversation.last_message_at,
            "can_post": False, "org": org_summary(db, conversation.org_id) if conversation.org_id else None,
            **chats.messages_of(db, conversation, current_user.id, before, goal_uuid, step_uuid, audience)}


def _step_questions(db: Session, current_user: PublicUser, assignment: GoalAssignment, step_key: str) -> list[dict]:
    """What learners wrote about one step in their own chats with the organization, newest first."""
    goals = {int(goal.id): goal for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).all() if goal.subject_user_id}  # type: ignore[arg-type]
    if not goals:
        return []
    steps = {step.step_uuid: int(step.goal_id) for step in db.exec(select(GoalStep).where(
        col(GoalStep.goal_id).in_(list(goals)), GoalStep.template_key == step_key)).all()}
    if not steps:
        return []
    rows = db.exec(select(ConversationMessage, ConversationMessageRef.goal_id).join(
        ConversationMessageRef, ConversationMessageRef.message_id == ConversationMessage.id,
    ).where(col(ConversationMessageRef.step_uuid).in_(list(steps)), col(ConversationMessageRef.goal_id).in_(list(goals)), ConversationMessage.kind == "text",
            ConversationMessage.visibility == visibility.ALL).order_by(col(ConversationMessage.creation_date).desc())).all()
    found, seen = [], set()
    for message, goal_id in rows:
        goal = goals[int(goal_id)]
        if message.sender_user_id != goal.subject_user_id or message.id in seen:
            continue
        seen.add(message.id)
        found.append({"person": person(db.get(User, goal.subject_user_id)), "goal_uuid": goal.goal_uuid, "message_uuid": message.message_uuid,
                      "body": message.body, "creation_date": message.creation_date})
    return found


def assignment_thread(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, step_key: str | None = None,
                      audience: str | None = None, before: str | None = None) -> dict:
    """A group assignment's thread with the whole group, filtered to a step and an audience when asked."""
    assignment = _assignment(db, current_user, org_id, assignment_uuid)
    if not assignment.usergroup_id:
        raise HTTPException(status_code=404, detail="Only group assignments have a group thread; message the learner instead")
    conversation = cohort.chat(db, assignment, cohort.GROUP)
    cohort.member(db, conversation, current_user.id)
    db.commit()
    thread = _thread(db, current_user, conversation, before, assignment.assignment_uuid, step_key, audience)
    questions = _step_questions(db, current_user, assignment, step_key) if step_key and audience != "staff" else []
    return {**thread, "assignment_uuid": assignment.assignment_uuid, "step_key": step_key, "questions": questions}


def _past_due(db: Session, assignment: GoalAssignment, goal: Goal, viewer_id: int) -> list[dict]:
    """A line per step the learner is behind on, from where they are now."""
    board = assignment_status.board(db, assignment, viewer_id)
    learner = next((item for item in board.learners if item.goal.id == goal.id), None)
    if not learner:
        return []
    return [{"kind": "past_due", "step_key": key, "step_uuid": learner.steps[key].step_uuid, "title": learner.steps[key].title, "due_date": learner.closes.get(key)}
            for key, name in learner.cells.items() if name == "behind" and key in learner.steps]


def learner_thread(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, user_uuid: str, step_key: str | None = None,
                   audience: str | None = None, before: str | None = None) -> dict:
    """One learner's messages with the organization about their plan from the assignment, with its past-due lines."""
    assignment = _assignment(db, current_user, org_id, assignment_uuid)
    user = db.exec(select(User).where(User.user_uuid == user_uuid)).first()
    goal = db.exec(select(Goal).where(Goal.assignment_id == assignment.id, Goal.subject_user_id == user.id)).first() if user else None
    if not user or not goal:
        raise HTTPException(status_code=404, detail="Learner not found on this assignment")
    conversation = school_chats.school_chat(db, org_id, int(user.id))  # type: ignore[arg-type]
    db.commit()
    step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == step_key)).first() if step_key else None
    if step_key and not step:
        raise HTTPException(status_code=404, detail="Step not found in this plan")
    thread = _thread(db, current_user, conversation, before, goal.goal_uuid, step.step_uuid if step else None, audience)
    lines = [] if audience == "staff" else [line for line in _past_due(db, assignment, goal, int(current_user.id)) if not step_key or line["step_key"] == step_key]
    return {**thread, "assignment_uuid": assignment.assignment_uuid, "goal_uuid": goal.goal_uuid, "learner": person(user), "step_key": step_key, "past_due": lines}
