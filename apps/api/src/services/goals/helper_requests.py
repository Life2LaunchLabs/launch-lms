"""Helpers waiting on an admin: learners' invitations to people (a parent, a mentor) on plans their organization gave them.

With the organization's ``helper_approval`` policy on, such an invitation starts as
``awaiting_approval`` and isn't sent, whether the learner invited them or plan staff approved the
learner's request for them. An admin approves it (it's sent, as any invitation) or declines it
(it never is). Staff inviting someone themselves don't wait.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalOwnership
from src.db.planning import PlanInvitation, PlanInvitationStatus, PlanRole
from src.db.users import PublicUser
from src.security.org_auth import is_org_admin, require_org_admin
from src.services.goals import access
from src.services.goals.sharing_roles import _invitation_label, _now, _stamp, _value, user_summary
from src.services.school import messaging

AWAITING = PlanInvitationStatus.AWAITING_APPROVAL.value


def needs_approval(db: Session, goal: Goal, inviter_id: int, requested_by: int | None = None) -> bool:
    """Whether an invitation onto this plan waits for an admin: the learner asked for it, on a plan their organization gave them."""
    if _value(goal.ownership) != GoalOwnership.EXTERNAL.value or not goal.org_id or not goal.subject_user_id:
        return False
    if goal.subject_user_id not in {inviter_id, requested_by} or is_org_admin(inviter_id, int(goal.org_id), db):
        return False
    return messaging.policy(db, int(goal.org_id)).helper_approval


def _dict(db: Session, invitation: PlanInvitation, goal: Goal) -> dict:
    role = db.get(PlanRole, invitation.role_id)
    return {
        "invitation_uuid": invitation.invitation_uuid, "status": _value(invitation.status), "creation_date": invitation.creation_date,
        "helper": user_summary(db, invitation.target_user_id) if invitation.target_user_id else None, "email": _invitation_label(db, invitation),
        "role": {"key": role.key, "name": role.name} if role else None,
        "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title}, "learner": user_summary(db, goal.subject_user_id),
        "invited_by": user_summary(db, invitation.invited_by_user_id),
    }


def list_requests(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Helper invitations waiting on this organization's admins, oldest first."""
    require_org_admin(current_user.id, org_id, db)
    rows = db.exec(select(PlanInvitation, Goal).join(Goal, Goal.id == PlanInvitation.goal_id).where(
        Goal.org_id == org_id, PlanInvitation.status == AWAITING,
    ).order_by(col(PlanInvitation.id))).all()
    requests = [_dict(db, invitation, goal) for invitation, goal in rows]
    return {"requests": requests, "total": len(requests)}


def _waiting(db: Session, org_id: int, invitation_uuid: str) -> tuple[PlanInvitation, Goal]:
    row = db.exec(select(PlanInvitation, Goal).join(Goal, Goal.id == PlanInvitation.goal_id).where(
        Goal.org_id == org_id, PlanInvitation.invitation_uuid == invitation_uuid,
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Helper request not found")
    if _value(row[0].status) != AWAITING:
        raise HTTPException(status_code=409, detail="This request was already answered")
    return row


def decide(db: Session, current_user: PublicUser, org_id: int, invitation_uuid: str, approve: bool) -> dict:
    """Approve (the invitation goes out) or decline (it never does) a helper waiting on an admin."""
    from src.services.goals.sharing import _invitation_message

    require_org_admin(current_user.id, org_id, db)
    invitation, goal = _waiting(db, org_id, invitation_uuid)
    invitation.status = PlanInvitationStatus.PENDING if approve else PlanInvitationStatus.DECLINED
    invitation.reviewed_by_user_id, invitation.reviewed_at, invitation.update_date = current_user.id, _now(), _stamp()
    if approve:
        # The thirty days to answer start now.
        invitation.expires_at = _now() + timedelta(days=30)
        role = db.get(PlanRole, invitation.role_id)
        _invitation_message(db, goal, invitation, role.name if role else "Helper")
    db.add(invitation)
    access.log(db, goal, current_user.id, "invitation.approved" if approve else "invitation.declined_by_org", {"invitation_uuid": invitation_uuid})
    db.commit()
    return _dict(db, invitation, goal)
