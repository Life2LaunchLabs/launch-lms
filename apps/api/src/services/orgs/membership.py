"""Membership side effects: who's on the organization's plans, and tidying up after someone leaves it."""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember
from src.db.goals import CURRENT_ASSIGNMENT_STATUSES, Goal, GoalAssignment, GoalOwnership, GoalStatus
from src.db.goal_sharing import PlanCollaborator
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.services.goals.sharing_roles import _stamp

# Plans that make a learner "active": issued and not finished or archived.
OPEN_GOALS = (GoalStatus.PENDING.value, GoalStatus.ACTIVE.value)


def assigned_user_ids(db: Session, org_id: int, staff_user_id: int | None = None) -> set[int]:
    """Learners with an open plan from the organization; with ``staff_user_id``, only the plans that person staffs.

    Someone staffs a plan when they're on its assignment's staff, they assigned it, or they're staff on the learner's group.
    """
    goals = db.exec(select(Goal.subject_user_id, Goal.owner_user_id, GoalAssignment.staff_user_ids).outerjoin(
        GoalAssignment, GoalAssignment.id == Goal.assignment_id,
    ).where(
        Goal.org_id == org_id, Goal.ownership == GoalOwnership.EXTERNAL.value, col(Goal.status).in_(OPEN_GOALS),
        col(Goal.subject_user_id).is_not(None),
        (col(GoalAssignment.id).is_(None)) | (col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES)),
    )).all()
    if staff_user_id is None:
        return {int(subject) for subject, _, _ in goals}
    mine = {int(subject) for subject, owner, staff in goals if owner == staff_user_id or staff_user_id in (staff or [])}
    groups = db.exec(select(UserGroupStaff.usergroup_id).where(UserGroupStaff.org_id == org_id, UserGroupStaff.user_id == staff_user_id)).all()
    if groups:
        learners = {int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).where(col(UserGroupUser.usergroup_id).in_(list(groups)))).all()}
        mine |= learners & {int(subject) for subject, _, _ in goals}
    return mine - {staff_user_id}


def cleanup_after_removal(db: Session, org_id: int, user_id: int) -> None:
    """After someone leaves an organization (their membership row already deleted, not yet committed).

    They come off its groups as member and staff, out of its chats, and off its learners' plans
    (their collaborator rows go inactive, so history keeps who did what). Learners' chats with the
    organization and the groups' chats are brought up to date without them.
    """
    from src.services.school import chats as school_chats, group_chats

    group_ids = {int(row.usergroup_id) for row in db.exec(select(UserGroupStaff).where(UserGroupStaff.org_id == org_id, UserGroupStaff.user_id == user_id)).all()}
    for row in db.exec(select(UserGroupStaff).where(UserGroupStaff.org_id == org_id, UserGroupStaff.user_id == user_id)).all():
        db.delete(row)
    for row in db.exec(select(UserGroupUser).where(UserGroupUser.org_id == org_id, UserGroupUser.user_id == user_id)).all():
        group_ids.add(int(row.usergroup_id))
        db.delete(row)
    now = _stamp()
    goal_ids = select(Goal.id).where(Goal.org_id == org_id)
    for row in db.exec(select(PlanCollaborator).where(PlanCollaborator.user_id == user_id, PlanCollaborator.active == True, col(PlanCollaborator.goal_id).in_(goal_ids))).all():  # noqa: E712
        row.active, row.update_date = False, now
        db.add(row)
    org_chats = select(Conversation.id).where(Conversation.org_id == org_id)
    touched = set(db.exec(select(ConversationMember.conversation_id).where(ConversationMember.user_id == user_id, col(ConversationMember.conversation_id).in_(org_chats))).all())
    for row in db.exec(select(ConversationMember).where(ConversationMember.user_id == user_id, col(ConversationMember.conversation_id).in_(org_chats))).all():
        db.delete(row)
    db.flush()
    for group in db.exec(select(UserGroup).where(col(UserGroup.id).in_(list(group_ids)))).all() if group_ids else []:
        group_chats.sync(db, group)
    # Learners' chats they were in for a plan rather than a group.
    for conversation in db.exec(select(Conversation).where(col(Conversation.id).in_(list(touched)), Conversation.kind == school_chats.SCHOOL)).all() if touched else []:
        _, _, student_id = (conversation.direct_key or "::").split(":")
        if student_id.isdigit() and int(student_id) != user_id:
            school_chats.school_chat(db, org_id, int(student_id))
    db.flush()
