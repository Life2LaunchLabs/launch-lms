"""An assignment's cohort chats: its staff alone, or its staff and the whole group.

An assignment has up to two chats, found by ``Conversation.assignment_id`` and ``channel``:

- ``group_staff`` (Staff only): the assignment's staff, meaning the people it was assigned
  with as staff and the group's staff who cover it. Learners never see it.
- ``group_all`` (Whole group): those staff and the group's learners with a plan from it. Only
  group assignments have one. A person assignment's learner already talks with its staff in
  their chat with the organization.

They hang off the assignment and not its group, because a group can run several assignments,
each from its own template with its own steps and its own staff. A cohort chat is about the
assignment's plan, so it filters by template step the way a learner's chat filters by their
steps: the assignment's uuid stands in for the plan and the template's step keys for its steps.
Those refs carry ``"cohort": True`` and their ref rows have no goal.

Members follow the assignment: ``sync`` runs when its staff change, when its group's
membership or staff change, and when its learners' plans are issued, accepted or archived.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMessage, ConversationMessageRef
from src.db.goals import AssignmentStatus, Goal, GoalAssignment, GoalStatus, GoalTemplate, GoalTemplateVersion, StepStatus
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser
from src.services.goals.document import iter_steps
from src.services.goals.sharing_roles import _stamp
from src.services.school.staff import covers

COHORT = "cohort"
STAFF, GROUP = "group_staff", "group_all"
AUDIENCES = {"staff": STAFF, "group": GROUP}
# Learners in the whole-group chat: their plan from the assignment is waiting, under way or finished.
LEARNING = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)


def _value(item) -> str:
    return getattr(item, "value", item)


# Who's in each chat


def staff_ids(db: Session, assignment: GoalAssignment) -> set[int]:
    """The assignment's staff: the people it was assigned with, and the group's staff who cover it."""
    ids = {int(user_id) for user_id in assignment.staff_user_ids or []}
    if assignment.usergroup_id:
        rows = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == assignment.usergroup_id)).all()
        ids |= {int(row.user_id) for row in rows if covers(row, assignment)}
    return ids


def learner_ids(db: Session, assignment: GoalAssignment) -> set[int]:
    """The group's learners with a plan from the assignment. People who left the group drop out."""
    if not assignment.usergroup_id:
        return set()
    subjects = set(db.exec(select(Goal.subject_user_id).where(Goal.assignment_id == assignment.id, col(Goal.status).in_(LEARNING))).all())
    members = set(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == assignment.usergroup_id)).all())
    return {int(user_id) for user_id in subjects & members if user_id}


def members_of(db: Session, assignment: GoalAssignment, channel: str) -> set[int]:
    return staff_ids(db, assignment) | (learner_ids(db, assignment) if channel == GROUP else set())


def channels(assignment: GoalAssignment) -> tuple[str, ...]:
    """Every assignment has a staff chat; group assignments also have one with the whole group."""
    return (STAFF, GROUP) if assignment.usergroup_id else (STAFF,)


def _template_title(db: Session, assignment: GoalAssignment) -> str:
    template = db.get(GoalTemplate, assignment.template_id)
    return template.title if template else "Assignment"


def _title(db: Session, assignment: GoalAssignment, channel: str) -> str:
    if channel == STAFF:
        return f"{_template_title(db, assignment)} · Staff"
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    return f"{_template_title(db, assignment)} · {group.name if group else 'Group'}"


def find(db: Session, assignment: GoalAssignment, channel: str) -> Conversation | None:
    return db.exec(select(Conversation).where(Conversation.assignment_id == assignment.id, Conversation.channel == channel)).first()


def _set_members(db: Session, conversation: Conversation, wanted: set[int]) -> None:
    from src.services.connect.workspace import _set_members

    _set_members(db, conversation, wanted)


def chat(db: Session, assignment: GoalAssignment, channel: str) -> Conversation:
    """The assignment's chat for one channel, created if needed, with its members brought up to date (flushed)."""
    conversation = find(db, assignment, channel)
    title = _title(db, assignment, channel)
    if not conversation:
        now = _stamp()
        conversation = Conversation(
            conversation_uuid=f"chat_{uuid4()}", kind=COHORT, title=title, org_id=assignment.org_id, assignment_id=assignment.id,
            channel=channel, created_by_user_id=assignment.owner_user_id, creation_date=now, update_date=now,
        )
        db.add(conversation)
        db.flush()
    elif conversation.title != title:
        conversation.title = title
        db.add(conversation)
    _set_members(db, conversation, members_of(db, assignment, channel))
    return conversation


def sync(db: Session, assignment: GoalAssignment) -> None:
    """Bring the assignment's existing chats up to date with its staff and learners (flushed)."""
    for conversation in db.exec(select(Conversation).where(Conversation.assignment_id == assignment.id)).all():
        if conversation.channel in channels(assignment):
            _set_members(db, conversation, members_of(db, assignment, str(conversation.channel)))


def sync_group(db: Session, group_id: int) -> None:
    """After a group's members or staff change: the chats of every assignment it has."""
    db.flush()
    for assignment in db.exec(select(GoalAssignment).where(GoalAssignment.usergroup_id == group_id)).all():
        sync(db, assignment)


def sync_for_goal(db: Session, goal: Goal) -> None:
    """After a learner's plan from an assignment is issued, accepted or archived."""
    assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
    if assignment:
        sync(db, assignment)


def assignment_of(db: Session, conversation: Conversation) -> GoalAssignment | None:
    return db.get(GoalAssignment, conversation.assignment_id) if conversation.assignment_id else None


def can_post(db: Session, conversation: Conversation) -> bool:
    """Members write until the assignment ends; then the chat stays to read."""
    assignment = assignment_of(db, conversation)
    return bool(assignment) and _value(assignment.status) != AssignmentStatus.ENDED.value  # type: ignore[union-attr]


# The plan it's about: the assignment's template steps


def _document(db: Session, assignment: GoalAssignment) -> dict:
    version = db.get(GoalTemplateVersion, assignment.version_id)
    return (version.document if version else None) or {}


def _steps(document: dict) -> dict[str, str]:
    return {step["key"]: step.get("title") or "Step" for _, step in iter_steps(document) if step.get("key")}


def counts(db: Session, conversation: Conversation) -> tuple[dict[str, int], int]:
    """Messages per template step, and in the whole chat."""
    by_step = {str(step): int(count) for step, count in db.exec(
        select(ConversationMessageRef.step_uuid, func.count(func.distinct(ConversationMessageRef.message_id)))
        .where(ConversationMessageRef.conversation_id == conversation.id, col(ConversationMessageRef.goal_id).is_(None), col(ConversationMessageRef.step_uuid).is_not(None))
        .group_by(ConversationMessageRef.step_uuid)
    ).all()}
    total = int(db.exec(select(func.count()).select_from(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id)).one())
    return by_step, total


def topic(db: Session, conversation: Conversation) -> dict | None:
    """The assignment's plan as the chat's one topic: the template's steps, with how many messages tag each.

    Steps don't say where anyone stands: learners read this chat too, and each learner's
    progress is their own.
    """
    from src.services.goals.assignments import _planned

    assignment = assignment_of(db, conversation)
    if not assignment:
        return None
    document = _document(db, assignment)
    due = _planned(assignment, document)["steps"]
    by_step, total = counts(db, conversation)
    steps = [{"step_uuid": key, "title": title, "status": StepStatus.NOT_STARTED.value, "due_date": due.get(key), "behind": False, "count": by_step.get(key, 0)}
             for key, title in _steps(document).items()]
    ended = _value(assignment.status) == AssignmentStatus.ENDED.value
    return {
        "goal_uuid": assignment.assignment_uuid, "title": _template_title(db, assignment),
        "status": GoalStatus.FINISHED.value if ended else GoalStatus.ACTIVE.value, "source": "assignment", "count": total,
        "progress": {"done": 0, "total": len(steps), "submitted": 0, "behind": 0}, "steps": steps,
    }


def filtered(query, db: Session, conversation: Conversation, goal_uuid: str | None, step_uuid: str | None):
    """Narrow a cohort chat to one template step. The whole plan is the whole chat."""
    assignment = assignment_of(db, conversation)
    if not assignment or assignment.assignment_uuid != goal_uuid:
        raise HTTPException(status_code=404, detail="That plan isn't in this chat")
    if not step_uuid:
        return query
    about = select(ConversationMessageRef.message_id).where(
        ConversationMessageRef.conversation_id == conversation.id, col(ConversationMessageRef.goal_id).is_(None), ConversationMessageRef.step_uuid == step_uuid,
    )
    return query.where(col(ConversationMessage.id).in_(about))


def tag(db: Session, conversation: Conversation, kind: str, first: str, second: str | None) -> dict | None:
    """A plan or step tag that names this chat's assignment or one of its template steps."""
    assignment = assignment_of(db, conversation)
    if not assignment or first != assignment.assignment_uuid:
        return None
    if kind == "plan":
        return {"kind": "plan", "goal_uuid": first, "cohort": True}
    return {"kind": "step", "goal_uuid": first, "step_uuid": second, "cohort": True} if second in _steps(_document(db, assignment)) else None


def resolve_one(db: Session, ref: dict) -> dict | None:
    """A cohort tag as readers see it now: the template's current title and step titles."""
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == ref.get("goal_uuid"))).first()
    if not assignment:
        return None
    title = _template_title(db, assignment)
    if ref.get("kind") == "plan":
        return {"kind": "plan", "goal_uuid": assignment.assignment_uuid, "title": title}
    step = _steps(_document(db, assignment)).get(ref.get("step_uuid") or "")
    return {"kind": "step", "goal_uuid": assignment.assignment_uuid, "step_uuid": ref["step_uuid"], "title": step, "plan_title": title,
            "status": StepStatus.NOT_STARTED.value} if step else None


# The chat buttons


def cohort_chat(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, audience: str) -> dict:
    """An assignment's chat with its staff or its whole group, started if needed, for its chat buttons.

    Staff only: the assignment's staff. Whole group: those staff and the group's learners.
    Anyone else, such as a helper a learner invited onto their own plan, gets a 403.
    """
    channel = AUDIENCES.get(audience)
    if not channel:
        raise HTTPException(status_code=422, detail="Choose the staff chat or the whole group's")
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid, GoalAssignment.org_id == org_id)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if channel not in channels(assignment):
        raise HTTPException(status_code=404, detail="Only group assignments have a chat with the whole group")
    if current_user.id not in members_of(db, assignment, channel):
        raise HTTPException(status_code=403, detail="Only the assignment's staff can read this chat" if channel == STAFF else "Only the group and its staff can read this chat")
    conversation = chat(db, assignment, channel)
    db.commit()
    by_step, total = counts(db, conversation)
    return {
        "assignment_uuid": assignment.assignment_uuid, "audience": audience, "conversation_uuid": conversation.conversation_uuid,
        "title": conversation.title, "can_post": can_post(db, conversation), "counts": by_step, "count": total, "topic": topic(db, conversation),
    }
